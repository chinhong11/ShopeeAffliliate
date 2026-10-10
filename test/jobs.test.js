/* Step 6: slot planning, expiry, scheduler wiring */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
Object.assign(process.env, { DATA_DIR: tmp, TZ: 'Asia/Kuala_Lumpur', CONFIG_FILE: path.join(tmp, 'none.json') });
const { db, dayStr } = await import('../src/db.js');
const { planDay, upcoming, slotLabels } = await import('../src/slots.js');
const { loadConfig } = await import('../src/config.js');
const jobs = await import('../src/jobs.js');

const cfg = loadConfig();

test('planDay: postTimes ± jitter, ≥ 3 h apart, max postsPerDay, planned once', () => {
  for (let i = 0; i < 50; i++) {
    const day = `2030-01-${String(i % 28 + 1).padStart(2, '0')}`;
    db.prepare('DELETE FROM slots WHERE day=?').run(day);
    const rows = planDay(day, { ...cfg, postTimes: ['12:30', '14:00', '20:30'], postsPerDay: 3 });
    assert.ok(rows.length <= 3);
    for (let k = 1; k < rows.length; k++) assert.ok(rows[k].planned_at - rows[k - 1].planned_at >= 3 * 3600e3);
    const base = new Date(2030, 0, i % 28 + 1, 12, 30).getTime();
    assert.ok(Math.abs(rows[0].planned_at - base) <= 10 * 60e3);
  }
  const day = '2030-02-01';
  const a = planDay(day, cfg), b = planDay(day, { ...cfg, jitterMinutes: 0 });
  assert.deepEqual(a.map(r => r.planned_at), b.map(r => r.planned_at));
  assert.equal(a.length, 2);
  assert.deepEqual(slotLabels({ ...cfg, postsPerDay: 1 }), ['12:30']);
});

test('upcoming slots: today 12:30, today 20:30, tomorrow 12:30, …', () => {
  const morning = new Date(2031, 4, 5, 9, 0).getTime();
  const u = upcoming(3, cfg, morning);
  assert.deepEqual(u.map(s => s.text), ['今天 12:30', '今天 20:30', '明天 12:30']);
  const evening = new Date(2031, 4, 5, 21, 0).getTime();
  assert.deepEqual(upcoming(2, cfg, evening).map(s => s.text), ['明天 12:30', '明天 20:30']);
});

test('drafts not approved within 3 days expire', () => {
  const ins = db.prepare(`INSERT INTO drafts(id,item_id,shop_id,strategy,status,product,form,collected_day,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const old = Date.now() - 3.1 * 86400e3;
  ins.run('dold', '1', '1', 'top', 'draft', '{}', '{}', dayStr(old), old, old);
  ins.run('dappr', '2', '2', 'top', 'approved', '{}', '{}', dayStr(old), old, old);
  ins.run('dnew', '3', '3', 'top', 'draft', '{}', '{}', dayStr(), Date.now(), Date.now());
  assert.equal(jobs.expireDrafts(), 1);
  assert.equal(db.prepare('SELECT status FROM drafts WHERE id=?').get('dold').status, 'expired');
  assert.equal(db.prepare('SELECT status FROM drafts WHERE id=?').get('dappr').status, 'approved');
});

test('scheduler: collect 08:00, 00:05, every 5 min, token check 07:50 (Asia/Kuala_Lumpur)', () => {
  const list = jobs.startJobs();
  const fmt = d => d.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false });
  const [collect, plan, every5, token] = list.map(j => j.nextRun());
  assert.equal(fmt(collect), '08:00');
  assert.equal(fmt(plan), '00:05');
  assert.ok(every5 - Date.now() <= 5 * 60e3);
  assert.equal(fmt(token), '07:50');
  jobs.stopJobs();
});
