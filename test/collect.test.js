/* the collector's 大折扣 list (sample products, offline) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
const cfg0 = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ...cfg0, categories: [{ name: 'T', productCatId: null }],
  strategies: { topSellers: { enabled: false, perDay: 0 }, highestCommission: { enabled: false, perDay: 0 }, biggestDiscount: { enabled: true, perDay: 20 } },
  filters: { minRating: 0, minSales: 0, excludeKeywords: [] } }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'config.json'), SHOPEE_MOCK: '1', TZ: 'Asia/Kuala_Lumpur', GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '' });
const { collect, makeFilter } = await import('../src/collect.js');
const { drafts, db, dayStr } = await import('../src/db.js');
const mock = await import('../src/shopee-mock.js');

test('大折扣 only picks products whose poster shows a discount (10 % and up)', async () => {
  const small = mock.NODES.filter(n => n.priceDiscountRate > 0 && n.priceDiscountRate < 10);
  await collect({ log: () => {} });
  const disc = drafts.list('draft').filter(d => d.strat === 'disc');
  assert.ok(disc.length > 0, 'some 大折扣 drafts');
  assert.ok(disc.every(d => d.p.disc >= 10), disc.map(d => d.p.disc).join(','));
  assert.ok(disc.every(d => !small.some(n => String(n.itemId) === String(d.itemId))));
});

test('the product filter: rating, sales, photo, price, excluded words, no repeat, already queued, one shop a day', () => {
  const ins = db.prepare('INSERT INTO drafts(id,item_id,shop_id,strategy,status,product,form,collected_day,created_at,updated_at,pending_since) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const now = Date.now();
  db.prepare("INSERT INTO posts(draft_id,item_id,kind,at) VALUES('dp1','2001','posted',?)").run(now - 10 * 86400e3);
  db.prepare("INSERT INTO posts(draft_id,item_id,kind,at) VALUES('dp2','2002','posted',?)").run(now - 40 * 86400e3);
  ins.run('dq1', '3001', 'x1', 'top', 'failed', '{}', '{}', '2020-01-01', now, now, now);
  ins.run('dq2', '3002', 'x2', 'top', 'expired', '{}', '{}', '2020-01-01', now, now, now);
  ins.run('dq3', '4001', 'shopToday', 'top', 'draft', '{}', '{}', dayStr(), now, now, now);
  const cfg = { filters: { minRating: 4.7, minSales: 500, excludeKeywords: ['二手', 'Refurbished'] }, noRepeatDays: 30 };
  const { ok, reasons } = makeFilter(cfg, dayStr());
  const P = o => ({ itemId: '1001', shopId: 's1', name: 'Nice Cup', rating: 4.9, sales: 900, imageUrl: 'x', price: 10, ...o });
  assert.equal(ok(P()), true);
  const no = { rating: [{ rating: 4.6 }, { rating: null }], sales: [{ sales: 499 }], image: [{ imageUrl: '' }], price: [{ price: 0 }, { price: null }],
    keyword: [{ name: '二手 杯子' }, { name: 'REFURBISHED cup' }], posted: [{ itemId: '2001' }], queued: [{ itemId: '3001' }], shop: [{ shopId: 'shopToday' }] };
  for (const [why, list] of Object.entries(no)) for (const o of list) assert.equal(ok(P(o)), false, `${why}: ${JSON.stringify(o)}`);
  assert.deepEqual(reasons, { rating: 2, sales: 1, image: 1, price: 2, keyword: 2, posted: 1, queued: 1, shop: 1 });
  assert.equal(ok(P({ itemId: '2002' })), true, 'posted more than noRepeatDays ago: may come back');
  assert.equal(ok(P({ itemId: '3002' })), true, 'an expired draft does not block');
  assert.equal(ok(P({ rating: 4.7, sales: 500 })), true, 'exactly the minimum passes');
});

