/* 待审核 (home) */
import { esc, page, GUIDE } from './html.js';
import { STRATS, TPL, rm, fmtSold, shortName, commOf, rateOf } from '../mapping.js';
import { fmtTime, toMin } from '../slots.js';
import { dayStr } from '../db.js';

export const zhDate = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`; };

/* poster block: rendered thumb, or the Shopee photo dimmed with a spinner / error */
export function posterBlock(d, st, { dirty = false, big = false } = {}) {
  const has = st.hasPoster, busy = st.busy, err = !busy && d.posterError;
  /* the edit page shows the 1080px JPEG (the PNG only for posters made before it existed) */
  const file = !big ? `${d.id}.jpg` : st.hasView ? `${d.id}-v.jpg` : `${d.id}.png`;
  const src = has ? `/posters/${file}?k=${encodeURIComponent(d.posterKey || '')}` : `/img/${encodeURIComponent(d.p.img)}`;
  return `<div class="pvw${has ? '' : ' raw'}" data-poster="${d.id}"${busy ? ' data-pending="1"' : ''}>
    <img src="${src}" alt="" loading="lazy">
    ${busy ? `<div class="pv-over"><i class="spin"></i><span>${has ? '重新生成中…' : '生成海报中…'}</span></div>` : ''}
    ${err ? `<div class="pv-over"><span>海报没生成出来</span><button class="btn btn-ghost btn-sm" data-act="render" data-id="${d.id}">重试</button></div>` : ''}
    ${!busy ? `<div class="pv-dirty"${dirty ? '' : ' hidden'}>有改动 · 点下面「重新生成海报」</div>` : ''}
  </div>`;
}

export const priceRow = p => `<div class="pr"><span class="now">${rm(p.price)}</span>${p.disc >= 10 ? `<span class="pct">-${Math.round(p.disc)}%</span>` : ''}<span class="rt">${rateOf(p) ? `<b>★${rateOf(p)}</b> · ` : ''}${fmtSold(p.sales)}</span></div>`;
export const priceWarn = (pc, tail) => pc ? `<div class="warn"><b>价格变了</b> ${esc(pc.from)} → ${esc(pc.to)}${pc.fromPct !== pc.toPct ? `（${esc(pc.fromPct || '—')} → ${esc(pc.toPct || '—')}）` : ''}。${tail}</div>` : '';

/* drafts can be approved for 3 days; the last day says so */
function expiry(d, expireMs, now) {
  const at = d.pendingSince + expireMs;
  if (!expireMs || at - now > 86400e3) return '';
  return `<div class="exp">⏳ ${dayStr(at) === dayStr(now) ? '今天' : '明天'} ${fmtTime(at)} 过期，过了就不能批准</div>`;
}

function card(d, st, expireMs, now) {
  const p = d.p;
  return `<article class="card" data-id="${d.id}">
    <a class="pv" href="/d/${d.id}">${posterBlock(d, st)}
      <div class="chips"><span class="chip ${d.strat}">${STRATS[d.strat].zh}</span>${d.isNew ? '<span class="chip new">新</span>' : ''}${p.mock ? '<span class="chip new">MOCK</span>' : ''}</div>
    </a>
    <div class="bd">
      ${priceWarn(d.priceChanged, '海报已按新价格更新，确认后再批准。')}
      ${expiry(d, expireMs, now)}
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

/* the publishing pause banner: plain reason, Facebook's own words apart, and the guide section that fixes it */
const pauseBanner = p => `<div class="alert"><div class="at"><b>发布已暂停</b><p>${esc(p.message)}</p>${p.detail ? `<p class="fbw">Facebook 原话：${esc(p.detail)}</p>` : ''}
  <a class="help" href="${GUIDE}#${p.code === 190 ? 'if-the-facebook-token-stops-working' : 'if-posting-is-paused-for-another-reason'}" target="_blank" rel="noopener">${p.code === 190 ? '怎么重新生成 token' : '怎么处理'} ↗</a></div><button class="btn btn-sm" data-act="token">重试</button></div>`;

/* the last Facebook token check (daily, at start, and 现在检查); a failed one shows as the pause banner instead */
function fbStatus(tc, now) {
  if (!tc) return '';
  const when = (dayStr(tc.at) === dayStr(now) ? '今天 ' : zhDate(tc.at) + ' ') + fmtTime(tc.at);
  const txt = tc.ok ? `✓ Facebook 正常 · ${when} 检查过` : tc.transient ? `⚠ ${when} 暂时连不上 Facebook，稍后会自动再查` : '';
  return txt ? `<div class="fbst${tc.ok ? '' : ' warn'}"><span>${esc(txt)}</span><button class="btn btn-ghost btn-sm" data-act="token">现在检查</button></div>` : '';
}

/* empty queue: "all done" only when today's collect has run; the time follows config.collectAt */
const ADD = '<a class="btn btn-ghost btn-sm" href="/new">＋ 手动添加</a>';
function emptyBox(lastCollect, collecting, collectAt = '08:00', now = Date.now(), hasApi = true) {
  if (!hasApi) return `<div class="empty"><b>还没有草稿</b><p>还没设置 Shopee API：从 Shopee 下载商品图，手动加进来。</p>${ADD}</div>`;
  const t = new Date(now), next = (t.getHours() * 60 + t.getMinutes() < toMin(collectAt) ? '今天 ' : '明天 ') + collectAt;
  const done = lastCollect && dayStr(lastCollect.at) === dayStr(now);
  const [h, p] = collecting ? ['正在抓新品…', '抓到的草稿会出现在这里。'] : done ? ['今天的都处理完了', `${next} 自动抓新品，也可以现在再抓一次。`] : ['还没有新草稿', `${next} 自动抓新品，也可以现在抓一次。`];
  return `<div class="empty"><b>${h}</b><p>${p}</p><button class="btn btn-ghost btn-sm" data-act="collect"${collecting ? ' disabled' : ''}>↻ 现在抓取</button>${ADD}</div>`;
}

export function queueView({ brand, pending, approved, today, paused, collecting, lastCollect, collectError, posterState, posted, skipped = [], hasThumb = () => false, collectAt, expireMs = 0, hasApi = true, tokenCheck = null }) {
  const now = Date.now();
  const failed = !collecting && collectError && (!lastCollect || collectError.at > lastCollect.at);
  const sub = collecting || (failed
    ? `${zhDate(collectError.at)} · ${fmtTime(collectError.at)} 抓取失败：${collectError.error}`
    : lastCollect
      ? `${zhDate(lastCollect.at)} · ${fmtTime(lastCollect.at)} 抓了 ${lastCollect.created} 个新品`
      : hasApi ? `${zhDate(Date.now())} · 还没抓取` : `${zhDate(Date.now())} · 手动模式（还没设置 Shopee API）`);
  const todayEntries = approved.filter(x => x.slot && x.slot.k === 0);
  const body = `
    <header class="rv-head">
      <div class="grow">
        <h1>待审核${pending.length ? `<span class="cnt">${pending.length}</span>` : ''}</h1>
        <div class="hsub${collecting ? ' busy' : failed ? ' err' : ''}" id="hsub">${esc(sub)}</div>
      </div>
      ${ADD}
      ${hasApi ? `<button class="btn btn-ghost btn-sm" data-act="collect"${collecting ? ' disabled' : ''}>↻ 抓取</button>` : ''}
    </header>
    <div class="rv-scroll" id="scroll">
      ${paused ? pauseBanner(paused) : fbStatus(tokenCheck, now)}
      <div class="slots">${today.map(s => slotCard(s, todayEntries.find(x => x.slot.label === s.label), paused, posted[s.draftId])).join('')}</div>
      ${pending.length
        ? `<div class="list">${pending.map(d => card(d, posterState(d), expireMs, now)).join('')}</div>`
        : emptyBox(lastCollect, collecting, collectAt, now, hasApi)}
      ${approved.length ? `<div class="lbl">已批准 · 排队中 · ${approved.length}</div>
      <div class="qlist">${approved.map(({ d, slot }) => `<div class="qrow">
        <img src="${posterState(d).hasPoster ? `/posters/${d.id}.jpg?k=${encodeURIComponent(d.posterKey)}` : `/img/${encodeURIComponent(d.p.img)}`}" alt="">
        <a class="qt" href="/d/${d.id}"><b>${esc(shortName(d.p.name))}</b><span>✓ ${slot ? esc(slot.text) + ' 发布' : '等空位'}</span></a>
        <button class="btn btn-ghost btn-sm" data-act="unapprove" data-id="${d.id}">撤回</button>
      </div>`).join('')}</div>` : ''}
      ${skipped.length ? `<details class="skp" id="skipped"><summary class="lbl">已跳过 · ${skipped.length} <span class="soft">点开可以恢复或删除</span></summary>
      <div class="qlist">${skipped.map(d => `<div class="qrow">
        <img src="${hasThumb(d) ? `/posters/${d.id}.jpg?k=${encodeURIComponent(d.posterKey || '')}` : `/img/${encodeURIComponent(d.p.img)}`}" alt="">
        <div class="qt"><b>${esc(shortName(d.p.name))}</b><span class="dim">${dayStr(d.updatedAt) === dayStr(now) ? '今天' : zhDate(d.updatedAt)} ${fmtTime(d.updatedAt)} 跳过</span></div>
        <button class="btn btn-ghost btn-sm" data-act="unskip" data-id="${d.id}">恢复</button>
        <button class="btn btn-ghost btn-sm del" data-act="remove" data-id="${d.id}" aria-label="删除这张草稿">删除</button>
      </div>`).join('')}</div></details>` : ''}
      <div class="endpad"></div>
    </div>`;
  return page({ title: '待审核', brand, body, tab: 'queue', count: pending.length });
}
