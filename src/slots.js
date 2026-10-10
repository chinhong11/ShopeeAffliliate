/* posting slots: configured postTimes ± jitter, planned per day (README Step 6) */
import { db, dayStr } from './db.js';

const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const fmtTime = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/* configured slot labels for a day: sorted, at most postsPerDay */
export const slotLabels = cfg => [...cfg.postTimes].sort((a, b) => toMin(a) - toMin(b)).slice(0, Math.max(0, cfg.postsPerDay | 0));

const dayStart = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n, 12)); };

/* plan a day's slots once: label ± random jitter, at least 3 h apart */
export function planDay(day, cfg, rand = Math.random) {
  const have = db.prepare('SELECT * FROM slots WHERE day=? ORDER BY planned_at').all(day);
  if (have.length) return have;
  const j = Math.max(0, cfg.jitterMinutes | 0);
  let prev = -Infinity;
  const ins = db.prepare('INSERT OR IGNORE INTO slots(day,label,planned_at) VALUES(?,?,?)');
  for (const label of slotLabels(cfg)) {
    let m = toMin(label) + Math.round((rand() * 2 - 1) * j);
    if (m < prev + 180) m = prev + 180;
    if (m >= 24 * 60) break; // can't keep 3 h spacing inside the day
    prev = m;
    ins.run(day, label, dayStart(day) + m * 60e3);
  }
  return db.prepare('SELECT * FROM slots WHERE day=? ORDER BY planned_at').all(day);
}

export const daySlots = day => db.prepare('SELECT * FROM slots WHERE day=? ORDER BY planned_at').all(day);

const DAYS = ['今天', '明天', '后天'];
export const dayWord = n => DAYS[n] || n + ' 天后';

/* the next n open slots, in order (today's planned ones first, then future days by config) */
export function upcoming(n, cfg, now = Date.now()) {
  const out = [], today = dayStr(now);
  for (let k = 0; out.length < n && k < 60; k++) {
    const day = addDays(today, k);
    const rows = daySlots(day);
    if (rows.length) {
      for (const r of rows) if (r.status === 'open' && r.planned_at > now - 10 * 60e3) out.push({ day, k, label: r.label, plannedAt: r.planned_at, slotId: r.id });
    } else {
      for (const label of slotLabels(cfg)) if (k > 0 || dayStart(day) + toMin(label) * 60e3 > now) out.push({ day, k, label, plannedAt: null, slotId: null });
    }
  }
  return out.slice(0, n).map(s => ({ ...s, text: dayWord(s.k) + ' ' + s.label }));
}

/* today's slots for the queue header cards */
export function todayView(cfg, now = Date.now()) {
  const day = dayStr(now), rows = daySlots(day);
  if (rows.length) return rows.map(r => ({ label: r.label, plannedAt: r.planned_at, status: r.status, draftId: r.draft_id, slotId: r.id }));
  return slotLabels(cfg).map(label => ({ label, plannedAt: null, status: dayStart(day) + toMin(label) * 60e3 > now ? 'open' : 'past', draftId: null }));
}

export { hhmm, toMin };
