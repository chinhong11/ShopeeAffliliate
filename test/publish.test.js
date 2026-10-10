/* Step 5: publish flow against a local fake Graph API + SHOPEE_MOCK (no real API calls) */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
cfg.categories = [{ name: 'Test', productCatId: null }];
fs.writeFileSync(cfgFile, JSON.stringify(cfg));

/* fake Graph API: records requests, answers per `mode` */
const calls = [];
let mode = 'ok';
const graph = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c.toString('latin1'));
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, body });
    const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (mode === 'token' && req.url.includes('/photos')) return send(400, { error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } });
    if (mode === '5xx' && req.url.includes('/photos')) return send(500, { error: { message: 'An unknown error has occurred.', code: 1 } });
    if (req.url.includes('/photos')) return send(200, { id: 'ph1', post_id: 'page1_post1' });
    if (req.url.includes('/comments')) return send(200, { id: 'c1' });
    if (req.url.includes('/page1_post1')) return send(200, { permalink_url: 'https://www.facebook.com/page1/posts/post1', id: 'page1_post1' });
    if (req.url.includes('/debug_token')) return send(200, { data: { is_valid: true, type: 'PAGE', profile_id: 'page1', scopes: ['pages_manage_posts', 'pages_manage_engagement', 'pages_read_engagement'], expires_at: 0 } });
    send(404, { error: { message: 'unknown ' + req.url, code: 100 } });
  });
});
await new Promise(r => graph.listen(0, '127.0.0.1', r));

Object.assign(process.env, {
  DATA_DIR: tmp, CONFIG_FILE: cfgFile, SHOPEE_MOCK: '1', TZ: 'Asia/Kuala_Lumpur',
  FB_GRAPH_BASE: `http://127.0.0.1:${graph.address().port}`, FB_PAGE_ID: 'page1', FB_PAGE_TOKEN: 'tok', FB_APP_ID: 'app', FB_APP_SECRET: 'sec'
});
const { db, drafts, dayStr } = await import('../src/db.js');
const { collect } = await import('../src/collect.js');
const { posterKey } = await import('../src/mapping.js');
const { loadConfig } = await import('../src/config.js');
const { posterFile, thumbFile, closeBrowser } = await import('../src/render.js');
const svc = await import('../src/service.js');
const pub = await import('../src/publish.js');
const fb = await import('../src/facebook.js');
const mock = await import('../src/shopee-mock.js');
fb.opts.retryDelayMs = 10;

await collect({ log: () => {} });
/* stand-in posters so no browser is needed: mark every draft's poster as fresh */
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
for (const d of drafts.list('draft')) {
  fs.writeFileSync(posterFile(d.id), PNG); fs.writeFileSync(thumbFile(d.id), PNG);
  drafts.update(d.id, { posterKey: posterKey(d, loadConfig()) });
}
const approveNext = () => { const d = drafts.list('draft').filter(x => !x.priceChanged).sort((a, b) => a.id < b.id ? -1 : 1)[0]; drafts.update(d.id, { status: 'approved', approvedAt: Date.now() }); return d; };
/* a due slot today (inserting any slot for today also stops planDay from adding the configured ones) */
const slotNow = label => db.prepare('INSERT INTO slots(day,label,planned_at) VALUES(?,?,?)').run(dayStr(), label, Date.now() - 60e3).lastInsertRowid;
const lastPost = () => db.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT 1').get();

test.after(async () => { graph.close(); await closeBrowser(); });

test('dry-run logs the payload and makes no API calls', async () => {
  const d = approveNext();
  calls.length = 0;
  const r = await pub.publishDraft(d.id, { dryRun: true });
  assert.equal(r.kind, 'dry-run');
  assert.match(r.payload.message, /购买链接放在第一条评论/);
  assert.match(r.payload.comment, /s\.shopee\.com\.my\//);
  assert.equal(calls.length, 0);
  assert.equal(drafts.get(d.id).status, 'approved');
});

test('slot → oldest approved → photo + caption ① → comment ② with the link', async () => {
  calls.length = 0;
  const d = drafts.list('approved')[0];
  const sid = slotNow('12:30');
  const [r] = await pub.publishDue();
  assert.equal(r.kind, 'posted');
  const photo = calls.find(c => c.url.includes('/v26.0/page1/photos'));
  assert.ok(photo && photo.method === 'POST');
  assert.match(photo.body, /name="source"; filename="poster.png"/);
  assert.match(photo.body, /name="published"\r\n\r\ntrue/);
  const utf = b => Buffer.from(b, 'latin1').toString('utf8').replace(/\r\n/g, '\n'); // multipart sends \n as \r\n
  assert.ok(utf(photo.body).includes(d.form.cap1));
  const cm = calls.find(c => c.url.includes('/page1_post1/comments'));
  assert.ok(Buffer.from(cm.body, 'latin1').toString('utf8').includes(d.shortLink));
  const row = lastPost();
  assert.equal(row.kind, 'posted'); assert.equal(row.fb_post_id, 'page1_post1'); assert.equal(row.comment_id, 'c1');
  assert.equal(row.permalink, 'https://www.facebook.com/page1/posts/post1');
  assert.deepEqual(JSON.parse(row.sub_ids), d.subIds);
  assert.equal(drafts.get(d.id).status, 'posted');
  assert.equal(db.prepare('SELECT status FROM slots WHERE id=?').get(sid).status, 'used');
});

test('price moved > 3% → back to 待审核 marked 价格变了, nothing posted', async () => {
  const d = approveNext();
  const node = mock.NODES.find(n => String(n.itemId) === d.itemId);
  const old = node.priceMin; node.priceMin = String((Number(old) * 1.2).toFixed(2));
  calls.length = 0;
  const r = await pub.publishDraft(d.id, {});
  node.priceMin = old;
  assert.equal(r.kind, 'returned');
  assert.equal(calls.length, 0);
  const n = drafts.get(d.id);
  assert.equal(n.status, 'draft'); assert.ok(n.priceChanged); assert.match(n.priceChanged.to, /RM/);
  assert.equal(lastPost().kind, 'returned');
});

test('token error 190 → publishing paused, draft stays queued', async () => {
  svc.pause.clear();
  const d = approveNext();
  mode = 'token';
  const r = await pub.publishDraft(d.id, {});
  mode = 'ok';
  assert.equal(r.kind, 'failed'); assert.equal(r.fatal, true);
  assert.equal(svc.pause.get().code, 190);
  assert.equal(drafts.get(d.id).status, 'approved');
  await assert.rejects(pub.publishDraft(d.id, {}), /发布已暂停/);
  const t = await fb.checkToken();
  assert.equal(t.ok, true);
  svc.pause.clear();
});

test('5xx retried once after the delay, then failed + 重试 works', async () => {
  const d = drafts.list('approved')[0];
  mode = '5xx'; calls.length = 0;
  const r = await pub.publishDraft(d.id, {});
  assert.equal(r.kind, 'failed');
  assert.equal(calls.filter(c => c.url.includes('/photos')).length, 2);
  assert.equal(drafts.get(d.id).status, 'failed');
  mode = 'ok';
  const res = await pub.retryPost(lastPost().id);
  assert.equal(res.kind, 'posted');
  assert.equal(drafts.get(d.id).status, 'posted');
});

test('no approved draft → slot skipped; postsPerDay respected', async () => {
  for (const d of drafts.list('approved')) drafts.update(d.id, { status: 'draft' });
  const sid = slotNow('20:30');
  await pub.publishDue();
  assert.equal(db.prepare('SELECT status FROM slots WHERE id=?').get(sid).status, 'skipped');
  approveNext();
  const sid2 = slotNow('23:59');
  await pub.publishDue(); // 2 posted today already (postsPerDay 2)
  assert.equal(db.prepare('SELECT status FROM slots WHERE id=?').get(sid2).status, 'skipped');
});

test('debug_token problems are reported', async () => {
  const real = fb.opts.fetchImpl;
  fb.opts.fetchImpl = async () => new Response(JSON.stringify({ data: { is_valid: true, type: 'USER', profile_id: 'x', scopes: ['pages_manage_posts'], expires_at: 1900000000 } }));
  const t = await fb.checkToken();
  fb.opts.fetchImpl = real;
  assert.equal(t.ok, false);
  assert.equal(t.problems.length, 4);
});
