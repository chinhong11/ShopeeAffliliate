/* 在 Studio 精修 → 保存到草稿, in a real browser on sample products: the posted poster is the studio's own export,
   the save message names what stayed the app's, the edit page reloads by itself, 清除 brings the app's look back.
   Offline (SHOPEE_MOCK, temp data dir). `npm run studio-test` */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const cfg = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ...cfg, categories: [{ name: 'T', productCatId: null }] }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'config.json'), SHOPEE_MOCK: '1', DISABLE_JOBS: '1', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'x'.repeat(32) });
const { app } = await import('../src/server.js');
const { collect } = await import('../src/collect.js');
const { drafts } = await import('../src/db.js');
const { posterFile, closeBrowser } = await import('../src/render.js');

await collect({ log: () => {} });
const d = drafts.list('draft').find(x => !(x.p.disc >= 20)); // the app shows no discount seal on it
if (!d) throw new Error('no sample draft under 20 % off');
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const B = `http://127.0.0.1:${srv.address().port}`, form = () => drafts.get(d.id).form;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
/* the studio loads html-to-image from unpkg (fine in a browser with internet); serve the same file offline */
const h2i = createRequire(import.meta.url).resolve('html-to-image/dist/html-to-image.js');
await ctx.route('https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js', r => r.fulfill({ path: h2i, contentType: 'text/javascript' }));

let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  got: ' + JSON.stringify(got)}`); };
const errors = [], p = await ctx.newPage();
p.on('pageerror', e => errors.push('edit: ' + e.message));
const posterReady = () => p.waitForFunction(() => !document.querySelector('.ed-pv .pv-over'), null, { timeout: 300000 });
try {
  await p.goto(B + '/login'); await p.fill('#pw', 'pw'); await p.click('button[type=submit]'); await p.waitForURL(B + '/');
  await p.goto(B + '/d/' + d.id); await posterReady();
  const key0 = drafts.get(d.id).posterKey;
  const [s] = await Promise.all([ctx.waitForEvent('page'), p.click('#studio')]);
  s.on('pageerror', e => errors.push('studio: ' + e.message));
  await s.waitForSelector('.rvb-save:not([disabled])', { timeout: 120000 });
  const set = (sel, v) => s.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, String(v));
  /* tap 保存到草稿 → its message; a real save also reloads the edit page */
  const save = async () => {
    await s.$eval('.rvb-m', e => { e.textContent = ''; });
    const reloaded = p.waitForEvent('load', { timeout: 300000 }).then(() => true, () => false);
    await s.click('.rvb-save');
    await s.waitForFunction(() => /已保存|没保存成功|没有改动|没生成出来/.test(document.querySelector('.rvb-m').textContent), null, { timeout: 300000 });
    const msg = await s.$eval('.rvb-m', e => e.textContent);
    return { msg, reloaded: /已保存/.test(msg) ? await reloaded : false };
  };

  /* 1: colour, text size, photo zoom with the studio's own controls → the app's poster is the studio's export */
  await s.click('.swatches[data-target="1"] .swatch:nth-child(4)');
  await set('#textSize', 115); await set('#gzoom0', 160); await s.waitForTimeout(400);
  const studioPng = await s.evaluate(() => window.PostStudio.exportPng());
  let r = await save();
  check('saved, nothing left out', r.msg === '已保存 ✓ App 里的海报已经更新', r.msg);
  check('edit page reloaded by itself', r.reloaded);
  const lk = form().look || {};
  check('kept in the draft', lk.size === 115 && lk.frames && Object.values(lk.frames)[0].zoom === 160, lk);
  const appPng = 'data:image/png;base64,' + fs.readFileSync(posterFile(d.id)).toString('base64');
  const changed = await s.evaluate(async ([a, c]) => {
    const px = async src => { const i = new Image(); i.src = src; await i.decode(); const k = document.createElement('canvas'); k.width = i.width; k.height = i.height; const g = k.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const [A, C] = [await px(a), await px(c)];
    if (A.length !== C.length) return 1;
    let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - C[i]), Math.abs(A[i + 1] - C[i + 1]), Math.abs(A[i + 2] - C[i + 2])) > 24) n++;
    return n / (A.length / 4);
  }, [appPng, studioPng]);
  check(`posted poster = studio export (${(changed * 100).toFixed(3)} % pixels differ)`, changed < 0.001, changed);

  /* 2: nothing changed since */
  r = await save();
  check('no change → 没有改动', r.msg === '没有改动', r.msg);

  /* 3: the discount seal turned on where the product has no big discount */
  await s.$eval('#sealToggle', e => e.click()); await set('#textSize', 110);
  r = await save();
  check('seal → 价格和数据 named', r.msg.includes('价格和数据以 App 为准'), r.msg);

  /* 4: price, number of photos, a caption typed by hand */
  await set('#dNowIn', 'RM 1.00');
  await s.$eval('#layoutSeg', e => e.querySelector(`button[data-lay="${window.PostStudio.getState().layout === 1 ? 2 : 1}"]`).click());
  await s.$eval('#capOut', e => { e.value = '我自己写的文案'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await set('#textSize', 105);
  r = await save();
  check('price, photos, caption named', ['价格和数据', '照片', '文案'].every(w => r.msg.includes(w)), r.msg);
  check('price not taken', !JSON.stringify(form()).includes('RM 1.00') && form().look.size === 105, form().look);

  /* 5: a template the app keeps locked (限时抢购 needs a real end time) */
  const tpl = form().tpl;
  await s.click('.tpl[data-tpl="t3"]');
  r = await save();
  check('locked template → 模板没换', r.msg.includes('模板没换成这个') && form().tpl === tpl, r.msg);

  /* 6: 清除 on the edit page → the app's own look and poster again */
  await s.close(); await p.waitForSelector('#lookNote:not([hidden])'); await posterReady();
  await p.click('#lookClear'); await p.click('#regen'); await p.waitForTimeout(300); await posterReady(); await p.waitForTimeout(500);
  check('清除 → original poster', !form().look && drafts.get(d.id).posterKey === key0, form().look);
  check('no page errors', !errors.length, errors);
} finally {
  await b.close(); await closeBrowser(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
