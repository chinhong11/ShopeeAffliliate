/* ＋ 手动添加: a hand-added product (no Shopee API keys) becomes a draft and posts with the pasted link,
   without any Shopee call (none could succeed: no keys, no mock) */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'man-'));
const calls = [];
const graph = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c.toString('latin1'));
  req.on('end', () => {
    calls.push({ url: req.url, body });
    const send = j => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (req.url.includes('/photos')) return send({ id: 'ph1', post_id: 'page1_post1' });
    if (req.url.includes('/comments')) return send({ id: 'c1' });
    send({ permalink_url: 'https://www.facebook.com/page1/posts/post1', id: 'page1_post1' });
  });
});
await new Promise(r => graph.listen(0, '127.0.0.1', r));
Object.assign(process.env, { GEMINI_API_KEY: '', // never the real key from .env
 
  DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'none.json'), SHOPEE_MOCK: '', SHOPEE_APP_ID: '', SHOPEE_APP_SECRET: '', TZ: 'Asia/Kuala_Lumpur',
  FB_GRAPH_BASE: `http://127.0.0.1:${graph.address().port}`, FB_PAGE_ID: 'page1', FB_PAGE_TOKEN: 'tok', FB_APP_ID: 'app', FB_APP_SECRET: 'sec'
});
const { drafts } = await import('../src/db.js');
const { posterKey } = await import('../src/mapping.js');
const { loadConfig } = await import('../src/config.js');
const { posterFile, thumbFile, closeBrowser } = await import('../src/render.js');
const shopee = await import('../src/shopee.js');
const svc = await import('../src/service.js');
const pub = await import('../src/publish.js');
test.after(async () => { graph.close(); await closeBrowser(); }); // a queued background render may have opened Chromium

const photo = 'data:image/jpeg;base64,' + fs.readFileSync(new URL('../design/review-photos/p-ramen1.jpg', import.meta.url)).toString('base64');
const LINK = 'https://s.shopee.com.my/AbC123';
/* stand-in poster, written before the queued render gets its turn (no browser in tests) */
const fresh = d => { for (let i = 1; i <= Math.min(4, d.form.photos.length); i++) fs.writeFileSync(posterFile(d.id, i), Buffer.from('89504e470d0a1a0a', 'hex')); fs.writeFileSync(posterFile(d.id), Buffer.from('89504e470d0a1a0a', 'hex')); fs.writeFileSync(thumbFile(d.id), 'x'); drafts.update(d.id, { posterKey: posterKey(drafts.get(d.id), loadConfig()) }); return drafts.get(d.id); };
const input = { name: '辛拉面 单包', price: '2.90', was: '4.90', rating: '4.8', sales: '8700', link: LINK, photos: [photo, photo] };

test('hand-added product: checked, made into a draft, posted with the pasted link and no Shopee call', async () => {
  assert.equal(shopee.ready(), false);
  for (const [k, v, msg] of [['name', '', /名称/], ['price', '0', /现价/], ['was', '1', /原价/], ['rating', '6', /评分/], ['sales', '1.5', /已售/],
    ['link', 'https://evil.example/shopee.com.my', /Shopee 的链接/], ['link', 'http://s.shopee.com.my/x', /Shopee 的链接/], ['photos', [], /照片/]]) {
    assert.throws(() => svc.addManual({ ...input, [k]: v }), msg, k);
  }
  const d = svc.addManual(input);
  fresh(d); // stand-in posters (no browser), written before the queued render gets its turn

  const s = drafts.get(d.id);
  assert.equal(s.strat, 'man');
  assert.equal(s.shortLink, LINK);
  assert.equal(s.p.disc, 41);
  assert.equal(s.form.photos.length, 2);
  assert.match(s.form.cap2, /s\.shopee\.com\.my\/AbC123/);

  await svc.approve(d.id); // would throw on a short-link call without keys
  const r = await pub.publishDraft(d.id);
  assert.equal(r.kind, 'posted', r.message);
  assert.ok(calls.some(c => c.url.includes('/comments') && decodeURIComponent(c.body.replace(/\+/g, ' ')).includes(LINK)));
});

test('hand-added: duplicates are caught, details can be fixed, an old price is asked about', async () => {
  const link = 'https://s.shopee.com.my/Dup1';
  const d = fresh(svc.addManual({ ...input, link }));
  assert.match(svc.addManual({ ...input, link }).duplicate, /待审核或排队中/);                 // same link still waiting
  assert.ok(fresh(svc.addManual({ ...input, link, force: true })).id);                               // 还是要加 → added anyway
  assert.match(svc.manualDuplicate(LINK), /今天发过了/);                                       // posted in the first test

  /* fixing the details: numbers, headline, captions and link follow; photos stay */
  const s = fresh(svc.saveManualProduct(d.id, { ...input, price: '3.50', was: '', link: 'https://s.shopee.com.my/New9' }));
  assert.equal(s.p.price, 3.5); assert.equal(s.p.disc, 0); assert.equal(s.p.img, d.p.img);
  assert.equal(s.shortLink, 'https://s.shopee.com.my/New9');
  assert.match(s.form.cap2, /New9/); assert.doesNotMatch(s.form.cap2 + s.form.cap1 + s.form.l1 + s.form.l2, /RM 2\.90/);
  assert.throws(() => svc.saveManualProduct(d.id, { ...input, price: 'x' }), /现价/);

  /* the price question: only for hand-added drafts, only once the price is a day old */
  assert.equal(svc.priceQuestion(s), '');
  assert.match(svc.priceQuestion(s, Date.now() + 2 * 86400e3), /2 天前.*RM 3\.50/s);
  assert.equal(svc.priceQuestion({ ...s, status: 'approved' }, Date.now() + 2 * 86400e3), '');
  assert.equal(svc.priceQuestion({ ...s, p: { ...s.p, manual: false } }, Date.now() + 2 * 86400e3), '');
});

test('queue page: the last Facebook check is shown when posting is not paused', async () => {
  const { queueView } = await import('../src/views/queue.js');
  const base = { brand: 'LIM', pending: [], approved: [], today: [], paused: null, collecting: '', lastCollect: null, collectError: null, posterState: () => ({}), posted: {}, hasApi: false };
  assert.match(queueView({ ...base, tokenCheck: { at: Date.now(), ok: true } }), /✓ Facebook 正常 · 今天 \d\d:\d\d 检查过/);
  assert.match(queueView({ ...base, tokenCheck: { at: Date.now(), ok: false, transient: true } }), /暂时连不上 Facebook/);
  assert.doesNotMatch(queueView({ ...base, tokenCheck: null }), /fbst/);
  assert.doesNotMatch(queueView({ ...base, paused: { code: 190, message: 'x' }, tokenCheck: { at: Date.now(), ok: true } }), /Facebook 正常/);
});

test('imported Shopee photos: downloaded only from Shopee image hosts, images only', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex'), ok = 'https://down-my.img.susercontent.com/file/my-111-a';
  const fake = (type = 'image/png', status = 200, url = '') => async () => ({ ok: status < 300, status, url, headers: new Headers({ 'content-type': type }), arrayBuffer: async () => png });
  const [up, got] = await svc.importPhotos([photo, ok], fake());
  assert.equal(up, photo);                                                            // an uploaded photo passes through
  assert.equal(got, 'data:image/png;base64,' + png.toString('base64'));
  await assert.rejects(svc.importPhotos(['http://down-my.img.susercontent.com/file/x'], fake()), /只能导入 Shopee/);
  await assert.rejects(svc.importPhotos(['https://evil.example/file/x'], fake()), /只能导入 Shopee/);
  await assert.rejects(svc.importPhotos(['https://susercontent.com.evil.example/x'], fake()), /只能导入 Shopee/);
  await assert.rejects(svc.importPhotos([ok], fake('image/png', 200, 'https://evil.example/x')), /只能导入 Shopee/); // redirected away
  await assert.rejects(svc.importPhotos([ok], fake('text/html')), /格式不支持/);
  await assert.rejects(svc.importPhotos([photo, ok], fake('image/png', 404)), /第 2 张照片.*HTTP 404/);   // says which photo
  assert.match((await svc.importPhotos([ok], fake('image/avif')))[0], /^data:image\/avif;base64,/);
  await assert.rejects(svc.importPhotos([ok], fake('image/png', 404)), /HTTP 404/);
  assert.deepEqual(await svc.importPhotos(undefined), []);
});

test('已跳过 → 删除: only a skipped draft, gone for good', () => {
  const d = svc.addManual({ ...input, link: 'https://s.shopee.com.my/Del1', force: true });
  assert.throws(() => svc.removeSkipped(d.id), /不在「已跳过」/);  // still waiting: not deleted
  assert.ok(drafts.get(d.id));
  svc.skip(d.id);
  svc.removeSkipped(d.id);
  assert.equal(drafts.get(d.id), undefined);
  assert.throws(() => svc.removeSkipped(d.id), /不在「已跳过」/);  // twice: plain message
  assert.equal(svc.manualDuplicate('https://s.shopee.com.my/Del1'), ''); // can be added again
});

test('several photos: one poster per photo in the same design, posted together', async () => {
  const d = svc.addManual({ ...input, link: 'https://s.shopee.com.my/Multi', photos: [photo, photo, photo], force: true });
  const { studioState } = await import('../src/mapping.js');
  assert.equal(studioState(drafts.get(d.id), loadConfig()).layout, 1);
  fresh(d);
  await svc.approve(d.id, null);
  calls.length = 0;
  const r = await pub.publishDraft(d.id);
  assert.equal(r.kind, 'posted', r.message);
  const uploads = calls.filter(c => c.url.includes('/photos'));
  assert.equal(uploads.length, 3);                                   // one poster per photo
  assert.ok(uploads.every(c => /filename="d[0-9a-f]+-[1-3]\.png"[\s\S]*image\/png/.test(c.body)));
  assert.ok(calls.some(c => c.url.includes('/feed') && c.body.includes('attached_media')));
});

test('发布时间: a draft with its own time skips the slots and posts when it comes; a past time is refused', async () => {
  const d = fresh(svc.addManual({ ...input, link: 'https://s.shopee.com.my/When1', force: true }));
  const soon = Date.now() + 3600e3;
  svc.saveForm(d.id, { postAt: soon });
  assert.equal(drafts.get(d.id).form.postAt, soon);
  svc.saveForm(d.id, { postAt: Date.now() - 3600e3 });                      // past: keeps the old time
  assert.equal(drafts.get(d.id).form.postAt, soon);
  await svc.approve(d.id, null);
  const row = svc.approvedWithSlots().find(x => x.d.id === d.id);
  assert.match(row.slot.text, /（指定）$/); assert.equal(row.slot.k, -1);
  /* its time comes: posted by the due run, without a slot */
  drafts.update(d.id, { form: { ...drafts.get(d.id).form, postAt: Date.now() - 60e3 } });
  const r = await pub.publishDue({ log: () => {} });
  assert.ok(r.some(x => x.kind === 'posted'));
  assert.equal(drafts.get(d.id).status, 'posted');
  /* 2 h late: back in the normal queue instead of posting */
  const late = fresh(svc.addManual({ ...input, link: 'https://s.shopee.com.my/When2', force: true }));
  await svc.approve(late.id, null);
  drafts.update(late.id, { form: { ...drafts.get(late.id).form, postAt: Date.now() - 3 * 3600e3 } });
  await pub.publishDue({ log: () => {} });
  assert.equal(drafts.get(late.id).form.postAt, null);
});
