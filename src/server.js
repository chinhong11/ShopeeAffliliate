/* web service: review app, /studio/, posters, /healthz (+ scheduler, Step 6) */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { env, dirs, ROOT, loadConfig } from './config.js';
import { db, drafts, kv } from './db.js';
import { isAuthed, sessionCookie, clearCookie, tryLogin } from './auth.js';
import * as svc from './service.js';
import { todayView } from './slots.js';
import { posterKey, studioState, STRATS, TPL, langOf } from './mapping.js';
import { SIZE, cleanBrand, coverHtml, avatarHtml } from './brand.js';
import { thumbFile, viewFile, posterFile, pageFile, closeBrowser, renderHtml } from './render.js';
import * as fb from './facebook.js';
import * as publish from './publish.js';
import { startJobs, stopJobs } from './jobs.js';
import * as telegram from './telegram.js';
import { loginView } from './views/login.js';
import { queueView } from './views/queue.js';
import { editView } from './views/edit.js';
import { logView } from './views/log.js';
import { statsView } from './views/stats.js';
import { newView } from './views/new.js';
import { designsView } from './views/designs.js';
import { brandView } from './views/brand.js';
import { ready as shopeeReady } from './shopee.js';
import { H2I_FILE } from './static.js';
import * as gemini from './gemini.js';

export const app = express();
/* req.ip (login limit) may only come from X-Forwarded-For when a proxy we trust sets it: on by default on
   Railway / Render / Fly (one proxy hop), off on a bare port (docker-compose on a VPS), override with TRUST_PROXY */
const onProxyHost = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.FLY_APP_NAME);
const tp = (process.env.TRUST_PROXY || '').trim();
app.set('trust proxy', tp === '' ? (onProxyHost ? 1 : false) : /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp === 'false' ? false : tp);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

const brand = () => (loadConfig().brand.bName || 'LIM');
const sendFile = (res, f, type) => fs.existsSync(f) ? res.type(type || path.extname(f)).sendFile(f) : res.status(404).end();

/* ---------- public ---------- */
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true, paused: !!svc.pause.get() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
/* scripts are checked for a newer copy on every load (a cheap 304 when unchanged): they import each other by plain
   URL, so a version in the URL would load a second copy of app.js; an hour-old script once ran against a new page */
app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '1h', setHeaders: (res, f) => { if (f.endsWith('.js')) res.set('Cache-Control', 'no-cache'); } }));
app.get('/static/studio-ui-v3.css', (req, res) => sendFile(res, path.join(ROOT, 'studio/studio-ui-v3.css')));
app.get('/static/review-app.css', (req, res) => sendFile(res, path.join(ROOT, 'design/review-app.css')));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').send(JSON.stringify({
  name: brand() + ' 带货后台', short_name: brand() + ' 后台', lang: 'zh', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#15131a', theme_color: '#15131a',
  icons: [{ src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/static/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
})));

app.get('/login', (req, res) => isAuthed(req) ? res.redirect('/') : res.send(loginView({ brand: brand() })));
app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  const r = tryLogin(req.ip, (req.body && req.body.password) || '');
  if (!r.ok) return res.status(r.locked ? 429 : 401).send(loginView({ brand: brand(), error: r.error }));
  res.set('Set-Cookie', sessionCookie()).redirect('/');
});
app.post('/logout', (req, res) => res.set('Set-Cookie', clearCookie()).redirect('/login'));

/* Telegram webhook (public; secret in the path + header) */
app.use(telegram.router);

/* ---------- everything else needs the login ---------- */
app.use((req, res, next) => {
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: '请先登录' });
  if (req.method === 'GET' && req.accepts('html')) return res.redirect('/login');
  res.status(401).end();
});

/* 在 Studio 精修 (…v3.html?draft=<id>): the studio page also gets the bar that loads that draft and saves
   what you change back to it (public/studio-bridge.js); the studio files themselves stay as they are */
app.get('/studio/html-to-image.js', (req, res) => sendFile(res, H2I_FILE, 'text/javascript')); // pinned, from node_modules
app.get('/studio/:file', (req, res, next) => {
  if (req.params.file !== 'Shopee Post Maker v3.html' || !/^d[0-9a-f]{8}$/.test(String(req.query.draft || ''))) return next();
  const html = fs.readFileSync(path.join(ROOT, 'studio', 'Shopee Post Maker v3.html'), 'utf8');
  res.type('html').set('Cache-Control', 'no-store').send(html.replace('</body>', '<script type="module" src="/static/studio-bridge.js"></script>\n</body>'));
});
app.use('/studio', express.static(path.join(ROOT, 'studio')));
app.get('/shared/:f', (req, res) => ['mapping.js', 'pick.js', 'brand.js'].includes(req.params.f) ? sendFile(res, path.join(ROOT, 'src', req.params.f), 'text/javascript') : res.status(404).end());
app.get('/posters/:f', (req, res) => {
  /* {id}.png, {id}-1..4.png (t8 pages), {id}.jpg (card), {id}-v.jpg (edit page) */
  const m = /^(d[0-9a-f]+)(?:-([1-4]|v|o[1-4]|p[1-4]))?\.(png|jpg)$/.exec(req.params.f);
  const file = !m ? null : m[2] && m[2][0] === 'o' ? (m[3] === 'jpg' ? svc.optionFile(m[1], +m[2][1] - 1) : null) :
    m[2] && m[2][0] === 'p' ? (m[3] === 'jpg' ? pageFile(m[1], +m[2][1]) : null) : m[3] === 'png' ? (m[2] === 'v' ? null : posterFile(m[1], m[2] ? +m[2] : 0)) : !m[2] ? thumbFile(m[1]) : m[2] === 'v' ? viewFile(m[1]) : null;
  if (!file) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000'); // URLs carry ?k=posterKey
  sendFile(res, file);
});
app.get('/img/:f', (req, res) => {
  if (!/^[\w.-]+$/.test(req.params.f)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  sendFile(res, path.join(dirs.img, req.params.f));
});

/* ---------- pages ---------- */
/* a poster that doesn't match its draft (made by `npm run collect`, edited, …) is queued when it is shown,
   so a spinner always means a render is really on its way */
const posterState = (d, cfg) => {
  if (!d.posterError && !svc.posterFresh(d, cfg)) svc.queuePosters([d.id]);
  return { hasPoster: fs.existsSync(thumbFile(d.id)), hasView: fs.existsSync(viewFile(d.id)), busy: svc.status.rendering.has(d.id) || svc.status.queued.has(d.id) };
};
const pendingCount = () => db.prepare("SELECT COUNT(*) n FROM drafts WHERE status='draft'").get().n;

app.get('/', (req, res) => {
  const cfg = loadConfig();
  const posted = {};
  for (const r of db.prepare("SELECT draft_id, name, at FROM posts WHERE kind='posted' AND at>=?").all(Date.now() - 2 * 86400e3)) posted[r.draft_id] = { name: r.name, at: r.at };
  const lc = kv.get('lastCollect');
  res.send(queueView({
    brand: brand(), pending: drafts.list('draft'), approved: svc.approvedWithSlots(cfg), today: todayView(cfg),
    paused: svc.pause.get(), collecting: svc.status.collecting, lastCollect: lc && lc.at > Date.now() - 36 * 3600e3 ? lc : null,
    collectError: shopeeReady() ? kv.get('lastCollectError') : null, tokenCheck: kv.get('tokenCheck'), posterState: d => posterState(d, cfg), posted,
    /* skipped drafts that can still be approved (3 days), newest first: 恢复 brings one back */
    skipped: drafts.list('skipped').filter(d => d.pendingSince > Date.now() - svc.EXPIRE_MS).sort((a, b) => b.updatedAt - a.updatedAt),
    hasThumb: d => fs.existsSync(thumbFile(d.id)), collectAt: cfg.collectAt, expireMs: svc.EXPIRE_MS, hasApi: shopeeReady()
  }));
});

app.get('/d/:id/designs', (req, res) => {
  const d = drafts.get(req.params.id);
  if (!d || !['draft', 'approved'].includes(d.status)) return res.redirect('/');
  res.send(designsView({ brand: brand(), d, count: pendingCount(), ai: gemini.enabled() }));
});
app.get('/new', (req, res) => res.send(newView({ brand: brand(), count: pendingCount() })));
/* 主页图: the Page's cover and profile picture (src/brand.js), drawn like the posters; uploading them stays the person's choice */
const brandDesign = () => cleanBrand(kv.get('brand:design') || { lang: langOf(loadConfig()) }, loadConfig().brand);
app.get('/brand', (req, res) => res.send(brandView({ brand: brand(), count: pendingCount(), o: brandDesign(), b: loadConfig().brand, pageId: env.FB_PAGE_ID })));
app.get('/brand/:kind.png', async (req, res, next) => {
  const k = req.params.kind;
  if (!SIZE[k]) return next();
  const png = await renderHtml((k === 'cover' ? coverHtml : avatarHtml)(brandDesign()), SIZE[k]);
  if (req.query.dl) res.attachment(`facebook-${k === 'cover' ? 'cover' : 'profile'}.png`);
  res.type('png').set('Cache-Control', 'no-store').send(png);
});

app.get('/d/:id', (req, res) => {
  const d = drafts.get(req.params.id);
  if (!d || !['draft', 'approved'].includes(d.status)) return res.redirect('/');
  const cfg = loadConfig();
  const st = posterState(d, cfg);
  res.send(editView({ brand: brand(), d, st, cfg: { ...cfg, ai: gemini.enabled() }, count: pendingCount(), dirty: st.hasPoster && !st.busy && d.posterKey !== posterKey(d, cfg) }));
});

app.get('/log', (req, res) => {
  const rows = svc.logRows(30).map(r => {
    const d = drafts.get(r.draft_id);
    return { ...r, retryable: r.kind === 'failed' && d && d.status === 'failed' };
  });
  const imgOf = r => fs.existsSync(thumbFile(r.draft_id)) ? `/posters/${r.draft_id}.jpg?k=${r.at}` : (() => { const d = drafts.get(r.draft_id); return d ? '/img/' + d.p.img : ''; })();
  res.send(logView({ brand: brand(), rows, count: pendingCount(), imgOf }));
});

app.get('/stats', async (req, res) => {
  const range = req.query.r === '30' ? '30' : '7';
  const since = Date.now() - Number(range) * 86400e3;
  const posts = db.prepare("SELECT strategy, tpl FROM posts WHERE kind='posted' AND at>=?").all(since);
  const conv = db.prepare('SELECT strategy, tpl, SUM(orders) o, SUM(commission) c FROM conversions WHERE purchase_time>=? GROUP BY strategy, tpl').all(since);
  const hasReport = !!db.prepare('SELECT 1 FROM conversions LIMIT 1').get();
  const group = (key, names) => Object.keys(names).map(k => {
    const n = posts.filter(p => p[key] === k).length;
    const cs = conv.filter(c => c[key] === k);
    return [k, typeof names[k] === 'string' ? names[k] : names[k].zh, n, cs.reduce((a, c) => a + (c.c || 0), 0), cs.reduce((a, c) => a + (c.o || 0), 0)];
  }).filter(r => r[2] || r[3]).sort((a, b) => (hasReport ? b[3] - a[3] : b[2] - a[2]));
  const s = {
    posts: posts.length, hasReport, reportAt: kv.get('reportAt', ''),
    orders: conv.reduce((a, c) => a + (c.o || 0), 0), comm: conv.reduce((a, c) => a + (c.c || 0), 0),
    strat: group('strategy', STRATS), tpl: group('tpl', TPL)
  };
  let models = [], modelsError = '';
  try { models = await gemini.listModels(); } catch (e) { modelsError = e.message; }
  res.send(statsView({ brand: brand(), range, s, count: pendingCount(), gem: { ...gemini.usage(), models, modelsError } }));
});

/* ---------- JSON API (custom header: browsers can't send it cross-site without CORS) ---------- */
const api = express.Router();
api.use((req, res, next) => req.method === 'GET' || req.get('X-Requested-With') === 'rv' ? next() : res.status(403).json({ error: 'bad request' }));
api.use(express.json({ limit: '24mb' })); // 手动添加: up to 4 photos of 2048px as data: URLs
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res) ?? { ok: true }); }
  catch (e) { console.error(req.method, req.path, e.message); res.status(400).json({ error: e.message }); }
};

api.get('/status', wrap(() => ({
  collecting: svc.status.collecting, collectResult: svc.status.collectResult,
  rendering: [...svc.status.rendering, ...svc.status.queued], paused: svc.pause.get()
})));
api.post('/collect', wrap(() => ({ started: svc.runCollect() })));
api.post('/manual', wrap(async req => {
  const sent = Array.isArray(req.body && req.body.photos) ? req.body.photos : [];
  console.log(`手动添加: ${sent.length} photo(s), ${sent.filter(x => typeof x === 'string' && x.startsWith('https:')).length} from Shopee`);
  const r = svc.addManual({ ...req.body, photos: await svc.importPhotos(sent) }); return r.duplicate ? { duplicate: r.duplicate } : { id: r.id }; }));
api.post('/drafts/:id/product', wrap(req => { svc.saveManualProduct(req.params.id, req.body); return { ok: true }; }));
api.post('/drafts/:id/approve', wrap(async req => {
  const question = !(req.body && req.body.priceOk) && svc.priceQuestion(drafts.get(req.params.id));
  if (question) return { confirm: question };
  const r = await svc.approve(req.params.id, req.body && req.body.form);
  return { again: r.again, slot: r.slot ? r.slot.text : null };
}));
api.post('/drafts/:id/skip', wrap(req => svc.skip(req.params.id)));
api.post('/drafts/:id/unskip', wrap(req => svc.unskip(req.params.id)));
api.post('/drafts/:id/remove', wrap(req => svc.removeSkipped(req.params.id)));
api.post('/drafts/:id/unapprove', wrap(req => svc.unapprove(req.params.id)));
api.post('/drafts/:id/save', wrap(async req => {
  const d = svc.saveForm(req.params.id, req.body.form);
  if (req.body.render) { await svc.ensurePoster(d.id); }
  else if (req.body.queue && !svc.posterFresh(d)) svc.queuePosters([d.id]); // leaving the page: refresh the poster in the background (autosaves don't)
  const n = drafts.get(d.id);
  return { form: n.form, posterKey: n.posterKey, posterError: n.posterError };
}));
/* 数据 → Gemini: which model, and its limits */
api.post('/gemini/model', wrap(async req => ({ model: await gemini.choose(String((req.body && req.body.id) || '')) })));
api.post('/gemini/limits', wrap(req => ({ limits: gemini.setLimits(req.body && req.body.id, req.body) })));
/* ✨ AI 设计 page: the stored options, 4 new ones, an option's preview, using one */
api.get('/drafts/:id/designs', wrap(req => ({ designs: svc.designOptions(req.params.id).map((o, n) => ({ tpl: o.tpl, why: o.why, preview: fs.existsSync(svc.optionFile(req.params.id, n)) ? `/posters/${req.params.id}-o${n + 1}.jpg?k=${o.at}` : '' })) })));
api.post('/drafts/:id/designs', wrap(async req => ({ designs: (await svc.newDesignOptions(req.params.id)).map(o => ({ tpl: o.tpl, why: o.why, preview: '' })) })));
const optionN = req => { const n = Number(req.params.n); if (!(Number.isInteger(n) && n >= 0 && n < 4)) throw new Error('没有这一款'); return n; };
api.post('/drafts/:id/designs/:n/preview', wrap(async req => ({ preview: await svc.previewOption(req.params.id, optionN(req)) })));
api.post('/drafts/:id/designs/:n/use', wrap(req => { svc.useOption(req.params.id, optionN(req)); return { ok: true }; }));
api.post('/brand', wrap(req => { const o = cleanBrand(req.body && req.body.design, loadConfig().brand); kv.set('brand:design', o); return { design: o }; }));
/* ✨ AI 设计海报: a new look for this draft, then its poster */
api.post('/drafts/:id/ai-design', wrap(async req => {
  const r = await svc.designDraft(req.params.id);
  await svc.ensurePoster(req.params.id);
  return { why: r.why, tpl: r.tpl };
}));
/* ✨ AI 写文案: new captions from the saved draft; the edit page shows them and saves them as hand-edited */
api.post('/drafts/:id/ai-caption', wrap(async req => {
  const d = drafts.get(req.params.id);
  if (!d) throw new Error('草稿不存在');
  return gemini.captions(d, loadConfig());
}));
api.post('/drafts/:id/render', wrap(async req => { await svc.ensurePoster(req.params.id, { force: true }); return { posterKey: drafts.get(req.params.id).posterKey }; }));
/* the edit screen asks this after waiting for a background render */
api.get('/drafts/:id/poster', wrap(req => {
  const d = drafts.get(req.params.id);
  if (!d) throw new Error('草稿不存在');
  return { posterKey: d.posterKey, posterError: d.posterError, busy: svc.status.rendering.has(d.id) || svc.status.queued.has(d.id), lookAt: (d.form.look && d.form.look.at) || 0 };
}));
/* 保存到草稿 in the studio: keep what was changed there, then make the poster from it */
api.post('/drafts/:id/studio', wrap(async req => {
  const d = svc.saveStudio(req.params.id, req.body && req.body.changes);
  await svc.ensurePoster(d.id);
  const n = drafts.get(d.id), st = studioState(n, loadConfig());
  return { posterKey: n.posterKey, posterError: n.posterError, shown: { seal: st.seal, proof: st.proof, tpl: n.form.tpl, framesDropped: d.framesDropped } };
}));
api.post('/drafts/:id/photo', wrap(req => { const ref = svc.savePhoto(req.params.id, req.body.dataUrl); return { ref, url: '/img/' + ref.slice(3) }; }));
api.get('/drafts/:id/studio-state', wrap(req => {
  const d = drafts.get(req.params.id);
  if (!d) throw new Error('草稿不存在');
  return { ...studioState(d, loadConfig(), ref => '/img/' + encodeURIComponent(ref.replace(/^\w+:/, ''))), photoRefs: d.form.photos };
}));
/* 重试 on the Token banner: debug_token must pass before publishing resumes */
api.post('/token', wrap(async () => {
  const r = await fb.checkToken();
  kv.set('tokenCheck', { at: Date.now(), ok: r.ok, transient: !!r.transient });
  if (r.ok) { svc.pause.clear(); return { ok: true }; }
  if (r.transient) return { ok: false, error: '暂时连不上 Facebook（' + r.problems.join('；') + '），过几分钟再点重试' };
  svc.pause.set(190, svc.pauseText(190, r.problems), 'token', svc.fbWords(r.detail));
  return { ok: false, error: r.problems.join('；') };
}));
api.post('/posts/:id/retry', wrap(req => publish.retryPost(Number(req.params.id))));
api.post('/posts/:id/delete', wrap(req => publish.deletePosted(Number(req.params.id))));
app.use('/api', api);

app.use((req, res) => res.status(404).send('Not found'));

/* ---------- start ---------- */
export async function start() {
  /* posters missing after a restart / collect from the CLI */
  const cfg = loadConfig();
  const stale = [...drafts.list('draft'), ...drafts.list('approved')].filter(d => !svc.posterFresh(d, cfg) && !d.posterError).map(d => d.id);
  if (stale.length) svc.queuePosters(stale);
  const srv = app.listen(env.PORT, () => console.log(`review app on http://localhost:${env.PORT}${env.SHOPEE_MOCK ? ' (SHOPEE_MOCK)' : ''}`));
  if (telegram.init({ onCollected: svc.onCollected, onCollectFailed: svc.onCollectFailed, onPublishEvent: publish.onPublishEvent, onPause: svc.onPause, onReminder: svc.onReminder })) console.log('telegram on');
  if (process.env.DISABLE_JOBS !== '1') startJobs();
  const stop = async () => { console.log('shutting down'); stopJobs(); srv.close(); await closeBrowser(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return srv;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) start();
