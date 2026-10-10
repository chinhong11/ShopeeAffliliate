import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.SHOPEE_APP_ID = 'app1'; process.env.SHOPEE_APP_SECRET = 'sec1';
process.env.DATA_DIR = process.env.TEST_DATA_DIR || './data-test';
const shopee = await import('../src/shopee.js');
const { productFromOffer, fmtSold, shortName, wasOf, pctOf, commOf, rm } = await import('../src/mapping.js');

test('signature = sha256(AppId + Timestamp + Payload + Secret)', () => {
  const payload = '{"query":"{ a }","variables":{}}';
  const want = crypto.createHash('sha256').update('app1' + 1700000000 + payload + 'sec1').digest('hex');
  assert.equal(shopee.authHeader('app1', 'sec1', payload, 1700000000), `SHA256 Credential=app1, Timestamp=1700000000, Signature=${want}`);
});

test('gql signs the exact body and retries 5xx then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async (url, opt) => {
    calls++;
    const m = opt.headers.Authorization.match(/Timestamp=(\d+), Signature=(\w+)/);
    assert.equal(m[2], crypto.createHash('sha256').update('app1' + m[1] + opt.body + 'sec1').digest('hex'));
    if (calls < 2) return new Response('busy', { status: 503 });
    return new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 });
  };
  const t0 = Date.now();
  assert.deepEqual(await shopee.gql('{ ok }', {}, { fetchImpl }), { ok: 1 });
  assert.equal(calls, 2);
  assert.ok(Date.now() - t0 >= 1900);
});

test('gql throws GraphQL errors without retrying', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(JSON.stringify({ errors: [{ message: 'Invalid Signature', extensions: { code: 10020 } }] })); };
  await assert.rejects(shopee.gql('{ x }', {}, { fetchImpl }), /10020: Invalid Signature/);
  assert.equal(calls, 1);
});

test('subIds are letters and digits only, max 5', () => {
  assert.deepEqual(shopee.cleanSubIds(['fb', 't-1', 'top', '2026-10-10', 'd_ab12', 'x']), ['fb', 't1', 'top', '20261010', 'dab12']);
});

test('mapping rules', () => {
  const p = productFromOffer({ itemId: 1, shopId: 2, productName: '【Ready Stock】辛拉面 🔥 甜辣泡菜炒面 5包装 COD', priceMin: '12.90', priceDiscountRate: 67, ratingStar: '4.86', sales: 1234, commissionRate: '0.08' });
  assert.equal(p.price, 12.9); assert.equal(p.comm, 0.08); assert.equal(p.rating, 4.86);
  assert.equal(shortName(p.name), '辛拉面 甜辣泡菜炒面 5包装');
  assert.equal(shortName('a'.repeat(30)).length, 24);
  assert.equal(fmtSold(860), '已售 860'); assert.equal(fmtSold(1234), '已售 1.2k+'); assert.equal(fmtSold(12999), '已售 12k+');
  assert.equal(fmtSold(1234, 'mix'), '1.2k+ sold');
  assert.equal(pctOf(p), '-67%'); assert.equal(wasOf(p), rm(12.9 / 0.33));
  assert.equal(wasOf({ ...p, disc: 9 }), ''); assert.equal(pctOf({ ...p, disc: 9 }), '');
  assert.equal(commOf(p), '佣金 8% ≈ RM 1.03/单');
});
