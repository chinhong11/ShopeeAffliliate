/* 主页图: the Facebook cover and profile picture, designed in the app and drawn by the renderer */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg0 = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg0, language: 'ms', brand: { bName: 'LIM', bTag: 'Sharing', bInit: 'L' } }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: cfgFile, SHOPEE_MOCK: '1', DISABLE_JOBS: '1', GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '', SESSION_SECRET: 'x'.repeat(32), FB_PAGE_ID: 'page1' });
const B = await import('../src/brand.js');
const { sessionCookie } = await import('../src/auth.js');
const { kv } = await import('../src/db.js');
const { closeBrowser } = await import('../src/render.js');
const { app } = await import('../src/server.js');
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const URL0 = `http://127.0.0.1:${srv.address().port}`, cookie = sessionCookie().split(';')[0];
const get = (p, auth = true) => fetch(URL0 + p, { redirect: 'manual', headers: auth ? { cookie } : {} });
const post = (p, body) => fetch(URL0 + p, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify(body) });
/* PNG width × height from its IHDR */
const size = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
test.after(async () => { srv.close(); await closeBrowser(); });

test('choices are checked: known styles, short texts, a #rrggbb colour; the brand fills empty fields', () => {
  const b = { bName: 'LIM', bTag: 'Sharing', bInit: 'L' };
  const o = B.cleanBrand({ cover: 'neon', avatar: 'x', accent: 'red;background:url(x)', name: '  ', line: 'a'.repeat(99), lang: 'fr' }, b);
  assert.deepEqual([o.cover, o.avatar, o.accent, o.name, o.tag, o.init, o.lang], ['cream', 'badge', '#ee4d2d', 'LIM', 'Sharing', 'L', 'zh']);
  assert.equal(o.line.length, 40);
  const ms = B.cleanBrand({ lang: 'ms' }, b);
  assert.equal(ms.line, 'Barang Shopee terbaik setiap hari');
  assert.equal(B.cleanBrand({ accent: '#0E7490', cover: 'white', avatar: 'name' }, b).accent, '#0e7490');
});

test('words go into the picture as text, never as HTML; "Shopee" takes the accent', () => {
  const o = B.cleanBrand({ name: '<img src=x onerror=alert(1)>', line: 'Kedai <b>Shopee</b>', sub: '"quoted" & more' }, {});
  const c = B.coverHtml(o), a = B.avatarHtml({ ...o, avatar: 'name' });
  assert.ok(!c.includes('<img src=x') && !a.includes('<img src=x'));
  assert.ok(c.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(c.includes('Kedai &lt;b&gt;<b>Shopee</b>&lt;/b&gt;'), 'only the word Shopee is marked');
  assert.ok(c.includes('&quot;quoted&quot; &amp; more'));
  for (const k of Object.keys(B.COVER_STYLES)) assert.ok(B.coverHtml({ ...o, cover: k }).includes(`class="${k}"`));
});

test('the 主页图 page needs the login, starts in config.json\'s language and has the 主页图 tab', async () => {
  const anon = await get('/brand', false);
  assert.equal(anon.status, 302);
  const r = await get('/brand'), h = await r.text();
  assert.equal(r.status, 200);
  assert.ok(h.includes('href="/brand" aria-selected="true">主页图'));
  assert.ok(h.includes('Barang Shopee terbaik setiap hari'), 'Malay default text from "language": "ms"');
  assert.ok(h.includes('https://www.facebook.com/page1'));
  assert.equal((await get('/shared/brand.js')).status, 200, 'the page previews with the same module');
});

test('生成: the choices are saved (checked) and the PNGs are Facebook-sized: cover 1640×720, profile picture 720×720', async () => {
  const s = await post('/api/brand', { design: { lang: 'zh', cover: 'dark', avatar: 'initial', accent: '#0e7490', name: 'CH', tag: 'Sharing Hub', init: 'C', evil: 1 } });
  assert.equal(s.status, 200);
  const saved = kv.get('brand:design');
  assert.equal(saved.cover, 'dark'); assert.equal(saved.accent, '#0e7490'); assert.ok(!('evil' in saved));
  const cover = await get('/brand/cover.png'), cbuf = Buffer.from(await cover.arrayBuffer());
  assert.equal(cover.headers.get('content-type'), 'image/png');
  assert.deepEqual(size(cbuf), [1640, 720]);
  const av = await get('/brand/avatar.png?dl=1'), abuf = Buffer.from(await av.arrayBuffer());
  assert.deepEqual(size(abuf), [720, 720]);
  assert.match(av.headers.get('content-disposition'), /attachment; filename="?facebook-profile\.png"?/);
  assert.equal((await get('/brand/other.png')).status, 404);
  assert.ok([302, 401].includes((await get('/brand/cover.png', false)).status), 'pictures need the login too');
});
