/* review fixes: product names, .env parsing, form validation, poster queue, photo upload ids, login limit */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-'));
const cfgFile = path.join(tmp, 'config.json');
const cfg0 = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg0, categories: [{ name: 'T', productCatId: null }] }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: cfgFile, TZ: 'Asia/Kuala_Lumpur', SHOPEE_MOCK: '1', ADMIN_PASSWORD: 'right-pw', SESSION_SECRET: 'x'.repeat(32), DISABLE_JOBS: '1' });
delete process.env.TRUST_PROXY; delete process.env.RAILWAY_ENVIRONMENT; delete process.env.RENDER; delete process.env.FLY_APP_NAME;
const { parseDotEnv, loadConfig } = await import('../src/config.js');
const { shortName, posterKey, endAtFrom, countdown } = await import('../src/mapping.js');
const { drafts, db } = await import('../src/db.js');
const { collect } = await import('../src/collect.js');
const { posterFile, thumbFile } = await import('../src/render.js');
const svc = await import('../src/service.js');

test('shortName keeps "Cod", drops COD / flags / emoji, never splits a character', () => {
  assert.equal(shortName('Seven Seas Cod Liver Oil 100 Capsules'), 'Seven Seas Cod Liver Oi…');
  assert.equal(shortName('Baju Raya (COD) Ready Stock'), 'Baju Raya');
  const s = shortName('Mi Band 8 Smart Watch 🇲🇾 Malaysia Set');
  assert.equal(s, 'Mi Band 8 Smart Watch M…');
  assert.ok(!/[\uD800-\uDFFF]/.test(shortName('手表🇲🇾'.repeat(10))), 'no surrogate halves');
  assert.equal(Array.from(shortName('好'.repeat(30))).length, 24);
});

test('.env: trailing spaces, inline comments, quotes, export', () => {
  assert.deepEqual(parseDotEnv('ADMIN_PASSWORD=hunter2 \nPORT=4545 # dev\n# c\nA="x # y"\nexport B=1\nC=a#b'),
    { ADMIN_PASSWORD: 'hunter2', PORT: '4545', A: 'x # y', B: '1', C: 'a#b' });
});

test('t3 end time is a date: an ended sale shows no countdown, never a 24 h wrap', () => {
  const noon = new Date(2031, 0, 1, 12, 28).getTime();
  assert.equal(new Date(endAtFrom('12:00', noon)).getDate(), 2); // already passed today → tomorrow
  assert.deepEqual(countdown({ end: '12:00', endAt: new Date(2031, 0, 1, 12, 0).getTime() }, noon), { h: '00', m: '00', s: '00' });
  assert.deepEqual(countdown({ endAt: noon + 90 * 60e3 + 5e3 }, noon), { h: '01', m: '30', s: '05' });
});

await collect({ log: () => {} });
const [a, b, c] = drafts.list('draft');
const fresh = id => { fs.writeFileSync(posterFile(id), 'p'); fs.writeFileSync(thumbFile(id), 'j'); drafts.update(id, { posterKey: posterKey(drafts.get(id), loadConfig()) }); };

test('cleanForm: no prototype keys as template, personal hook removed with 我用过 off, flash end dated', () => {
  const d = drafts.get(a.id), cfg = loadConfig();
  assert.equal(svc.cleanForm(d.form, { tpl: 'constructor' }, d, cfg).tpl, d.form.tpl);
  assert.equal(svc.cleanForm(d.form, { tpl: '__proto__' }, d, cfg).tpl, d.form.tpl);
  const on = svc.cleanForm(d.form, { used: true, l1: '这玩意儿也太\n好用了吧？！', l2: '不买真的亏' }, d, cfg);
  assert.equal(on.l1, '这玩意儿也太\n好用了吧？！');
  const off = svc.cleanForm(on, { used: false }, d, cfg);
  assert.notEqual(off.l1, on.l1);
  const t3 = svc.cleanForm(d.form, { tpl: 't3', flash: { end: '23:59', pct: '50' } }, d, cfg);
  assert.equal(t3.tpl, 't3'); assert.ok(t3.flash.endAt > Date.now());
  const again = svc.cleanForm(t3, { l2: 'x', flash: { ...t3.flash } }, d, cfg);
  assert.equal(again.flash.endAt, t3.flash.endAt); // unchanged time keeps its date
  const ended = svc.cleanForm({ ...t3, flash: { ...t3.flash, endAt: Date.now() - 1000 } }, {}, d, cfg);
  assert.equal(ended.tpl, d.form.autoTpl); // a sale that has ended can't stay on t3
});

test('status changes are check-and-set: skip / approve after the draft changed do nothing or fail', async () => {
  fresh(b.id);
  drafts.update(b.id, { status: 'posting' });
  svc.skip(b.id);
  assert.equal(drafts.get(b.id).status, 'posting');
  await assert.rejects(svc.approve(b.id), /不能批准/);
  assert.throws(() => svc.saveForm(b.id, { l1: 'x' }), /正在发布/);
  drafts.update(b.id, { status: 'draft' });
  drafts.update(b.id, { pendingSince: Date.now() - 4 * 86400e3 });
  await assert.rejects(svc.approve(b.id), /过期/);
  assert.equal(drafts.get(b.id).status, 'expired');
});

test('a queued poster that turned out fresh never stays "rendering" (spinner)', async () => {
  fresh(c.id);
  const orig = drafts.get(c.id).form;
  svc.saveForm(c.id, { ...orig, l1: 'changed' });   // ‹ 返回 with an edit: stale, so the server queues a render
  const done = svc.queuePosters([c.id]);
  assert.ok(svc.status.queued.has(c.id));
  svc.saveForm(c.id, orig);                        // edit undone before its turn: fresh again
  await done;
  assert.ok(!svc.status.queued.has(c.id) && !svc.status.rendering.has(c.id));
});

test('photo upload: the draft id must be a real draft id (no path in it)', () => {
  const png = 'data:image/png;base64,' + Buffer.from('x').toString('base64');
  assert.throws(() => svc.savePhoto('x/../../../tmp/evil', png), /草稿不存在/);
  assert.throws(() => svc.savePhoto('d00000000', png), /草稿不存在/);
  assert.match(svc.savePhoto(a.id, png), new RegExp('^up:up-' + a.id + '-[0-9a-f]{6}\\.png$'));
});

test('login limit: on a bare port X-Forwarded-For is ignored, so rotating it gives no extra tries', async () => {
  const { app } = await import('../src/server.js');
  const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const B = `http://127.0.0.1:${srv.address().port}`;
  const login = (pw, xff) => fetch(B + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': xff }, body: 'password=' + pw });
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await login('guess' + i, '10.0.0.' + i)).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 429, 429, 429]);
  srv.close();
});
