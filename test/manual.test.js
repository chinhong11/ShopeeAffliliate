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
Object.assign(process.env, {
  DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'none.json'), SHOPEE_MOCK: '', SHOPEE_APP_ID: '', SHOPEE_APP_SECRET: '', TZ: 'Asia/Kuala_Lumpur',
  FB_GRAPH_BASE: `http://127.0.0.1:${graph.address().port}`, FB_PAGE_ID: 'page1', FB_PAGE_TOKEN: 'tok', FB_APP_ID: 'app', FB_APP_SECRET: 'sec'
});
const { drafts } = await import('../src/db.js');
const { posterKey } = await import('../src/mapping.js');
const { loadConfig } = await import('../src/config.js');
const { posterFile, thumbFile } = await import('../src/render.js');
const shopee = await import('../src/shopee.js');
const svc = await import('../src/service.js');
const pub = await import('../src/publish.js');
test.after(() => graph.close());

const photo = 'data:image/jpeg;base64,' + fs.readFileSync(new URL('../design/review-photos/p-ramen1.jpg', import.meta.url)).toString('base64');
const LINK = 'https://s.shopee.com.my/AbC123';
const input = { name: '辛拉面 单包', price: '2.90', was: '4.90', rating: '4.8', sales: '8700', link: LINK, photos: [photo, photo] };

test('hand-added product: checked, made into a draft, posted with the pasted link and no Shopee call', async () => {
  assert.equal(shopee.ready(), false);
  for (const [k, v, msg] of [['name', '', /名称/], ['price', '0', /现价/], ['was', '1', /原价/], ['rating', '6', /评分/], ['sales', '1.5', /已售/],
    ['link', 'https://evil.example/shopee.com.my', /Shopee 的链接/], ['link', 'http://s.shopee.com.my/x', /Shopee 的链接/], ['photos', [], /照片/]]) {
    assert.throws(() => svc.addManual({ ...input, [k]: v }), msg, k);
  }
  const d = svc.addManual(input);
  /* stand-in posters (no browser), written before the queued render gets its turn */
  fs.writeFileSync(posterFile(d.id), Buffer.from('89504e470d0a1a0a', 'hex')); fs.writeFileSync(thumbFile(d.id), 'x');
  drafts.update(d.id, { posterKey: posterKey(drafts.get(d.id), loadConfig()) });

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
