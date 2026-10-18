/* Step 5 hardening: races, failures before posting, link guarantee, price / t3 / template changes, crash-safe
   recording. Fake Shopee GraphQL + fake Graph API servers, drafts inserted directly (no browser needed). */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pubflow-'));
const cfgFile = path.join(tmp, 'config.json');
const baseCfg = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
const writeCfg = patch => fs.writeFileSync(cfgFile, JSON.stringify({ ...baseCfg, categories: [{ name: 'T', productCatId: null }], ...patch }));
writeCfg({});

/* ---- fake Shopee: product lookups (price / delay / error per item) + generateShortLink ---- */
const shop = { items: {}, delayMs: 0, shortLinks: [] };
const link = ids => 'https://s.shopee.com.my/' + ids.join('');
const shopeeSrv = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const { query } = JSON.parse(b);
    const send = j => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (query.includes('generateShortLink')) {
      const ids = JSON.parse(query.match(/subIds: (\[[^\]]*\])/)[1]);
      shop.shortLinks.push(ids);
      return send({ data: { generateShortLink: { shortLink: link(ids) } } });
    }
    const it = shop.items[query.match(/itemId: (\d+)/)[1]];
    setTimeout(() => {
      if (it && it.error) return send({ errors: [{ message: it.error, extensions: { code: 10020 } }] });
      send({ data: { productOfferV2: { nodes: it ? [it.node] : [] } } });
    }, shop.delayMs);
  });
});
/* ---- fake Graph API ---- */
const fbs = { calls: [], dropPhoto: false, photoMode: '', holdComment: null };
const graphSrv = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c.toString('latin1')); req.on('end', async () => {
    const url = req.url.split('?')[0];
    fbs.calls.push({ method: req.method, url, body: Buffer.from(b, 'latin1').toString('utf8').replace(/\r\n/g, '\n') });
    const send = j => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (url.endsWith('/photos') && fbs.photoMode === 'empty') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(''); } // "OK", no answer
    if (url.endsWith('/photos') && fbs.photoMode === 'cut') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '99' }); res.write('{"id":'); return setTimeout(() => req.socket.destroy(), 20); }
    if (url.endsWith('/photos')) { if (fbs.dropPhoto) return req.socket.destroy(); return send({ id: 'ph', post_id: 'page_post' + fbs.calls.length }); }
    if (url.endsWith('/comments')) { if (fbs.holdComment) await fbs.holdComment; return send({ id: 'c1' }); }
    if (req.method === 'GET' && url.includes('page_post')) return send({ permalink_url: 'https://www.facebook.com/' + url.split('/').pop() });
    send({});
  });
});
await new Promise(r => shopeeSrv.listen(0, '127.0.0.1', r));
await new Promise(r => graphSrv.listen(0, '127.0.0.1', r));
Object.assign(process.env, { GEMINI_API_KEY: '', // never the real key from .env
 
  DATA_DIR: tmp, CONFIG_FILE: cfgFile, TZ: 'Asia/Kuala_Lumpur', SHOPEE_MOCK: '0', SHOPEE_APP_ID: 'a', SHOPEE_APP_SECRET: 's',
  SHOPEE_ENDPOINT: `http://127.0.0.1:${shopeeSrv.address().port}/graphql`,
  FB_GRAPH_BASE: `http://127.0.0.1:${graphSrv.address().port}`, FB_PAGE_ID: 'page', FB_PAGE_TOKEN: 'tok'
});
const { db, drafts, dayStr } = await import('../src/db.js');
const { loadConfig } = await import('../src/config.js');
const { posterKey, rm } = await import('../src/mapping.js');
const { refreshCaptions } = await import('../src/pick.js');
const { posterFile, thumbFile, closeBrowser } = await import('../src/render.js');
const svc = await import('../src/service.js');
const pub = await import('../src/publish.js');
const fb = await import('../src/facebook.js');
fb.opts.retryDelayMs = 5;
test.after(async () => { shopeeSrv.close(); graphSrv.close(); await closeBrowser(); });

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let seq = 0;
/* an approved draft with a poster that matches it; the fake Shopee knows the item at `price` */
function mk({ price = 20, disc = 30, tpl = 't1', status = 'approved', form = {}, approvedAt = Date.now() + seq } = {}) {
  const n = ++seq, id = 'd' + String(n).padStart(8, '0'), itemId = String(7000 + n);
  const node = { itemId: +itemId, shopId: 55, productName: 'Item ' + n, imageUrl: 'x', priceMin: String(price), priceMax: String(price), priceDiscountRate: disc, ratingStar: '4.9', sales: 9000, commissionRate: '0.05', productLink: `https://shopee.com.my/p/55/${itemId}`, offerLink: '', shopName: 's' };
  shop.items[itemId] = { node };
  const p = { itemId, shopId: '55', name: 'Item ' + n, imageUrl: 'x', price, priceMax: price, disc, rating: 4.9, sales: 9000, comm: 0.05, productLink: node.productLink, offerLink: '', img: itemId + '.jpg' };
  const subIds = ['fb', tpl, 'top', '20261011', id];
  const f = { tpl, autoTpl: 't1', l1: '全网都在抢的\n爆款', l2: '已售 9k+ 件', photos: ['img:' + itemId + '.jpg'], used: false,
    review: { quote: '', author: '' }, flash: { end: '', pct: '' }, chat: { m1: '', m2: '', m3: '' }, cap1: '', cap2: '', cap1Manual: false, cap2Manual: false, ...form };
  const d = { id, itemId, shopId: '55', strat: 'top', p, form: f, shortLink: link(subIds), subIds, collectedDay: dayStr() };
  refreshCaptions(d, loadConfig());
  drafts.insert(d);
  drafts.update(id, { status, approvedAt });
  fresh(id);
  return id;
}
const fresh = (id, d = drafts.get(id)) => { fs.writeFileSync(posterFile(id), PNG); fs.writeFileSync(thumbFile(id), PNG); drafts.update(id, { posterKey: posterKey(d, loadConfig()) }); };
const photos = () => fbs.calls.filter(c => c.url.endsWith('/photos'));
const reset = () => { fbs.calls.length = 0; shop.delayMs = 0; fbs.dropPhoto = false; fbs.photoMode = ''; svc.pause.clear(); db.prepare("DELETE FROM posts").run(); };
const slot = label => db.prepare('INSERT INTO slots(day,label,planned_at) VALUES(?,?,?)').run(dayStr(), label, Date.now() - 60e3).lastInsertRowid;

test('撤回 while the pre-post price check runs: nothing is posted', async () => {
  reset();
  const id = mk();
  shop.delayMs = 400;
  const run = pub.publishDraft(id, {});
  setTimeout(() => svc.unapprove(id), 100);
  const r = await run;
  assert.equal(r.kind, 'cancelled');
  assert.equal(photos().length, 0);
  assert.equal(drafts.get(id).status, 'draft');
});

test('two publishers on the same draft (scheduler + npm run publish-due -- --now): it is posted once', async () => {
  reset();
  const id = mk();
  shop.delayMs = 200;
  const [a, b] = await Promise.all([pub.publishDraft(id, {}), pub.publishDraft(id, {})]);
  assert.deepEqual([a.kind, b.kind].sort(), ['cancelled', 'posted']);
  assert.equal(photos().length, 1);
});

test('a failure before posting is recorded and does not block the drafts behind it', async () => {
  reset();
  drafts.list('approved').forEach(d => drafts.update(d.id, { status: 'skipped' }));
  const bad = mk(), good = mk();
  shop.items[drafts.get(bad).itemId].error = 'Invalid Credential';
  const s1 = slot('12:30'), s2 = slot('13:30');
  await pub.publishDue();
  assert.equal(drafts.get(bad).status, 'failed');
  assert.equal(drafts.get(good).status, 'posted');
  const rows = db.prepare('SELECT kind, draft_id, message FROM posts ORDER BY id').all();
  assert.equal(rows[0].kind, 'failed'); assert.equal(rows[0].draft_id, bad); assert.match(rows[0].message, /Invalid Credential/);
  assert.equal(db.prepare('SELECT status FROM slots WHERE id=?').get(s1).status, 'failed');
  assert.equal(db.prepare('SELECT status FROM slots WHERE id=?').get(s2).status, 'used');
  db.prepare('DELETE FROM slots').run();
});

test('connection lost on the photo POST: not re-sent (no duplicate), recorded as maybe-posted', async () => {
  reset();
  const id = mk();
  fbs.dropPhoto = true;
  const r = await pub.publishDraft(id, {});
  assert.equal(r.kind, 'failed');
  assert.equal(photos().length, 1);
  assert.match(r.message, /可能已经发出去/);
  assert.equal(drafts.get(id).status, 'failed');
  /* GETs (idempotent) are still retried once */
  fb.opts.fetchImpl = (() => { let n = 0; return async (...a) => { if (n++ === 0) throw new TypeError('fetch failed'); return fetch(...a); }; })();
  assert.ok(await fb.graph('GET', '/page_post1', {}));
  fb.opts.fetchImpl = (...a) => fetch(...a);
});

test('Facebook says OK with no answer, or the answer is cut off: maybe-posted, never posted again by the slot or another draft', async () => {
  for (const mode of ['empty', 'cut']) {
    reset();
    drafts.list('approved').forEach(d => drafts.update(d.id, { status: 'skipped' }));
    const a = mk(), b = mk(), s = slot('12:30');
    fbs.photoMode = mode;
    await pub.publishDue();
    assert.equal(photos().length, 1, mode);
    assert.equal(drafts.get(a).status, 'failed', mode);
    assert.match(db.prepare("SELECT message FROM posts WHERE draft_id=?").get(a).message, /可能已经发出去了：先到专页看看/, mode);
    assert.notEqual(db.prepare('SELECT status FROM slots WHERE id=?').get(s).status, 'open', mode);
    fbs.photoMode = '';
    await pub.publishDue(); // the next minute's check
    assert.equal(photos().length, 1, mode + ': nothing more posted in that slot');
    assert.equal(drafts.get(b).status, 'approved', mode);
    db.prepare('DELETE FROM slots').run();
  }
});

test('撤回 / 跳过 that come too late say so instead of "done"', async () => {
  reset();
  const id = mk();
  drafts.update(id, { status: 'posting' });
  assert.throws(() => svc.unapprove(id), /撤回不了/);
  assert.throws(() => svc.skip(id), /已经处理过了/);
  assert.equal(drafts.get(id).status, 'posting');
  drafts.update(id, { status: 'skipped' });
});

test('Shopee gives no price (0) right before posting: not posted, back to review with the old price', async () => {
  reset();
  const id = mk({ price: 20 });
  shop.items[drafts.get(id).itemId].node.priceMin = '0';
  const r = await pub.publishDraft(id, {});
  assert.notEqual(r.kind, 'posted');
  assert.equal(photos().length, 0);
  assert.equal(drafts.get(id).status, 'draft');
  assert.equal(drafts.get(id).p.price, 20, 'the old price is kept');
});

test('link mode switched to direct after approval: the post carries the link in the caption', async () => {
  reset();
  const auto = mk(), manual = mk({ form: { cap1: '我写的文案\n👉 购买链接放在第一条评论 👇', cap1Manual: true } });
  writeCfg({ linkMode: 'direct' });
  for (const id of [auto, manual]) fresh(id); // posters for the new config
  for (const id of [auto, manual]) {
    const d = drafts.get(id);
    const r = await pub.publishDraft(id, {});
    assert.equal(r.kind, 'posted');
    const msg = photos().pop().body;
    assert.ok(msg.includes(d.shortLink), 'link in the caption');
    assert.ok(!msg.includes('第一条评论'));
  }
  assert.equal(fbs.calls.filter(c => c.url.endsWith('/comments')).length, 0);
  writeCfg({});
});

test('small price move before posting: the headline and captions get the new price', async () => {
  reset();
  const id = mk({ price: 19.9, disc: 60, form: { l1: '把价格\n打下来了！', l2: '现在只要 RM 19.90' } });
  shop.items[drafts.get(id).itemId].node.priceMin = '19.50';
  const pc = await pub.priceCheck(drafts.get(id));
  assert.equal(pc.ok, true);
  const d = drafts.get(id);
  assert.equal(d.p.price, 19.5);
  assert.equal(d.form.l2, '现在只要 RM 19.50');
  assert.ok(d.form.cap1.includes(rm(19.5)) && !d.form.cap1.includes(rm(19.9)));
  /* a hand-written headline gets its numbers swapped */
  const id2 = mk({ price: 10, disc: 20, form: { l1: '只要 RM 10.00\n冲', l2: '-20% 今天' } });
  Object.assign(shop.items[drafts.get(id2).itemId].node, { priceMin: '10.20', priceDiscountRate: 18 });
  await pub.priceCheck(drafts.get(id2));
  assert.deepEqual([drafts.get(id2).form.l1, drafts.get(id2).form.l2], ['只要 RM 10.20\n冲', '-18% 今天']);
  /* exactly 3 % is not "more than 3 %" */
  const id3 = mk({ price: 10 });
  shop.items[drafts.get(id3).itemId].node.priceMin = '10.30';
  assert.equal((await pub.priceCheck(drafts.get(id3))).ok, true);
});

test('t3 whose flash sale has ended: back to review on the automatic template, nothing posted', async () => {
  reset();
  const id = mk({ tpl: 't3', form: { flash: { end: '12:00', pct: '80', endAt: Date.now() - 60e3 } } });
  const r = await pub.publishDraft(id, {});
  assert.equal(r.kind, 'returned');
  assert.match(r.message, /限时抢购已经结束/);
  assert.equal(photos().length, 0);
  const d = drafts.get(id);
  assert.equal(d.status, 'draft'); assert.equal(d.form.tpl, 't1');
});

test('template changed on an approved draft: the posted link carries the posted template', async () => {
  reset();
  const id = mk({ tpl: 't1' });
  svc.saveForm(id, { tpl: 't6' });                 // edit screen ‹ 返回 on an approved draft
  const d = drafts.get(id);
  const ids = ['fb', 't6', 'top', '20261011', id];
  fresh(id, { ...d, shortLink: link(ids), subIds: ids }); // the poster that state will have
  const r = await pub.publishDraft(id, {});
  assert.equal(r.kind, 'posted');
  assert.deepEqual(shop.shortLinks.pop(), ids);
  const row = db.prepare("SELECT tpl, sub_ids FROM posts WHERE kind='posted' ORDER BY id DESC").get();
  assert.equal(row.tpl, 't6'); assert.deepEqual(JSON.parse(row.sub_ids), ids);
  assert.ok(fbs.calls.find(c => c.url.endsWith('/comments')).body.includes(link(ids)));
});

test('the post is recorded as soon as the photo is live (a crash during the comment can not lead to a second post)', async () => {
  reset();
  const id = mk();
  let release; fbs.holdComment = new Promise(r => { release = r; });
  const run = pub.publishDraft(id, {});
  for (let i = 0; i < 50 && !fbs.calls.some(c => c.url.endsWith('/comments')); i++) await new Promise(r => setTimeout(r, 20));
  const row = db.prepare("SELECT * FROM posts WHERE draft_id=?").get(id);
  assert.equal(row.kind, 'posted'); assert.ok(row.fb_post_id);
  assert.equal(drafts.get(id).status, 'posted');
  pub.recoverInterrupted(); // what the next start does after a crash right now
  assert.match(db.prepare('SELECT message FROM posts WHERE draft_id=?').get(id).message, /服务重启/);
  release(); fbs.holdComment = null;
  assert.equal((await run).kind, 'posted');
});

test('重试 and --now respect postsPerDay', async () => {
  reset();
  const a = mk(), b = mk();
  for (const id of [a, b]) assert.equal((await pub.publishDraft(id, {})).kind, 'posted');
  const c = mk();
  await assert.rejects(pub.publishDraft(c, {}), /postsPerDay/);
  drafts.update(c, { status: 'failed' });
  const rowId = db.prepare("INSERT INTO posts(draft_id,item_id,kind,at) VALUES(?,?,'failed',?)").run(c, '1', Date.now()).lastInsertRowid;
  await assert.rejects(pub.retryPost(rowId), /postsPerDay/);
});
