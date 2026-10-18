/* 已发布: posted / failed / returned, grouped by day */
import { esc, page } from './html.js';
import { STRATS, TPL, shortName } from '../mapping.js';
import { fmtTime } from '../slots.js';
import { dayStr } from '../db.js';

const ST = { posted: '已发布', failed: '失败', returned: '退回' };
const dayLabel = t => {
  const d = new Date(t), md = `${d.getMonth() + 1}月${d.getDate()}日`, k = dayStr(t), now = Date.now();
  if (k === dayStr(now)) return '今天 · ' + md;
  if (k === dayStr(now - 86400e3)) return '昨天 · ' + md;
  return md;
};

export function logView({ brand, rows, count, imgOf }) {
  const groups = [];
  for (const r of rows) {
    const label = dayLabel(r.at);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push(g = { label, items: [] });
    g.items.push(r);
  }
  const item = r => {
    const sub = r.sub_ids ? JSON.parse(r.sub_ids).join('·') : '';
    return `<div class="lg ${r.kind}">
      <img src="${esc(imgOf(r))}" alt="">
      <div class="lt">
        <div class="l1"><span class="st ${r.kind}">${ST[r.kind]}</span><b>${fmtTime(r.at)}</b>${r.tpl ? `<span class="mt">${TPL[r.tpl] || r.tpl} · ${(STRATS[r.strategy] || {}).zh || ''}</span>` : ''}</div>
        <div class="nm">${esc(shortName(r.name))}</div>
        ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ''}
        ${sub ? `<code>${esc(sub)}</code>` : ''}
      </div>
      <div class="la">
        ${r.kind === 'posted' && r.permalink ? `<a href="${esc(r.permalink)}" target="_blank" rel="noopener">查看 ↗</a><a class="boost" href="${esc(r.permalink)}" target="_blank" rel="noopener" title="打开帖子后，点帖子下面的「加速推广 / Boost post」">推广 ↗</a><button class="btn btn-ghost btn-sm del" data-act="delpost" data-id="${r.id}">删除</button>` : ''}
        ${r.kind === 'failed' && r.retryable ? `<button class="btn btn-ghost btn-sm" data-act="retry" data-id="${r.id}">重试</button>` : ''}
      </div>
    </div>`;
  };
  const body = `
    <header class="rv-head"><div class="grow"><h1>已发布</h1><div class="hsub">发出去的帖子都在这里，点一条可以去 Facebook 看</div></div></header>
    <div class="rv-scroll" id="scroll">
      ${rows.some(r => r.kind === 'posted' && r.permalink) ? '<div class="hint boost-tip">想花钱推广一帖：点「推广 ↗」打开帖子，再点帖子下面的「加速推广 / Boost post」，在 Facebook 里选预算、天数和受众。</div>' : ''}
      ${groups.length ? groups.map(g => `<section><div class="lbl">${esc(g.label)}</div><div class="lgc">${g.items.map(item).join('')}</div></section>`).join('')
        : '<div class="empty" style="margin-top:8px"><b>还没有发布记录</b><p>批准的草稿会在发帖时段自动发到 Facebook 专页。</p></div>'}
      <div class="endpad"></div>
    </div>`;
  return page({ title: '已发布', brand, body, tab: 'log', count });
}
