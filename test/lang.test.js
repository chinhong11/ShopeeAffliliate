/* poster and caption language: 中文 or Bahasa Melayu per draft (default from config.json), the review app stays Chinese */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg0 = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg0, categories: [{ name: 'T', productCatId: null }] }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: cfgFile, TZ: 'Asia/Kuala_Lumpur', SHOPEE_MOCK: '1', DISABLE_JOBS: '1', GEMINI_API_KEY: '' });
const { langOf, tagsOf, studioState, posterKey, fmtSold } = await import('../src/mapping.js');
const { HL, PERSONAL, headline, suggest, cap1, cap2, postTexts, isPersonal, swapNumbers, refreshHeadline, fill } = await import('../src/pick.js');
const { newForm } = await import('../src/draft.js');
const svc = await import('../src/service.js');
const { prompt } = await import('../src/gemini.js');

const HAN = /[㐀-鿿]/;
const P = o => ({ name: 'Botol Air Tumbler 1L', price: 19.9, disc: 60, rating: 4.7, sales: 2134, img: 'x.jpg', ...o });
const cfg = { language: 'zh', linkMode: 'comment', voucherCode: 'LIM10', hashtags: { zh: '#shopee #好物分享', ms: '#shopee #barangviral' } };
const draft = (lang, o = {}) => {
  const p = P(o.p), [l1, l2] = headline(p, cfg, {}, lang);
  return { p, shortLink: 'https://s.shopee.com.my/abc', form: { tpl: 't1', autoTpl: 't1', lang, l1, l2, photos: ['img:x.jpg'], used: false, review: { quote: '', author: '' }, flash: { end: '', pct: '' }, chat: { m1: '', m2: '', m3: '' }, ...o.form } };
};

test('the draft\'s own language wins over config.json; anything else is Chinese', () => {
  assert.equal(langOf(cfg, { lang: 'ms' }), 'ms');
  assert.equal(langOf({ language: 'ms' }, {}), 'ms');
  assert.equal(langOf({ language: 'ms' }, { lang: 'zh' }), 'zh');
  assert.equal(langOf({ language: 'xx' }, {}), 'zh');
  assert.equal(langOf(undefined, undefined), 'zh');
  assert.equal(tagsOf(cfg, 'ms'), '#shopee #barangviral');
  assert.equal(tagsOf({ hashtags: '#one' }, 'ms'), '#one', 'one string = every language');
  assert.equal(tagsOf({ hashtags: { zh: '#zh' } }, 'ms'), '#zh');
  assert.equal(fmtSold(2134, 'ms'), '2.1k+ terjual');
});

test('a new draft takes config.json\'s language and its headline is in it', () => {
  const st = { prev: null, rot: {} };
  const f = newForm({ p: P() }, { ...cfg, language: 'ms' }, st);
  assert.equal(f.lang, 'ms');
  assert.deepEqual([f.l1, f.l2], ['Harga dah\njatuh teruk!', 'Sekarang RM 19.90 je']);
  assert.equal(newForm({ p: P() }, cfg, { prev: null, rot: {} }).lang, 'zh');
});

test('Malay headlines: no Chinese, and every line short enough for the poster (it shrinks to 75 %, then wraps)', () => {
  const p = P({ price: 1299.9, was: 2599.8, sales: 12345, rating: 4.9 });
  for (const [a, b] of [...Object.values(HL.ms).flat(), ...PERSONAL.ms]) {
    for (const line of [...fill(a, p, 'ms').split('\n'), fill(b, p, 'ms')]) {
      assert.ok(!HAN.test(line), line);
      assert.ok(line.length <= 22, `too long for the panel: ${line}`);
    }
  }
  assert.equal(suggest(p, true, cfg, { lang: 'ms' }).length, suggest(p, true, cfg, { lang: 'zh' }).length, 'same number of suggestions, so switching keeps the same pick');
  assert.ok(suggest(p, false, cfg, { lang: 'ms' }).every(([a, b]) => !HAN.test(a + b)));
});

test('caption ① and comment ② in Malay: the link, the voucher, Malay hashtags, nothing in Chinese', () => {
  const d = draft('ms');
  const c1 = cap1(d, cfg), c2 = cap2(d, cfg);
  assert.ok(!HAN.test(c1 + c2), c1 + '\n' + c2);
  assert.match(c1, /^Harga dah jatuh teruk!🔥/);
  assert.match(c1, /Botol Air Tumbler 1L/);
  assert.match(c1, /rating 4\.7, 2\.1k\+ terjual/);
  assert.match(c1, /💰 Sekarang RM 19\.90 \(-60%\)/);
  assert.match(c1, /LIM10/);
  assert.match(c1, /👉 Link pembelian di komen pertama 👇/);
  assert.match(c1, /#shopee #barangviral$/);
  assert.equal(c2, '🛒 Link "Botol Air Tumbler 1L" ada di sini 👇\nhttps://s.shopee.com.my/abc\n💰 RM 19.90 | 🎟 Kod LIM10');
  const used = cap1(draft('ms', { form: { used: true } }), cfg);
  assert.ok(!HAN.test(used)); assert.match(used, /aku dah cuba/);
  /* Chinese stays as it was */
  const z = draft('zh');
  assert.match(cap1(z, cfg), /👉 购买链接放在第一条评论 👇/);
  assert.match(cap1(z, cfg), /#shopee #好物分享$/);
});

test('direct mode in Malay: the link goes in the post in Malay, also over a caption written for comment mode', () => {
  const direct = { ...cfg, linkMode: 'direct' };
  const d = draft('ms');
  assert.match(cap1(d, direct), /👉 Beli terus di sini: https:\/\/s\.shopee\.com\.my\/abc/);
  assert.equal(cap2(d, direct), '');
  d.form.cap1 = cap1(d, cfg); // written while the link was in the comment
  const { message, comment } = postTexts(d, direct);
  assert.match(message, /👉 Beli terus di sini: https:\/\/s\.shopee\.com\.my\/abc/);
  assert.ok(!message.includes('komen pertama'));
  assert.equal(comment, null);
});

test('the poster in Malay: button, sold, buyer, flash sale, group chat, carousel captions; Chinese unchanged', () => {
  const st = studioState(draft('ms'), cfg);
  assert.equal(st.lang, 'ms');
  assert.equal(st.ctaText, 'Link di komen 👇');
  assert.equal(st.sold, '2.1k+ terjual');
  assert.equal(st.cap.tags, '#shopee #barangviral');
  assert.equal(studioState(draft('ms'), { ...cfg, linkMode: 'direct' }).ctaText, 'Klik link & beli 🛒');
  assert.equal(studioState(draft('ms', { form: { tpl: 't5', review: { quote: 'Best!', author: '' } } }), cfg).review.author, '— Pembeli Shopee');
  assert.equal(studioState(draft('ms', { form: { tpl: 't3', flash: { end: '23:00', pct: '80', endAt: Date.now() + 3600e3 } } }), cfg).stockTxt, 'Flash sale sekarang');
  assert.equal(studioState(draft('ms', { form: { tpl: 't4', chat: { m1: 'a', m2: 'b', m3: 'c' } } }), cfg).chat.title, 'Kongsi Barang Best 🔥');
  const t8 = studioState(draft('ms', { form: { tpl: 't8', photos: ['img:a.jpg', 'img:b.jpg', 'img:c.jpg', 'img:d.jpg'] } }), cfg);
  assert.deepEqual(t8.set.pages.map(p => p.cap), ['', 'Kenapa berbaloi ✅', 'Gambar sebenar 🔍', 'Cara beli 👇']);
  const zh = studioState(draft('zh'), cfg);
  assert.equal(zh.ctaText, '评论区拿链接 👇'); assert.equal(zh.sold, '已售 2.1k+');
  assert.notEqual(posterKey(draft('ms'), cfg), posterKey(draft('zh'), cfg), 'switching language makes a new poster');
});

test('the edit form keeps a valid language only; a 我用过 hook in Malay is dropped when 我用过 is off', () => {
  const old = draft('zh').form, d = draft('zh');
  assert.equal(svc.cleanForm(old, { lang: 'ms' }, d, cfg).lang, 'ms');
  assert.equal(svc.cleanForm(old, { lang: 'fr' }, d, cfg).lang, 'zh');
  assert.ok(isPersonal('Benda ni\nbest gila!') && isPersonal('这玩意儿也太\n好用了吧？！'));
  const n = svc.cleanForm({ ...old, lang: 'ms' }, { l1: 'Benda ni\nbest gila!', l2: 'Tak beli memang rugi' }, d, cfg);
  assert.ok(!isPersonal(n.l1) && !HAN.test(n.l1), 'replaced by a Malay data headline');
});

test('new numbers before posting: Malay headline rebuilt, hand-written Malay text gets its numbers swapped', () => {
  const o = P(), n = P({ price: 17.5, sales: 3200, rating: 4.8 });
  const f = draft('ms').form;
  assert.deepEqual(refreshHeadline(f, o, n, cfg), { l1: 'Harga dah\njatuh teruk!', l2: 'Sekarang RM 17.50 je' });
  assert.equal(swapNumbers('Cuma RM 19.90, rating 4.7, 2.1k+ terjual', o, n), 'Cuma RM 17.50, rating 4.8, 3.2k+ terjual');
  /* one pass: RM 10 → RM 20 at the same 50 % off, while the old 原价 was RM 20 — never RM 40 twice */
  assert.equal(swapNumbers('现在 RM 10.00（原价 RM 20.00）', P({ price: 10, disc: 50 }), P({ price: 20, disc: 50 })), '现在 RM 20.00（原价 RM 40.00）');
});

test('✨ AI 写文案 asks for Malay on a Malay draft, with the Malay link line; Chinese drafts as before', () => {
  const ms = prompt(draft('ms'), cfg), zh = prompt(draft('zh'), cfg);
  assert.match(ms, /用马来文写两段/);
  assert.match(ms, /👉 Link pembelian di komen pertama 👇/);
  assert.match(zh, /用简体中文写两段/);
  assert.match(zh, /👉 购买链接放在第一条评论 👇/);
});

test('0 sold says nothing (a new product added by hand); 限时抢购 has the same poster key in the browser and on the server', () => {
  assert.equal(fmtSold(0), ''); assert.equal(fmtSold(0, 'ms'), '');
  const d = draft('zh', { p: { sales: 0 } });
  assert.equal(studioState(d, cfg).sold, '');
  assert.ok(!/已售 0|0 terjual/.test(cap1(d, cfg) + cap1(draft('ms', { p: { sales: 0 } }), cfg)));
  const t3 = o => draft('zh', { form: { tpl: 't3', flash: { end: '23:00', pct: '80', ...o } } });
  assert.equal(posterKey(t3({ endAt: 0 }), cfg), posterKey(t3({ endAt: Date.now() + 5 * 3600e3 }), cfg), 'the browser sends endAt 0, the server dates it');
  assert.notEqual(posterKey(t3({ end: '22:00' }), cfg), posterKey(t3({}), cfg), 'a new end time is a new poster');
});

