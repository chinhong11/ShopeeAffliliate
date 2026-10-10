/* Facebook Graph API: Page photo post + first comment, carousel, token check (README Step 5) */
import fs from 'node:fs';
import { env } from './config.js';

const GRAPH = () => `${env.FB_GRAPH_BASE}/${env.FB_GRAPH_VERSION}`;
/* mock drafts may only ever reach a local fake Graph server (tests) */
export const isLocalFake = () => /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.FB_GRAPH_BASE);
/* rate-limit, spam or token errors: stop all publishing */
export const FATAL = new Set([4, 17, 32, 368, 190]);

export class FbError extends Error {
  constructor(msg, { code = 0, subcode = 0, status = 0, type = '' } = {}) {
    super(msg); this.code = code; this.subcode = subcode; this.status = status; this.type = type;
  }
  get fatal() { return FATAL.has(this.code); }
  get serverError() { return this.status >= 500; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const opts = { retryDelayMs: 60000, fetchImpl: (...a) => fetch(...a) };

/* one Graph call; 5xx retried once after 60 s */
export async function graph(method, path, params = {}, { file } = {}) {
  const url = new URL(GRAPH() + path);
  const send = async () => {
    let body, res;
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    } else {
      body = new FormData();
      for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
      if (file) body.append(file.field, new Blob([file.buf], { type: 'image/png' }), file.name);
    }
    try { res = await opts.fetchImpl(url, { method, body }); }
    catch (e) { throw new FbError('network: ' + e.message, { status: 599 }); }
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { j = null; }
    if (!res.ok || (j && j.error)) {
      const e = (j && j.error) || {};
      throw new FbError(`Facebook ${e.code ? '错误 ' + e.code : 'HTTP ' + res.status}: ${e.error_user_msg || e.message || text.slice(0, 200)}`,
        { code: e.code || 0, subcode: e.error_subcode || 0, status: res.status, type: e.type || '' });
    }
    return j;
  };
  try { return await send(); }
  catch (e) {
    if (!(e instanceof FbError) || !e.serverError) throw e;
    await sleep(opts.retryDelayMs);
    return send();
  }
}

const tok = () => ({ access_token: env.FB_PAGE_TOKEN });
const need = () => { if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw new FbError('FB_PAGE_ID / FB_PAGE_TOKEN missing in .env'); };

/* single image: POST /{page-id}/photos (multipart source, published=true) → {id, post_id} */
export async function postPhoto(png, message) {
  need();
  return graph('POST', `/${env.FB_PAGE_ID}/photos`, { ...tok(), message, published: 'true' }, { file: { field: 'source', buf: png, name: 'poster.png' } });
}
/* carousel (t8): unpublished photos → /{page-id}/feed with attached_media → {id} */
export async function postCarousel(pngs, message) {
  need();
  const ids = [];
  for (const [i, png] of pngs.entries()) {
    const r = await graph('POST', `/${env.FB_PAGE_ID}/photos`, { ...tok(), published: 'false' }, { file: { field: 'source', buf: png, name: `poster-${i + 1}.png` } });
    ids.push(r.id);
  }
  const r = await graph('POST', `/${env.FB_PAGE_ID}/feed`, { ...tok(), message, attached_media: ids.map(id => ({ media_fbid: id })) });
  return { id: r.id, post_id: r.id, media: ids };
}
export const comment = (postId, message) => graph('POST', `/${postId}/comments`, { ...tok(), message });
export async function permalink(postId) {
  try { return (await graph('GET', `/${postId}`, { ...tok(), fields: 'permalink_url' })).permalink_url || ''; }
  catch { return ''; }
}

/* debug_token: type PAGE, our Page, the 3 scopes, never expires */
export const SCOPES = ['pages_manage_posts', 'pages_manage_engagement', 'pages_read_engagement'];
export async function checkToken() {
  if (!env.FB_PAGE_TOKEN) return { ok: false, problems: ['FB_PAGE_TOKEN 没设置'] };
  if (!env.FB_APP_ID || !env.FB_APP_SECRET) return { ok: false, problems: ['FB_APP_ID / FB_APP_SECRET 没设置'] };
  let d;
  try { d = (await graph('GET', '/debug_token', { input_token: env.FB_PAGE_TOKEN, access_token: `${env.FB_APP_ID}|${env.FB_APP_SECRET}` })).data || {}; }
  catch (e) { return { ok: false, problems: [e.message], error: e }; }
  const p = [];
  if (!d.is_valid) p.push('token 无效' + (d.error ? '：' + d.error.message : ''));
  if (d.type !== 'PAGE') p.push(`type 是 ${d.type || '?'}，要 PAGE`);
  if (env.FB_PAGE_ID && String(d.profile_id) !== String(env.FB_PAGE_ID)) p.push(`profile_id ${d.profile_id || '?'} 不是 FB_PAGE_ID ${env.FB_PAGE_ID}`);
  const missing = SCOPES.filter(s => !(d.scopes || []).includes(s));
  if (missing.length) p.push('缺权限 ' + missing.join(', '));
  if (d.expires_at !== 0) p.push(d.expires_at ? `会过期（${new Date(d.expires_at * 1000).toISOString().slice(0, 10)}），要 expires_at: 0` : 'expires_at 不是 0');
  return { ok: !p.length, problems: p, data: d };
}

export const readPng = f => fs.readFileSync(f);
