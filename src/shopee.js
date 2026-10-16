/* Shopee Affiliate Open API client (GraphQL) */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env, dirs, ROOT } from './config.js';
import * as mock from './shopee-mock.js';

/* productOfferV2 sortType (Affiliate Open API docs): 1 relevance, 2 item sold desc, 3 price desc, 4 price asc, 5 commission desc.
   There is no discount sort, so 大折扣 ranks the pooled candidates by priceDiscountRate (collect.js). */
export const SORT = { RELEVANCE: 1, SALES_DESC: 2, PRICE_DESC: 3, PRICE_ASC: 4, COMMISSION_DESC: 5 };

const NODE_FIELDS = 'itemId shopId productName imageUrl priceMin priceMax priceDiscountRate ratingStar sales commissionRate productLink offerLink shopName';

/* keys set (or the offline mock): without them the app runs on products added by hand (＋ 手动添加) */
export const ready = () => env.SHOPEE_MOCK || !!(env.SHOPEE_APP_ID && env.SHOPEE_APP_SECRET);

export class ShopeeError extends Error {
  constructor(msg, extra = {}) { super(msg); Object.assign(this, extra); }
}

export function sign(appId, secret, timestamp, payload) {
  return crypto.createHash('sha256').update(appId + timestamp + payload + secret).digest('hex');
}
export function authHeader(appId, secret, payload, timestamp = Math.floor(Date.now() / 1000)) {
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${sign(appId, secret, timestamp, payload)}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* signs every request; retries 429 / 5xx (and GraphQL rate-limit errors) with backoff, 3 tries */
export async function gql(query, variables = {}, { tries = 3, fetchImpl = fetch } = {}) {
  if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) throw new ShopeeError('SHOPEE_APP_ID / SHOPEE_APP_SECRET missing in .env');
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(1000 * 2 ** i);
    const payload = JSON.stringify({ query, variables });
    let res;
    try {
      res = await fetchImpl(env.SHOPEE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(env.SHOPEE_APP_ID, env.SHOPEE_APP_SECRET, payload) },
        body: payload
      });
    } catch (e) { last = new ShopeeError('network: ' + e.message); continue; }
    if (res.status === 429 || res.status >= 500) { last = new ShopeeError('HTTP ' + res.status, { status: res.status }); continue; }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new ShopeeError(`HTTP ${res.status}: ${text.slice(0, 200)}`, { status: res.status }); }
    if (json.errors && json.errors.length) {
      const e0 = json.errors[0], code = e0.extensions && e0.extensions.code;
      const err = new ShopeeError(`Shopee API error ${code ?? ''}: ${e0.message}`, { code, status: res.status });
      if (code === 10030) { last = err; continue; } // rate limit
      throw err;
    }
    if (!res.ok) throw new ShopeeError('HTTP ' + res.status, { status: res.status });
    return json.data;
  }
  throw last;
}

/* productOfferV2 nodes */
export async function offers({ productCatId = null, keyword = null, sortType = SORT.SALES_DESC, page = 1, limit = 50 } = {}) {
  if (env.SHOPEE_MOCK) return mock.offers({ productCatId, keyword, sortType, page, limit });
  const vars = { sortType, page, limit };
  const args = ['sortType: $sortType', 'page: $page', 'limit: $limit'];
  const defs = ['$sortType: Int', '$page: Int', '$limit: Int'];
  if (productCatId) { vars.productCatId = Number(productCatId); args.push('productCatId: $productCatId'); defs.push('$productCatId: Int'); }
  if (keyword) { vars.keyword = keyword; args.push('keyword: $keyword'); defs.push('$keyword: String'); }
  const q = `query(${defs.join(', ')}) { productOfferV2(${args.join(', ')}) { nodes { ${NODE_FIELDS} } pageInfo { page limit hasNextPage } } }`;
  const data = await gql(q, vars);
  const r = data.productOfferV2 || {};
  return { nodes: r.nodes || [], hasNextPage: !!(r.pageInfo && r.pageInfo.hasNextPage) };
}

/* one product by shop + item (pre-post price check). null if gone. */
export async function product(shopId, itemId) {
  if (env.SHOPEE_MOCK) return mock.product(shopId, itemId);
  const id = s => String(s).replace(/\D/g, '');
  const q = `query { productOfferV2(shopId: ${id(shopId)}, itemId: ${id(itemId)}, limit: 1) { nodes { ${NODE_FIELDS} } } }`;
  const data = await gql(q);
  const n = data.productOfferV2 && data.productOfferV2.nodes;
  return (n && n[0]) || null;
}

/* subIds: letters and digits only, max 5 */
export const cleanSubIds = ids => ids.map(s => String(s).replace(/[^A-Za-z0-9]/g, '')).filter(Boolean).slice(0, 5);

export async function shortLink(originUrl, subIds = []) {
  const ids = cleanSubIds(subIds);
  if (env.SHOPEE_MOCK) return mock.shortLink(originUrl, ids);
  /* inline literals (JSON strings are valid GraphQL strings) so we don't depend on the input type's name */
  const q = `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: ${JSON.stringify(ids)} }) { shortLink } }`;
  const data = await gql(q);
  const s = data.generateShortLink && data.generateShortLink.shortLink;
  if (!s) throw new ShopeeError('generateShortLink returned no shortLink');
  return s;
}

/* imageUrl → $DATA_DIR/img/{itemId}.jpg ; returns the file name */
export async function downloadImage(imageUrl, itemId) {
  const name = String(itemId).replace(/\W/g, '') + '.jpg';
  const out = path.join(dirs.img, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return name;
  if (imageUrl.startsWith('mock:')) { fs.copyFileSync(path.join(ROOT, imageUrl.slice(5)), out); return name; }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) throw new Error('image too small');
      fs.writeFileSync(out, buf);
      return name;
    } catch (e) { lastErr = e; await sleep(1000 * (i + 1)); }
  }
  throw new ShopeeError('image download failed: ' + lastErr.message);
}
