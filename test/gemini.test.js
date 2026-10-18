/* ✨ AI 写文案: the prompt keeps to the draft's data, the real link replaces {link}, errors read plainly (no real API call) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-'));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'none.json'), GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-flash-latest' });
const gemini = await import('../src/gemini.js');
const { env } = await import('../src/config.js');

const d = { shortLink: 'https://s.shopee.com.my/AbC', p: { name: '辛拉面 单包', price: 2.9, originalPrice: 4.9, disc: 41, rating: 4.8, sales: 8700 }, form: { l1: '把价格\n打下来了！', used: false } };
const cfg = { linkMode: 'comment', voucherCode: 'LIM5', hashtags: '#shopee #好物分享' };
const reply = (obj, status = 200) => { const calls = []; const f = async (url, o) => { calls.push({ url, o }); return { ok: status < 300, status, json: async () => obj }; }; f.calls = calls; return f; };
const answer = (post, comment) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ post, comment }) }] } }] });

test('prompt: only the draft\'s facts, no first person unless 我用过, link left as {link}', () => {
  const p = gemini.prompt(d, cfg);
  for (const s of ['RM 2.90', 'RM 4.90', '-41%', '4.8', '已售 8.7k+', 'LIM5', '不要写「我用过」', '{link}', '👉 购买链接放在第一条评论 👇']) assert.ok(p.includes(s), s);
  assert.ok(!p.includes('https://'));
  assert.ok(gemini.prompt({ ...d, form: { ...d.form, used: true } }, cfg).includes('可以用第一人称'));
  assert.ok(gemini.prompt(d, { ...cfg, linkMode: 'direct' }).includes('写空字符串'));
});

test('captions: real link in, stray addresses out, hashtags added; plain errors', async () => {
  const f = reply(answer('姐妹们看过来 😍\n现在只要 RM 2.90 https://fake.example/x\n👉 购买链接放在第一条评论 👇', '链接在这 👉 {link}'));
  const r = await gemini.captions(d, cfg, f);
  assert.equal(r.cap2, '链接在这 👉 https://s.shopee.com.my/AbC');
  assert.ok(!r.cap1.includes('fake.example'));
  assert.ok(r.cap1.endsWith('#shopee #好物分享'));
  assert.match(f.calls[0].url, /models\/gemini-flash-latest:generateContent$/);
  assert.equal(f.calls[0].o.headers['x-goog-api-key'], 'k');

  assert.equal((await gemini.captions(d, { ...cfg, linkMode: 'direct' }, reply(answer('买这里 {link}', 'x')))).cap2, '');
  await assert.rejects(gemini.captions(d, cfg, reply({}, 429)), /每分钟的免费次数/);
  await assert.rejects(gemini.captions(d, cfg, reply({ error: { message: 'API key not valid' } }, 400)), /API key not valid/);
  await assert.rejects(gemini.captions(d, cfg, reply({ candidates: [] })), /没有写出/);
  env.GEMINI_API_KEY = '';
  await assert.rejects(gemini.captions(d, cfg, reply(answer('a', 'b'))), /GEMINI_API_KEY/);
});

test('AI design: answer checked field by field, unreadable colours replaced, photo sent along', async () => {
  env.GEMINI_API_KEY = 'k';
  const ok = gemini.cleanDesign({ tpl: 't6', panel: '#1F2A44', accent: '#C2410C', c1: '#FDE68A', c2: '#CBD5E1', font: 'modern', align: 'left', marker: false, why: '深蓝配暖橙，突出质感' });
  assert.deepEqual(ok, { tpl: 't6', look: { panel: '#1f2a44', accent: '#c2410c', c1: '#fde68a', c2: '#cbd5e1', font: '"Montserrat","Noto Sans SC"', align: 'left', hl: false }, why: '深蓝配暖橙，突出质感' });
  const bad = gemini.cleanDesign({ tpl: 't4', panel: 'navy', accent: '#ffff66', c1: '#fafafa', c2: '#eeeeee', font: 'comic', align: 'right', marker: true, markerColor: 'yellow' });
  assert.equal(bad.tpl, 't1');                                       // only the panel templates
  assert.deepEqual(bad.look, { c1: '#1c1c1e', c2: '#1c1c1e', hl: false }); // no panel → white: light text replaced; pale accent dropped
  assert.ok(gemini.contrast('#ffffff', '#000000') > 20);
  /* a mid-tone panel: the replacement text is the colour that reads, and the same one the poster's bar uses */
  const { darkHex } = await import('../src/mapping.js');
  for (const panel of ['#a0a0a0', '#e07a5f', '#4fa3d1', '#00d70f']) {
    const lk = gemini.cleanDesign({ tpl: 't1', panel, c1: panel, c2: panel }).look;
    assert.ok(gemini.contrast(lk.c2, panel) >= 3, `${panel}: ${lk.c2}`);
    assert.equal(lk.c2 === '#ffffff', darkHex(panel), panel);
  }

  const f = reply({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tpl: 't2', panel: '#fff7ec', accent: '#b91c1c', c1: '#7c2d12', c2: '#57534e', font: 'rounded', align: 'center', marker: true, markerColor: '#fde047', why: '暖色配泡面' }) }] } }] });
  const r = await gemini.design(d, { buf: Buffer.from('jpegbytes'), type: 'image/jpeg' }, f);
  assert.equal(r.tpl, 't2'); assert.equal(r.look.hlc, '#fde047');
  const sent = JSON.parse(f.calls[0].o.body);
  assert.equal(sent.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
  assert.match(sent.contents[0].parts[0].text, /RM 2\.90/);
});

test('AI 设计 page: 4 different designs asked for, each checked, at most 4 kept', async () => {
  env.GEMINI_API_KEY = 'k';
  const one = (tpl, panel) => ({ tpl, panel, accent: '#9a3412', c1: '#7c2d12', c2: '#57534e', font: 'cute', align: 'left', marker: false, why: tpl });
  const f = reply({ candidates: [{ content: { parts: [{ text: JSON.stringify({ designs: [one('t1', '#fffbeb'), one('t2', '#fef2f2'), one('t6', '#111827'), one('t9', '#ffffff'), one('t1', '#ecfeff')] }) }] } }] });
  const list = await gemini.designs(d, null, f);
  assert.equal(list.length, 4);
  assert.deepEqual(list.map(x => x.tpl), ['t1', 't2', 't6', 't1']);  // unknown template → t1
  assert.equal(list[2].look.c1, '#ffffff');                         // dark text on the dark panel replaced
  assert.match(JSON.parse(f.calls[0].o.body).contents[0].parts[0].text, /4 款风格明显不同/);
  await assert.rejects(gemini.designs(d, null, reply({ candidates: [{ content: { parts: [{ text: '{"designs":[]}' }] } }] })), /没有给出设计/);
});

test('usage: counted per day and minute; a 429 says which limit and how long to wait', async () => {
  env.GEMINI_API_KEY = 'k';
  const before = gemini.usage().today.req;
  const ok = reply({ modelVersion: 'gemini-3.8-flash', usageMetadata: { totalTokenCount: 1234 }, candidates: [{ content: { parts: [{ text: JSON.stringify({ post: 'a', comment: 'b {link}' }) }] } }] });
  await gemini.captions(d, cfg, ok);
  const minute = { error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '31s' }] } };
  const e = await gemini.captions(d, cfg, reply(minute, 429)).catch(x => x);
  assert.match(e.message, /31 秒后再试/); assert.equal(e.retryMs, 31000);
  const day = { error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
  const e2 = await gemini.captions(d, cfg, reply(day, 429)).catch(x => x);
  assert.match(e2.message, /今天的 Gemini 免费次数用完了/); assert.equal(e2.retryMs, 0);
  const u = gemini.usage();
  assert.equal(u.today.req - before, 3); assert.ok(u.today.tokens >= 1234); assert.ok(u.lastMinute >= 3);
  assert.equal(u.model, 'gemini-flash-latest'); assert.equal(u.alias['gemini-flash-latest'], 'gemini-3.8-flash'); // the alias and the model behind it assert.equal(u.lastLimit.scope, 'day');
});

test('model choice and limits: chosen from the key\'s text models, limits typed or learned from a 429, counted per model', async () => {
  env.GEMINI_API_KEY = 'k';
  const list = { models: [
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] };
  assert.deepEqual(await gemini.listModels(reply(list), 1), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']); // text models only
  assert.equal(await gemini.choose('gemini-3.5-flash-lite', reply(list)), 'gemini-3.5-flash-lite');
  await assert.rejects(gemini.choose('gemini-3.1-flash-image', reply(list)), /用不了/);
  assert.deepEqual(gemini.setLimits('gemini-3.5-flash-lite', { rpm: '15', tpm: '', rpd: '1000' }), { rpm: 15, rpd: 1000 });
  assert.throws(() => gemini.setLimits('gemini-3.5-flash-lite', { rpm: '-1' }), /正整数/);
  /* the request goes to the chosen model; a 429 teaches its daily limit */
  const day = reply({ error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '1500' }] }] } }, 429);
  await gemini.captions(d, cfg, day).catch(() => {});
  assert.match(day.calls[0].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(gemini.limits()['gemini-3.5-flash-lite'].rpd, 1500);
  assert.ok(gemini.usage().today.models['gemini-3.5-flash-lite'] >= 1);
  assert.equal(await gemini.choose(env.GEMINI_MODEL, reply(list)), env.GEMINI_MODEL); // back to the default
});

test('an overloaded model (503) is tried again, then a plain message', async () => {
  env.GEMINI_API_KEY = 'k';
  gemini.opts.busyWaitMs = [0, 0];
  const busy = { error: { code: 503, message: 'This model is currently experiencing high demand.' } };
  const good = { candidates: [{ content: { parts: [{ text: JSON.stringify({ post: '好', comment: '{link}' }) }] } }] };
  let n = 0;
  const flaky = async () => (++n < 3 ? { ok: false, status: 503, json: async () => busy } : { ok: true, status: 200, json: async () => good });
  assert.match((await gemini.captions(d, cfg, flaky)).cap1, /^好/);
  assert.equal(n, 3);                                                   // 2 retries, then it worked
  await assert.rejects(gemini.captions(d, cfg, reply(busy, 503)), /现在太忙.*换一个模型/);
});
