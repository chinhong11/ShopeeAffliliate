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
Object.assign(process.env, { GEMINI_API_KEY: '', // never the real key from .env
  DATA_DIR: tmp, CONFIG_FILE: cfgFile, TZ: 'Asia/Kuala_Lumpur', SHOPEE_MOCK: '1', ADMIN_PASSWORD: 'right-pw', SESSION_SECRET: 'x'.repeat(32), DISABLE_JOBS: '1' });
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
  assert.throws(() => svc.skip(b.id), /已经处理过了/);
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

test('posted slot and 已发布 show the short name and the time the post actually went out', async () => {
  const { queueView, priceWarn } = await import('../src/views/queue.js');
  const { logView } = await import('../src/views/log.js');
  const { fmtTime } = await import('../src/slots.js');
  const planned = new Date(2026, 9, 11, 12, 41).getTime(), at = planned + 47 * 60e3; // posted late, e.g. after a pause
  const raw = '【Ready Stock】辛拉面 甜辣泡菜炒面 5包装 🔥 COD';
  const html = queueView({
    brand: 'LEE', pending: [], approved: [], today: [{ label: '12:30', plannedAt: planned, status: 'used', draftId: 'd00000001' }],
    paused: null, collecting: '', lastCollect: null, collectError: null, posterState: () => ({}), posted: { d00000001: { name: raw, at } }
  });
  assert.ok(html.includes(fmtTime(at) + ' 已发') && !html.includes(fmtTime(planned) + ' 已发'));
  assert.ok(html.includes(shortName(raw)) && !html.includes('Ready Stock'));
  const log = logView({ brand: 'LEE', count: 0, imgOf: () => '', rows: [{ id: 1, draft_id: 'd00000001', kind: 'posted', at, name: raw, tpl: 't1', strategy: 'top', sub_ids: '[]', permalink: 'https://www.facebook.com/x' }] });
  assert.ok(log.includes(shortName(raw)) && !log.includes('Ready Stock'));
  const pc = { from: 'RM 219.00', to: 'RM 251.85', fromPct: '-12%' };
  assert.ok(!priceWarn({ ...pc, toPct: '-12%' }, '').includes('-12% → -12%'), 'an unchanged discount is not repeated');
  assert.ok(priceWarn({ ...pc, toPct: '-20%' }, '').includes('-12% → -20%'));
});

test('poster key: a new short link or caption is not a new poster (except 好友爆料, whose chat shows the link)', () => {
  const cfg = loadConfig(), d = drafts.get(a.id), k = posterKey(d, cfg);
  assert.equal(posterKey({ ...d, shortLink: 'https://s.shopee.com.my/other' }, cfg), k);
  assert.equal(posterKey({ ...d, form: { ...d.form, cap1: 'changed', cap1Manual: true } }, cfg), k);
  assert.notEqual(posterKey({ ...d, form: { ...d.form, l1: '别的标题' } }, cfg), k);
  const t4 = { ...d, form: { ...d.form, tpl: 't4', chat: { m1: '有货吗', m2: '有', m3: '链接' } } };
  assert.notEqual(posterKey({ ...t4, shortLink: 'https://s.shopee.com.my/other' }, cfg), posterKey(t4, cfg));
});

test('已跳过: 恢复 within 3 days, not when too old or when the product already has a newer draft', () => {
  const [x, y] = drafts.list('draft');
  svc.skip(x.id); svc.unskip(x.id);
  assert.equal(drafts.get(x.id).status, 'draft');
  svc.skip(x.id);
  drafts.update(x.id, { pendingSince: Date.now() - 3.1 * 86400e3 });
  assert.throws(() => svc.unskip(x.id), /超过 3 天/);
  drafts.update(x.id, { pendingSince: Date.now() });
  db.prepare('UPDATE drafts SET item_id=? WHERE id=?').run(x.itemId, y.id); // a newer draft of the same product
  assert.throws(() => svc.unskip(x.id), /已经有新的草稿/);
  db.prepare('UPDATE drafts SET item_id=? WHERE id=?').run(y.itemId, y.id);
  svc.unskip(x.id);
  assert.equal(drafts.get(x.id).status, 'draft');
  assert.throws(() => svc.unskip(x.id), /不在「已跳过」/);
});

test('queue page: plain pause banner with a guide link, first-run empty box, last-day note, 已跳过 list', async () => {
  const { queueView } = await import('../src/views/queue.js');
  const base = { brand: 'LEE', pending: [], approved: [], today: [], paused: null, collecting: '', lastCollect: null, collectError: null,
    posterState: () => ({}), posted: {}, collectAt: '09:15', expireMs: svc.EXPIRE_MS };
  let h = queueView(base);
  assert.ok(h.includes('还没有新草稿') && h.includes('09:15 自动抓新品') && !h.includes('今天的都处理完了') && !h.includes('08:00'));
  assert.ok(queueView({ ...base, lastCollect: { at: Date.now(), created: 3 } }).includes('今天的都处理完了'));
  const paused = { code: 190, source: 'token', message: svc.pauseText(190, ['token 无效']),
    detail: svc.fbWords('Facebook 错误 190: Error validating access token: Session has expired.') };
  h = queueView({ ...base, paused });
  assert.ok(h.includes('Facebook token 有问题：token 无效') && h.includes('Facebook 原话：Error validating access token: Session has expired<'));
  assert.ok(h.includes('SETUP.md#if-the-facebook-token-stops-working') && !h.includes('.。'));
  assert.ok(queueView({ ...base, paused: { code: 368, message: svc.pauseText(368), detail: '' } }).includes('#if-posting-is-paused-for-another-reason'));
  const d = drafts.list('draft')[0];
  const lastDay = { ...d, pendingSince: Date.now() - 2.5 * 86400e3 };
  assert.ok(queueView({ ...base, pending: [lastDay] }).includes('过期，过了就不能批准'));
  assert.ok(!queueView({ ...base, pending: [{ ...d, pendingSince: Date.now() }] }).includes('过期，过了就不能批准'));
  h = queueView({ ...base, skipped: [{ ...d, status: 'skipped', updatedAt: Date.now() }] });
  assert.ok(h.includes('已跳过 · 1') && h.includes(`data-act="unskip" data-id="${d.id}"`));
});

test('在 Studio 精修 → 保存到草稿: what changed in the studio is kept, drawn on the poster, and product data stays the app\'s', async () => {
  const { studioState, rm } = await import('../src/mapping.js');
  const cfg = loadConfig(), id = drafts.list('draft')[0].id;
  svc.saveForm(id, { photos: [drafts.get(id).form.photos[0], 'up:up-extra.jpg'] });
  const d0 = drafts.get(id), key0 = posterKey(d0, cfg), [p0, p1] = d0.form.photos;
  svc.saveStudio(id, {
    c1: '#1e90ff', size: 120, scrim: 999, align: 'center', font: 'Comic Sans', ctaText: '  点这里买  ', seal: true, proof: false, now: 'RM 1.00',
    frames: [{ zoom: 150, x: 30, y: 70 }, { zoom: 90, x: -5, y: 200 }]
  });
  const d1 = drafts.get(id), lk = d1.form.look;
  assert.equal(lk.c1, '#1e90ff'); assert.equal(lk.size, 120); assert.equal(lk.scrim, 80); assert.equal(lk.align, 'center');
  assert.ok(!('font' in lk), 'only the studio\'s own fonts'); assert.equal(lk.ctaText, '点这里买');
  assert.ok(!('seal' in lk), 'cannot bring back what the data turned off'); assert.equal(lk.proof, false);
  assert.deepEqual(lk.frames, { [p0]: { zoom: 150, x: 30, y: 70 }, [p1]: { zoom: 100, x: 0, y: 100 } });
  assert.equal(d1.form.l1, d0.form.l1, 'the headline was not touched in the studio');
  const st = studioState(d1, cfg);
  assert.equal(st.c1, '#1e90ff'); assert.equal(st.proof, false); assert.equal(st.ctaText, '点这里买');
  assert.equal(st.now, rm(d1.p.price), 'the price stays the product\'s');
  assert.deepEqual(st.photos[0], { src: p0, zoom: 150, x: 30, y: 70 });
  assert.notEqual(posterKey(d1, cfg), key0);
  /* a headline changed in the studio comes back; a bad colour doesn't; earlier studio changes stay */
  svc.saveStudio(id, { l1: 'Studio 改的标题', c2: 'red;background:url(x)' });
  const d2 = drafts.get(id);
  assert.equal(d2.form.l1, 'Studio 改的标题'); assert.ok(!('c2' in d2.form.look)); assert.equal(d2.form.look.c1, '#1e90ff');
  assert.ok(d2.form.look.at > lk.at, 'each studio save is newer than the one before (same millisecond too)');
  /* a dragged position keeps its decimals; framing for a photo list the app has changed since is dropped */
  svc.saveStudio(id, { photos: [p0, p1], frames: [{ zoom: 120, x: 37.4, y: 50 }] });
  assert.equal(drafts.get(id).form.look.frames[p0].x, 37.4);
  assert.ok(svc.saveStudio(id, { photos: [p1], frames: [{ zoom: 200, x: 10, y: 10 }] }).framesDropped);
  assert.equal(drafts.get(id).form.look.frames[p0].zoom, 120);
  /* an edit page opened before that studio save doesn't write its older look over it */
  svc.saveForm(id, { l2: '编辑页改的', look: { ...d2.form.look, c1: '#000000', at: d2.form.look.at - 1 } });
  assert.equal(drafts.get(id).form.look.c1, '#1e90ff'); assert.equal(drafts.get(id).form.l2, '编辑页改的');
  /* a photo removed in the app takes its framing with it; 清除 removes the studio's styling */
  svc.saveForm(id, { photos: [p0] });
  assert.deepEqual(Object.keys(drafts.get(id).form.look.frames), [p0]);
  svc.saveForm(id, { look: null });
  assert.equal(drafts.get(id).form.look, undefined);
  assert.equal(posterKey(drafts.get(id), cfg), posterKey({ ...d0, form: { ...d0.form, photos: [p0], l1: 'Studio 改的标题', l2: '编辑页改的' } }, cfg));
});
