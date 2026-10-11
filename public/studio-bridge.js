/* 在 Studio 精修: the studio opened from 编辑 (…v3.html?draft=<id>) loads that draft, and 保存到草稿 sends back
   what you changed here (styles, headline, photo framing, carousel captions), so the posted poster looks like
   this one. Prices, rating, sold, the photos themselves and the brand badge stay the app's. */
const id = new URLSearchParams(location.search).get('draft');
const api = async (url, body) => {
  const r = await fetch('/api' + url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rv' }, body: JSON.stringify(body) });
  if (r.status === 401) throw new Error('请先在 App 里登录');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '出错了 (' + r.status + ')');
  return j;
};
const STYLE = ['c1', 'c2', 'ol', 'hl', 'hlc', 'font', 'size', 'align', 'scrim', 'bg', 'ctaText', 'cta', 'arrow', 'shopee', 'seal', 'proof'];
const TEXT = ['tpl', 'l1', 'l2'];
/* changed here but not taken back: the app's data and settings decide these */
const KEPT = {
  价格和数据: s => [s.price, s.now, s.was, s.pct, s.sealLabel, s.rate, s.sold, s.voucher, s.voucherCode, s.cd, s.stockTxt, s.stockPct],
  照片: s => [s.layout, ...[...s.photos, ...s.set.pages].map(p => (p.img ? `${p.iw}x${p.ih}:${typeof p.img === 'string' ? p.img.length : ''}` : ''))],
  标志: s => [s.badge, s.bstyle, s.bInit, s.bName, s.bTag, s.badgec],
  语言: s => [s.lang],
  群名: s => [s.chat.title, s.chat.sub],
  文案: s => { const c = s.cap; return [c.mode, c.name, c.link, c.price, c.code, c.tags, c.manual && c.out, c.manual2 && c.out2]; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const frame = p => (p ? { zoom: p.zoom, x: p.x, y: p.y } : null);

/* what changed between two studio states, in the shape POST /api/drafts/:id/studio takes */
function changes(a, b) {
  const ch = {};
  for (const k of [...STYLE, ...TEXT]) if (!same(a[k], b[k])) ch[k] = b[k];
  if (!same(a.review, b.review)) ch.review = { quote: b.review.quote, author: b.review.author };
  const chat = s => [s.chat.m1, s.chat.m2, s.chat.m3];
  if (!same(chat(a), chat(b))) ch.chat = { m1: b.chat.m1, m2: b.chat.m2, m3: b.chat.m3 };
  const fr = b.photos.map((p, i) => (same(frame(a.photos[i]), frame(p)) ? null : frame(p)));
  if (fr.some(Boolean)) ch.frames = fr;
  const pg = b.set.pages.map((p, i) => {
    const o = a.set.pages[i], c = {};
    if (o.cap !== p.cap) c.cap = p.cap;
    if (!same(frame(o), frame(p))) Object.assign(c, frame(p));
    return Object.keys(c).length ? c : null;
  });
  if (pg.some(Boolean)) ch.pages = pg;
  return ch;
}

const css = document.createElement('style');
css.textContent = `
.appbar>:not(.rvb){flex-shrink:0}
@media (max-width:1200px){.appbar .brandmark .wm{display:none}}
.rvb{display:flex;align-items:center;gap:10px;min-width:0;flex:0 1 auto}
.rvb-i{display:flex;flex-direction:column;justify-content:center;gap:2px;width:380px;min-width:0;flex:0 1 auto}
.rvb-t{font-size:13px;font-weight:700;color:var(--muted,#9b91a8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rvb-t b{color:var(--text,#f2eef6)}
.rvb-m{font-size:12px;line-height:1.3;font-weight:700;color:var(--muted,#9b91a8);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.rvb-m.ok{color:#3ddc84}
.rvb-m.err{color:#ff6b86}
.rvb button{height:38px;padding:0 14px;border-radius:10px;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.rvb-save{border:0;color:#fff;background:linear-gradient(135deg,var(--shopee-2,#ff6b3d),var(--shopee,#ee4d2d))}
.rvb-save:disabled{opacity:.55;cursor:default}
.rvb-back{border:1px solid var(--line-2,#43394f);background:transparent;color:var(--text,#f2eef6)}`;
document.head.appendChild(css);
const bar = document.createElement('div');
bar.className = 'rvb';
bar.innerHTML = '<div class="rvb-i"><span class="rvb-t">精修草稿</span><span class="rvb-m" role="status"></span></div><button class="rvb-save" disabled>保存到草稿</button><button class="rvb-back">回到 App</button>';
const appbar = document.querySelector('.appbar');
appbar.insertBefore(bar, document.getElementById('downloadBtn'));
const [info, saveBtn, backBtn] = bar.children, [title, msg] = info.children;
/* kind: '' a hint, 'ok' saved, 'err' a problem; the whole text shows on hover when it's cut to two lines */
const say = (t, kind = '') => { msg.textContent = msg.title = t; msg.className = 'rvb-m' + (kind ? ' ' + kind : ''); };

let loaded = null, saved = null; // the state as it came from the app / as last saved
async function boot() {
  for (let i = 0; i < 200 && !window.PostStudio; i++) await new Promise(r => setTimeout(r, 50));
  if (!window.PostStudio) throw new Error('Studio 没加载出来，刷新一下');
  const st = await api(`/drafts/${id}/studio-state`);
  await window.PostStudio.load(st, { persist: true });
  loaded = saved = window.PostStudio.getState();
  const name = (st.cap && st.cap.name) || id;
  title.innerHTML = '';
  title.append('精修「', Object.assign(document.createElement('b'), { textContent: name }), '」');
  title.title = '精修「' + name + '」';
  say('改好后点「保存到草稿」，App 会照这里重新生成海报 · 价格和照片以 App 为准');
  saveBtn.disabled = false;
}

saveBtn.onclick = async () => {
  const now = window.PostStudio.getState(), ch = changes(saved, now);
  if (!Object.keys(ch).length) { say('没有改动'); return; }
  saveBtn.disabled = true; say('保存中…正在按这里的样子生成海报');
  try {
    const r = await api(`/drafts/${id}/studio`, { changes: ch });
    saved = now;
    try { new BroadcastChannel('rv').postMessage({ type: 'studio-saved', id }); } catch {}
    if (r.posterError) { say(`改动已保存，但海报没生成出来（${r.posterError}）。回到 App 点「↻ 重新生成海报」再试`, 'err'); saveBtn.disabled = false; return; }
    const kept = Object.keys(KEPT).filter(k => !same(KEPT[k](loaded), KEPT[k](now)));
    /* the discount seal and the rating show only where the product has them: turned on here, they stay off */
    if (!kept.includes('价格和数据') && ['seal', 'proof'].some(k => now[k] && !r.shown[k])) kept.unshift('价格和数据');
    const notes = kept.length ? [`${kept.join('、')}以 App 为准，没有带回去`] : [];
    if (r.shown.tpl !== now.tpl) notes.push('模板没换成这个：要先在 App 里补上它需要的内容'); // locked until it has its real data
    say(['已保存 ✓ App 里的海报已经更新', ...notes].join('。'), 'ok');
  } catch (e) { say('没保存成功：' + e.message, 'err'); }
  saveBtn.disabled = false;
};
backBtn.onclick = () => {
  window.close(); // a tab the app opened closes; otherwise go back to the draft
  setTimeout(() => { location.href = '/d/' + encodeURIComponent(id); }, 200);
};
boot().catch(e => say('打不开这张草稿：' + e.message, 'err'));
