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
/* a render that takes longer than this (or whose renderer process dies) is aborted and Chromium is restarted */
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 120000);

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
/* drop the shared browser (crash / timeout recovery); the next render launches a fresh one */
async function resetBrowser() {
  const b = browserP; browserP = null; ctxP = null;
  if (b) await b.then(br => br.close(), () => {}).catch(() => {});
}
export async function closeBrowser() {
  await resetBrowser();
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
  try {
    await page.route(H2I_URL, r => r.fulfill({ path: H2I_FILE, contentType: 'text/javascript' }));
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fontRoute);
    await page.goto(base + STUDIO_PATH, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.PostStudio, null, { timeout: 60000 });
    return page;
  } catch (e) {
    page.close().catch(() => {}); // don't leave a half-loaded studio page in the shared context
    /* our own local page aborting its load = the renderer died while loading it (e.g. out of memory): restart Chromium */
    if (/ERR_ABORTED|frame was detached|crash/i.test(e.message)) throw Object.assign(new Error('Chromium 渲染进程崩溃了（可能是内存不够）'), { fatal: true });
    throw e;
  }
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
    else if (fs.existsSync(f)) return route.fulfill({ status: 200, headers, body: fs.readFileSync(f) }); // Google answered 4xx/5xx: stale beats none
    return route.fulfill({ status: res.status(), headers: { ...headers, 'content-type': res.headers()['content-type'] || headers['content-type'] }, body });
  } catch (e) {
    if (fs.existsSync(f)) return route.fulfill({ status: 200, headers, body: fs.readFileSync(f) }); // stale CSS beats no CSS
    return route.abort();
  }
}

const toBuf = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

/* html-to-image inlines every @font-face it can read into each export: with the studio's Google Fonts that is
   ~550 slices and ~1 GB of Chromium memory. Keep only the faces whose family is used inside #post and whose
   unicode-range covers a character the poster can show (its text, pseudo-element content and every string in
   the state, e.g. the t8 page captions). Glyphs come from the same faces, so the PNG is unchanged. */
async function trimFonts(page, state) {
  const text = [];
  (function walk(v) {
    if (typeof v === 'string') { if (!v.startsWith('data:') && v.length < 4000) text.push(v); }
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(state);
  return page.evaluate(async extra => {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href.startsWith('https://fonts.googleapis.com/'));
    if (!link || !link.sheet) return { trimmed: false };
    const post = document.getElementById('post');
    const chars = new Set();
    const addText = s => { s = String(s || ''); for (const t of [s, s.toUpperCase(), s.toLowerCase()]) for (const ch of t) chars.add(ch.codePointAt(0)); };
    const unq = s => s.trim().replace(/^["']|["']$/g, '').toLowerCase();
    const fams = new Set();
    const addFam = v => String(v || '').split(',').forEach(f => fams.add(unq(f)));
    addText(post.textContent); addText(extra);
    for (const el of [post, ...post.querySelectorAll('*')]) {
      addFam(getComputedStyle(el).fontFamily);
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(el, pe);
        if (cs.content && cs.content !== 'none' && cs.content !== 'normal') { addFam(cs.fontFamily); addText(cs.content); }
      }
    }
    const covers = range => String(range || 'U+0-10FFFF').split(',').some(part => {
      const m = part.trim().replace(/^U\+/i, '');
      let lo, hi;
      if (m.includes('?')) { lo = parseInt(m.replace(/\?/g, '0'), 16); hi = parseInt(m.replace(/\?/g, 'F'), 16); }
      else if (m.includes('-')) { const [a, b] = m.split('-'); lo = parseInt(a, 16); hi = parseInt(b.replace(/^U\+/i, ''), 16); }
      else lo = hi = parseInt(m, 16);
      for (const c of chars) if (c >= lo && c <= hi) return true;
      return false;
    });
    let css = '', kept = 0, total = 0;
    try {
      for (const r of link.sheet.cssRules) {
        if (r.type !== CSSRule.FONT_FACE_RULE) { css += r.cssText + '\n'; continue; }
        total++;
        if (fams.has(unq(r.style.getPropertyValue('font-family'))) && covers(r.style.getPropertyValue('unicode-range'))) { css += r.cssText + '\n'; kept++; }
      }
    } catch { return { trimmed: false }; } // unreadable sheet: export with whatever html-to-image can embed
    if (!kept) return { trimmed: false, total };
    const style = document.createElement('style');
    style.textContent = css;
    link.after(style);
    link.remove();
    /* the faces are re-created from the trimmed rules: load them before exporting */
    post.getBoundingClientRect();
    await Promise.all([...document.fonts].map(f => f.status === 'loaded' ? null : f.load().catch(() => null)));
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { trimmed: true, kept, total };
  }, text.join('\n'));
}

/* renders run one at a time */
function exclusive(fn) {
  const job = chain.then(fn);
  chain = job.catch(() => {});
  return job;
}

/* one render with a deadline. A crashed renderer or a stuck export never settles on its own (the pending
   page.evaluate just hangs), so on timeout / crash Chromium is closed, which also rejects whatever is pending. */
async function renderNow(state, { set = false } = {}) {
  let page = null, timer = null;
  let abort;
  const guard = new Promise((_, rej) => { abort = rej; });
  guard.catch(() => {}); // a crash event after the race is settled must not become an unhandled rejection
  timer = setTimeout(() => abort(Object.assign(new Error(`海报渲染超时（${Math.round(RENDER_TIMEOUT_MS * (set ? 2 : 1) / 1000)} 秒）`), { fatal: true })), RENDER_TIMEOUT_MS * (set ? 2 : 1));
  const work = (async () => {
    page = await openStudio();
    page.once('crash', () => abort(Object.assign(new Error('Chromium 渲染进程崩溃了（可能是内存不够）'), { fatal: true })));
    await page.evaluate(s => window.PostStudio.load(s), state);
    const live = await page.evaluate(() => window.PostStudio.getState());
    const bad = placeholderProblems(live, state);
    if (bad.length) throw new Error('placeholder guard: ' + bad.join(', '));
    await trimFonts(page, state);
    await page.evaluate(() => window.PostStudio.fit && window.PostStudio.fit()); // headline / price sizes with the final fonts
    const pngUrl = await page.evaluate(() => window.PostStudio.exportPng());
    const png = toBuf(pngUrl);
    /* JPEGs for the review app: 540px for the cards, 1080px for the edit page (a fraction of the PNG's size on a phone) */
    const jpeg = (size, q = 0.85) => page.evaluate(async ([u, s, q]) => {
      const i = new Image(); await new Promise((r, j) => { i.onload = r; i.onerror = j; i.src = u; });
      const c = document.createElement('canvas'); c.width = c.height = s; c.getContext('2d').drawImage(i, 0, 0, s, s);
      return c.toDataURL('image/jpeg', q);
    }, [pngUrl, size, q]).then(toBuf);
    /* a photo-heavy 2160px PNG can pass Facebook's upload size: post a 92 % JPEG of the same size instead */
    const post = png.length > 3.8e6 ? await jpeg(2160, 0.92) : png;
    const thumb = await jpeg(540), view = await jpeg(1080);
    const pages = set ? (await page.evaluate(() => window.PostStudio.exportSet())).map(toBuf) : null;
    const caption = await page.evaluate(() => window.PostStudio.caption());
    return { png, post, thumb, view, set: pages, caption };
  })();
  work.catch(() => {});
  try {
    return await Promise.race([work, guard]);
  } catch (e) {
    if (e.fatal) await resetBrowser();
    throw e;
  } finally {
    clearTimeout(timer);
    if (page) page.close().catch(() => {});
  }
}

/* a whole HTML page of w×h CSS px (主页图: src/brand.js) → PNG at 2×, after its fonts are in; same queue as the posters */
export const renderHtml = (html, { w, h }) => exclusive(async () => {
  const page = await (await getBrowser()).newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(60000);
  try {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fontRoute);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  } finally { await page.close().catch(() => {}); }
});

/* studio state → PNG buffer(s). Fails if a studio demo value survives (placeholder guard). */
export const renderState = (state, opts) => exclusive(() => renderNow(state, opts));

/* stored photo ref ('img:9001.jpg') → data: URL */
export function photoDataUrl(ref) {
  if (/^data:/.test(ref)) return ref;
  const f = path.join(dirs.img, path.basename(String(ref).replace(/^\w+:/, '')));
  const b = fs.readFileSync(f);
  const mime = b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,` + b.toString('base64');
}

function writeAtomic(file, buf) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); }
export const thumbFile = id => path.join(dirs.out, `${id}.jpg`);
export const viewFile = id => path.join(dirs.out, `${id}-v.jpg`);
/* 1080px JPEG of each page of a multi-photo draft, for the edit page (the PNGs are what gets posted) */
export const pageFile = (id, n) => path.join(dirs.out, `${id}-p${n}.jpg`);
export const posterFile = (id, n = 0) => path.join(dirs.out, n ? `${id}-${n}.png` : `${id}.png`);

/* render a draft → $DATA_DIR/out/{draftId}.png (t8: also {draftId}-1..4.png).
   The draft is read when its turn comes, so the poster and its posterKey always describe the same state. */
export const renderDraft = id => exclusive(async () => {
  const d = drafts.get(id);
  if (!d) throw new Error('no draft ' + id);
  const cfg = loadConfig();
  try {
    const st = studioState(d, cfg, photoDataUrl);
    const r = await renderNow(st, { set: d.form.tpl === 't8' });
    /* more than one photo (not the carousel): the same design again on each of the others → {id}-2..4.png, {id}-1 = the first */
    const more = d.form.tpl === 't8' ? [] : st.photos.slice(1);
    const pages = r.set || (more.length ? [r.post] : null), views = more.length ? [r.view] : [];
    for (const ph of more) { const x = await renderNow({ ...st, photos: [ph] }); pages.push(x.post); views.push(x.view); }
    writeAtomic(posterFile(id), r.set ? r.set[0] : r.post);
    writeAtomic(thumbFile(id), r.thumb);
    writeAtomic(viewFile(id), r.view);
    if (pages) pages.forEach((b, i) => writeAtomic(posterFile(id, i + 1), b));
    views.forEach((b, i) => writeAtomic(pageFile(id, i + 1), b));
    drafts.update(id, { posterKey: posterKey(d, cfg), posterError: null });
    return { file: posterFile(id), files: pages ? pages.map((_, i) => posterFile(id, i + 1)) : [posterFile(id)], caption: r.caption };
  } catch (e) {
    drafts.update(id, { posterError: String(e.message || e).slice(0, 300) });
    throw e;
  }
});
