/* review-app actions + background work (collect, poster renders) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, dirs } from './config.js';
import { drafts, kv, ymd, db } from './db.js';
import * as shopee from './shopee.js';
import { posterKey, TPL } from './mapping.js';
import { refreshCaptions, availability } from './pick.js';
import { renderDraft, posterFile, thumbFile } from './render.js';
import { upcoming } from './slots.js';
import { collect } from './collect.js';

/* live status for the review app (polled by /api/status) */
export const status = { collecting: '', collectResult: null, rendering: new Set(), queued: new Set() };
const listeners = [];
export const onCollected = fn => listeners.push(fn);

/* ---------- posters ---------- */
const inflight = new Map();
export const posterFresh = (d, cfg = loadConfig()) => !!d.posterKey && d.posterKey === posterKey(d, cfg) && fs.existsSync(posterFile(d.id)) && fs.existsSync(thumbFile(d.id));

export function ensurePoster(id, { force = false } = {}) {
  if (inflight.has(id)) return inflight.get(id);
  const d = drafts.get(id);
  if (!d) return Promise.reject(new Error('no draft'));
  if (!force && posterFresh(d)) return Promise.resolve(d);
  status.rendering.add(id);
  const p = renderDraft(id).finally(() => { status.rendering.delete(id); status.queued.delete(id); inflight.delete(id); });
  inflight.set(id, p);
  return p;
}
/* background renders, one after another */
let bg = Promise.resolve();
export function queuePosters(ids) {
  for (const id of ids) {
    status.queued.add(id);
    bg = bg.then(() => ensurePoster(id)).catch(e => console.error('render', id, e.message));
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
      queuePosters(r.ids).then(() => listeners.forEach(fn => fn(r)));
    })
    .catch(e => { status.collectResult = { ok: false, error: e.message, at: Date.now() }; console.error('collect failed:', e.message); })
    .finally(() => { status.collecting = ''; });
  return true;
}

/* ---------- forms ---------- */
const str = (v, n) => String(v ?? '').slice(0, n);
const REF = /^(img|up):[\w.-]+$/;
export function cleanForm(old, f) {
  const n = { ...old };
  if (f.tpl && TPL[f.tpl]) n.tpl = f.tpl;
  if ('l1' in f) n.l1 = str(f.l1, 60);
  if ('l2' in f) n.l2 = str(f.l2, 60);
  if (Array.isArray(f.photos)) {
    const ph = f.photos.filter(x => typeof x === 'string' && REF.test(x)).slice(0, 4);
    if (ph[0] === old.photos[0]) n.photos = ph; // the Shopee image stays first
  }
  if ('used' in f) n.used = !!f.used;
  if (f.review) n.review = { quote: str(f.review.quote, 80), author: str(f.review.author, 16) };
  if (f.flash) n.flash = { end: /^\d\d:\d\d$/.test(f.flash.end || '') ? f.flash.end : '', pct: str(f.flash.pct, 2).replace(/\D/g, '') };
  if (f.chat) n.chat = { m1: str(f.chat.m1, 40), m2: str(f.chat.m2, 40), m3: str(f.chat.m3, 40) };
  for (const k of ['cap1', 'cap2']) if (k in f) n[k] = str(f[k], 2000);
  for (const k of ['cap1Manual', 'cap2Manual']) if (k in f) n[k] = !!f[k];
  if (!availability(n)[n.tpl]) n.tpl = n.autoTpl; // locked templates need their real data first
  return n;
}

export function saveForm(id, f) {
  const d = drafts.get(id);
  if (!d) throw new Error('草稿不存在');
  d.form = cleanForm(d.form, f || {});
  refreshCaptions(d, loadConfig());
  drafts.update(id, { form: d.form });
  return drafts.get(id);
}

/* sub IDs carry the template: when it changed, get a fresh short link and swap it into the captions */
async function syncShortLink(d) {
  if (d.subIds[1] === d.form.tpl) return d;
  const subIds = shopee.cleanSubIds(['fb', d.form.tpl, d.strat, d.subIds[3] || ymd(), d.id]);
  const link = await shopee.shortLink(d.p.productLink || d.p.offerLink, subIds);
  const f = d.form, old = d.shortLink;
  if (old) { f.cap1 = f.cap1.split(old).join(link); f.cap2 = f.cap2.split(old).join(link); }
  d.shortLink = link; d.subIds = subIds;
  refreshCaptions(d, loadConfig());
  drafts.update(d.id, { shortLink: link, subIds, form: f });
  return drafts.get(d.id);
}

/* ---------- actions ---------- */
export async function approve(id, form) {
  let d = drafts.get(id);
  if (!d || !['draft', 'approved'].includes(d.status)) throw new Error('这张草稿不能批准了');
  const again = d.status === 'approved';
  if (form) d = saveForm(id, form);
  d = await syncShortLink(d);
  await ensurePoster(id);
  drafts.update(id, { status: 'approved', approvedAt: again ? d.approvedAt : Date.now(), priceChanged: null, isNew: false });
  return { again, slot: slotOf(id) };
}
export function skip(id) { const d = drafts.get(id); if (d && d.status === 'draft') drafts.update(id, { status: 'skipped' }); }
export function unskip(id) { const d = drafts.get(id); if (d && d.status === 'skipped') drafts.update(id, { status: 'draft' }); }
export function unapprove(id) { const d = drafts.get(id); if (d && d.status === 'approved') drafts.update(id, { status: 'draft', approvedAt: 0 }); }

/* approved drafts fill upcoming slots in approval order */
export function approvedWithSlots(cfg = loadConfig()) {
  const list = drafts.list('approved');
  const sl = upcoming(list.length, cfg);
  return list.map((d, i) => ({ d, slot: sl[i] || null }));
}
export const slotOf = id => { const r = approvedWithSlots().find(x => x.d.id === id); return r && r.slot; };

/* photo upload (data:image/jpeg URL, already resized in the browser) → ref */
export function savePhoto(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('照片格式不对');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4e6) throw new Error('照片太大');
  const name = `up-${id}-${crypto.randomBytes(3).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(dirs.img, name), buf);
  return 'up:' + name;
}

/* posting pause (Facebook token / rate-limit problems) */
const pauseListeners = [];
export const onPause = fn => pauseListeners.push(fn);
export const pause = {
  get: () => kv.get('publishPaused'),
  set(code, message) {
    const old = kv.get('publishPaused'), p = { code, message, at: Date.now() };
    kv.set('publishPaused', p);
    if (!old || old.message !== message) pauseListeners.forEach(fn => { try { fn(p); } catch (e) { console.error(e.message); } });
  },
  clear: () => kv.del('publishPaused')
};

export const logRows = (days = 30) => db.prepare('SELECT * FROM posts WHERE at>=? ORDER BY at DESC').all(Date.now() - days * 86400e3);
