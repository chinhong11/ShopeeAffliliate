/* 贴士 / 梗图: ideas → edit with a live preview (the same HTML the server draws, /shared/content.js) → 生成海报 → 发布 */
import { api, toast } from '/static/app.js';
import { SIZE, cleanContent, contentHtml, missing } from '/shared/content.js';

const el = id => document.getElementById(id);
const { kind, lang: defLang, b: brand, items } = JSON.parse(el('data').textContent);
const TEXTS = kind === 'meme' ? ['top', 'e1', 'bottom', 'e2', 'caption'] : ['title', 'points', 'caption'];
let o = { lang: defLang }, id = null, made = false;

function render() {
  const c = cleanContent(kind, o, brand), box = el('pv'), fr = box.querySelector('iframe'), html = contentHtml(kind, c);
  fr.width = SIZE.w; fr.height = SIZE.h;
  if (fr.srcdoc !== html) fr.srcdoc = html;
  const k = box.clientWidth / SIZE.w;
  fr.style.transform = `scale(${k})`; box.style.height = SIZE.h * k + 'px';
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === c.lang)));
  if (kind === 'meme') {
    const photo = c.style === 'photo';
    document.querySelectorAll('[data-style]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === c.style)));
    el('photoField').hidden = !photo;
    for (const k of ['e1', 'e2']) el(k).closest('.field').hidden = photo;
    el('pickPhoto').textContent = c.photo ? '📷 换照片' : '📷 选照片';
  }
  el('accentHex').textContent = c.accent;
}
/* the poster shown must be the text that gets posted: any change hides it until 生成海报 again */
const stale = () => { if (made) { made = false; el('out').hidden = true; } };
function load(data, itemId = null, error = '') {
  const c = cleanContent(kind, data, brand);
  o = { ...c, points: (c.points || []).join('\n') }; id = itemId; stale();
  for (const k of TEXTS) el(k).value = o[k] || '';
  el('accent').value = c.accent;
  el('del').hidden = !id;
  el('err').hidden = !error; el('err').textContent = error;
  el('editor').hidden = false;
  render();
  el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
for (const k of TEXTS) el(k).oninput = e => { o[k] = e.target.value; stale(); render(); };
el('accent').oninput = e => { o.accent = e.target.value; stale(); render(); };
el('blank').onclick = () => load({ lang: o.lang, style: o.style });
/* photo meme: resized here (long side 2048), saved on the server, shown in the preview from /img/ */
if (kind === 'meme') {
  el('pickPhoto').onclick = () => el('photoIn').click();
  el('photoIn').onchange = async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const done = busy(el('pickPhoto'), '上传中…');
    try {
      const dataUrl = await new Promise((res, rej) => {
        const im = new Image(); im.onerror = () => rej(new Error('读不了这张照片'));
        im.onload = () => {
          const s = Math.min(1, 2048 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.86));
        };
        im.src = URL.createObjectURL(file);
      });
      o.photo = (await api('/content/photo', { dataUrl })).photo; stale();
    } catch (err) { toast(err.message); }
    done(); render();
  };
}
document.addEventListener('click', e => {
  const l = e.target.closest('[data-lang]');
  if (l) { o.lang = l.dataset.lang; stale(); render(); }
  const st = e.target.closest('[data-style]');
  if (st) { o.style = st.dataset.style; stale(); render(); }
  const op = e.target.closest('[data-open]');
  if (op) { const c = items.find(x => String(x.id) === op.dataset.open); if (c) load(c.data, c.id, c.error); }
});

/* ✨ 4 ideas in the chosen language; 用这个 puts one in the editor */
const list = el('ideaList');
if (el('ideas')) el('ideas').onclick = async () => {
  const btn = el('ideas'), label = btn.textContent;
  btn.disabled = true; btn.textContent = '想点子中…';
  try {
    const { ideas } = await api('/content/ideas', { kind, lang: o.lang });
    list.innerHTML = '';
    ideas.forEach(c => {
      const card = document.createElement('div'); card.className = 'ct-idea';
      const b = document.createElement('b'), p = document.createElement('div'), use = document.createElement('button');
      b.textContent = kind === 'meme' ? `${c.e1} ${c.top}` : c.title;
      p.textContent = kind === 'meme' ? `${c.e2} ${c.bottom}` : c.points.join(' · ');
      use.type = 'button'; use.className = 'btn btn-ghost btn-sm'; use.textContent = '用这个';
      use.onclick = () => load(c);
      card.append(b, p, use); list.append(card);
    });
  } catch (err) { toast(err.message); }
  btn.disabled = false; btn.textContent = label;
};

const save = async () => {
  const data = { ...o, points: String(o.points || '').split('\n') };
  const { item } = await api(id ? `/content/${id}` : '/content', id ? { data } : { kind, data });
  id = item.id; el('del').hidden = false;
};
const busy = (b, text) => { const label = b.textContent; b.disabled = true; b.textContent = text; return () => { b.disabled = false; b.textContent = label; }; };

el('make').onclick = async () => {
  const why = missing(kind, cleanContent(kind, o, brand));
  if (why) return toast(why);
  const done = busy(el('make'), '生成中…'), img = el('outImg');
  try {
    await save();
    const url = `/content/${id}.png?t=${Date.now()}`;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('海报没生成出来，再试一次')); img.src = url; });
    el('outDl').href = url;
    el('out').hidden = false; made = true;
    el('out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) { toast(err.message); }
  done();
};
el('post').onclick = async () => {
  if (!made || !confirm('现在发到 Facebook 专页？')) return;
  const done = busy(el('post'), '发布中…');
  try {
    await api(`/content/${id}/post`, {});
    toast('已发布 ✅');
    setTimeout(() => location.reload(), 900);
  } catch (err) { el('err').textContent = err.message; el('err').hidden = false; toast(err.message); done(); }
};
el('del').onclick = async () => {
  if (!id || !confirm('删除这个草稿？')) return;
  try { await api(`/content/${id}/delete`, {}); location.reload(); } catch (err) { toast(err.message); }
};
addEventListener('resize', render);
render();
