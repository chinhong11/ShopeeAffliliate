/* ＋ 手动添加: photos resized in the browser (same as the edit page), then one POST makes the draft */
import { api, toast, toastNext } from './app.js';

const el = id => document.getElementById(id);
const photos = []; // data:image/jpeg URLs, first = main photo

const resize = file => new Promise((res, rej) => {
  const im = new Image(); im.onerror = () => rej(new Error('读不了这张照片'));
  im.onload = () => {
    const s = Math.min(1, 1080 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.86));
  };
  im.src = URL.createObjectURL(file);
});

function renderPhotos() {
  el('phTip').textContent = `${photos.length} / 4`;
  el('phs').innerHTML = [0, 1, 2, 3].map(i => {
    if (photos[i]) return `<div class="ph on" style="background-image:url('${photos[i]}')">${i === 0 ? '<span class="tag">主图</span>' : ''}<button type="button" class="x" data-rm="${i}" aria-label="移除这张">×</button></div>`;
    if (i === photos.length) return '<button type="button" class="ph add" id="addPh" aria-label="加照片">＋</button>';
    return '<div class="ph"></div>';
  }).join('');
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

el('nf').onsubmit = async e => {
  e.preventDefault();
  const v = id => el(id).value.trim();
  const btn = el('save');
  btn.disabled = true; btn.textContent = '添加中…';
  try {
    await api('/manual', { name: v('name'), price: v('price'), was: v('was'), rating: v('rating'), sales: v('sales'), link: v('link'), photos });
    toastNext('已加到待审核 · 海报生成中');
    location.href = '/';
  } catch (err) { btn.disabled = false; btn.textContent = '加到待审核'; toast(err.message); }
};
renderPhotos();
