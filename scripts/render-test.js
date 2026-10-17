/* README Step 3 acceptance test: render studio/samples/ramen.png with t1 t2 t5 t6 at every layout through the
   automation path (PostStudio.load + exportPng) and compare each with the studio's own ⬇ 下载海报 button export
   of the same state; also t3 / t4 and the four t8 pages (vs ⬇ 下载全部 4 张), since the renderer embeds only the
   font slices a poster uses. Writes $DATA_DIR/render-test/{tpl}-{layout}.png and contact.png. `npm run render-test` */
import fs from 'node:fs';
import path from 'node:path';
import { dirs, ROOT } from '../src/config.js';
import { renderState, openStudio, closeBrowser } from '../src/render.js';

const OUT = path.join(dirs.data, 'render-test');
fs.mkdirSync(OUT, { recursive: true });
const ramen = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'studio/samples/ramen.png')).toString('base64');

const base = {
  lang: 'zh', l1: '全网都在抢的\n爆款', l2: '已售 15k+ 件',
  price: true, now: 'RM 12.90', was: 'RM 18.97', pct: '-32%', seal: true, sealLabel: 'OFF',
  proof: true, rate: '4.9', sold: '已售 15k+', voucher: false, voucherCode: '',
  cta: true, ctaText: '评论区拿链接 👇', arrow: true, shopee: true,
  badge: true, bstyle: 'lee', bInit: 'L', bName: 'LEE', bTag: 'Sharing', badgec: '#1c1c1e',
  cd: { h: '00', m: '00', s: '00' }, stockTxt: '', stockPct: 0,
  review: { quote: '', author: '' }, chat: { title: '', sub: '', m1: '', m2: '', m3: '' },
  cap: { mode: 'comment', name: '辛拉面 甜辣泡菜炒面 5包装', link: 'https://s.shopee.com.my/test', price: 'RM 12.90', code: '', tags: '#shopee' }
};
const cases = [];
for (const tpl of ['t1', 't2', 't5', 't6']) for (let layout = 1; layout <= 4; layout++) {
  const st = { ...base, tpl, layout, photos: Array(layout).fill(ramen) };
  if (tpl === 't5') st.review = { quote: '（测试用评价）面很Q，辣度刚好', author: '— 测试' };
  cases.push(st);
}
cases.push({ ...base, tpl: 't3', layout: 1, photos: [ramen], cd: { h: '05', m: '42', s: '07' }, stockTxt: '限时闪购中', stockPct: 64 });
cases.push({ ...base, tpl: 't4', layout: 1, photos: [ramen], chat: { title: '好物分享群 🔥', sub: '群聊', m1: '（测试）这个辣不辣？', m2: '微辣，配蛋超好吃', m3: '我也要链接！' } });
const setCase = { ...base, tpl: 't8', layout: 1, photos: [ramen], set: { pages: [0, 1, 2, 3].map(i => ({ src: ramen, cap: ['', '为什么值得买 ✅', '细节实拍 🔍', '怎么下单 👇'][i] })) } };

async function buttonExport(state) {
  const page = await openStudio({ fresh: true });
  try {
    await page.evaluate(s => window.PostStudio.load(s), state);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#downloadBtn')]);
    return fs.readFileSync(await dl.path());
  } finally { await page.close(); }
}
/* t8: the studio's ⬇ 下载全部 4 张 button → its 4 downloads */
async function buttonExportSet(state) {
  const page = await openStudio({ fresh: true });
  try {
    await page.evaluate(s => window.PostStudio.load(s), state);
    const files = [];
    const got = new Promise((res, rej) => {
      page.on('download', async dl => { files.push(fs.readFileSync(await dl.path())); if (files.length === 4) res(); });
      setTimeout(() => rej(new Error('set download timeout')), 240000);
    });
    await page.click('#dlSetBtn');
    await got;
    return files;
  } finally { await page.close(); }
}

/* pixel diff in the browser: share of pixels whose channel delta > 24, and mean abs delta */
async function diff(a, b) {
  const page = await openStudio();
  try {
    return await page.evaluate(async ([a, b]) => {
      const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const px = async src => { const i = await load(src); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data }; };
      const A = await px(a), B = await px(b);
      if (A.w !== B.w || A.h !== B.h) return { size: `${A.w}x${A.h} vs ${B.w}x${B.h}`, changed: 1, mean: 255 };
      let changed = 0, sum = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        const m = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2]));
        sum += m; if (m > 24) changed++;
      }
      const n = A.d.length / 4;
      return { size: `${A.w}x${A.h}`, changed: changed / n, mean: sum / n };
    }, [a, b].map(x => 'data:image/png;base64,' + x.toString('base64')));
  } finally { await page.close(); }
}

async function contactSheet(files) {
  const page = await openStudio();
  try {
    const url = await page.evaluate(async srcs => {
      const c = document.createElement('canvas'), s = 360, g0 = 12; c.width = 4 * s + 5 * g0; c.height = 4 * s + 5 * g0;
      const g = c.getContext('2d'); g.fillStyle = '#15131a'; g.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < srcs.length; k++) {
        const i = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = srcs[k]; });
        g.drawImage(i, g0 + (k % 4) * (s + g0), g0 + Math.floor(k / 4) * (s + g0), s, s);
      }
      return c.toDataURL('image/png');
    }, files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')));
    fs.writeFileSync(path.join(OUT, 'contact.png'), Buffer.from(url.split(',')[1], 'base64'));
  } finally { await page.close(); }
}

let fail = 0;
const files = [];
for (const st of cases) {
  const name = `${st.tpl}-${st.layout}`;
  const t = Date.now();
  const { png } = await renderState(st);
  const btn = await buttonExport(st);
  const f = path.join(OUT, name + '.png');
  fs.writeFileSync(f, png); fs.writeFileSync(path.join(OUT, name + '-button.png'), btn);
  files.push(f);
  const d = await diff(png, btn);
  const ok = d.size === '2160x2160' && d.changed < 0.001; // posters are exported at 2× (post-studio-v3.js snapshot)
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${d.size}  changed ${(d.changed * 100).toFixed(3)}%  mean Δ ${d.mean.toFixed(3)}  ${Date.now() - t} ms`);
}
{
  const t = Date.now();
  const { set } = await renderState(setCase, { set: true });
  const btn = await buttonExportSet(setCase);
  for (let i = 0; i < 4; i++) {
    const name = `t8-page${i + 1}`;
    const f = path.join(OUT, name + '.png');
    fs.writeFileSync(f, set[i]); files.push(f);
    const d = await diff(set[i], btn[i]);
    const ok = d.size === '2160x2160' && d.changed < 0.001; // posters are exported at 2× (post-studio-v3.js snapshot)
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${d.size}  changed ${(d.changed * 100).toFixed(3)}%  mean Δ ${d.mean.toFixed(3)}${i === 3 ? `  ${Date.now() - t} ms` : ''}`);
  }
}
await contactSheet(files.slice(0, 16));
const total = cases.length + 4;
console.log(`\n${total - fail}/${total} identical to the studio export · ${path.join(OUT, 'contact.png')}`);
await closeBrowser();
process.exit(fail ? 1 : 0);
