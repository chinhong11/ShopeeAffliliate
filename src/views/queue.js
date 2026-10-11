/* 待审核 (home) */
import { esc, page } from './html.js';
import { STRATS, TPL, rm, fmtSold, shortName, commOf, rateOf } from '../mapping.js';
import { fmtTime } from '../slots.js';

export const zhDate = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`; };

/* poster block: rendered thumb, or the Shopee photo dimmed with a spinner / error */
export function posterBlock(d, st, { dirty = false, big = false } = {}) {
  const has = st.hasPoster, busy = st.busy, err = !busy && d.posterError;
  const src = has ? `/posters/${d.id}.${big ? 'png' : 'jpg'}?k=${encodeURIComponent(d.posterKey || '')}` : `/img/${encodeURIComponent(d.p.img)}`;
  return `<div class="pvw${has ? '' : ' raw'}" data-poster="${d.id}"${busy ? ' data-pending="1"' : ''}>
    <img src="${src}" alt="" loading="lazy">
    ${busy ? `<div class="pv-over"><i class="spin"></i><span>${has ? '重新生成中…' : '生成海报中…'}</span></div>` : ''}
    ${err ? `<div class="pv-over"><span>海报没生成出来</span><button class="btn btn-ghost btn-sm" data-act="render" data-id="${d.id}">重试</button></div>` : ''}
    ${!busy ? `<div class="pv-dirty"${dirty ? '' : ' hidden'}>有改动 · 点下面「重新生成海报」</div>` : ''}
  </div>`;
}

export const priceRow = p => `<div class="pr"><span class="now">${rm(p.price)}</span>${p.disc >= 10 ? `<span class="pct">-${Math.round(p.disc)}%</span>` : ''}<span class="rt">${rateOf(p) ? `<b>★${rateOf(p)}</b> · ` : ''}${fmtSold(p.sales)}</span></div>`;
export const priceWarn = (pc, tail) => pc ? `<div class="warn"><b>价格变了</b> ${esc(pc.from)} → ${esc(pc.to)}${pc.fromPct !== pc.toPct ? `（${esc(pc.fromPct || '—')} → ${esc(pc.toPct || '—')}）` : ''}。${tail}</div>` : '';

function card(d, st) {
  const p = d.p;
  return `<article class="card" data-id="${d.id}">
    <a class="pv" href="/d/${d.id}">${posterBlock(d, st)}
      <div class="chips"><span class="chip ${d.strat}">${STRATS[d.strat].zh}</span>${d.isNew ? '<span class="chip new">新</span>' : ''}${p.mock ? '<span class="chip new">MOCK</span>' : ''}</div>
    </a>
    <div class="bd">
      ${priceWarn(d.priceChanged, '海报已按新价格更新，确认后再批准。')}
      <h3 class="nm">${esc(p.name)}</h3>
      ${priceRow(p)}
      <div class="cm"><b>${commOf(p)}</b> · ${TPL[d.form.tpl]}</div>
      <div class="act">
        <button class="btn btn-ghost" data-act="skip" data-id="${d.id}">跳过</button>
        <a class="btn btn-ghost" href="/d/${d.id}">编辑</a>
        <button class="btn btn-primary" data-act="approve" data-id="${d.id}">批准</button>
      </div>
    </div>
  </article>`;
}

/* posted: { name, at } of the slot's post (it can go out up to 2 h after the planned minute) */
function slotCard(s, entry, paused, posted) {
  let cls, sub, name, href = '';
  if (s.status === 'used') { cls = 'filled'; sub = posted ? fmtTime(posted.at) + ' 已发' : '已发'; name = posted ? shortName(posted.name) : '已发布'; }
  else if (s.status === 'returned') { cls = 'empty'; sub = '退回'; name = '查价变了，没有发'; }
  else if (s.status === 'failed') { cls = 'paused'; sub = '失败'; name = '发帖失败，看「已发布」'; }
  else if (s.status === 'skipped' || s.status === 'past') { cls = 'empty'; sub = '已过'; name = '没有批准的，这个时段跳过'; }
  else if (paused) { cls = 'paused'; sub = '暂停'; name = entry ? shortName(entry.d.p.name) : '发布已暂停'; }
  else if (entry) { cls = 'filled'; sub = '约 ' + (s.plannedAt ? fmtTime(s.plannedAt) : s.label) + ' 发'; name = shortName(entry.d.p.name); href = `/d/${entry.d.id}`; }
  else { cls = 'empty'; sub = '今天'; name = '空，批准一张就排进来'; }
  const dot = cls === 'filled' || (paused && entry);
  const inner = `<div class="st"><b>${esc(s.label)}</b><span>${esc(sub)}</span></div><div class="sn">${dot ? '<i></i>' : ''}<span>${esc(name)}</span></div>`;
  return href ? `<a class="slot ${cls}" role="button" href="${href}">${inner}</a>` : `<div class="slot ${cls}">${inner}</div>`;
}

export function queueView({ brand, pending, approved, today, paused, collecting, lastCollect, collectError, posterState, posted }) {
  const failed = !collecting && collectError && (!lastCollect || collectError.at > lastCollect.at);
  const sub = collecting || (failed
    ? `${zhDate(collectError.at)} · ${fmtTime(collectError.at)} 抓取失败：${collectError.error}`
    : lastCollect
      ? `${zhDate(lastCollect.at)} · ${fmtTime(lastCollect.at)} 抓了 ${lastCollect.created} 个新品`
      : `${zhDate(Date.now())} · 还没抓取`);
  const todayEntries = approved.filter(x => x.slot && x.slot.k === 0);
  const body = `
    <header class="rv-head">
      <div class="grow">
        <h1>待审核${pending.length ? `<span class="cnt">${pending.length}</span>` : ''}</h1>
        <div class="hsub${collecting ? ' busy' : failed ? ' err' : ''}" id="hsub">${esc(sub)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-act="collect"${collecting ? ' disabled' : ''}>↻ 抓取</button>
    </header>
    <div class="rv-scroll" id="scroll">
      ${paused ? `<div class="alert"><div class="at"><b>发布已暂停</b><p>${esc(paused.message)}</p></div><button class="btn btn-sm" data-act="token">重试</button></div>` : ''}
      <div class="slots">${today.map(s => slotCard(s, todayEntries.find(x => x.slot.label === s.label), paused, posted[s.draftId])).join('')}</div>
      ${pending.length
        ? `<div class="list">${pending.map(d => card(d, posterState(d))).join('')}</div>`
        : `<div class="empty"><b>今天的都处理完了</b><p>明天 08:00 自动抓新品，也可以现在抓一次。</p><button class="btn btn-ghost btn-sm" data-act="collect"${collecting ? ' disabled' : ''}>↻ 现在抓取</button></div>`}
      ${approved.length ? `<div class="lbl">已批准 · 排队中 · ${approved.length}</div>
      <div class="qlist">${approved.map(({ d, slot }) => `<div class="qrow">
        <img src="${posterState(d).hasPoster ? `/posters/${d.id}.jpg?k=${encodeURIComponent(d.posterKey)}` : `/img/${encodeURIComponent(d.p.img)}`}" alt="">
        <a class="qt" href="/d/${d.id}"><b>${esc(shortName(d.p.name))}</b><span>✓ ${slot ? esc(slot.text) + ' 发布' : '等空位'}</span></a>
        <button class="btn btn-ghost btn-sm" data-act="unapprove" data-id="${d.id}">撤回</button>
      </div>`).join('')}</div>` : ''}
      <div class="endpad"></div>
    </div>`;
  return page({ title: '待审核', brand, body, tab: 'queue', count: pending.length });
}
