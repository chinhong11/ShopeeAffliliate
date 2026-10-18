/* In a real browser on sample products, offline (SHOPEE_MOCK, temp data dir, no Gemini / Telegram). `npm run studio-test`
   - the studio opened on a draft (…v3.html?draft=<id>) → 保存到草稿: the posted poster is the studio's own export, the save
     message names what stayed the app's, the edit page reloads by itself, 用基本样式 brings the app's look back
   - a square Shopee photo is shown whole above the panel, not cropped
   - 海报和文案的语言: Bahasa Melayu ↔ 中文 on the edit page changes the headline, captions and poster, and is saved
   - 主页图: the cover / profile picture preview follows the choices, 生成 gives Facebook-sized PNGs to download */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const cfg = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url)));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ...cfg, categories: [{ name: 'T', productCatId: null }] }));
Object.assign(process.env, { DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'config.json'), SHOPEE_MOCK: '1', DISABLE_JOBS: '1', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'x'.repeat(32), GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '' }); // never the real keys from .env
const { app } = await import('../src/server.js');
const { collect } = await import('../src/collect.js');
const { drafts, kv } = await import('../src/db.js');
const { posterFile, closeBrowser } = await import('../src/render.js');

await collect({ log: () => {} });
const d = drafts.list('draft').find(x => !(x.p.disc >= 20)); // the app shows no discount seal on it
if (!d) throw new Error('no sample draft under 20 % off');
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const B = `http://127.0.0.1:${srv.address().port}`, form = () => drafts.get(d.id).form;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
/* nothing from unpkg: the studio's html-to-image comes from the app (a request there would fail offline) */
await ctx.route('https://unpkg.com/**', r => { errors.push('unpkg: ' + r.request().url()); r.abort(); });

let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  got: ' + JSON.stringify(got)}`); };
const errors = [], p = await ctx.newPage();
p.on('pageerror', e => errors.push('edit: ' + e.message));
const posterReady = () => p.waitForFunction(() => !document.querySelector('.ed-pv .pv-over'), null, { timeout: 300000 });
try {
  await p.goto(B + '/login'); await p.fill('#pw', 'pw'); await p.click('button[type=submit]'); await p.waitForURL(B + '/');
  await p.goto(B + '/d/' + d.id); await posterReady();
  const key0 = drafts.get(d.id).posterKey;
  const studio = async () => {
    const s = await ctx.newPage(); s.on('pageerror', e => errors.push('studio: ' + e.message));
    await s.goto(`${B}/studio/Shopee%20Post%20Maker%20v3.html?draft=${d.id}`);
    await s.waitForSelector('.rvb-save:not([disabled])', { timeout: 120000 }); await s.waitForTimeout(300);
    return s;
  };
  const s = await studio();
  /* 0: the square sample photo above the panel: shown whole (framed on a blurred copy), not cut to the box */
  const ph = await s.evaluate(() => { const e = document.querySelector('#photo.framed, .cellphoto.framed'); return { tpl: window.PostStudio.getState().tpl, framed: !!e, sw: e ? getComputedStyle(e).getPropertyValue('--sw') : '' }; });
  check(`square photo shown whole (${ph.tpl}, ${ph.sw.trim()} wide)`, ph.framed && ['t1', 't2', 't6'].includes(ph.tpl), ph);
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
  check('用基本样式 → original poster', !form().look && drafts.get(d.id).posterKey === key0, form().look);

  /* 7: 海报和文案的语言 → Bahasa Melayu: headline, captions, saved, a new poster with Malay words */
  const HAN = /[\u3400-\u9fff]/;
  await p.click('[data-lang="ms"]');
  const msForm = await p.evaluate(() => ({ l1: document.getElementById('l1').value, c1: document.getElementById('c1').value, c2: document.getElementById('c2').value, on: document.querySelector('[data-lang="ms"]').getAttribute('aria-pressed') }));
  check('Melayu: headline in Malay', !HAN.test(msForm.l1) && msForm.on === 'true', msForm);
  check('Melayu: captions in Malay', msForm.c1.includes('Link pembelian di komen pertama') && msForm.c2.includes('ada di sini'), msForm);
  await p.click('#regen'); await p.waitForTimeout(300); await posterReady(); await p.waitForTimeout(500);
  check('Melayu: saved with the draft, new poster', form().lang === 'ms' && form().cap1.includes('Link pembelian di komen pertama') && drafts.get(d.id).posterKey !== key0, { lang: form().lang, key: drafts.get(d.id).posterKey });
  const s2 = await studio();
  const words = await s2.evaluate(() => ({ cta: document.getElementById('ctaFloat').textContent, bar: document.getElementById('bbCta').textContent, sold: document.getElementById('bbSold').textContent, line1: document.getElementById('line1').textContent, verified: document.getElementById('rbVerified').textContent }));
  check('Melayu: words on the poster', words.bar === 'Link di komen 👇' && /terjual/.test(words.sold) && !HAN.test(words.line1) && words.verified === '✅ Pembelian disahkan', words);
  await s2.close();
  await p.goto(B + '/');
  check('Melayu: the card says so', await p.$eval(`.card[data-id="${d.id}"]`, c => !!c.querySelector('.chip.lang')).catch(() => false));

  /* 8: back to 中文 */
  await p.goto(B + '/d/' + d.id); await posterReady();
  await p.click('[data-lang="zh"]');
  const zh = await p.evaluate(() => ({ l1: document.getElementById('l1').value, c1: document.getElementById('c1').value }));
  check('中文 again: headline and captions', HAN.test(zh.l1) && zh.c1.includes('购买链接放在第一条评论'), zh);
  await p.click('#regen'); await p.waitForTimeout(300); await posterReady(); await p.waitForTimeout(500);
  check('中文 again: saved, the first poster back', form().lang === 'zh' && drafts.get(d.id).posterKey === key0, form().lang);

  /* 8a: an empty headline and a subtitle you wrote: switching language fills the headline, keeps your subtitle */
  await p.fill('#l1', ''); await p.fill('#l2', 'only my sub'); await p.click('[data-lang="ms"]');
  const mine = { l1: await p.inputValue('#l1'), l2: await p.inputValue('#l2') };
  check('language switch keeps a hand-written subtitle', mine.l2 === 'only my sub' && mine.l1.trim() && !HAN.test(mine.l1), mine);

  /* 8b: the same draft open in two tabs (phone + laptop): each tab's autosave keeps the other's saved edit */
  const q = await ctx.newPage(); q.on('pageerror', e => errors.push('tab B: ' + e.message));
  await q.goto(B + '/d/' + d.id); await q.waitForSelector('#l2');
  const saved = pg => pg.waitForFunction(() => /已保存/.test(document.getElementById('sv').textContent), null, { timeout: 30000 });
  await p.fill('#l1', 'Tab A 标题'); await saved(p);
  await q.fill('#l2', 'Tab B 副标题'); await saved(q); await q.waitForTimeout(2000); await q.close();
  check('two tabs: both saved edits kept', form().l1 === 'Tab A 标题' && form().l2 === 'Tab B 副标题', { l1: form().l1, l2: form().l2 });

  /* 9: 主页图: preview follows the typing, 生成 gives the Facebook-sized PNGs, the choices are kept */
  await p.goto(B + '/brand'); await p.waitForTimeout(500);
  const doc = id => p.$eval(`#${id} iframe`, f => f.srcdoc);
  await p.fill('#name', 'CH Hub'); await p.click('[data-cover="dark"]'); await p.click('[data-avatar="initial"]'); await p.click('[data-lang="ms"]');
  const pv = { cover: await doc('pvCover'), avatar: await doc('pvAvatar'), line: await p.inputValue('#line') };
  check('主页图: preview follows the choices', pv.cover.includes('CH Hub') && pv.cover.includes('class="dark"') && pv.avatar.includes('class="initial"') && pv.line === 'Barang Shopee terbaik setiap hari', pv.line);
  const make = async kind => {
    await p.click(`[data-make="${kind}"]`);
    await p.waitForFunction(k => { const i = document.getElementById('outImg'); return !document.getElementById('out').hidden && i.className === k && i.complete && i.naturalWidth; }, kind, { timeout: 120000 });
    return p.evaluate(() => ({ w: document.getElementById('outImg').naturalWidth, h: document.getElementById('outImg').naturalHeight, dl: document.getElementById('outDl').getAttribute('href') }));
  };
  const cv = await make('cover'), av = await make('avatar');
  await p.click('[data-make="cover"]');
  const allOff = await p.evaluate(() => [...document.querySelectorAll('[data-make]')].every(b => b.disabled));
  await p.waitForFunction(() => [...document.querySelectorAll('[data-make]')].every(b => !b.disabled && !/生成中/.test(b.textContent)), null, { timeout: 120000 });
  check('主页图: one 生成 at a time, both buttons back after', allOff);
  check('主页图: 生成封面 1640×720, 生成头像 720×720, both to download', cv.w === 1640 && cv.h === 720 && av.w === 720 && av.h === 720 && /dl=1/.test(cv.dl + av.dl), { cv, av });
  const kept = kv.get('brand:design') || {};
  check('主页图: choices kept for next time', kept.name === 'CH Hub' && kept.cover === 'dark' && kept.lang === 'ms', kept);
  await p.reload(); check('主页图: page opens with them', (await p.inputValue('#name')) === 'CH Hub');
  /* 10: 梗图: write one, the preview follows, 生成海报 → 1080×1080, then 发布 shows; any change hides it again */
  await p.goto(B + '/memes'); await p.click('#blank');
  check('梗图: no 发布 button before a poster is made', await p.$eval('#post', b => !b.offsetParent)); await p.click('[data-lang="ms"]');
  await p.fill('#top', 'Gaji masuk'); await p.fill('#bottom', 'Gaji keluar <b>');
  const mv = await p.$eval('#pv iframe', f => f.srcdoc);
  check('梗图: preview follows the typing, words as text', mv.includes('Gaji masuk') && mv.includes('Gaji keluar &lt;b&gt;') && mv.includes('class="meme"'));
  await p.click('#make');
  await p.waitForFunction(() => { const i = document.getElementById('outImg'); return !document.getElementById('out').hidden && i.complete && i.naturalWidth; }, null, { timeout: 120000 });
  const mp = await p.evaluate(() => ({ w: outImg.naturalWidth, h: outImg.naturalHeight, post: !document.getElementById('post').hidden, del: !document.getElementById('del').hidden }));
  check('梗图: 生成海报 1080×1080, 发布 and 删除 there', mp.w === 1080 && mp.h === 1080 && mp.post && mp.del, mp);
  await p.fill('#top', 'Gaji masuk!');
  check('梗图: a change hides the poster until 生成 again', await p.$eval('#out', o => o.hidden && getComputedStyle(o).display === 'none' && !o.querySelector('#post').offsetParent));
  await p.reload();
  check('梗图: saved as a draft', (await p.$$eval('[data-open]', l => l.map(x => x.textContent))).some(t => t.includes('Gaji masuk / Gaji keluar <b>')));
  /* 11: 梗图 with a photo: pick 照片, upload, the preview and the PNG use it */
  await p.click('#blank'); await p.click('[data-style="photo"]');
  check('梗图: 照片 hides the emoji fields, shows the photo picker', await p.evaluate(() => !document.getElementById('photoField').hidden && document.getElementById('e1').closest('.field').hidden));
  await p.setInputFiles('#photoIn', new URL('../design/review-photos/p-ramen1.jpg', import.meta.url).pathname);
  await p.waitForFunction(() => document.querySelector('#pv iframe').srcdoc.includes('/img/ct-'), null, { timeout: 30000 });
  await p.fill('#top', 'Bila gaji masuk');
  await p.click('#make');
  await p.waitForFunction(() => { const i = document.getElementById('outImg'); return !document.getElementById('out').hidden && i.complete && i.naturalWidth; }, null, { timeout: 120000 });
  const pm = await p.evaluate(() => { const i = document.getElementById('outImg'), c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    const d = x.getImageData(540, 700, 1, 1).data; return { w: i.naturalWidth, rgb: [...d.slice(0, 3)], pv: document.querySelector('#pv iframe').contentDocument.querySelector('img.ph').naturalWidth }; });
  check('梗图: photo in the preview and in the 1080×1080 PNG (not the empty dark card)', pm.w === 1080 && pm.pv > 0 && pm.rgb.some(v => Math.abs(v - 28) > 20), pm);
  check('no page errors', !errors.length, errors);
} finally {
  await b.close(); await closeBrowser(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
