/* Poster renderer: the studio in headless Chromium (README Step 3).
   One shared browser; a new page per poster, closed after; renders run one at a time. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { env, dirs, loadConfig } from './config.js';
import { drafts } from './db.js';
import { studioState, posterKey, placeholderProblems } from './mapping.js';
import { startStudioServer } from './static.js';

const require = createRequire(import.meta.url);
/* the studio loads html-to-image from unpkg; serve the same pinned version from node_modules so renders don't depend on that CDN */
const H2I_URL = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
const H2I_FILE = require.resolve('html-to-image/dist/html-to-image.js');
export const STUDIO_PATH = '/studio/Shopee%20Post%20Maker%20v3.html';

let browserP = null, ctxP = null, baseUrl = null, ownServer = null, chain = Promise.resolve();

/* server.js calls this with its own http://127.0.0.1:PORT; CLI scripts get a private static server */
export function setStudioBase(url) { baseUrl = url; }
async function ensureBase() {
  if (!baseUrl) { const s = await startStudioServer(); ownServer = s.srv; baseUrl = s.url; }
  return baseUrl;
}
function getBrowser() {
  if (!browserP) {
    browserP = chromium.launch({ executablePath: env.CHROMIUM_PATH || undefined });
    browserP.then(b => b.on('disconnected', () => { browserP = null; ctxP = null; }), () => { browserP = null; });
  }
  return browserP;
}
/* one shared context so the HTTP cache keeps the ~500 web-font files html-to-image embeds;
   pages never persist studio state (PostStudio.load starts from defaults) */
function getContext() {
  if (!ctxP) ctxP = getBrowser().then(b => b.newContext({ viewport: { width: 1400, height: 1000 } }));
  ctxP.catch(() => { ctxP = null; });
  return ctxP;
}
export async function closeBrowser() {
  const b = browserP; browserP = null; ctxP = null;
  if (b) await (await b).close().catch(() => {});
  if (ownServer) { ownServer.close(); ownServer = null; baseUrl = null; }
}

export async function openStudio({ fresh = false } = {}) {
  const base = await ensureBase();
  let page;
  if (fresh) { /* isolated context (acceptance test: the studio's own download button) */
    const ctx = await (await getBrowser()).newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
    page = await ctx.newPage();
    page.on('close', () => ctx.close().catch(() => {}));
  } else page = await (await getContext()).newPage();
  await page.route(H2I_URL, r => r.fulfill({ path: H2I_FILE, contentType: 'text/javascript' }));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fontRoute);
  await page.goto(base + STUDIO_PATH, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.PostStudio, null, { timeout: 60000 });
  return page;
}

/* disk cache for Google Fonts (CSS for a day, font files forever: their URLs are versioned).
   html-to-image fetches and embeds every @font-face (~550 files) on each export; this keeps that local. */
const FONT_CACHE = path.join(dirs.data, 'fontcache');
fs.mkdirSync(FONT_CACHE, { recursive: true });
async function fontRoute(route) {
  const url = route.request().url();
  const isCss = url.startsWith('https://fonts.googleapis.com/');
  const f = path.join(FONT_CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  const headers = { 'access-control-allow-origin': '*', 'content-type': isCss ? 'text/css; charset=utf-8' : 'font/woff2' };
  try {
    const st = fs.statSync(f);
    if (!isCss || Date.now() - st.mtimeMs < 86400e3) return route.fulfill({ status: 200, headers, body: fs.readFileSync(f) });
  } catch {}
  try {
    const res = await route.fetch();
    const body = await res.body();
    if (res.ok()) { fs.writeFileSync(f + '.tmp', body); fs.renameSync(f + '.tmp', f); }
    return route.fulfill({ status: res.status(), headers: { ...headers, 'content-type': res.headers()['content-type'] || headers['content-type'] }, body });
  } catch (e) {
    if (fs.existsSync(f)) return route.fulfill({ status: 200, headers, body: fs.readFileSync(f) }); // stale CSS beats no CSS
    return route.abort();
  }
}

const toBuf = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

/* studio state → PNG buffer(s). Fails if a studio demo value survives (placeholder guard). */
export function renderState(state, { set = false } = {}) {
  const job = chain.then(async () => {
    const page = await openStudio();
    try {
      await page.evaluate(s => window.PostStudio.load(s), state);
      const live = await page.evaluate(() => window.PostStudio.getState());
      const bad = placeholderProblems(live, state);
      if (bad.length) throw new Error('placeholder guard: ' + bad.join(', '));
      const png = toBuf(await page.evaluate(() => window.PostStudio.exportPng()));
      const pages = set ? (await page.evaluate(() => window.PostStudio.exportSet())).map(toBuf) : null;
      const caption = await page.evaluate(() => window.PostStudio.caption());
      return { png, set: pages, caption };
    } finally { await page.close().catch(() => {}); }
  });
  chain = job.catch(() => {});
  return job;
}

/* stored photo ref ('img:9001.jpg') → data: URL */
export function photoDataUrl(ref) {
  if (/^data:/.test(ref)) return ref;
  const f = path.join(dirs.img, path.basename(String(ref).replace(/^\w+:/, '')));
  const b = fs.readFileSync(f);
  const mime = b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,` + b.toString('base64');
}

function writeAtomic(file, buf) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); }
export const posterFile = (id, n = 0) => path.join(dirs.out, n ? `${id}-${n}.png` : `${id}.png`);

/* render a draft → $DATA_DIR/out/{draftId}.png (t8: also {draftId}-1..4.png) */
export async function renderDraft(id) {
  const d = drafts.get(id);
  if (!d) throw new Error('no draft ' + id);
  const cfg = loadConfig();
  try {
    const st = studioState(d, cfg, photoDataUrl);
    const r = await renderState(st, { set: d.form.tpl === 't8' });
    writeAtomic(posterFile(id), r.set ? r.set[0] : r.png);
    if (r.set) r.set.forEach((b, i) => writeAtomic(posterFile(id, i + 1), b));
    drafts.update(id, { posterKey: posterKey(d, cfg), posterError: null });
    return { file: posterFile(id), files: r.set ? r.set.map((_, i) => posterFile(id, i + 1)) : [posterFile(id)], caption: r.caption };
  } catch (e) {
    drafts.update(id, { posterError: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
