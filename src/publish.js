/* publish approved drafts at their slots (README Step 5). `npm run publish-due [-- --dry-run | --now]` */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadConfig, env, dirs } from './config.js';
import { db, drafts, dayStr } from './db.js';
import * as shopee from './shopee.js';
import * as fb from './facebook.js';
import { productFromOffer, rm, pctOf, flashEnded } from './mapping.js';
import { refreshCaptions, refreshHeadline, swapNumbers, postTexts } from './pick.js';
import { ensurePoster, pause, pauseText, fbWords, posterFresh, syncShortLink } from './service.js';
import { posterFile } from './render.js';
import { planDay, upcoming } from './slots.js';

const events = [];
export const onPublishEvent = fn => events.push(fn);
const emit = (type, data) => events.forEach(fn => Promise.resolve().then(() => fn(type, data)).catch(e => console.error('event', e.message)));

const logPost = r => db.prepare(`INSERT INTO posts(draft_id,item_id,kind,at,slot_id,name,tpl,strategy,layout,sub_ids,fb_post_id,permalink,comment_id,message,payload)
  VALUES(@draft_id,@item_id,@kind,@at,@slot_id,@name,@tpl,@strategy,@layout,@sub_ids,@fb_post_id,@permalink,@comment_id,@message,@payload)`)
  .run({ slot_id: null, fb_post_id: null, permalink: null, comment_id: null, message: null, payload: null, at: Date.now(), ...r }).lastInsertRowid;
const base = d => ({ draft_id: d.id, item_id: d.itemId, name: d.p.name, tpl: d.form.tpl, strategy: d.strat, layout: Math.min(4, d.form.photos.length), sub_ids: JSON.stringify(d.subIds) });
const setSlot = (slotId, status, draftId = null) => slotId && db.prepare('UPDATE slots SET status=?, draft_id=COALESCE(?, draft_id) WHERE id=?').run(status, draftId, slotId);
/* atomic: only one publisher (scheduler, CLI) gets a slot */
const claimSlot = slotId => db.prepare("UPDATE slots SET status='posting' WHERE id=? AND status='open'").run(slotId).changes > 0;
export const postedToday = () => db.prepare("SELECT COUNT(*) n FROM posts WHERE kind='posted' AND at>=?").get(new Date(dayStr() + 'T00:00:00').getTime()).n;
/* marks a posted row whose first comment was still on its way; recoverInterrupted() rewrites it after a crash */
const COMMENT_PENDING = '正在发第一条评论…';

/* README: "price moved > 3 %" — in whole cents, so an exact 3 % move is not "more" */
const movedMoreThan3 = (a, b) => { const c0 = Math.round(a * 100), c1 = Math.round(b * 100); return Math.abs(c1 - c0) * 100 > 3 * c0; };

/* right before posting: re-fetch the product. >3% price move or gone → back to 待审核, no post.
   A smaller move updates the poster, headline and captions so they never show a stale price. */
export async function priceCheck(d, { dryRun = false } = {}) {
  if (d.p.manual) return { ok: true }; // added by hand: no API to re-check against
  const node = await shopee.product(d.shopId, d.itemId);
  if (!node) return { ok: false, gone: true, message: '商品下架了或不在联盟计划里，这次没有发。' };
  const n = productFromOffer(node), o = d.p;
  const changed = n.price !== o.price || Math.round(n.disc) !== Math.round(o.disc);
  if (!changed) return { ok: true };
  const moved = movedMoreThan3(o.price, n.price);
  const pc = { from: rm(o.price), fromPct: pctOf(o), to: rm(n.price), toPct: pctOf(n) };
  if (dryRun) return { ok: !moved, wouldUpdate: true, priceChanged: pc, message: `价格 ${pc.from} → ${pc.to}` };
  const cfg = loadConfig();
  const p = { ...o, price: n.price, priceMax: n.priceMax, disc: n.disc, rating: n.rating ?? o.rating, sales: n.sales || o.sales, comm: n.comm || o.comm };
  /* the headline and hand-edited captions were written from the old numbers */
  const f = { ...d.form, ...refreshHeadline(d.form, o, p, cfg) };
  for (const k of ['cap1', 'cap2']) if (f[k + 'Manual']) f[k] = swapNumbers(f[k], o, p, cfg);
  const nd = { ...d, p, form: f };
  refreshCaptions(nd, cfg);
  drafts.update(d.id, { p, form: nd.form });
  if (moved) return { ok: false, priceChanged: pc, message: `发帖前查价：价格变了（${pc.from} → ${pc.to}），已退回待审核。这个时段没有发帖。` };
  return { ok: true, updated: true };
}

/* the Facebook payload for a draft (captions as they will be posted, link always present) */
export function payload(d, cfg = loadConfig()) {
  const n = d.form.tpl === 't8' ? 4 : Math.min(4, d.form.photos.length); // one poster per photo, same design (render.js)
  const carousel = n > 1;
  const { message, comment } = postTexts(d, cfg);
  return {
    endpoint: carousel ? `POST /${env.FB_PAGE_ID || '{page-id}'}/photos ×4 (published=false) → POST /${env.FB_PAGE_ID || '{page-id}'}/feed attached_media` : `POST /${env.FB_PAGE_ID || '{page-id}'}/photos (source=PNG, published=true)`,
    images: carousel ? Array.from({ length: n }, (_, i) => posterFile(d.id, i + 1)) : [posterFile(d.id)],
    message, comment,
    subIds: d.subIds, shortLink: d.shortLink
  };
}

/* back to 待审核 without posting (price moved, item gone, flash sale over). Only if nobody changed the draft meanwhile. */
function returnToReview(d, from, slotId, message, { gone = false, priceChanged = null, form = null } = {}) {
  const fields = gone ? { status: 'expired' } : { status: 'draft', approvedAt: 0, priceChanged, isNew: false, pendingSince: Date.now(), ...(form ? { form } : {}) };
  if (!drafts.update(d.id, fields, { from: [from] })) return { kind: 'cancelled', message: '发帖前草稿被撤回或改动了，这次没有发' };
  if (!gone) ensurePoster(d.id).catch(() => {});
  setSlot(slotId, 'returned', d.id);
  logPost({ ...base(d), kind: 'returned', slot_id: slotId, message });
  emit('returned', { d, message });
  return { kind: 'returned', message };
}

/* something broke before anything reached Facebook: record it (已发布 + Telegram) and take the draft out of the
   queue as 失败 (重试 posts it), so one broken draft never blocks the approved drafts behind it */
function failBeforePost(d, from, slotId, e) {
  const message = '发帖前出错，这次没有发：' + e.message;
  if (!drafts.update(d.id, { status: 'failed' }, { from: [from] })) return { kind: 'cancelled', message: '发帖前草稿被撤回或改动了，这次没有发' };
  setSlot(slotId, 'failed', d.id);
  logPost({ ...base(d), kind: 'failed', slot_id: slotId, message });
  emit('failed', { d, message, fatal: false });
  return { kind: 'failed', message };
}

/* publish one approved draft now (a 失败 one too with manual: true). Returns {kind: posted|failed|returned|cancelled|dry-run}.
   Throws only for refusals: publishing paused, postsPerDay reached for a post outside the slots. */
export async function publishDraft(id, { slotId = null, dryRun = false, manual = false, scheduled = false } = {}) {
  let d = drafts.get(id);
  if (!d) throw new Error('草稿不存在');
  const from = d.status;
  if (!(from === 'approved' || (manual && from === 'failed'))) return { kind: 'cancelled', message: '只发布已批准的草稿（这张现在是「' + from + '」）' };
  const paused = pause.get();
  if (paused && !dryRun) throw new Error('发布已暂停：' + paused.message);
  const cfg = loadConfig();
  if (!slotId && !scheduled && !dryRun && postedToday() >= cfg.postsPerDay) throw new Error(`今天已经发了 ${cfg.postsPerDay} 帖（postsPerDay），明天再发`);

  let pl, images;
  try {
    if (d.p.mock && !dryRun && !fb.isLocalFake()) throw new Error('这是 SHOPEE_MOCK 测试数据，不能真的发到 Facebook');
    /* a countdown to a sale that has ended would be invented: back to review on the automatic template */
    if (d.form.tpl === 't3' && flashEnded(d.form.flash)) {
      const message = `限时抢购已经结束了（${d.form.flash.end || '没有结束时间'}），这次没有发。已换回自动模板，退回待审核。`;
      if (dryRun) return { kind: 'returned', dryRun: true, message };
      return returnToReview(d, from, slotId, message, { form: { ...d.form, tpl: d.form.autoTpl } });
    }
    const pc = await priceCheck(d, { dryRun });
    if (!pc.ok) {
      if (dryRun) return { kind: 'returned', dryRun: true, message: pc.message };
      return returnToReview(d, from, slotId, pc.message, { gone: pc.gone, priceChanged: pc.priceChanged });
    }
    d = drafts.get(id);
    if (dryRun) {
      const view = { ...d, form: { ...d.form } };
      refreshCaptions(view, cfg);
      pl = payload(view, cfg);
      console.log('[dry-run] no API calls. Facebook payload:\n' + JSON.stringify({ ...pl, posterFresh: posterFresh(d, cfg), priceCheck: pc,
        ...(!d.p.manual && d.subIds[1] !== d.form.tpl ? { note: `sub IDs still carry ${d.subIds[1]}; a real post first gets a short link for ${d.form.tpl}` } : {}) }, null, 2));
      return { kind: 'dry-run', payload: pl };
    }
    d = await syncShortLink(d); // the link's sub IDs must name the template that is posted
    /* captions as the current config wants them (link mode, voucher, hashtags) unless edited by hand */
    refreshCaptions(d, cfg);
    drafts.update(id, { form: d.form }, { from: [from] });
    /* the poster must match the state being posted; t3's countdown is re-rendered at post time */
    if (d.form.tpl === 't3') await ensurePoster(id, { force: true });
    else if (!posterFresh(d, cfg)) await ensurePoster(id);
    d = drafts.get(id);
    if (!posterFresh(d, cfg)) { await ensurePoster(id); d = drafts.get(id); } // edited while it rendered
    if (!posterFresh(d, cfg)) throw new Error('海报还没跟上草稿的改动');
    pl = payload(d, cfg);
    images = pl.images.map(f => fs.readFileSync(f));
  } catch (e) {
    if (dryRun) throw e;
    return failBeforePost(d, from, slotId, e);
  }

  /* claim it: only if it is still in the status we started from (not withdrawn, skipped or taken by another publisher) */
  if (!drafts.update(id, { status: 'posting' }, { from: [from] })) return { kind: 'cancelled', message: '发帖前草稿被撤回、跳过或已经在发了，这次没有发' };
  setSlot(slotId, 'posting', id);
  let post;
  try {
    post = images.length > 1 ? await fb.postCarousel(images, pl.message, pl.images.map(f => path.basename(f))) : await fb.postPhoto(images[0], pl.message);
  } catch (e) {
    const fatal = e instanceof fb.FbError && e.fatal;
    if (fatal) pause.set(e.code, pauseText(e.code), undefined, fbWords(e.message));
    drafts.update(id, { status: fatal ? 'approved' : 'failed' }); // paused: stays queued for the next slot
    setSlot(slotId, 'failed', id);
    const msg = e instanceof fb.FbError && e.status === 599
      ? `连接 Facebook 时网络中断（${e.message}）。帖子可能已经发出去了：先到专页看看，没有再点重试。`
      : (e instanceof fb.FbError && e.serverError ? 'Facebook 服务器错误，60 秒后自动重试也失败。' : '') + e.message;
    logPost({ ...base(d), kind: 'failed', slot_id: slotId, message: msg, payload: JSON.stringify(pl) });
    emit('failed', { d, message: msg, fatal });
    return { kind: 'failed', message: msg, fatal };
  }
  /* the photo is live: record it before anything else, so a crash from here on can never lead to a second post */
  const postId = post.post_id || post.id;
  drafts.update(id, { status: 'posted' });
  setSlot(slotId, 'used', id);
  const rowId = logPost({ ...base(d), kind: 'posted', slot_id: slotId, fb_post_id: postId, message: pl.comment ? COMMENT_PENDING : null, payload: JSON.stringify(pl) });
  let commentId = null, note = null;
  if (pl.comment) {
    try { commentId = (await fb.comment(postId, pl.comment)).id; }
    catch (e) {
      note = (e instanceof fb.FbError && e.status === 599 ? '帖子已发，发第一条评论时网络中断（评论可能发出去了）：' : '帖子已发，但第一条评论没发出去：')
        + e.message + '。请到 Facebook 看看，没有就手动补上链接评论。';
      if (e instanceof fb.FbError && e.fatal) pause.set(e.code, pauseText(e.code), undefined, fbWords(e.message));
    }
  }
  const link = await fb.permalink(postId);
  db.prepare('UPDATE posts SET permalink=?, comment_id=?, message=? WHERE id=?').run(link, commentId, note, rowId);
  emit('posted', { d, postId, permalink: link, note });
  return { kind: 'posted', postId, permalink: link, commentId, note };
}

const oldestApproved = () => drafts.list('approved').find(d => !d.form.postAt) || null; // drafts with their own 发布时间 don't take slots

/* every 5 min: each due, unused slot → oldest approved draft. None approved → slot skipped. */
export async function publishDue({ now = Date.now(), log = console.log } = {}) {
  const cfg = loadConfig();
  planDay(dayStr(now), cfg);
  const due = db.prepare("SELECT * FROM slots WHERE status='open' AND planned_at<=? ORDER BY planned_at").all(now);
  const out = [];
  /* 发布时间 set on the draft: posted when it comes (within a tick, 5 min), outside the slots and postsPerDay.
     More than 2 h late (the app was off) → no surprise post: it joins the normal queue instead. */
  for (const d of drafts.list('approved').filter(x => x.form.postAt && x.form.postAt <= now)) {
    if (pause.get()) { log(`${d.id}: own time, publishing paused`); break; }
    if (now - d.form.postAt > 2 * 3600e3) { drafts.update(d.id, { form: { ...d.form, postAt: null } }, { from: ['approved'] }); log(`${d.id}: own time missed by > 2 h, back in the normal queue`); continue; }
    log(`${d.id}: own time, posting`);
    try { const r = await publishDraft(d.id, { scheduled: true }); out.push(r); log(`  → ${r.kind}${r.message ? ': ' + r.message : ''}`); }
    catch (e) { log('  ! ' + e.message); }
  }
  for (const s of due) {
    if (now - s.planned_at > 2 * 3600e3) { setSlot(s.id, 'skipped'); log(`slot ${s.day} ${s.label}: missed by > 2 h, skipped`); continue; }
    if (pause.get()) { log(`slot ${s.day} ${s.label}: publishing paused`); break; } // stays open until resumed or missed
    if (postedToday() >= cfg.postsPerDay) { setSlot(s.id, 'skipped'); log(`slot ${s.label}: postsPerDay reached`); continue; }
    if (!claimSlot(s.id)) continue; // another publisher has it
    let done = false;
    for (let tries = 0; tries < 3 && !done; tries++) { // a draft withdrawn at the last moment hands the slot to the next one
      const d = oldestApproved();
      if (!d) { setSlot(s.id, 'skipped'); log(`slot ${s.day} ${s.label}: nothing approved, skipped`); done = true; break; }
      log(`slot ${s.day} ${s.label}: posting ${d.id}`);
      try {
        const r = await publishDraft(d.id, { slotId: s.id });
        out.push(r);
        log(`  → ${r.kind}${r.message ? ': ' + r.message : ''}${r.permalink ? ' ' + r.permalink : ''}`);
        done = r.kind !== 'cancelled';
      } catch (e) { log('  ! ' + e.message); break; }
    }
    if (!done) setSlot(s.id, 'open'); // still usable by the next tick
  }
  return out;
}

/* manual 重试 from 已发布 */
export async function retryPost(postRowId) {
  const r = db.prepare('SELECT * FROM posts WHERE id=?').get(postRowId);
  if (!r || r.kind !== 'failed') throw new Error('没有这条失败记录');
  const res = await publishDraft(r.draft_id, { manual: true });
  if (res.kind !== 'posted') throw new Error(res.message || '还是没发出去');
  db.prepare("UPDATE posts SET message=COALESCE(message,'') || ' · 已手动重试成功' WHERE id=?").run(postRowId);
  return res;
}

/* a crash between claim and result leaves 'posting': never auto-retry (it may be live).
   Called by the instance that holds the scheduler lease (jobs.js), so a still-running old instance isn't overruled. */
export function recoverInterrupted() {
  for (const r of db.prepare("SELECT id FROM drafts WHERE status='posting'").all()) {
    const d = drafts.get(r.id);
    if (!drafts.update(d.id, { status: 'failed' }, { from: ['posting'] })) continue;
    logPost({ ...base(d), kind: 'failed', message: '发布过程中服务重启了。先到 Facebook 专页看看有没有发出去，没有再点重试。' });
  }
  db.prepare("UPDATE slots SET status='failed' WHERE status='posting'").run();
  db.prepare("UPDATE posts SET message=? WHERE kind='posted' AND message=?").run('帖子已发；发第一条评论时服务重启了，请到 Facebook 看看有没有链接评论，没有就手动补上。', COMMENT_PENDING);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dry = process.argv.includes('--dry-run'), now = process.argv.includes('--now');
  (async () => {
    const { closeBrowser } = await import('./render.js');
    try {
      if (dry || now) {
        const d = oldestApproved();
        if (!d) { console.log('no approved draft'); return; }
        const next = upcoming(1, loadConfig())[0];
        console.log(`oldest approved: ${d.id} ${d.p.name} · ${d.form.tpl}${dry && next ? ` · next slot ${next.text}` : ''}`);
        const r = await publishDraft(d.id, { dryRun: dry });
        if (!dry) console.log(JSON.stringify(r, null, 2));
      } else await publishDue();
    } catch (e) { console.error('publish failed:', e.message); process.exitCode = 1; }
    finally { await closeBrowser(); }
  })();
}
