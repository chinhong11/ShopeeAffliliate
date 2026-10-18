/* review app: shared behaviour (actions, toasts, collect progress, poster polling) */
const $ = (s, el = document) => el.querySelector(s);
export const api = async (url, body) => {
  const r = await fetch('/api' + url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify(body) });
  if (r.status === 401) { location.href = '/login'; throw new Error('请先登录'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '出错了 (' + r.status + ')');
  return j;
};

/* photo tiles with data-src: a photo under 800 px on its short side gets a badge (posters are 2160 px; the poster
   frames such a photo instead of stretching it, but a bigger photo is still sharper) */
export const SMALL_PX = 800;
export function flagSmall(root = document) {
  for (const el of root.querySelectorAll('[data-src]')) {
    if (el.dataset.sized === el.dataset.src) continue;
    el.dataset.sized = el.dataset.src;
    const im = new Image();
    im.onload = () => {
      const w = im.naturalWidth, h = im.naturalHeight;
      if (Math.min(w, h) < SMALL_PX && !el.querySelector('.lowres')) el.insertAdjacentHTML('beforeend', `<span class="lowres" title="这张照片只有 ${w}×${h}，海报会有点糊；有更大的照片就换一张">${Math.min(w, h)}px 会糊</span>`);
    };
    im.src = el.dataset.src;
  }
}

/* layout class follows the window (phone < 900px ≤ desktop) */
const rv = $('#rv');
const fit = () => { const desk = innerWidth >= 900; rv.classList.toggle('desk', desk); rv.classList.toggle('phone', !desk); };
addEventListener('resize', fit);

/* toast with optional 撤销; survives a soft refresh */
let toastT = 0;
export function toast(msg, undo) {
  clearTimeout(toastT);
  const slot = $('#toast-slot');
  slot.innerHTML = `<div class="toast"><span></span>${undo ? '<button>撤销</button>' : ''}</div>`;
  slot.querySelector('span').textContent = msg;
  const close = () => { clearTimeout(toastT); slot.innerHTML = ''; };
  slot.querySelector('.toast').onclick = e => { if (!e.target.closest('button')) close(); }; // tap to close
  if (undo) slot.querySelector('button').onclick = () => { close(); undo(); };
  /* long enough to read (about 5 characters a second): at least 3 s, 8 s when it can be undone, at most 12 s */
  toastT = setTimeout(close, Math.min(12000, Math.max(undo ? 8000 : 3000, 1500 + String(msg).length * 200)));
}
try { const t = sessionStorage.getItem('rvToast'); if (t) { sessionStorage.removeItem('rvToast'); toast(t); } } catch {}
export const toastNext = msg => { try { sessionStorage.setItem('rvToast', msg); } catch {} };

/* re-fetch this page and swap the main area + tab badges, keeping the scroll position */
export async function refresh() {
  const sc = $('#scroll'), top = sc ? sc.scrollTop : 0;
  const html = await (await fetch(location.href, { headers: { Accept: 'text/html' } })).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('#main');
  if (!main) { location.reload(); return; }
  const open = [...document.querySelectorAll('details[open][id]')].map(n => n.id); // keep 已跳过 open across refreshes
  $('#main').replaceWith(main);
  for (const id of open) { const n = document.getElementById(id); if (n) n.open = true; }
  document.querySelectorAll('.tabs, .topnav nav').forEach((n, i) => { const m = doc.querySelectorAll('.tabs, .topnav nav')[i]; if (m) n.innerHTML = m.innerHTML; });
  const ns = $('#scroll'); if (ns) ns.scrollTop = top;
  watch();
}

/* poll while posters render or a collect runs */
let pollT = 0;
let approving = 0; // approvals on their way
function watch() {
  clearTimeout(pollT);
  if ($('#ed')) return; // the edit screen polls for itself (a refresh would drop unsaved edits)
  const pending = [...document.querySelectorAll('[data-pending]')].map(el => el.dataset.poster);
  const busy = $('#hsub.busy');
  if (!pending.length && !busy && !collecting) return;
  pollT = setTimeout(async () => {
    try {
      const s = await api('/status');
      const h = $('#hsub');
      if (collecting) {
        if (s.collecting) { if (h) { h.textContent = s.collecting; h.classList.add('busy'); } }
        else {
          collecting = false;
          const r = s.collectResult;
          await refresh();
          if (r && !r.ok) toast('抓取失败：' + r.error);
          else if (r) toast(r.created ? `抓到 ${r.created} 个新品 · 其余的发过了或不达标` : '没有新的 · 其余的发过了或不达标');
          return;
        }
      }
      if (pending.some(id => !s.rendering.includes(id))) return approving ? watch() : refresh(); // a refresh would bring back an enabled 批准 mid-approval
    } catch {}
    watch();
  }, collecting ? 800 : 1500);
}
let collecting = !!$('#hsub.busy');

const ACT = {
  async approve(id, btn) {
    btn.disabled = true; btn.textContent = '批准中…'; approving++;
    try {
      let r = await api(`/drafts/${id}/approve`, {});
      if (r.confirm) {
        if (!confirm(r.confirm)) { btn.disabled = false; btn.textContent = '批准'; return; }
        r = await api(`/drafts/${id}/approve`, { priceOk: true });
      }
      await refresh(); toast(r.again ? '已保存修改' : '已批准 · ' + (r.slot || '等空位') + ' 发布');
    }
    catch (e) { btn.disabled = false; btn.textContent = '批准'; toast(e.message); }
    finally { approving--; }
  },
  async skip(id) {
    await api(`/drafts/${id}/skip`, {}); await refresh();
    toast('已跳过', async () => { await api(`/drafts/${id}/unskip`, {}); await refresh(); });
  },
  async unapprove(id) { await api(`/drafts/${id}/unapprove`, {}); await refresh(); toast('已撤回，回到待审核'); },
  async remove(id) {
    if (!confirm('删除这张草稿？删除后不能恢复。')) return;
    await api(`/drafts/${id}/remove`, {}); await refresh(); toast('已删除');
  },
  async unskip(id) { await api(`/drafts/${id}/unskip`, {}); await refresh(); toast('已恢复，回到待审核'); },
  async render(id) {
    if ($('#ed')) { document.dispatchEvent(new CustomEvent('rv:render', { detail: id })); return; } // edit screen re-renders itself
    api(`/drafts/${id}/render`, {}).catch(e => toast(e.message)); setTimeout(refresh, 300);
  },
  async collect() {
    const r = await api('/collect', {});
    collecting = true;
    const h = $('#hsub'); if (h) { h.textContent = '抓取中…'; h.classList.add('busy'); }
    document.querySelectorAll('[data-act=collect]').forEach(b => b.disabled = true);
    if (!r.started) toast('已经在抓取了');
    watch();
  },
  async delpost(id, btn) {
    if (!confirm('从 Facebook 专页删除这个帖子（连同评论区的链接）？删除后不能恢复。')) return;
    btn.disabled = true; btn.textContent = '删除中…';
    try { await api(`/posts/${id}/delete`, {}); await refresh(); toast('已从 Facebook 删除'); }
    catch (e) { btn.disabled = false; btn.textContent = '删除'; toast(e.message); }
  },
  async gmodel(id, btn) {
    btn.disabled = true;
    try { const r = await api('/gemini/model', { id }); await refresh(); toast('现在用 ' + r.model); }
    catch (e) { btn.disabled = false; toast(e.message); }
  },
  async token(_, btn) {
    btn.disabled = true;
    const wasPaused = !!$('.alert');
    try { const r = await api('/token', {}); await refresh(); toast(r.ok ? (wasPaused ? 'Token 正常 · 已恢复发布' : 'Facebook 正常') : (r.error || 'Token 还是不行')); }
    catch (e) { btn.disabled = false; toast(e.message); }
  },
  async retry(id, btn) {
    btn.disabled = true; btn.textContent = '重试中…';
    try { await api(`/posts/${id}/retry`, {}); await refresh(); toast('已发布到 Facebook 专页'); }
    catch (e) { await refresh(); toast(e.message); }
  }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !ACT[b.dataset.act]) return;
  e.preventDefault(); e.stopPropagation();
  ACT[b.dataset.act](b.dataset.id, b).catch(err => { toast(err.message); refresh(); }); // the card may be stale: show it as it is now
});
/* 数据 → Gemini limits: a changed box saves that model's three numbers */
document.addEventListener('change', async e => {
  const i = e.target.closest('[data-limit]'); if (!i) return;
  const body = { id: i.dataset.model };
  for (const x of document.querySelectorAll(`[data-model="${CSS.escape(i.dataset.model)}"]`)) body[x.dataset.limit] = x.value.trim();
  try { await api('/gemini/limits', body); toast('已记下 ' + i.dataset.model + ' 的限额'); } catch (err) { toast(err.message); }
});
watch();
