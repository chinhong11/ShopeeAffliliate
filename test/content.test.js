/* 贴士 / 梗图: fields checked, words never HTML, Gemini ideas (fake), the 1080×1080 PNG, posting once through a fake Graph API */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

console.log = (...a) => console.error(...a); // app log lines on stdout would corrupt the test runner's output
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg0 = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg0, language: 'ms', brand: { bName: 'LIM', bTag: 'Sharing', bInit: 'L' } }));

const fbs = { calls: [], fail: 0 };
const graphSrv = http.createServer((req, res) => {
  req.resume(); req.on('end', () => {
    const url = req.url.split('?')[0], send = (j, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    fbs.calls.push({ method: req.method, url });
    if (url.endsWith('/photos') && fbs.fail) return send({ error: { code: fbs.fail, message: 'nope' } }, 400);
    if (url.endsWith('/photos')) return send({ id: 'ph', post_id: 'page_9' });
    if (req.method === 'GET') return send({ permalink_url: 'https://www.facebook.com/page_9' });
    send({});
  });
});
await new Promise(r => graphSrv.listen(0, '127.0.0.1', r));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: cfgFile, SHOPEE_MOCK: '1', DISABLE_JOBS: '1', GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '', SESSION_SECRET: 'x'.repeat(32),
  FB_GRAPH_BASE: `http://127.0.0.1:${graphSrv.address().port}`, FB_PAGE_ID: 'page', FB_PAGE_TOKEN: 'tok' });
const C = await import('../src/content.js');
const gemini = await import('../src/gemini.js');
const { env } = await import('../src/config.js');
const { sessionCookie } = await import('../src/auth.js');
const svc = await import('../src/service.js');
const { closeBrowser } = await import('../src/render.js');
const { app } = await import('../src/server.js');
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const URL0 = `http://127.0.0.1:${srv.address().port}`, cookie = sessionCookie().split(';')[0];
const get = (p, auth = true) => fetch(URL0 + p, { redirect: 'manual', headers: auth ? { cookie } : {} });
const post = (p, body) => fetch(URL0 + '/api' + p, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...(await r.json()) }));
test.after(async () => { srv.close(); graphSrv.close(); await closeBrowser(); });

test('fields are checked: short texts, at most 5 points, a #rrggbb colour, the brand on the badge', () => {
  const t = C.cleanContent('tip', { title: 'a'.repeat(99), points: 'x\n\n y \nz\n1\n2\n3', accent: 'red;x', lang: 'fr', extra: 1 }, { bName: 'LIM' });
  assert.equal(t.title.length, 50);
  assert.deepEqual(t.points, ['x', 'y', 'z', '1', '2']);
  assert.deepEqual([t.accent, t.lang, t.name, t.extra], ['#ee4d2d', 'zh', 'LIM', undefined]);
  const m = C.cleanContent('meme', { top: 'a', e1: '🤣🤣🤣🤣', lang: 'ms' });
  assert.deepEqual([m.e1, m.e2, m.lang, m.style, C.missing('meme', m)], ['🤣🤣🤣', '🫠', 'ms', 'text', '上下两行都要写']);
  assert.equal(C.missing('tip', t), '');
  const ph = C.cleanContent('meme', { style: 'photo', top: 'a', photo: '../../etc/passwd' });
  assert.deepEqual([ph.style, ph.photo, C.missing('meme', ph)], ['photo', '', '要有照片和至少一行字']);
  assert.equal(C.missing('meme', { ...ph, photo: 'ct-0123456789ab.jpg' }), '');
});

test('words go into the picture as text, never as HTML', () => {
  const h = C.contentHtml('meme', C.cleanContent('meme', { top: '<img src=x onerror=alert(1)>', bottom: '"a" & b' }));
  assert.ok(!h.includes('<img src=x'));
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;') && h.includes('&quot;a&quot; &amp; b'));
});

test('ideas: the prompt has today, the 3R rule and the language; 4 ideas at most, addresses dropped', async () => {
  const p = gemini.ideasPrompt('tip', 'ms', new Date(2026, 9, 18).getTime());
  for (const s of ['2026-10-18', '3R', '马来文', '不编造数字']) assert.ok(p.includes(s), s);
  const one = i => ({ title: 'T' + i, points: ['a', 'b'], caption: 'jom https://x.y/z cuba' });
  const f = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map(one) }) }] } }] }) });
  await assert.rejects(gemini.contentIdeas('tip', 'ms', f), /GEMINI_API_KEY/);
  env.GEMINI_API_KEY = 'k'; // a fake key: the fetch is faked too
  try {
    const list = await gemini.contentIdeas('tip', 'ms', f);
    assert.equal(list.length, 4);
    assert.equal(list[0].caption, 'jom  cuba');
  } finally { env.GEMINI_API_KEY = ''; }
});

test('pages need a login; the tabs are there', async () => {
  assert.ok([302, 401].includes((await get('/tips', false)).status));
  for (const p of ['/tips', '/memes']) {
    const r = await get(p), h = await r.text();
    assert.equal(r.status, 200);
    assert.ok(h.includes('href="/tips"') && h.includes('href="/memes"') && h.includes('/static/content.js'));
  }
});

test('save → 1080×1080 PNG → post once; then it can no longer be changed, deleted or posted again', async () => {
  const { item } = await post('/content', { kind: 'tip', data: { title: 'Jimat elektrik', points: ['Tutup suis', 'Guna kipas'], caption: 'Cuba ni 💡', lang: 'ms' } });
  assert.equal(item.status, 'draft');
  const png = Buffer.from(await (await get(`/content/${item.id}.png`)).arrayBuffer());
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1080]);
  const [a, b] = await Promise.all([post(`/content/${item.id}/post`, {}), post(`/content/${item.id}/post`, {})]);
  assert.equal([a, b].filter(r => r.status === 200).length, 1);
  assert.equal(fbs.calls.filter(c => c.url.endsWith('/photos')).length, 1);
  const done = svc.getContent(item.id);
  assert.deepEqual([done.status, done.postId, done.permalink], ['posted', 'page_9', 'https://www.facebook.com/page_9']);
  assert.match((await post(`/content/${item.id}`, { data: { title: 'x' } })).error, /已经发了/);
  assert.match((await post(`/content/${item.id}/delete`, {})).error, /不能在这里删/);
  assert.match((await post(`/content/${item.id}/post`, {})).error, /已经在发或发过了/);
});

test('photo meme: the upload is saved, a 1080×1080 PNG, deleting the draft removes the photo', async () => {
  const red = await (await import('../src/render.js')).renderHtml('<div style="width:40px;height:40px;background:#f00"></div>', { w: 40, h: 40 });
  assert.match((await post('/content/photo', { dataUrl: 'data:text/html;base64,PGI+' })).error, /照片格式不对/);
  const { photo } = await post('/content/photo', { dataUrl: 'data:image/png;base64,' + red.toString('base64') });
  assert.match(photo, /^ct-[0-9a-f]{12}\.png$/);
  const { item } = await post('/content', { kind: 'meme', data: { style: 'photo', photo, top: 'Bila gaji masuk' } });
  assert.equal(item.data.photo, photo);
  const png = Buffer.from(await (await get(`/content/${item.id}.png`)).arrayBuffer());
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1080]);
  assert.ok(fs.existsSync(path.join(tmp, 'img', photo)));
  assert.equal((await post(`/content/${item.id}/delete`, {})).status, 200);
  assert.ok(!fs.existsSync(path.join(tmp, 'img', photo)));
});

test('a Facebook error leaves it a draft with the reason; a token error pauses; a paused page refuses to post', async () => {
  const { item } = await post('/content', { kind: 'meme', data: { top: 'Gaji masuk', bottom: 'Gaji keluar' } });
  fbs.fail = 190;
  assert.equal((await post(`/content/${item.id}/post`, {})).status, 400);
  const c = svc.getContent(item.id);
  assert.equal(c.status, 'draft');
  assert.ok(c.error);
  assert.ok(svc.pause.get());
  fbs.fail = 0;
  const n = fbs.calls.length;
  assert.match((await post(`/content/${item.id}/post`, {})).error, /暂停/);
  assert.equal(fbs.calls.length, n);
  svc.pause.clear();
  assert.equal((await post(`/content/${item.id}/delete`, {})).status, 200);
  assert.equal(svc.getContent(item.id), undefined);
});
