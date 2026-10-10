/* scheduler inside the service (README Step 6). Timezone from config (Asia/Kuala_Lumpur). Exactly one instance. */
import os from 'node:os';
import { Cron } from 'croner';
import { loadConfig } from './config.js';
import { db, kv, dayStr } from './db.js';
import { planDay } from './slots.js';
import { publishDue } from './publish.js';
import { checkToken } from './facebook.js';
import { runCollect, pause } from './service.js';

const log = (...a) => console.log(new Date().toISOString(), '[jobs]', ...a);
const jobs = [];
let busy = false;

/* single-instance lease in the shared DB: a second copy (e.g. during a rolling deploy) stays idle */
const ME = `${os.hostname()}:${process.pid}`;
function holdLease() {
  const l = kv.get('jobsLease');
  if (l && l.owner !== ME && Date.now() - l.at < 3 * 60e3) return false;
  kv.set('jobsLease', { owner: ME, at: Date.now() });
  return true;
}

export async function tick() {
  if (busy || !holdLease()) return;
  busy = true;
  try { await publishDue({ log }); }
  catch (e) { log('publishDue failed:', e.message); }
  finally { busy = false; }
}

export function expireDrafts(now = Date.now()) {
  const r = db.prepare("UPDATE drafts SET status='expired', updated_at=? WHERE status='draft' AND created_at<?").run(now, now - 3 * 86400e3);
  if (r.changes) log(`expired ${r.changes} drafts not approved within 3 days`);
  return r.changes;
}

/* invalid token or a missing scope → stop publishing (red banner) */
export async function tokenCheck() {
  const r = await checkToken();
  if (r.ok) { log('debug_token ok'); return r; }
  log('debug_token problems:', r.problems.join('; '));
  pause.set(190, 'Facebook token 有问题：' + r.problems.join('；') + '。到 Meta 重新生成 Page token，更新到服务器设置后点「重试」。批准的帖子会继续排队。');
  return r;
}

export function daily() {
  const cfg = loadConfig();
  planDay(dayStr(), cfg);
  expireDrafts();
}

export function startJobs() {
  const cfg = loadConfig();
  const tz = cfg.timezone || 'Asia/Kuala_Lumpur';
  const [ch, cm] = cfg.collectAt.split(':').map(Number);
  const opt = { timezone: tz, protect: true, catch: e => log('job error:', e.message) };
  const lead = fn => () => { if (holdLease()) return fn(); };
  jobs.push(
    new Cron(`${cm} ${ch} * * *`, opt, lead(() => { log('collect'); runCollect(); })),
    new Cron('5 0 * * *', opt, lead(daily)),
    new Cron('*/5 * * * *', opt, tick),
    new Cron(`${(cm + 50) % 60} ${(ch + 23 + Math.floor((cm + 50) / 60)) % 24} * * *`, opt, lead(tokenCheck)) // 10 min before collect
  );
  setInterval(holdLease, 60e3).unref(); // keep the lease fresh while we hold it
  if (holdLease()) { daily(); tokenCheck().catch(e => log('token check:', e.message)); setTimeout(tick, 5000).unref(); }
  else log('another instance holds the scheduler lease; jobs idle here');
  log(`scheduled (${tz}): collect ${cfg.collectAt}, plan 00:05, publish every 5 min, token check daily`);
  return jobs;
}
export const stopJobs = () => { jobs.forEach(j => j.stop()); jobs.length = 0; };
export const nextRuns = () => jobs.map(j => j.nextRun() && j.nextRun().toISOString());
