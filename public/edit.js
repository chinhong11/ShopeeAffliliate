/* 编辑草稿 */
import { api, toast, toastNext } from '/static/app.js';
import { TPL, TPL_NOTE, TPL_LOCK, TPL_ORDER, LAYOUT, posterKey } from '/shared/mapping.js';
import { suggest, availability, cap1, cap2, isPersonal } from '/shared/pick.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const { d, cfg } = JSON.parse($('#data').textContent);
const f = JSON.parse(JSON.stringify(d.form));
const draft = () => ({ ...d, form: f });
let savedForm = JSON.stringify(d.form);
let savedKey = d.posterKey || posterKey({ ...d, form: d.form }, cfg);
let unlock = null, busy = false;
const direct = cfg.linkMode === 'direct';
const imgUrl = ref => '/img/' + encodeURIComponent(ref.replace(/^\w+:/, ''));
const UNLOCK_TXT = {
  t3: '照 Shopee 闪购页填真实的结束时间和已抢进度。',
  t4: '写你和朋友真实聊过的话，不要编。',
  t5: '在下面「买家真实评价」贴一条买家原话。',
  t8: () => `在「照片」加满 4 张（现在 ${f.photos.length} 张）。`
};

/* ---------- form markup ---------- */
$('#form').innerHTML = `
  <section class="sec">
    <div class="sec-h"><span class="ic">🎨</span><h2>模板</h2><span class="tip">自动选：${esc(TPL[f.autoTpl])}</span></div>
    <div class="tps" id="tps"></div>
    <div id="unlock"></div>
  </section>
  <section class="sec">
    <div class="sec-h"><span class="ic">✍️</span><h2>标题</h2></div>
    <div class="field"><label for="l1">主标题 <span class="soft">Enter 换行</span></label><textarea id="l1" rows="2" maxlength="60"></textarea></div>
    <div class="field"><label for="l2">副标题</label><input id="l2" type="text" maxlength="60"></div>
    <div class="field"><label>换一个 <span class="soft" id="hookNote"></span></label><div class="hooks" id="hooks"></div></div>
  </section>
  <section class="sec">
    <div class="sec-h"><span class="ic">📷</span><h2>照片</h2><span class="tip" id="phTip"></span></div>
    <div class="phs" id="phs"></div>
    <input id="file" type="file" accept="image/*" hidden>
    <div class="hint">第 1 张是 Shopee 商品图。加照片会自动换排版：2 张双图、3 张三图、4 张四宫格。</div>
  </section>
  <section class="sec">
    <div class="toggle-row"><label for="used">我用过这个 <span class="soft">打开后标题和文案可以写亲身体验</span></label><button class="toggle" id="used"></button></div>
  </section>
  <section class="sec">
    <div class="sec-h"><span class="ic">⭐</span><h2>买家真实评价</h2><span class="tip">填了才能用「真实好评」</span></div>
    <div class="field"><textarea id="rq" rows="2" maxlength="80" placeholder="从 Shopee 评价区复制一条买家原话" aria-label="买家真实评价"></textarea></div>
    <div class="field"><label for="ra">署名</label><input id="ra" type="text" maxlength="16" placeholder="— Shopee 买家"></div>
  </section>
  <section class="sec">
    <div class="sec-h"><span class="ic">💬</span><h2>Facebook 文案</h2><button class="btn btn-ghost btn-sm" id="rebuild" style="margin-left:auto" hidden>↻ 重新生成</button></div>
    <div class="field"><label for="c1">① 帖子</label><textarea id="c1" rows="8"></textarea></div>
    <div class="field"${direct ? ' hidden' : ''}><label for="c2">② 第一条评论 <span class="soft">发帖后自动发，带链接</span></label><textarea id="c2" rows="3"></textarea></div>
  </section>`;

const el = id => document.getElementById(id);
el('l1').value = f.l1; el('l2').value = f.l2; el('rq').value = f.review.quote; el('ra').value = f.review.author;
el('c1').value = f.cap1; el('c2').value = f.cap2;

/* ---------- renderers ---------- */
function renderTps() {
  const av = availability(f);
  el('tps').innerHTML = TPL_ORDER.map(k => {
    const lock = !av[k];
    return `<button class="tp${lock ? ' lock' : ''}" data-tpl="${k}" aria-pressed="${f.tpl === k}"><b>${lock ? '🔒 ' : ''}${TPL[k]}</b><span>${lock ? TPL_LOCK[k] : k === f.autoTpl ? '自动推荐' : TPL_NOTE[k]}</span></button>`;
  }).join('');
  const uh = $('#unlock .uh');
  if (uh && unlock) {
    const ok = av[unlock];
    uh.className = 'uh' + (ok ? ' ok' : '');
    uh.textContent = ok ? `可以用了 · 点上面的「${TPL[unlock]}」` : (typeof UNLOCK_TXT[unlock] === 'function' ? UNLOCK_TXT[unlock]() : UNLOCK_TXT[unlock]);
  }
}
function renderUnlock() {
  const box = el('unlock');
  if (!unlock) { box.innerHTML = ''; return; }
  let inner = '<div class="uh"></div>';
  if (unlock === 't3') inner += `<div class="u2">
      <div class="field"><label for="fe">结束时间</label><input type="time" id="fe" value="${esc(f.flash.end)}"></div>
      <div class="field"><label for="fp">已抢 %</label><input type="text" id="fp" inputmode="numeric" maxlength="2" placeholder="82" value="${esc(f.flash.pct)}"></div></div>`;
  if (unlock === 't4') inner += [['m1', '朋友问', '例：上次你说的那个还有货吗？'], ['m2', '你的回复（配产品照片）', '例：有！Shopee 现在 RM 19.90'], ['m3', '朋友反应', '例：快发我链接']]
    .map(([k, l, ph]) => `<div class="field"><label for="chat-${k}">${l}</label><input type="text" id="chat-${k}" data-chat="${k}" maxlength="40" placeholder="${esc(ph)}" value="${esc(f.chat[k])}"></div>`).join('');
  box.innerHTML = `<div class="unlock">${inner}</div>`;
  renderTps();
}
function renderHooks() {
  el('hookNote').textContent = '按商品数据' + (f.used ? ' · 含亲测款' : '');
  const list = suggest(d.p, f.used, cfg);
  el('hooks').innerHTML = list.map(([a, b], i) => `<button data-hook="${i}">${esc(a.replace(/\n/g, ' '))}</button>`).join('');
  el('hooks').onclick = e => { const b = e.target.closest('[data-hook]'); if (!b) return; const [a, s] = list[+b.dataset.hook]; f.l1 = a; f.l2 = s; el('l1').value = a; el('l2').value = s; changed(); };
}
function renderPhotos() {
  const n = f.photos.length;
  el('phTip').textContent = `${n} 张 · ${LAYOUT[n]}`;
  el('phs').innerHTML = [0, 1, 2, 3].map(i => {
    const ref = f.photos[i];
    if (ref) return `<div class="ph on" style="background-image:url('${imgUrl(ref)}')">${i === 0 ? '<span class="tag">Shopee</span>' : `<button class="x" data-rm="${i}" aria-label="移除这张">×</button>`}</div>`;
    if (i === n) return '<button class="ph add" id="addPh" aria-label="加照片">＋</button>';
    return '<div class="ph"></div>';
  }).join('');
}
function syncCaptions() {
  if (!f.cap1Manual) { f.cap1 = cap1(draft(), cfg); el('c1').value = f.cap1; }
  if (!f.cap2Manual) { f.cap2 = cap2(draft(), cfg); el('c2').value = f.cap2; }
  el('rebuild').hidden = !(f.cap1Manual || f.cap2Manual);
}
function setPoster(state, msg) {
  const box = $('.ed-pv .pvw'); if (!box) return;
  box.querySelectorAll('.pv-over').forEach(n => n.remove());
  if (state === 'busy') box.insertAdjacentHTML('beforeend', `<div class="pv-over"><i class="spin"></i><span>${box.classList.contains('raw') ? '生成海报中…' : '重新生成中…'}</span></div>`);
  if (state === 'err') box.insertAdjacentHTML('beforeend', `<div class="pv-over"><span>${esc(msg || '海报没生成出来')}</span></div>`);
  if (state === 'ok') { box.classList.remove('raw'); box.removeAttribute('data-pending'); box.querySelector('img').src = `/posters/${d.id}-v.jpg?k=${encodeURIComponent(savedKey)}`; }
}
function syncDirty() {
  const dirty = posterKey(draft(), cfg) !== savedKey;
  let badge = $('.ed-pv .pv-dirty');
  if (!badge) { $('.ed-pv .pvw').insertAdjacentHTML('beforeend', '<div class="pv-dirty" hidden>有改动 · 点下面「重新生成海报」</div>'); badge = $('.ed-pv .pv-dirty'); }
  badge.hidden = !dirty || busy;
  el('regen').classList.toggle('hot', dirty);
  el('regen').disabled = busy; el('approve').disabled = busy;
  el('regen').textContent = busy ? '生成中…' : '↻ 重新生成海报';
}
function changed() {
  if (!availability(f)[f.tpl]) f.tpl = f.autoTpl;
  syncCaptions(); renderTps(); syncDirty();
}

/* ---------- events ---------- */
el('tps').onclick = e => {
  const b = e.target.closest('[data-tpl]'); if (!b) return;
  const k = b.dataset.tpl;
  if (availability(f)[k]) { f.tpl = k; unlock = null; renderUnlock(); changed(); return; }
  unlock = k; renderUnlock();
  if (k === 't5') setTimeout(() => el('rq').focus(), 60);
};
el('unlock').oninput = e => {
  const t = e.target;
  if (t.id === 'fe') { f.flash.end = t.value; f.flash.endAt = 0; } // the server dates the new end time on save
  if (t.id === 'fp') { t.value = t.value.replace(/\D/g, ''); f.flash.pct = t.value; }
  if (t.dataset.chat) f.chat[t.dataset.chat] = t.value;
  changed();
};
el('l1').oninput = e => { f.l1 = e.target.value; changed(); };
el('l2').oninput = e => { f.l2 = e.target.value; changed(); };
el('rq').oninput = e => { f.review.quote = e.target.value; changed(); };
el('ra').oninput = e => { f.review.author = e.target.value; changed(); };
el('c1').oninput = e => { f.cap1 = e.target.value; f.cap1Manual = true; el('rebuild').hidden = false; };
el('c2').oninput = e => { f.cap2 = e.target.value; f.cap2Manual = true; el('rebuild').hidden = false; };
el('rebuild').onclick = () => { f.cap1Manual = f.cap2Manual = false; syncCaptions(); };
const usedBtn = el('used');
const syncUsed = () => usedBtn.setAttribute('aria-pressed', f.used ? 'true' : 'false');
usedBtn.onclick = () => {
  f.used = !f.used;
  /* first-person hooks only with 我用过: turning it off puts back a headline from the product data */
  if (!f.used && isPersonal(f.l1, cfg)) { [f.l1, f.l2] = suggest(d.p, false, cfg)[0]; el('l1').value = f.l1; el('l2').value = f.l2; }
  syncUsed(); renderHooks(); changed();
};

el('phs').onclick = e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { f.photos.splice(+rm.dataset.rm, 1); renderPhotos(); changed(); return; }
  if (e.target.closest('#addPh')) el('file').click();
};
el('file').onchange = async e => {
  const file = e.target.files && e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const url = await new Promise((res, rej) => {
      const im = new Image(); im.onerror = () => rej(new Error('读不了这张照片'));
      im.onload = () => {
        const s = Math.min(1, 1080 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.86));
      };
      im.src = URL.createObjectURL(file);
    });
    const r = await api(`/drafts/${d.id}/photo`, { dataUrl: url });
    f.photos = [...f.photos, r.ref].slice(0, 4); renderPhotos(); changed();
  } catch (err) { toast(err.message); }
};

async function save(render) {
  const snap = JSON.stringify(f); // what this request saves; edits made while it runs are saved by the next one
  const r = await api(`/drafts/${d.id}/save`, { form: JSON.parse(snap), render });
  savedForm = snap;
  if (render) { savedKey = r.posterKey; if (r.posterError) throw new Error(r.posterError); }
  return r;
}

/* ---------- autosave: edits are saved a moment after you make them, and when the page is left ---------- */
const unsaved = () => JSON.stringify(f) !== savedForm;
let saving = null, retryAt = 0, lastErr = '', leaveAnyway = false;
const savedNote = () => { const n = el('sv'); if (!n) return; n.textContent = '· 已保存'; clearTimeout(savedNote.t); savedNote.t = setTimeout(() => { n.textContent = ''; }, 2500); };
function autosave() {
  if (reloading) return Promise.resolve();
  if (saving) return saving;
  if (busy || !unsaved() || Date.now() < retryAt) return Promise.resolve();
  saving = save(false).then(() => { lastErr = ''; savedNote(); }, err => {
    retryAt = Date.now() + 10000;
    if (err.message !== lastErr) { lastErr = err.message; toast('没保存成功：' + err.message); }
    throw err;
  }).finally(() => { saving = null; });
  return saving;
}
setInterval(() => { autosave().catch(() => {}); }, 1500);
/* save, then go: a failed save shows why and keeps you here once; tapping again leaves anyway */
async function leave(href) {
  if (!leaveAnyway && unsaved()) {
    try { if (saving) await saving.catch(() => {}); if (unsaved()) { retryAt = 0; await autosave(); } }
    catch (err) { leaveAnyway = true; toast(`没保存成功：${err.message}。再点一次就离开（这次的改动不保存）`); return; }
  }
  location.href = href;
}
/* phone back gesture, closing the tab, switching apps: send what's left (keepalive survives the page) */
const flush = () => {
  if (reloading || !unsaved()) return;
  fetch(`/api/drafts/${d.id}/save`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify({ form: f, render: false, queue: true }) }).catch(() => {});
};
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
/* the top menu / tabs and any other link in the page */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || a.target === '_blank' || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault(); leave(a.href);
});
async function regenerate() {
  busy = true; syncDirty(); setPoster('busy');
  try { await save(true); setPoster('ok'); }
  catch (e) { setPoster('err', '海报没生成出来'); toast(e.message); }
  busy = false; syncDirty();
}
el('regen').onclick = regenerate;
/* the poster's 重试 (shared markup with the queue cards): re-render here instead of reloading the page,
   which would throw away unsaved edits */
document.addEventListener('rv:render', regenerate);
el('approve').onclick = async () => {
  busy = true; syncDirty();
  if (posterKey(draft(), cfg) !== savedKey) setPoster('busy');
  try {
    const snap = JSON.stringify(f);
    const r = await api(`/drafts/${d.id}/approve`, { form: JSON.parse(snap) });
    savedForm = snap; // approving saved the form: nothing left for the leave-page flush
    toastNext(r.again ? '已保存修改' : '已批准 · ' + (r.slot || '等空位') + ' 发布');
    location.href = '/';
  } catch (e) { busy = false; syncDirty(); setPoster('none'); toast(e.message); }
};
/* desktop: open the studio on this draft; its 保存到草稿 sends the changes back (public/studio-bridge.js) */
el('studio').onclick = async () => {
  const w = window.open('about:blank', '_blank'); // opened right away so the browser doesn't block it
  try { if (saving) await saving; if (unsaved()) await save(false); } catch (e) { toast(e.message); }
  if (w) w.location.href = `/studio/Shopee%20Post%20Maker%20v3.html?draft=${encodeURIComponent(d.id)}`;
  else toast('Studio 没打开（被浏览器拦截了？）');
};
/* the studio saved this draft: show what it made. This page has nothing unsaved by then (it saved when you
   switched tabs); anything typed in the last moment is dropped rather than written over the studio's changes. */
let reloading = false;
const reloadFromServer = () => { reloading = true; location.reload(); };
try { new BroadcastChannel('rv').onmessage = e => { if (e.data && e.data.type === 'studio-saved' && e.data.id === d.id) reloadFromServer(); }; } catch {}
/* no BroadcastChannel (older Safari): coming back to this tab, a newer studio save reloads it.
   Only newer: 清除 here leaves the server's older one until it's saved, and that's not a studio change */
const lookAt0 = (f.look && f.look.at) || 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || reloading) return;
  try { const r = await api(`/drafts/${d.id}/poster`); if ((r.lookAt || 0) > lookAt0) reloadFromServer(); } catch {}
});
el('lookClear').onclick = () => { f.look = null; el('lookNote').hidden = true; changed(); };

/* poster still rendering when the page opened: wait, then show the poster the server actually made */
async function waitPoster() {
  if (!$('.ed-pv .pvw[data-pending]')) return;
  busy = true; syncDirty();
  let r = null;
  for (;;) {
    await new Promise(res => setTimeout(res, 1500));
    try { r = await api(`/drafts/${d.id}/poster`); if (!r.busy) break; } catch {}
  }
  busy = false;
  if (r.posterError) setPoster('err', '海报没生成出来');
  else { if (r.posterKey) savedKey = r.posterKey; setPoster('ok'); }
  syncDirty();
}

syncUsed(); renderTps(); renderHooks(); renderPhotos(); syncCaptions(); syncDirty(); waitPoster();
