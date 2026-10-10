/* publish approved drafts at their slots (README Step 5). `npm run publish-due [-- --dry-run | --now]` */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, env } from './config.js';
import { db, drafts, dayStr } from './db.js';
import * as shopee from './shopee.js';
import * as fb from './facebook.js';
import { productFromOffer, rm, pctOf, posterKey } from './mapping.js';
import { refreshCaptions } from './pick.js';
import { ensurePoster, pause, posterFresh } from './service.js';
import { posterFile } from './render.js';
import { planDay, upcoming } from './slots.js';

const events = [];
export const onPublishEvent = fn => events.push(fn);
const emit = (type, data) => events.forEach(fn => { try { fn(type, data); } catch (e) { console.error('event', e.message); } });

const logPost = r => db.prepare(`INSERT INTO posts(draft_id,item_id,kind,at,slot_id,name,tpl,strategy,layout,sub_ids,fb_post_id,permalink,comment_id,message,payload)
  VALUES(@draft_id,@item_id,@kind,@at,@slot_id,@name,@tpl,@strategy,@layout,@sub_ids,@fb_post_id,@permalink,@comment_id,@message,@payload)`)
  .run({ slot_id: null, fb_post_id: null, permalink: null, comment_id: null, message: null, payload: null, at: Date.now(), ...r }).lastInsertRowid;
const base = d => ({ draft_id: d.id, item_id: d.itemId, name: d.p.name, tpl: d.form.tpl, strategy: d.strat, layout: Math.min(4, d.form.photos.length), sub_ids: JSON.stringify(d.subIds) });
const setSlot = (slotId, status, draftId = null) => slotId && db.prepare('UPDATE slots SET status=?, draft_id=COALESCE(?, draft_id) WHERE id=?').run(status, draftId, slotId);
const postedToday = () => db.prepare("SELECT COUNT(*) n FROM posts WHERE kind='posted' AND at>=?").get(new Date(dayStr() + 'T00:00:00').getTime()).n;

/* right before posting: re-fetch the product. >3% price move or gone → back to 待审核, no post.
   A smaller move still updates the poster and captions so they never show a stale price. */
export async function priceCheck(d, { dryRun = false } = {}) {
  const node = await shopee.product(d.shopId, d.itemId);
  if (!node) return { ok: false, gone: true, message: '商品下架了或不在联盟计划里，这次没有发。' };
  const n = productFromOffer(node), o = d.p;
  const moved = Math.abs(n.price - o.price) / o.price;
  const changed = n.price !== o.price || Math.round(n.disc) !== Math.round(o.disc);
  if (!changed) return { ok: true };
  const pc = { from: rm(o.price), fromPct: pctOf(o), to: rm(n.price), toPct: pctOf(n) };
  if (dryRun) return { ok: moved <= 0.03, wouldUpdate: true, priceChanged: pc, message: `价格 ${pc.from} → ${pc.to}` };
  const p = { ...o, price: n.price, priceMax: n.priceMax, disc: n.disc, rating: n.rating ?? o.rating, sales: n.sales || o.sales, comm: n.comm || o.comm };
  const f = d.form;
  for (const k of ['cap1', 'cap2']) if (f[k + 'Manual']) f[k] = f[k].split(rm(o.price)).join(rm(n.price));
  const nd = { ...d, p, form: f };
  refreshCaptions(nd, loadConfig());
  drafts.update(d.id, { p, form: nd.form });
  if (moved > 0.03) return { ok: false, priceChanged: pc, message: `发帖前查价：价格变了（${pc.from} → ${pc.to}），已退回待审核。这个时段没有发帖。` };
  return { ok: true, updated: true };
}

/* the Facebook payload for a draft */
export function payload(d, cfg = loadConfig()) {
  const direct = cfg.linkMode === 'direct';
  const carousel = d.form.tpl === 't8';
  return {
    endpoint: carousel ? `POST /${env.FB_PAGE_ID || '{page-id}'}/photos ×4 (published=false) → POST /${env.FB_PAGE_ID || '{page-id}'}/feed attached_media` : `POST /${env.FB_PAGE_ID || '{page-id}'}/photos (source=PNG, published=true)`,
    images: carousel ? [1, 2, 3, 4].map(i => posterFile(d.id, i)) : [posterFile(d.id)],
    message: d.form.cap1,
    comment: direct ? null : d.form.cap2,
    subIds: d.subIds, shortLink: d.shortLink
  };
}

/* publish one approved draft now. Returns {kind, ...}. */
export async function publishDraft(id, { slotId = null, dryRun = false, manual = false } = {}) {
  let d = drafts.get(id);
  if (!d) throw new Error('草稿不存在');
  if (!['approved'].includes(d.status) && !(manual && d.status === 'failed')) throw new Error('只发布已批准的草稿');
  if (d.p.mock && !dryRun && !fb.isLocalFake()) throw new Error('这是 SHOPEE_MOCK 测试数据，不能真的发到 Facebook');
  const paused = pause.get();
  if (paused && !dryRun) throw new Error('发布已暂停：' + paused.message);
  const cfg = loadConfig();

  const pc = await priceCheck(d, { dryRun });
  if (!pc.ok) {
    if (dryRun) return { kind: 'returned', dryRun: true, message: pc.message };
    if (pc.gone) drafts.update(id, { status: 'expired' });
    else { drafts.update(id, { status: 'draft', approvedAt: 0, priceChanged: pc.priceChanged, isNew: false }); ensurePoster(id).catch(() => {}); }
    setSlot(slotId, 'returned', id);
    logPost({ ...base(d), kind: 'returned', slot_id: slotId, message: pc.message });
    emit('returned', { d, message: pc.message });
    return { kind: 'returned', message: pc.message };
  }
  d = drafts.get(id);
  /* poster must match the approved state; t3's countdown is re-rendered at post time */
  if (!dryRun && (d.form.tpl === 't3' || !posterFresh(d, cfg))) await ensurePoster(id, { force: d.form.tpl === 't3' });
  d = drafts.get(id);
  const pl = payload(d, cfg);
  if (dryRun) {
    console.log('[dry-run] no API calls. Facebook payload:\n' + JSON.stringify({ ...pl, posterFresh: posterFresh(d, cfg), priceCheck: pc }, null, 2));
    return { kind: 'dry-run', payload: pl };
  }

  /* claim it first so a crash can't post twice */
  drafts.update(id, { status: 'posting' });
  setSlot(slotId, 'posting', id);
  let post;
  try {
    const imgs = pl.images.map(f => fs.readFileSync(f));
    post = d.form.tpl === 't8' ? await fb.postCarousel(imgs, pl.message) : await fb.postPhoto(imgs[0], pl.message);
  } catch (e) {
    const fatal = e instanceof fb.FbError && e.fatal;
    if (fatal) pause.set(e.code, `Facebook 错误 ${e.code}：${e.message.replace(/^Facebook 错误 \d+: /, '')}。${e.code === 190 ? '到 Meta 重新生成 Page token，更新到服务器设置后点「重试」。' : '等一会儿再点「重试」。'}批准的帖子会继续排队。`);
    drafts.update(id, { status: fatal ? 'approved' : 'failed' }); // paused: stays queued for the next slot
    setSlot(slotId, 'failed', id);
    const msg = (e instanceof fb.FbError && e.serverError ? 'Facebook 服务器错误，60 秒后自动重试也失败。' : '') + e.message;
    logPost({ ...base(d), kind: 'failed', slot_id: slotId, message: msg, payload: JSON.stringify(pl) });
    emit('failed', { d, message: msg, fatal });
    return { kind: 'failed', message: msg, fatal };
  }
  const postId = post.post_id || post.id;
  let commentId = null, note = null;
  if (pl.comment) {
    try { commentId = (await fb.comment(postId, pl.comment)).id; }
    catch (e) {
      note = '帖子已发，但第一条评论没发出去：' + e.message + '。请到 Facebook 手动补上链接评论。';
      if (e instanceof fb.FbError && e.fatal) pause.set(e.code, e.message);
    }
  }
  const link = await fb.permalink(postId);
  drafts.update(id, { status: 'posted' });
  setSlot(slotId, 'used', id);
  logPost({ ...base(d), kind: 'posted', slot_id: slotId, fb_post_id: postId, permalink: link, comment_id: commentId, message: note, payload: JSON.stringify(pl) });
  emit('posted', { d, postId, permalink: link, note });
  return { kind: 'posted', postId, permalink: link, commentId, note };
}

const oldestApproved = () => drafts.list('approved')[0] || null;

/* every 5 min: each due, unused slot → oldest approved draft. None approved → slot skipped. */
export async function publishDue({ now = Date.now(), log = console.log } = {}) {
  const cfg = loadConfig();
  planDay(dayStr(now), cfg);
  const due = db.prepare("SELECT * FROM slots WHERE status='open' AND planned_at<=? ORDER BY planned_at").all(now);
  const out = [];
  for (const s of due) {
    if (now - s.planned_at > 2 * 3600e3) { setSlot(s.id, 'skipped'); log(`slot ${s.day} ${s.label}: missed by > 2 h, skipped`); continue; }
    if (pause.get()) { log(`slot ${s.day} ${s.label}: publishing paused`); break; } // stays open until resumed or missed
    if (postedToday() >= cfg.postsPerDay) { setSlot(s.id, 'skipped'); log(`slot ${s.label}: postsPerDay reached`); continue; }
    const d = oldestApproved();
    if (!d) { setSlot(s.id, 'skipped'); log(`slot ${s.day} ${s.label}: nothing approved, skipped`); continue; }
    log(`slot ${s.day} ${s.label}: posting ${d.id}`);
    try { const r = await publishDraft(d.id, { slotId: s.id }); out.push(r); log(`  → ${r.kind}${r.message ? ': ' + r.message : ''}${r.permalink ? ' ' + r.permalink : ''}`); }
    catch (e) { log('  ! ' + e.message); }
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

/* a crash between claim and result leaves 'posting': never auto-retry (it may be live) */
export function recoverInterrupted() {
  for (const r of db.prepare("SELECT id FROM drafts WHERE status='posting'").all()) {
    const d = drafts.get(r.id);
    drafts.update(d.id, { status: 'failed' });
    logPost({ ...base(d), kind: 'failed', message: '发布过程中服务重启了。先到 Facebook 专页看看有没有发出去，没有再点重试。' });
  }
  db.prepare("UPDATE slots SET status='failed' WHERE status='posting'").run();
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
