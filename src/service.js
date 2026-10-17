/* review-app actions + background work (collect, poster renders) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, dirs } from './config.js';
import { drafts, kv, ymd, db, dayStr, newDraftId } from './db.js';
import { newForm, withCaptions } from './draft.js';
import * as shopee from './shopee.js';
import { posterKey, TPL, endAtFrom, T8_CAPS, rm } from './mapping.js';
import { refreshCaptions, refreshHeadline, swapNumbers, availability, isPersonal, suggest } from './pick.js';
import { renderDraft, posterFile, thumbFile } from './render.js';
import { upcoming } from './slots.js';
import { collect } from './collect.js';

export const EXPIRE_MS = 3 * 86400e3; // README: drafts not approved within 3 days expire
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* live status for the review app (polled by /api/status) */
export const status = { collecting: '', collectResult: null, rendering: new Set(), queued: new Set() };
const listeners = { collected: [], collectFailed: [] };
export const onCollected = fn => listeners.collected.push(fn);
export const onCollectFailed = fn => listeners.collectFailed.push(fn);
/* listeners may be async; a failing one is logged, never an unhandled rejection */
const fire = (list, arg) => list.forEach(fn => Promise.resolve().then(() => fn(arg)).catch(e => console.error('listener', e.message)));

/* ---------- posters ---------- */
const inflight = new Map(); // id → { key, promise } of the render running for that draft
export const posterFresh = (d, cfg = loadConfig()) => !!d.posterKey && d.posterKey === posterKey(d, cfg) && fs.existsSync(posterFile(d.id)) && fs.existsSync(thumbFile(d.id));

/* resolves once the draft's poster matches its current state (force: render again regardless) */
export function ensurePoster(id, { force = false } = {}) {
  const d = drafts.get(id);
  if (!d) return Promise.reject(new Error('no draft'));
  const cfg = loadConfig();
  const key = posterKey(d, cfg);
  const cur = inflight.get(id);
  if (cur) {
    if (!force && cur.key === key) return cur.promise;
    /* a render of an older state is running (or a forced one is wanted): render again once it is done */
    return cur.promise.catch(() => {}).then(() => ensurePoster(id, { force }));
  }
  if (!force && posterFresh(d, cfg)) return Promise.resolve(d);
  status.rendering.add(id);
  const entry = { key, promise: null };
  entry.promise = renderDraft(id).finally(() => {
    if (inflight.get(id) === entry) { inflight.delete(id); status.rendering.delete(id); }
  });
  inflight.set(id, entry);
  return entry.promise;
}
/* background renders, one after another; an id waits in the queue at most once */
let bg = Promise.resolve();
export function queuePosters(ids) {
  for (const id of ids) {
    if (status.queued.has(id)) continue;
    status.queued.add(id);
    bg = bg.then(() => { status.queued.delete(id); return ensurePoster(id); }).catch(e => console.error('render', id, e.message));
  }
  return bg;
}

/* ---------- collect ---------- */
export function runCollect() {
  if (status.collecting) return false;
  status.collecting = '抓取中…';
  status.collectResult = null;
  const log = line => {
    console.log(line);
    if (/sortType 2/.test(line)) status.collecting = '抓取中… 爆卖';
    else if (/sortType 5/.test(line)) status.collecting = '抓取中… 爆卖 ✓ 高佣';
    else if (/^\s+topSellers:/.test(line)) status.collecting = '抓取中… 爆卖 ✓ 高佣 ✓ 大折扣';
    else if (/^\s+\+ /.test(line)) status.collecting = '生成草稿中…';
  };
  collect({ log })
    .then(r => {
      status.collectResult = { ok: true, created: r.created, at: Date.now() };
      kv.del('lastCollectError');
      queuePosters(r.ids).then(() => fire(listeners.collected, r));
    })
    .catch(e => {
      status.collectResult = { ok: false, error: e.message, at: Date.now() };
      kv.set('lastCollectError', { at: Date.now(), error: e.message }); // shown in the 待审核 header until the next good collect
      console.error('collect failed:', e.message);
      fire(listeners.collectFailed, e);
    })
    .finally(() => { status.collecting = ''; });
  return true;
}

/* ---------- forms ---------- */
const str = (v, n) => String(v ?? '').slice(0, n);

/* 在 Studio 精修: styles and photo framing set in the studio, kept per draft (form.look) and drawn over the app's
   own studio state (mapping.studioState). Only these fields, only valid values; prices, rating, sold, photos and
   the brand badge stay the app's. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const STUDIO_FONTS = ['"Noto Sans SC","Nunito"', '"Baloo 2","Noto Sans SC"', '"Ma Shan Zheng","Noto Sans SC"', '"Montserrat","Noto Sans SC"', '"Anton","Noto Sans SC"'];
const num = (v, lo, hi) => v === '' || v == null || typeof v === 'boolean' || !Number.isFinite(+v) ? undefined : Math.min(hi, Math.max(lo, +v));
const int = (v, lo, hi) => { const n = num(v, lo, hi); return n === undefined ? n : Math.round(n); };
function cleanLook(lk, photos = []) {
  if (!lk || typeof lk !== 'object') return undefined;
  const o = {};
  for (const k of ['c1', 'c2', 'ol', 'hlc', 'bg']) if (typeof lk[k] === 'string' && HEX.test(lk[k])) o[k] = lk[k];
  for (const k of ['hl', 'arrow', 'shopee']) if (typeof lk[k] === 'boolean') o[k] = lk[k];
  for (const k of ['seal', 'proof', 'cta']) if (lk[k] === false) o[k] = false; // can be hidden, never brought back
  if (STUDIO_FONTS.includes(lk.font)) o.font = lk.font;
  const size = int(lk.size, 70, 140), scrim = int(lk.scrim, 0, 80);
  if (size !== undefined) o.size = size;
  if (scrim !== undefined) o.scrim = scrim;
  if (['left', 'center', 'right'].includes(lk.align)) o.align = lk.align;
  if (typeof lk.ctaText === 'string' && lk.ctaText.trim()) o.ctaText = lk.ctaText.trim().slice(0, 24);
  const frames = m => {
    const out = {};
    for (const [ref, q] of Object.entries(m && typeof m === 'object' ? m : {})) {
      if (!photos.includes(ref) || !q || typeof q !== 'object') continue; // a photo that's gone takes its framing with it
      const zoom = int(q.zoom, 100, 280), x = num(q.x, 0, 100), y = num(q.y, 0, 100); // a dragged photo sits at e.g. 37.4 %
      if (zoom !== undefined && x !== undefined && y !== undefined) out[ref] = { zoom, x, y };
    }
    return Object.keys(out).length ? out : undefined;
  };
  const fr = frames(lk.frames), pf = frames(lk.pageFrames);
  if (fr) o.frames = fr;
  if (pf) o.pageFrames = pf;
  if (Array.isArray(lk.pageCaps)) o.pageCaps = lk.pageCaps.slice(0, 4).map(c => str(c, 30));
  if (!Object.keys(o).length) return undefined;
  if (Number.isFinite(+lk.at) && +lk.at > 0) o.at = +lk.at;
  return o;
}
const REF = /^(img|up):[\w.-]+$/;
export function cleanForm(old, f, d = null, cfg = loadConfig()) {
  const n = { ...old };
  if (f.tpl && own(TPL, f.tpl)) n.tpl = f.tpl;
  if ('l1' in f) n.l1 = str(f.l1, 60);
  if ('l2' in f) n.l2 = str(f.l2, 60);
  if (Array.isArray(f.photos)) {
    const ph = f.photos.filter(x => typeof x === 'string' && REF.test(x)).slice(0, 4);
    if (ph[0] === old.photos[0]) n.photos = ph; // the Shopee image stays first
  }
  if ('used' in f) n.used = !!f.used;
  if (f.review) n.review = { quote: str(f.review.quote, 80), author: str(f.review.author, 16) };
  if (f.flash) {
    const end = endAtFrom(f.flash.end) ? f.flash.end : '';
    const o = old.flash || {};
    /* the end time becomes a date when it is set; unchanged times keep their date */
    const endAt = !end ? 0 : (end === o.end && o.endAt && f.flash.endAt !== 0) ? o.endAt : endAtFrom(end);
    n.flash = { end, pct: str(f.flash.pct, 2).replace(/\D/g, ''), endAt };
  }
  if (f.chat) n.chat = { m1: str(f.chat.m1, 40), m2: str(f.chat.m2, 40), m3: str(f.chat.m3, 40) };
  /* the studio's look comes with the form, unless the page still had an older one than the studio saved since */
  const stale = 'look' in f && f.look && n.look && (+f.look.at || 0) < (+n.look.at || 0);
  const look = cleanLook('look' in f && !stale ? f.look : n.look, n.photos);
  if (look) n.look = look; else delete n.look;
  for (const k of ['cap1', 'cap2']) if (k in f) n[k] = str(f[k], 2000);
  for (const k of ['cap1Manual', 'cap2Manual']) if (k in f) n[k] = !!f[k];
  if (!own(TPL, n.tpl) || !availability(n)[n.tpl]) n.tpl = n.autoTpl; // locked templates need their real data first
  /* first-person hooks only on drafts marked 我用过 */
  if (!n.used && d && isPersonal(n.l1, cfg)) [n.l1, n.l2] = suggest(d.p, false, cfg)[0];
  return n;
}

export function saveForm(id, f) {
  const d = drafts.get(id);
  if (!d) throw new Error('草稿不存在');
  if (!['draft', 'approved'].includes(d.status)) throw new Error('这张草稿正在发布或已经处理完，不能再改了');
  const cfg = loadConfig();
  d.form = cleanForm(d.form, f || {}, d, cfg);
  refreshCaptions(d, cfg);
  if (!drafts.update(id, { form: d.form }, { from: ['draft', 'approved'] })) throw new Error('这张草稿刚刚开始发布，改动没有保存');
  return drafts.get(id);
}

/* 在 Studio 精修 → 保存到草稿: the bridge sends only what was changed in the studio (styles, texts, photo
   framing by photo position, carousel captions); everything else in the draft stays as it is */
const LOOK_KEYS = ['c1', 'c2', 'ol', 'hl', 'hlc', 'font', 'size', 'align', 'scrim', 'bg', 'ctaText', 'cta', 'arrow', 'shopee', 'seal', 'proof'];
export function saveStudio(id, ch) {
  const d = drafts.get(id);
  if (!d) throw new Error('草稿不存在');
  ch = ch && typeof ch === 'object' ? ch : {};
  const fm = d.form, f = {}, look = { ...(fm.look || {}) };
  for (const k of ['tpl', 'l1', 'l2']) if (own(ch, k) && typeof ch[k] === 'string') f[k] = ch[k];
  if (ch.review && typeof ch.review === 'object') f.review = { ...fm.review, ...ch.review };
  if (ch.chat && typeof ch.chat === 'object') f.chat = { ...fm.chat, ...ch.chat };
  for (const k of LOOK_KEYS) if (own(ch, k)) look[k] = ch[k];
  /* framing goes by photo position: if the photos changed in the app since the studio opened, it would land on the wrong one */
  const framed = !Array.isArray(ch.photos) || JSON.stringify(ch.photos) === JSON.stringify(fm.photos);
  if (framed && Array.isArray(ch.frames)) {
    look.frames = { ...(look.frames || {}) };
    ch.frames.forEach((q, i) => { if (q && fm.photos[i]) look.frames[fm.photos[i]] = q; });
  }
  if (Array.isArray(ch.pages)) {
    look.pageFrames = { ...(look.pageFrames || {}) };
    look.pageCaps = look.pageCaps ? [...look.pageCaps] : [...T8_CAPS];
    ch.pages.forEach((q, i) => {
      if (!q) return;
      if (framed && q.zoom !== undefined && fm.photos[i]) look.pageFrames[fm.photos[i]] = { zoom: q.zoom, x: q.x, y: q.y };
      if (typeof q.cap === 'string') look.pageCaps[i] = q.cap;
    });
  }
  look.at = Math.max(Date.now(), ((fm.look && +fm.look.at) || 0) + 1); // always newer than the last one, even if the clock steps back
  f.look = look;
  return Object.assign(saveForm(id, f), { framesDropped: !framed && !!(ch.frames || ch.pages) });
}

/* sub IDs carry the template: when it changed, get a fresh short link and swap it into the captions */
export async function syncShortLink(d) {
  if (d.p.manual || d.subIds[1] === d.form.tpl) return d; // a hand-added product keeps the link that was pasted
  const subIds = shopee.cleanSubIds(['fb', d.form.tpl, d.strat, d.subIds[3] || ymd(), d.id]);
  const link = await shopee.shortLink(d.p.productLink || d.p.offerLink, subIds);
  const f = d.form, old = d.shortLink;
  if (old) { f.cap1 = f.cap1.split(old).join(link); f.cap2 = f.cap2.split(old).join(link); }
  d.shortLink = link; d.subIds = subIds;
  refreshCaptions(d, loadConfig());
  drafts.update(d.id, { shortLink: link, subIds, form: f });
  return drafts.get(d.id);
}

/* ---------- actions (every status change is a check-and-set on the status it started from) ---------- */
export async function approve(id, form) {
  let d = drafts.get(id);
  if (!d || !['draft', 'approved'].includes(d.status)) throw new Error('这张草稿不能批准了');
  const from = d.status, again = from === 'approved';
  if (from === 'draft' && d.pendingSince < Date.now() - EXPIRE_MS) {
    drafts.update(id, { status: 'expired' }, { from: ['draft'] });
    throw new Error('这张草稿超过 3 天没批准，已经过期了');
  }
  if (form) d = saveForm(id, form);
  d = await syncShortLink(d);
  await ensurePoster(id);
  const ok = drafts.update(id, { status: 'approved', approvedAt: again ? d.approvedAt : Date.now(), priceChanged: null, isNew: false }, { from: [from] });
  if (!ok) throw new Error('这张草稿刚刚变了（跳过、退回或正在发布），刷新后再看');
  return { again, slot: slotOf(id) };
}
export function skip(id) { drafts.update(id, { status: 'skipped' }, { from: ['draft'] }); }
export function unskip(id) {
  const d = drafts.get(id);
  if (!d || d.status !== 'skipped') throw new Error('这张草稿已经不在「已跳过」里了');
  if (d.pendingSince < Date.now() - EXPIRE_MS) throw new Error('这张草稿超过 3 天了，不能恢复');
  if (drafts.queuedItem(d.itemId)) throw new Error('这个商品已经有新的草稿了，不用恢复');
  if (!drafts.update(id, { status: 'draft' }, { from: ['skipped'] })) throw new Error('这张草稿刚刚变了，刷新后再看');
}
export function unapprove(id) { drafts.update(id, { status: 'draft', approvedAt: 0, pendingSince: Date.now() }, { from: ['approved'] }); }

/* approved drafts fill upcoming slots in approval order */
export function approvedWithSlots(cfg = loadConfig(), now = Date.now()) {
  const list = drafts.list('approved');
  const sl = upcoming(list.length, cfg, now);
  return list.map((d, i) => ({ d, slot: sl[i] || null }));
}
export const slotOf = id => { const r = approvedWithSlots().find(x => x.d.id === id); return r && r.slot; };

/* photo upload (data:image/jpeg URL, already resized in the browser) → ref */
export function savePhoto(id, dataUrl) {
  if (!/^d[0-9a-f]{8}$/.test(String(id))) throw new Error('草稿不存在');
  const d = drafts.get(id);
  if (!d || !['draft', 'approved'].includes(d.status)) throw new Error('草稿不存在');
  return 'up:' + writePhoto(`up-${id}-${crypto.randomBytes(3).toString('hex')}`, dataUrl);
}
function writePhoto(base, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('照片格式不对');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4e6) throw new Error('照片太大');
  const name = `${base}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(dirs.img, name), buf);
  return name;
}

/* ＋ 手动添加 (no Shopee API yet): product details, photos and the affiliate link typed in by hand → a draft.
   It never calls the API: no short link (the pasted link is posted as it is), no price re-check before posting. */
const SHOPEE_HOST = /(^|\.)(shopee\.com\.my|shope\.ee)$/;
/* the typed-in product fields, checked; shared by 手动添加 and 商品资料 on the edit page */
function manualFields(b) {
  b = b && typeof b === 'object' ? b : {};
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) throw new Error('请填商品名称');
  const n = v => (v === '' || v == null) ? null : Number(v);
  const price = n(b.price), was = n(b.was), rating = n(b.rating), sales = n(b.sales);
  if (!(price > 0 && price < 1e5)) throw new Error('现价要填大于 0 的数字');
  if (was !== null && !(was > price && was < 1e5)) throw new Error('原价要比现价高（没有折扣就留空）');
  if (rating !== null && !(rating > 0 && rating <= 5)) throw new Error('评分要在 0–5 之间（没有就留空）');
  if (!(Number.isInteger(sales) && sales >= 0)) throw new Error('已售要填整数（例如 1200）');
  let url;
  try { url = new URL(String(b.link || '').trim()); } catch { throw new Error('推广链接不对：从 Shopee Affiliate 复制完整链接'); }
  if (url.protocol !== 'https:' || !SHOPEE_HOST.test(url.hostname)) throw new Error('推广链接要是 Shopee 的链接（https://s.shopee.com.my/… 或 https://shope.ee/…）');
  return {
    name, price, priceMax: price, originalPrice: was, disc: was ? Math.round((1 - price / was) * 100) : 0,
    rating, sales, productLink: url.href, checkedAt: Date.now() // checkedAt: when the price was last typed in (see priceQuestion)
  };
}
const ITEM_IDS = /-i\.(\d+)\.(\d+)|\/product\/(\d+)\/(\d+)/; // a full product link names its shop and item

/* the same product already waiting, or posted within noRepeatDays: '' if neither */
export function manualDuplicate(link, itemId = '', cfg = loadConfig(), now = Date.now()) {
  const rows = db.prepare(`SELECT status, (SELECT MAX(at) FROM posts WHERE draft_id=drafts.id AND kind='posted') posted FROM drafts
    WHERE json_extract(product, '$.productLink')=? OR (?<>'' AND item_id=?)`).all(link, itemId, itemId);
  if (rows.some(r => ['draft', 'approved', 'posting', 'failed'].includes(r.status))) return '这个商品已经在待审核或排队中了。';
  const last = Math.max(0, ...rows.map(r => r.posted || 0));
  if (last > now - cfg.noRepeatDays * 86400e3) {
    const days = Math.floor((now - last) / 86400e3);
    return `这个商品${days ? ` ${days} 天前` : '今天'}发过了（设置是 ${cfg.noRepeatDays} 天内不重复发）。`;
  }
  return '';
}

/* returns { duplicate } instead of adding when the product is already there, unless force */
export function addManual(b) {
  b = b && typeof b === 'object' ? b : {};
  const m = manualFields(b);
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 4) : [];
  if (!photos.length) throw new Error('至少加 1 张商品照片');
  const cfg = loadConfig(), ids = ITEM_IDS.exec(new URL(m.productLink).pathname) || [];
  if (!b.force) { const duplicate = manualDuplicate(m.productLink, ids[2] || ids[4] || '', cfg); if (duplicate) return { duplicate }; }

  const id = newDraftId();
  const files = photos.map((p, i) => writePhoto(i ? `up-${id}-${i}` : `m-${id}`, p));
  const p = { itemId: ids[2] || ids[4] || 'm' + id, shopId: ids[1] || ids[3] || '', shopName: '', imageUrl: '', comm: null, offerLink: '', manual: true, img: files[0], ...m };
  const pickState = kv.get('pickState', { prev: null, rot: {} });
  const form = newForm({ p }, cfg, pickState);
  form.photos = ['img:' + files[0], ...files.slice(1).map(f => 'up:' + f)];
  const d = withCaptions({ id, itemId: p.itemId, shopId: p.shopId, strat: 'man', p, form, shortLink: m.productLink, subIds: [], collectedDay: dayStr() }, cfg);
  drafts.insert(d);
  kv.set('pickState', pickState);
  queuePosters([id]);
  return d;
}

/* 商品资料 on the edit page: fix a hand-added product's details. Headline and captions follow the new numbers
   and link the way the pre-post price check updates them (a hand-written text gets its numbers swapped) */
export function saveManualProduct(id, b) {
  const d = drafts.get(id);
  if (!d || !d.p.manual) throw new Error('只有手动添加的商品可以改资料');
  if (!['draft', 'approved'].includes(d.status)) throw new Error('这张草稿正在发布或已经处理完，不能再改了');
  const cfg = loadConfig(), o = d.p, p = { ...o, ...manualFields(b) };
  const f = { ...d.form, ...refreshHeadline(d.form, o, p, cfg) };
  for (const k of ['cap1', 'cap2']) if (f[k + 'Manual']) f[k] = swapNumbers(f[k], o, p, cfg).split(d.shortLink).join(p.productLink);
  const nd = { ...d, p, form: f, shortLink: p.productLink };
  refreshCaptions(nd, cfg);
  if (!drafts.update(id, { p, form: nd.form, shortLink: nd.shortLink }, { from: ['draft', 'approved'] })) throw new Error('这张草稿刚刚开始发布，改动没有保存');
  queuePosters([id]);
  return drafts.get(id);
}

/* 批准 on a hand-added draft whose price was typed in over a day ago: nothing re-checks it, so ask first ('' = no question) */
export function priceQuestion(d, now = Date.now()) {
  if (!d || !d.p.manual || d.status !== 'draft') return '';
  const days = Math.floor((now - (d.p.checkedAt || d.createdAt)) / 86400e3);
  return days >= 1 ? `这张是 ${days} 天前填的价格。Shopee 上现在还是 ${rm(d.p.price)} 吗？\n\n确定：照这个价格批准\n取消：先去「编辑 → 商品资料」改价格` : '';
}

/* posting pause (Facebook token / rate-limit problems). source 'token' pauses are lifted by a passing token check.
   message: what happened and what to do, in plain words; detail: Facebook's own words, shown apart */
const pauseListeners = [];
export const onPause = fn => pauseListeners.push(fn);
export const pause = {
  get: () => kv.get('publishPaused'),
  set(code, message, source = code === 190 ? 'token' : 'post', detail = '') {
    const old = kv.get('publishPaused'), p = { code, message, detail, source, at: Date.now() };
    kv.set('publishPaused', p);
    if (!old || old.message !== message || (old.detail || '') !== detail) fire(pauseListeners, p);
  },
  clear: () => kv.del('publishPaused')
};
export const fbWords = m => String(m || '').replace(/^Facebook (错误 \d+|HTTP \d+): /, '').replace(/[\s.。!！]+$/, '');
export function pauseText(code, problems = []) {
  const queued = '批准的帖子会继续排队。';
  if (code === 190) return `Facebook token ${problems.length ? '有问题：' + problems.join('；') : '失效了'}，帖子发不出去。到 Meta 重新生成 Page token，换掉服务器设置里的 FB_PAGE_TOKEN，再点「重试」。${queued}`;
  if ([4, 17, 32].includes(code)) return `Facebook 说请求太频繁，暂时不让发。等一会儿再点「重试」。${queued}`;
  if (code === 368) return `Facebook 暂时挡住了这个专页发帖（可能被当成垃圾或违规内容）。先到专页看看 Facebook 的通知，过一段时间再点「重试」。${queued}`;
  return `Facebook 不让发帖（错误 ${code}）。处理好后点「重试」。${queued}`;
}

/* reminders (Telegram sends them when it is set up) */
const reminderListeners = [];
export const onReminder = fn => reminderListeners.push(fn);
export const remind = r => fire(reminderListeners, r);

export const logRows = (days = 30) => db.prepare('SELECT * FROM posts WHERE at>=? ORDER BY at DESC').all(Date.now() - days * 86400e3);
