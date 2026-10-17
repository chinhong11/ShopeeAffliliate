/* ✨ AI 设计: the stored options (or 4 new ones), each drawn one after another, then 用这款 */
import { api, toast, toastNext } from './app.js';

const $ = id => document.getElementById(id);
const { id } = JSON.parse(document.getElementById('data').textContent);
const TPL = { t1: '爆款分享', t2: '价格暴击', t6: '杂志封面' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let list = [], run = 0, busy = false;

function draw() {
  $('grid').innerHTML = list.map((o, n) => `<article class="ds-card">
    <div class="ds-img">${o.preview ? `<img src="${esc(o.preview)}" alt="设计 ${n + 1}">` : `<div class="pv-over"><i class="spin"></i><span>${o.error ? esc(o.error) : '画海报中…'}</span></div>`}</div>
    <div class="ds-bd"><b>${n + 1} · ${esc(TPL[o.tpl] || o.tpl)}</b><span>${esc(o.why)}</span></div>
    <button class="btn btn-primary" data-use="${n}"${o.preview ? '' : ' disabled'}>用这款</button>
  </article>`).join('');
}
/* previews one at a time (one renderer); a newer 再出 4 款 stops an older round */
async function previews(r) {
  for (const [n, o] of list.entries()) {
    if (o.preview) continue;
    try { o.preview = (await api(`/drafts/${id}/designs/${n}/preview`, {})).preview; }
    catch (e) { o.error = '没画出来：' + e.message; }
    if (r !== run) return;
    draw();
  }
}
async function fresh() {
  if (busy) return;
  busy = true; $('again').disabled = true; $('again').textContent = '设计中…';
  $('grid').innerHTML = '<div class="empty"><i class="spin"></i><b>Gemini 正在设计 4 款…</b><p>大概 10–20 秒，之后每款海报会一张张画出来。</p></div>';
  try { list = (await api(`/drafts/${id}/designs`, {})).designs; draw(); previews(++run); }
  catch (e) { $('grid').innerHTML = `<div class="empty"><b>没设计出来</b><p>${esc(e.message)}</p></div>`; }
  busy = false; $('again').disabled = false; $('again').textContent = '↻ 再出 4 款';
}

$('again').onclick = fresh;
$('grid').onclick = async e => {
  const b = e.target.closest('[data-use]'); if (!b) return;
  b.disabled = true; b.textContent = '使用中…';
  try { await api(`/drafts/${id}/designs/${b.dataset.use}/use`, {}); toastNext('已换成这款设计 · 海报生成中'); location.href = `/d/${id}`; }
  catch (err) { b.disabled = false; b.textContent = '用这款'; toast(err.message); }
};
/* the last options for this draft if there are any, otherwise 4 new ones */
(async () => {
  try { list = (await api(`/drafts/${id}/designs`)).designs; } catch { list = []; }
  if (!list.length) return fresh();
  draw(); previews(++run);
})();
