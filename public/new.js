/* ＋ 手动添加: photos resized in the browser (same as the edit page), then one POST makes the draft.
   Opened by the Shopee import bookmark (#import=…), the fields come filled and the page's photos can be picked;
   picked Shopee photos are sent as their https address and downloaded by the server. */
import { api, toast, toastNext } from './app.js';
import { grab } from './grab.js';

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const photos = []; // data:image/jpeg URLs (uploaded) or https Shopee photo addresses (imported), first = main photo

const resize = file => new Promise((res, rej) => {
  const im = new Image(); im.onerror = () => rej(new Error('读不了这张照片'));
  im.onload = () => {
    const s = Math.min(1, 2048 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.86));
  };
  im.src = URL.createObjectURL(file);
});

function renderPhotos() {
  el('phTip').textContent = `${photos.length} / 4`;
  el('phs').innerHTML = [0, 1, 2, 3].map(i => {
    if (photos[i]) return `<div class="ph on" style="background-image:url('${esc(photos[i])}')">${i === 0 ? '<span class="tag">主图</span>' : ''}<button type="button" class="x" data-rm="${i}" aria-label="移除这张">×</button></div>`;
    if (i === photos.length) return '<button type="button" class="ph add" id="addPh" aria-label="加照片">＋</button>';
    return '<div class="ph"></div>';
  }).join('');
  if (imp) renderPick();
}

el('phs').onclick = e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { photos.splice(+rm.dataset.rm, 1); renderPhotos(); return; }
  if (e.target.closest('#addPh')) el('file').click();
};
el('file').onchange = async e => {
  const files = [...(e.target.files || [])].slice(0, 4 - photos.length); e.target.value = '';
  try { for (const f of files) photos.push(await resize(f)); } catch (err) { toast(err.message); }
  renderPhotos();
};

/* ---------- the Shopee import bookmark ---------- */
const bm = el('bm');
if (bm) bm.href = 'javascript:' + encodeURIComponent(`(${grab})(${JSON.stringify(location.origin)})`);

const imp = (() => {
  const m = location.hash.match(/^#import=(.+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname); // a reload starts empty instead of importing twice
  try { const j = JSON.parse(decodeURIComponent(m[1])); return j && typeof j === 'object' ? j : null; } catch { return null; }
})();
function renderPick() {
  el('pick').innerHTML = imp.images.map(u => {
    const i = photos.indexOf(u);
    return `<button type="button" class="ph on${i >= 0 ? ' sel' : ''}" data-pick="${esc(u)}" style="background-image:url('${esc(u)}')" aria-pressed="${i >= 0}" aria-label="${i >= 0 ? `第 ${i + 1} 张，点一下取消` : '选这张'}">${i >= 0 ? `<span class="n">${i + 1}</span>` : ''}</button>`;
  }).join('');
}
if (imp) {
  const str = v => typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  for (const k of ['name', 'price', 'was', 'rating', 'sales']) if (str(imp[k])) el(k).value = str(imp[k]);
  imp.images = (Array.isArray(imp.images) ? imp.images : []).filter(u => typeof u === 'string' && /^https:\/\/[\w.-]*susercontent\.com\/file\/[\w-]+$/.test(u));
  const url = /^https:\/\/shopee\.com\.my\//.test(str(imp.url)) ? str(imp.url) : '';
  el('imp').hidden = false;
  el('impUrl').textContent = url || '（没读到商品网址）';
  el('impCopy').hidden = !url;
  el('impCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('商品网址已复制'); } catch { toast('复制不了，请手动选中复制'); } };
  el('pickTip').textContent = imp.images.length ? `${imp.images.length} 张 · 前 ${Math.min(4, imp.images.length)} 张已选好，点一下取消或换（最多 4 张，按点的顺序排）` : '没读到照片，请自己上传';
  for (const u of imp.images.slice(0, 4)) photos.push(u); // the first 4 gallery photos, Shopee's main photo first; untick the ones you don't want
  el('pick').onclick = e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const u = b.dataset.pick, i = photos.indexOf(u);
    if (i >= 0) photos.splice(i, 1);
    else if (photos.length < 4) photos.push(u);
    else { toast('最多 4 张：先取消一张'); return; }
    renderPhotos();
  };
  setTimeout(() => el('link').focus(), 50);
  toast('已从 Shopee 读到资料，检查一下再加');
}

el('nf').onsubmit = async e => {
  e.preventDefault();
  const v = id => el(id).value.trim();
  const btn = el('save');
  btn.disabled = true; btn.textContent = photos.some(p => p.startsWith('https:')) ? '下载照片中…' : '添加中…';
  try {
    const body = { name: v('name'), price: v('price'), was: v('was'), rating: v('rating'), sales: v('sales'), link: v('link'), photos };
    const r = await api('/manual', body);
    if (r.duplicate && !(confirm(r.duplicate + '\n\n还是要加吗？') && await api('/manual', { ...body, force: true }))) { btn.disabled = false; btn.textContent = '加到待审核'; return; }
    toastNext('已加到待审核 · 海报生成中');
    location.href = '/';
  } catch (err) { btn.disabled = false; btn.textContent = '加到待审核'; toast(err.message); }
};
renderPhotos();
