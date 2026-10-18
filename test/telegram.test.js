/* Step 7: Telegram posters + buttons + webhook (fake Telegram API, SHOPEE_MOCK) */
import test from 'node:test';
import assert from 'node:assert/strict';
/* the test runner reads its results from stdout: the app's log lines there could corrupt them ("Unable to deserialize cloned data") */
console.log = (...a) => console.error(...a);
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
cfg.categories = [{ name: 'Test', productCatId: null }];
fs.writeFileSync(cfgFile, JSON.stringify(cfg));

const calls = [];
const tg = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    calls.push({ url: req.url, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
});
await new Promise(r => tg.listen(0, '127.0.0.1', r));
const SECRET = 'testsecret_0123456789';
Object.assign(process.env, { GEMINI_API_KEY: '', // never the real key from .env
 
  DATA_DIR: tmp, CONFIG_FILE: cfgFile, SHOPEE_MOCK: '1', DISABLE_JOBS: '1', ADMIN_PASSWORD: 'x',
  TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}`, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '42',
  TELEGRAM_WEBHOOK_SECRET: SECRET, PUBLIC_URL: 'https://app.example.com'
});
const { drafts } = await import('../src/db.js');
const { collect } = await import('../src/collect.js');
const { posterKey } = await import('../src/mapping.js');
const { loadConfig } = await import('../src/config.js');
const { posterFile, thumbFile } = await import('../src/render.js');
const telegram = await import('../src/telegram.js');
const { app } = await import('../src/server.js');
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const B = `http://127.0.0.1:${srv.address().port}`;

const r = await collect({ log: () => {} });
for (const d of r.drafts) {
  fs.writeFileSync(posterFile(d.id), Buffer.from('png')); fs.writeFileSync(thumbFile(d.id), Buffer.from('jpg'));
  drafts.update(d.id, { posterKey: posterKey(drafts.get(d.id), loadConfig()) });
}
test.after(() => { srv.close(); tg.close(); });
const hook = (secret, header, update) => fetch(`${B}/telegram/${secret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(header ? { 'X-Telegram-Bot-Api-Secret-Token': header } : {}) }, body: JSON.stringify(update) });
const cb = (data, chat = 42) => ({ callback_query: { id: 'q1', data, message: { chat: { id: chat }, message_id: 7, photo: [{}] } } });
const settle = () => new Promise(r => setTimeout(r, 300));

test('after collect: one sendPhoto per draft with name · price · strategy and 3 buttons', async () => {
  await telegram.sendDrafts(r.drafts);
  const photos = calls.filter(c => c.url.endsWith('/sendPhoto'));
  assert.equal(photos.length, r.drafts.length);
  const body = photos[0].body;
  assert.match(body, /name="chat_id"\r\n\r\n42/);
  assert.match(body, /· RM \d+\.\d\d · (爆卖|高佣|大折扣)/);
  assert.match(body, /"callback_data":"ap:d[0-9a-f]+"/);
  assert.match(body, /"callback_data":"sk:d[0-9a-f]+"/);
  assert.match(body, /"url":"https:\/\/app\.example\.com\/d\/d[0-9a-f]+"/);
});

test('webhook rejects a wrong secret or missing header', async () => {
  assert.equal((await hook('nope', SECRET, cb('ap:' + r.drafts[0].id))).status, 404);
  assert.equal((await hook(SECRET, null, cb('ap:' + r.drafts[0].id))).status, 404);
  assert.equal(drafts.get(r.drafts[0].id).status, 'draft');
});

test('✅ 批准 approves, ❌ 跳过 skips; other chats are ignored', async () => {
  const [a, b, c] = r.drafts;
  assert.equal((await hook(SECRET, SECRET, cb('ap:' + c.id, 99))).status, 200); await settle();
  assert.equal(drafts.get(c.id).status, 'draft');
  calls.length = 0;
  await hook(SECRET, SECRET, cb('ap:' + a.id)); await settle();
  assert.equal(drafts.get(a.id).status, 'approved');
  assert.ok(calls.some(x => x.url.endsWith('/answerCallbackQuery') && /已批准/.test(x.body)));
  assert.ok(calls.some(x => x.url.endsWith('/editMessageCaption')));
  await hook(SECRET, SECRET, cb('sk:' + b.id)); await settle();
  assert.equal(drafts.get(b.id).status, 'skipped');
});

test('reminder before an empty posting time and the pause message reach the chat in plain words', async () => {
  const svc = await import('../src/service.js');
  telegram.init({ onCollected: () => {}, onCollectFailed: () => {}, onPublishEvent: () => {}, onPause: svc.onPause, onReminder: svc.onReminder });
  await settle();
  calls.length = 0;
  svc.remind({ label: '20:30', plannedAt: new Date(2032, 0, 1, 20, 34).getTime(), pending: 3 });
  svc.pause.set(190, svc.pauseText(190, ['token 无效']), 'token', svc.fbWords('Facebook 错误 190: Error validating access token: Session has expired.'));
  await settle();
  const texts = calls.filter(c => c.url.endsWith('/sendMessage')).map(c => JSON.parse(c.body).text);
  assert.ok(texts.some(t => t.startsWith('⏰ 20:30') && t.includes('约 20:34') && t.includes('还有 3 张草稿') && t.includes('https://app.example.com')), texts.join('\n---\n'));
  assert.ok(texts.some(t => t.startsWith('🛑 发布已暂停') && t.includes('Facebook token 有问题：token 无效') && t.includes('Facebook 原话：Error validating access token: Session has expired\n')), texts.join('\n---\n'));
  svc.pause.clear();
});
