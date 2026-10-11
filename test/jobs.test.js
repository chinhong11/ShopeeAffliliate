/* Step 6: slot planning, expiry, cleanup, token check, daily catch-up, lease */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
Object.assign(process.env, { DATA_DIR: tmp, TZ: 'Asia/Kuala_Lumpur', CONFIG_FILE: path.join(tmp, 'none.json'), FB_PAGE_TOKEN: '', FB_APP_ID: '', FB_APP_SECRET: '' });
const { db, kv, dayStr } = await import('../src/db.js');
const { planDay, upcoming, slotLabels } = await import('../src/slots.js');
const { loadConfig, dirs } = await import('../src/config.js');
const fb = await import('../src/facebook.js');
const svc = await import('../src/service.js');
const jobs = await import('../src/jobs.js');

const cfg = loadConfig();
const ins = db.prepare(`INSERT INTO drafts(id,item_id,shop_id,strategy,status,product,form,collected_day,created_at,updated_at,pending_since) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
const form = photos => JSON.stringify({ photos });

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
  assert.deepEqual(upcoming(3, cfg, morning).map(s => s.text), ['今天 12:30', '今天 20:30', '明天 12:30']);
  const evening = new Date(2031, 4, 5, 21, 0).getTime();
  assert.deepEqual(upcoming(2, cfg, evening).map(s => s.text), ['明天 12:30', '明天 20:30']);
});

test('drafts not approved within 3 days of coming up for review expire', () => {
  const old = Date.now() - 3.1 * 86400e3, recent = Date.now() - 3600e3;
  ins.run('dold', '1', '1', 'top', 'draft', '{}', '{}', dayStr(old), old, old, old);
  ins.run('dappr', '2', '2', 'top', 'approved', '{}', '{}', dayStr(old), old, old, old);
  ins.run('dback', '3', '3', 'top', 'draft', '{}', '{}', dayStr(old), old, recent, recent); // returned / withdrawn an hour ago
  assert.equal(jobs.expireDrafts(), 1);
  assert.equal(db.prepare('SELECT status FROM drafts WHERE id=?').get('dold').status, 'expired');
  assert.equal(db.prepare('SELECT status FROM drafts WHERE id=?').get('dappr').status, 'approved');
  assert.equal(db.prepare('SELECT status FROM drafts WHERE id=?').get('dback').status, 'draft');
});

test('cleanup: big posters of finished drafts after 2 days, thumbnails + photos after 30, live drafts untouched', () => {
  const now = Date.now(), day = 86400e3;
  const touch = (dir, f) => { const p = path.join(dir, f); fs.writeFileSync(p, 'x'); const t = new Date(now - 3 * day); fs.utimesSync(p, t, t); };
  const mk = (id, status, age, photo) => {
    ins.run(id, id, id, 'top', status, '{}', form(['img:' + photo]), dayStr(now - age), now - age, now - age, now - age);
    for (const f of [`${id}.png`, `${id}.jpg`, `${id}-1.png`]) touch(dirs.out, f);
    touch(dirs.img, photo);
  };
  mk('d0000aaa1', 'approved', 40 * day, 'live.jpg');   // live: keep everything
  mk('d0000aaa2', 'posted', 5 * day, 'recent.jpg');    // posted 5 days ago: thumbnail + photo stay
  mk('d0000aaa3', 'expired', 40 * day, 'gone.jpg');    // long done: everything goes
  touch(dirs.out, 'd0000aaa9.png.tmp');                // stray temp file
  jobs.cleanupFiles(now);
  const out = new Set(fs.readdirSync(dirs.out)), img = new Set(fs.readdirSync(dirs.img));
  for (const f of ['d0000aaa1.png', 'd0000aaa1.jpg', 'd0000aaa1-1.png', 'd0000aaa2.jpg']) assert.ok(out.has(f), f);
  for (const f of ['d0000aaa2.png', 'd0000aaa2-1.png', 'd0000aaa3.png', 'd0000aaa3.jpg', 'd0000aaa9.png.tmp']) assert.ok(!out.has(f), f);
  assert.ok(img.has('live.jpg') && img.has('recent.jpg') && !img.has('gone.jpg'));
});

test('token check: a check that could not be made never pauses; a real problem pauses; a good check lifts a token pause only', async () => {
  const real = fb.opts.fetchImpl;
  const { env } = await import('../src/config.js');
  Object.assign(env, { FB_PAGE_TOKEN: 't', FB_APP_ID: 'a', FB_APP_SECRET: 's', FB_PAGE_ID: 'p' });
  fb.opts.retryDelayMs = 1;
  svc.pause.clear();
  fb.opts.fetchImpl = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await jobs.tokenCheck()).transient, true);
  assert.equal(svc.pause.get(), null);
  fb.opts.fetchImpl = async () => new Response(JSON.stringify({ error: { code: 2, message: 'Service temporarily unavailable' } }), { status: 503 });
  await jobs.tokenCheck();
  assert.equal(svc.pause.get(), null);
  fb.opts.fetchImpl = async () => new Response(JSON.stringify({ data: { is_valid: false, type: 'PAGE', profile_id: 'p', scopes: [], expires_at: 0 } }));
  await jobs.tokenCheck();
  assert.equal(svc.pause.get().source, 'token');
  const good = { data: { is_valid: true, type: 'PAGE', profile_id: 'p', scopes: ['pages_manage_posts', 'pages_manage_engagement', 'pages_read_engagement'], expires_at: 0 } };
  fb.opts.fetchImpl = async () => new Response(JSON.stringify(good));
  await jobs.tokenCheck();
  assert.equal(svc.pause.get(), null);
  svc.pause.set(368, 'spam', 'post');
  await jobs.tokenCheck();
  assert.equal(svc.pause.get().code, 368); // a posting pause waits for 重试
  svc.pause.clear();
  fb.opts.fetchImpl = real;
  Object.assign(env, { FB_PAGE_TOKEN: '', FB_APP_ID: '', FB_APP_SECRET: '' });
});

test('daily jobs catch up once per day, and only on the lease holder', async () => {
  const today = dayStr();
  kv.set('jobsLease', { owner: 'other-host:1', at: Date.now() });   // a running old instance
  const late = new Date(); late.setHours(23, 59, 0, 0);
  await jobs.runDailyDue(late.getTime());
  assert.equal(kv.get('jobDone:collect'), null);
  kv.del('jobsLease');                                              // it stopped and released the lease
  await jobs.runDailyDue(late.getTime());
  for (const j of ['daily', 'backup', 'collect']) assert.equal(kv.get('jobDone:' + j), today, j);
  await new Promise(r => setTimeout(r, 200));
  assert.match(kv.get('lastCollectError').error, /categories/);       // the shipped config has none: visible, not silent
  kv.del('lastCollectError');
  await jobs.runDailyDue(late.getTime());                           // already done today
  await new Promise(r => setTimeout(r, 200));
  assert.equal(kv.get('lastCollectError'), null);
  svc.pause.clear(); // the token job ran without FB settings
});

test('scheduler: daily runner every minute, publishing every 5; stopping releases the lease', () => {
  kv.del('jobsLease');
  const list = jobs.startJobs();
  const runs = list.filter(j => j.nextRun).map(j => j.nextRun() - Date.now());
  assert.ok(runs[0] <= 60e3 && runs[1] <= 5 * 60e3);
  assert.ok(kv.get('jobsLease'));
  jobs.stopJobs();
  assert.equal(kv.get('jobsLease'), null);
});

test('backup keeps the newest 7', async () => {
  const { backup } = await import('../src/backup.js');
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(dirs.backup, `app-2020-01-0${i}.db`), 'x');
  const f = await backup({ log: () => {} });
  const left = fs.readdirSync(dirs.backup).sort();
  assert.equal(left.length, 7);
  assert.equal(left[6], path.basename(f));
  assert.ok(!left.includes('app-2020-01-01.db'));
});
