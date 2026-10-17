/* review app: shared behaviour (actions, toasts, collect progress, poster polling) */
const $ = (s, el = document) => el.querySelector(s);
export const api = async (url, body) => {
  const r = await fetch('/api' + url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify(body) });
  if (r.status === 401) { location.href = '/login'; throw new Error('请先登录'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '出错了 (' + r.status + ')');
  return j;
};

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
      if (pending.some(id => !s.rendering.includes(id))) return refresh();
    } catch {}
    watch();
  }, collecting ? 800 : 1500);
}
let collecting = !!$('#hsub.busy');

const ACT = {
  async approve(id, btn) {
    btn.disabled = true; btn.textContent = '批准中…';
    try {
      let r = await api(`/drafts/${id}/approve`, {});
      if (r.confirm) {
        if (!confirm(r.confirm)) { btn.disabled = false; btn.textContent = '批准'; return; }
        r = await api(`/drafts/${id}/approve`, { priceOk: true });
      }
      await refresh(); toast(r.again ? '已保存修改' : '已批准 · ' + (r.slot || '等空位') + ' 发布');
    }
    catch (e) { btn.disabled = false; btn.textContent = '批准'; toast(e.message); }
  },
  async skip(id) {
    await api(`/drafts/${id}/skip`, {}); await refresh();
    toast('已跳过', async () => { await api(`/drafts/${id}/unskip`, {}); await refresh(); });
  },
  async unapprove(id) { await api(`/drafts/${id}/unapprove`, {}); await refresh(); toast('已撤回，回到待审核'); },
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
  ACT[b.dataset.act](b.dataset.id, b).catch(err => toast(err.message));
});
watch();
