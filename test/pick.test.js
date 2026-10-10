import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTemplate, headline, suggest, cap1, cap2, availability } from '../src/pick.js';

const P = o => ({ name: '辛拉面 甜辣泡菜炒面 5包装', price: 12.9, disc: 32, rating: 4.9, sales: 15200, comm: 0.05, ...o });
const cfg = { language: 'zh', hashtags: '#shopee #好物分享 #开箱', voucherCode: '', linkMode: 'comment' };

test('template rules, first match wins', () => {
  assert.equal(pickTemplate(P({ disc: 40 }), null, false), 't2');
  assert.equal(pickTemplate(P({ disc: 10, rating: 4.8, sales: 1000 }), null, true), 't5');
  assert.equal(pickTemplate(P({ disc: 10, rating: 4.8, sales: 1000 }), null, false), 't1');
  assert.equal(pickTemplate(P({ disc: 10, sales: 5000 }), 't1', false), 't1');
  assert.equal(pickTemplate(P({ disc: 10, rating: 4.7, sales: 900 }), 't1', false), 't6');
  assert.equal(pickTemplate(P({ disc: 10, rating: 4.7, sales: 900 }), 't6', false), 't1');
  assert.equal(pickTemplate(P({ disc: 10, rating: 4.7, sales: 900 }), 't2', false), 't1');
});

test('headline: first matching condition, A/B alternate per condition', () => {
  const rot = {};
  assert.deepEqual(headline(P({ disc: 67 }), cfg, rot), ['把价格\n打下来了！', '现在只要 RM 12.90']);
  assert.deepEqual(headline(P({ disc: 67 }), cfg, rot), ['直接砍到\nRM 12.90！', '原价 RM 39.09']);
  assert.deepEqual(headline(P({}), cfg, rot), ['全网都在抢的\n爆款', '已售 15k+ 件']);
  assert.deepEqual(headline(P({}), cfg, rot), ['大家都在买的\n这个', '已售 15k+ 件 · ★4.9']);
  assert.deepEqual(headline(P({ sales: 1200 }), cfg, rot), ['评分 4.9 的\n宝藏好物', '买过的都说值']);
  assert.deepEqual(headline(P({ sales: 1200, rating: 4.6 }), cfg, rot), ['我不允许你\n还不知道这个', 'RM 12.90 · ★4.6']);
  assert.deepEqual(headline(P({ sales: 1200, rating: null }), cfg, rot), ['这个必须\n分享给你们', 'RM 12.90']);
  assert.deepEqual(headline(P({ disc: 50 }), { language: 'mix' }, {}), ['RM 12.90 ONLY!!\n不冲对不起自己', '-50% OFF']);
  assert.deepEqual(headline(P({}), { language: 'mix' }, {}), ['Viral 爆款\n大家都在买', '15k+ sold']);
});

test('personal hooks only when 我用过', () => {
  const has = l => l.some(([a]) => a.includes('好用了吧'));
  assert.equal(has(suggest(P({}), false, cfg)), false);
  assert.equal(has(suggest(P({}), true, cfg)), true);
  const banned = /最后一批|今晚恢复原价|历史最低价|最后 50 件|清货/;
  for (const used of [false, true]) for (const [a, b] of suggest(P({ disc: 60 }), used, cfg)) assert.ok(!banned.test(a + b));
});

test('caption ① and comment ②', () => {
  const d = { p: P({}), form: { l1: '全网都在抢的\n爆款', used: false }, shortLink: 'https://s.shopee.com.my/abc' };
  assert.equal(cap1(d, cfg), '全网都在抢的爆款🔥\n\n发现这个「辛拉面 甜辣泡菜炒面 5包装」，评分 4.9、已售 15k+，看了评价决定分享给你们 👀\n💰 现在 RM 12.90（-32%）\n👉 购买链接放在第一条评论 👇\n\n#shopee #好物分享 #开箱');
  assert.equal(cap2(d, cfg), '🛒 「辛拉面 甜辣泡菜炒面 5包装」链接在这 👇\nhttps://s.shopee.com.my/abc\n💰 RM 12.90');
  const c2 = { ...cfg, voucherCode: 'LEE5' };
  assert.match(cap1(d, c2), /🎟 结账输入折扣码【LEE5】再省/);
  assert.match(cap2(d, c2), /💰 RM 12.90｜🎟 折扣码 LEE5$/);
  assert.equal(cap2(d, { ...cfg, linkMode: 'direct' }), '');
  assert.match(cap1(d, { ...cfg, linkMode: 'direct' }), /👉 直接点这里买：https:\/\/s\.shopee\.com\.my\/abc/);
  assert.doesNotMatch(cap1({ ...d, p: P({ disc: 5 }) }, cfg), /（/);
  assert.match(cap1({ ...d, form: { ...d.form, used: true } }, cfg), /我先冲了/);
});

test('template locks', () => {
  const f = { review: { quote: '' }, flash: { end: '', pct: '' }, chat: { m1: '', m2: '', m3: '' }, photos: ['a'] };
  assert.deepEqual(availability(f), { t1: true, t2: true, t6: true, t5: false, t3: false, t4: false, t8: false });
  assert.equal(availability({ ...f, review: { quote: '好吃' }, photos: ['a', 'b', 'c', 'd'] }).t5, true);
  assert.equal(availability({ ...f, photos: ['a', 'b', 'c', 'd'] }).t8, true);
});
