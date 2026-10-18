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
const { collect } = await import('../src/collect.js');
const { drafts } = await import('../src/db.js');
const mock = await import('../src/shopee-mock.js');

test('大折扣 only picks products whose poster shows a discount (10 % and up)', async () => {
  const small = mock.NODES.filter(n => n.priceDiscountRate > 0 && n.priceDiscountRate < 10);
  await collect({ log: () => {} });
  const disc = drafts.list('draft').filter(d => d.strat === 'disc');
  assert.ok(disc.length > 0, 'some 大折扣 drafts');
  assert.ok(disc.every(d => d.p.disc >= 10), disc.map(d => d.p.disc).join(','));
  assert.ok(disc.every(d => !small.some(n => String(n.itemId) === String(d.itemId))));
});
