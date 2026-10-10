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
import { posterKey, studioState, STRATS, TPL } from './mapping.js';
import { thumbFile, posterFile, closeBrowser } from './render.js';
import * as fb from './facebook.js';
import * as publish from './publish.js';
import { startJobs, stopJobs } from './jobs.js';
import * as telegram from './telegram.js';
import { loginView } from './views/login.js';
import { queueView } from './views/queue.js';
import { editView } from './views/edit.js';
import { logView } from './views/log.js';
import { statsView } from './views/stats.js';

export const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

const brand = () => (loadConfig().brand.bName || 'LEE');
const sendFile = (res, f, type) => fs.existsSync(f) ? res.type(type || path.extname(f)).sendFile(f) : res.status(404).end();

/* ---------- public ---------- */
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true, paused: !!svc.pause.get() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
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

app.use('/studio', express.static(path.join(ROOT, 'studio')));
app.get('/shared/:f', (req, res) => ['mapping.js', 'pick.js'].includes(req.params.f) ? sendFile(res, path.join(ROOT, 'src', req.params.f), 'text/javascript') : res.status(404).end());
app.get('/posters/:f', (req, res) => {
  const m = /^(d[0-9a-f]+)(?:-([1-4]))?\.(png|jpg)$/.exec(req.params.f);
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000'); // URLs carry ?k=posterKey
  sendFile(res, m[3] === 'jpg' ? thumbFile(m[1]) : posterFile(m[1], m[2] ? +m[2] : 0));
});
app.get('/img/:f', (req, res) => {
  if (!/^[\w.-]+$/.test(req.params.f)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  sendFile(res, path.join(dirs.img, req.params.f));
});

/* ---------- pages ---------- */
const posterState = d => ({ hasPoster: fs.existsSync(thumbFile(d.id)), busy: svc.status.rendering.has(d.id) || svc.status.queued.has(d.id) || (!fs.existsSync(thumbFile(d.id)) && !d.posterError) });
const pendingCount = () => db.prepare("SELECT COUNT(*) n FROM drafts WHERE status='draft'").get().n;

app.get('/', (req, res) => {
  const cfg = loadConfig();
  const posted = {};
  for (const r of db.prepare("SELECT draft_id, name FROM posts WHERE kind='posted' AND at>=?").all(Date.now() - 2 * 86400e3)) posted[r.draft_id] = r.name;
  const lc = kv.get('lastCollect');
  res.send(queueView({
    brand: brand(), pending: drafts.list('draft'), approved: svc.approvedWithSlots(cfg), today: todayView(cfg),
    paused: svc.pause.get(), collecting: svc.status.collecting, lastCollect: lc && lc.at > Date.now() - 36 * 3600e3 ? lc : null,
    posterState, postedNames: posted
  }));
});

app.get('/d/:id', (req, res) => {
  const d = drafts.get(req.params.id);
  if (!d || !['draft', 'approved'].includes(d.status)) return res.redirect('/');
  const cfg = loadConfig();
  const st = posterState(d);
  res.send(editView({ brand: brand(), d, st, cfg, count: pendingCount(), dirty: st.hasPoster && !st.busy && d.posterKey !== posterKey(d, cfg) }));
});

app.get('/log', (req, res) => {
  const rows = svc.logRows(30).map(r => {
    const d = drafts.get(r.draft_id);
    return { ...r, retryable: r.kind === 'failed' && d && d.status === 'failed' };
  });
  const imgOf = r => fs.existsSync(thumbFile(r.draft_id)) ? `/posters/${r.draft_id}.jpg?k=${r.at}` : (() => { const d = drafts.get(r.draft_id); return d ? '/img/' + d.p.img : ''; })();
  res.send(logView({ brand: brand(), rows, count: pendingCount(), imgOf }));
});

app.get('/stats', (req, res) => {
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
  res.send(statsView({ brand: brand(), range, s, count: pendingCount() }));
});

/* ---------- JSON API (custom header: browsers can't send it cross-site without CORS) ---------- */
const api = express.Router();
api.use((req, res, next) => req.method === 'GET' || req.get('X-Requested-With') === 'rv' ? next() : res.status(403).json({ error: 'bad request' }));
api.use(express.json({ limit: '6mb' }));
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res) ?? { ok: true }); }
  catch (e) { console.error(req.method, req.path, e.message); res.status(400).json({ error: e.message }); }
};

api.get('/status', wrap(() => ({
  collecting: svc.status.collecting, collectResult: svc.status.collectResult,
  rendering: [...svc.status.rendering, ...svc.status.queued], paused: svc.pause.get()
})));
api.post('/collect', wrap(() => ({ started: svc.runCollect() })));
api.post('/drafts/:id/approve', wrap(async req => {
  const r = await svc.approve(req.params.id, req.body && req.body.form);
  return { again: r.again, slot: r.slot ? r.slot.text : null };
}));
api.post('/drafts/:id/skip', wrap(req => svc.skip(req.params.id)));
api.post('/drafts/:id/unskip', wrap(req => svc.unskip(req.params.id)));
api.post('/drafts/:id/unapprove', wrap(req => svc.unapprove(req.params.id)));
api.post('/drafts/:id/save', wrap(async req => {
  const d = svc.saveForm(req.params.id, req.body.form);
  if (req.body.render) { await svc.ensurePoster(d.id); }
  else if (!svc.posterFresh(d)) svc.queuePosters([d.id]);
  const n = drafts.get(d.id);
  return { form: n.form, posterKey: n.posterKey, posterError: n.posterError };
}));
api.post('/drafts/:id/render', wrap(async req => { await svc.ensurePoster(req.params.id, { force: true }); return { posterKey: drafts.get(req.params.id).posterKey }; }));
api.post('/drafts/:id/photo', wrap(req => { const ref = svc.savePhoto(req.params.id, req.body.dataUrl); return { ref, url: '/img/' + ref.slice(3) }; }));
api.get('/drafts/:id/studio-state', wrap(req => {
  const d = drafts.get(req.params.id);
  if (!d) throw new Error('草稿不存在');
  return studioState(d, loadConfig(), ref => '/img/' + encodeURIComponent(ref.replace(/^\w+:/, '')));
}));
/* 重试 on the Token banner: debug_token must pass before publishing resumes */
api.post('/token', wrap(async () => {
  const r = await fb.checkToken();
  if (r.ok) { svc.pause.clear(); return { ok: true }; }
  svc.pause.set(r.error ? r.error.code : 190, 'Facebook token 有问题：' + r.problems.join('；') + '。到 Meta 重新生成 Page token，更新到服务器设置后点「重试」。批准的帖子会继续排队。');
  return { ok: false, error: r.problems.join('；') };
}));
api.post('/posts/:id/retry', wrap(req => publish.retryPost(Number(req.params.id))));
app.use('/api', api);

app.use((req, res) => res.status(404).send('Not found'));

/* ---------- start ---------- */
export async function start() {
  publish.recoverInterrupted();
  /* posters missing after a restart / collect from the CLI */
  const cfg = loadConfig();
  const stale = [...drafts.list('draft'), ...drafts.list('approved')].filter(d => !svc.posterFresh(d, cfg) && !d.posterError).map(d => d.id);
  if (stale.length) svc.queuePosters(stale);
  const srv = app.listen(env.PORT, () => console.log(`review app on http://localhost:${env.PORT}${env.SHOPEE_MOCK ? ' (SHOPEE_MOCK)' : ''}`));
  if (telegram.init({ onCollected: svc.onCollected, onPublishEvent: publish.onPublishEvent, onPause: svc.onPause })) console.log('telegram on');
  if (process.env.DISABLE_JOBS !== '1') startJobs();
  const stop = async () => { console.log('shutting down'); stopJobs(); srv.close(); await closeBrowser(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return srv;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) start();
