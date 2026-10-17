/* scheduler inside the service (README Step 6). Timezone from config (Asia/Kuala_Lumpur). Exactly one instance. */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Cron } from 'croner';
import { loadConfig, dirs } from './config.js';
import { db, kv, dayStr } from './db.js';
import { planDay, toMin, hhmm } from './slots.js';
import { publishDue, recoverInterrupted } from './publish.js';
import { checkToken } from './facebook.js';
import { runCollect, pause, pauseText, fbWords, EXPIRE_MS, approvedWithSlots, remind } from './service.js';
import { backup } from './backup.js';
import { ready as shopeeReady } from './shopee.js';

const log = (...a) => console.log(new Date().toISOString(), '[jobs]', ...a);
const jobs = [];
let busy = false, leader = false;

/* single-instance lease in the shared DB: a second copy (e.g. during a rolling deploy) stays idle */
const ME = `${os.hostname()}:${process.pid}`;
function holdLease() {
  const l = kv.get('jobsLease');
  if (l && l.owner !== ME && Date.now() - l.at < 3 * 60e3) { leader = false; return false; }
  kv.set('jobsLease', { owner: ME, at: Date.now() });
  if (!leader) { leader = true; recoverInterrupted(); } // just took over: clean up what a dead instance left 'posting'
  return true;
}
function releaseLease() {
  const l = kv.get('jobsLease');
  if (l && l.owner === ME) kv.del('jobsLease'); // the next instance takes over at once instead of after 3 min
  leader = false;
}

export async function tick() {
  if (busy || !holdLease()) return;
  busy = true;
  try { await publishDue({ log }); }
  catch (e) { log('publishDue failed:', e.message); }
  try { remindDue(); } catch (e) { log('reminder failed:', e.message); }
  busy = false;
}

/* an hour before a posting time that nothing approved will fill, while drafts are waiting: remind once */
export function remindDue(now = Date.now()) {
  if (pause.get()) return null; // the pause itself was reported
  const pending = db.prepare("SELECT COUNT(*) n FROM drafts WHERE status='draft'").get().n;
  if (!pending) return null;
  const s = db.prepare("SELECT * FROM slots WHERE status='open' AND planned_at>? AND planned_at<=? ORDER BY planned_at").get(now, now + 3600e3);
  if (!s || kv.get('reminded:' + s.id)) return null;
  if (approvedWithSlots(loadConfig(), now).some(x => x.slot && x.slot.slotId === s.id)) return null;
  kv.set('reminded:' + s.id, now);
  const r = { label: s.label, plannedAt: s.planned_at, pending };
  log(`reminder: nothing approved for ${s.label}, ${pending} drafts waiting`);
  remind(r);
  return r;
}

/* README: drafts not approved within 3 days expire (counted from when they last came up for review) */
export function expireDrafts(now = Date.now()) {
  const r = db.prepare("UPDATE drafts SET status='expired', updated_at=? WHERE status='draft' AND COALESCE(pending_since, created_at)<?").run(now, now - EXPIRE_MS);
  if (r.changes) log(`expired ${r.changes} drafts not approved within 3 days`);
  return r.changes;
}

/* posters / photos of finished drafts: big PNGs go after 2 days, thumbnails + photos after 30 (the 已发布 tab
   shows 30 days). Without this a 1 GB volume fills up in about four months. Live drafts keep everything. */
export function cleanupFiles(now = Date.now()) {
  const keepAll = new Set(), keepThumb = new Set(), keepImg = new Set();
  for (const r of db.prepare('SELECT id, status, form, updated_at FROM drafts').all()) {
    const live = ['draft', 'approved', 'posting', 'failed'].includes(r.status);
    if (live || r.updated_at >= now - 2 * 86400e3) keepAll.add(r.id);
    if (live || r.updated_at >= now - 30 * 86400e3) {
      keepThumb.add(r.id);
      try { for (const ref of JSON.parse(r.form).photos || []) keepImg.add(String(ref).replace(/^\w+:/, '')); } catch {}
    }
  }
  const old = f => { try { return fs.statSync(f).mtimeMs < now - 86400e3; } catch { return false; } }; // never a file being written now
  let n = 0;
  for (const f of fs.readdirSync(dirs.out)) {
    const m = /^(d[0-9a-f]+)(-[1-4]|-v|-p[1-4])?\.(png|jpg)$/.exec(f), id = m && m[1];
    const keep = m && (keepAll.has(id) || (m[3] === 'jpg' && !m[2] && keepThumb.has(id))); // the -v.jpg goes with the big PNG
    if (!keep && old(path.join(dirs.out, f))) { fs.unlinkSync(path.join(dirs.out, f)); n++; }
  }
  for (const f of fs.readdirSync(dirs.img)) {
    if (!keepImg.has(f) && old(path.join(dirs.img, f))) { fs.unlinkSync(path.join(dirs.img, f)); n++; }
  }
  if (n) log(`cleanup: removed ${n} old poster / photo files`);
  return n;
}

/* invalid token or a missing scope → stop publishing (red banner). If Facebook couldn't be asked at all,
   nothing is known about the token: no pause, and the daily runner asks again a minute later. */
export async function tokenCheck() {
  const r = await checkToken();
  kv.set('tokenCheck', { at: Date.now(), ok: r.ok, transient: !!r.transient }); // the queue page shows when it last passed
  if (r.ok) {
    log('debug_token ok');
    const p = pause.get();
    if (p && p.source === 'token') { pause.clear(); log('token is valid again: publishing resumed'); }
    return r;
  }
  if (r.transient) { log('debug_token could not be checked, retrying later:', r.problems.join('; ')); return r; }
  log('debug_token problems:', r.problems.join('; '));
  pause.set(190, pauseText(190, r.problems), 'token', fbWords(r.detail));
  return r;
}

export function daily() {
  const cfg = loadConfig();
  db.prepare("DELETE FROM kv WHERE k LIKE 'reminded:%' AND CAST(substr(k, 10) AS INTEGER) IN (SELECT id FROM slots WHERE planned_at<?)").run(Date.now());
  planDay(dayStr(), cfg);
  expireDrafts();
  cleanupFiles();
}

/* daily jobs run at their time — or as soon as possible after it, if the service was down or another instance
   held the lease then (a deploy at 07:58 must not lose the day's collect). Done-markers live in the DB. */
const DAILY = [
  { name: 'daily', at: () => '00:05', run: () => { daily(); return true; } },
  { name: 'backup', at: () => '03:30', run: async () => { await backup({ log }); return true; } },
  { name: 'token', at: cfg => hhmm((toMin(cfg.collectAt) + 1430) % 1440), run: async () => !(await tokenCheck()).transient }, // 10 min before collect
  { name: 'collect', at: cfg => cfg.collectAt, run: () => { if (!shopeeReady()) { log('collect skipped: no Shopee API keys (products are added by hand)'); return true; } log('collect'); runCollect(); return true; } }
];
let dailyBusy = false;
export async function runDailyDue(now = Date.now()) {
  if (dailyBusy || !holdLease()) return;
  dailyBusy = true;
  try {
    const cfg = loadConfig(), today = dayStr(now), d = new Date(now), mins = d.getHours() * 60 + d.getMinutes();
    for (const j of DAILY) {
      if (mins < toMin(j.at(cfg)) || kv.get('jobDone:' + j.name) === today) continue;
      try { if (await j.run()) kv.set('jobDone:' + j.name, today); }
      catch (e) { log(`${j.name} failed:`, e.message); }
    }
  } finally { dailyBusy = false; }
}

export function startJobs() {
  const cfg = loadConfig();
  const tz = cfg.timezone || 'Asia/Kuala_Lumpur';
  const opt = { timezone: tz, protect: true, catch: e => log('job error:', e.message) };
  jobs.push(
    new Cron('* * * * *', opt, () => runDailyDue()), // collect / plan / backup / token check, each once a day
    new Cron('*/5 * * * *', opt, tick)               // due slots → publish
  );
  const keep = setInterval(() => { if (leader) holdLease(); }, 60e3); // keep the lease fresh while we hold it
  keep.unref(); jobs.push({ stop: () => clearInterval(keep) });
  if (holdLease()) {
    tokenCheck().catch(e => log('token check:', e.message));
    setTimeout(() => runDailyDue().then(tick), 5000).unref();
  } else log('another instance holds the scheduler lease; jobs idle here until it stops');
  log(`scheduled (${tz}): collect ${cfg.collectAt}, plan 00:05, publish every 5 min, backup 03:30, token check daily`);
  return jobs;
}
export const stopJobs = () => { jobs.forEach(j => j.stop()); jobs.length = 0; releaseLease(); };
export const nextRuns = () => jobs.filter(j => j.nextRun).map(j => j.nextRun() && j.nextRun().toISOString());
