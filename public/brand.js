/* 主页图: live preview with the same HTML the server draws (/shared/brand.js), then 生成 → the real PNG to download */
import { api, toast } from '/static/app.js';
import { SIZE, TEXT, cleanBrand, coverHtml, avatarHtml } from '/shared/brand.js';

const el = id => document.getElementById(id);
const { o, b: brand } = JSON.parse(el('data').textContent);
const TEXTS = ['name', 'tag', 'line', 'sub', 'init'];

/* each preview: the w×h page in an iframe, scaled down to the box's width */
function preview(id, kind, html) {
  const box = el(id), fr = box.querySelector('iframe'), { w, h } = SIZE[kind];
  fr.width = w; fr.height = h;
  if (fr.srcdoc !== html) fr.srcdoc = html;
  const k = box.clientWidth / w;
  fr.style.transform = `scale(${k})`; box.style.height = h * k + 'px';
}
function render() {
  const c = cleanBrand(o, brand);
  preview('pvCover', 'cover', coverHtml(c));
  preview('pvAvatar', 'avatar', avatarHtml(c));
  for (const k of ['lang', 'cover', 'avatar']) document.querySelectorAll(`[data-${k}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[k] === c[k])));
  el('accentHex').textContent = c.accent;
}
for (const k of TEXTS) el(k).oninput = e => { o[k] = e.target.value; render(); };
el('accent').oninput = e => { o.accent = e.target.value; render(); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang],[data-cover],[data-avatar]');
  if (!b) return;
  if (b.dataset.lang && b.dataset.lang !== o.lang) {
    /* the sentences still at the old language's words switch with it; your own words stay */
    for (const k of ['line', 'sub']) if (!o[k] || o[k] === TEXT[o.lang === 'ms' ? 'ms' : 'zh'][k]) { o[k] = TEXT[b.dataset.lang][k]; el(k).value = o[k]; }
    o.lang = b.dataset.lang;
  }
  if (b.dataset.cover) o.cover = b.dataset.cover;
  if (b.dataset.avatar) o.avatar = b.dataset.avatar;
  render();
});
/* 生成: save the choices, then the server draws the PNG (a few seconds) */
/* one at a time: both share the result image, so a second tap would leave the first waiting forever */
const makers = document.querySelectorAll('[data-make]');
makers.forEach(b => b.onclick = async () => {
  const kind = b.dataset.make, img = el('outImg');
  makers.forEach(x => { x.disabled = true; }); const label = b.textContent; b.textContent = '生成中…';
  try {
    await api('/brand', { design: o });
    const url = `/brand/${kind}.png?t=${Date.now()}`;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('图片没生成出来，再试一次')); img.src = url; });
    img.className = kind;
    el('outDl').href = url + '&dl=1';
    el('outDl').textContent = kind === 'cover' ? '⬇ 下载封面' : '⬇ 下载头像';
    el('out').hidden = false;
    el('out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) { toast(err.message); }
  makers.forEach(x => { x.disabled = false; }); b.textContent = label;
});
addEventListener('resize', render);
render();
