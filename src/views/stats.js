/* 数据: posts from our log; orders + commission only once the conversion report (Step 9) has data — never invented */
import { esc, page } from './html.js';
import { rm } from '../mapping.js';

export function statsView({ brand, range, s, count }) {
  const bars = (rows, strat) => {
    if (!rows.length) return '<div class="bars"><div class="br"><div class="bl"><span class="bo">还没有数据</span></div></div></div>';
    const by = s.hasReport ? 3 : 2, mx = Math.max(1, ...rows.map(x => x[by])); // bar length: commission, else posts
    return `<div class="bars">${rows.map(([k, n, posts, comm, orders]) => `<div class="br">
      <div class="bl"><span class="${strat ? 'chip ' + k : 'tn'}">${esc(n)}</span><span class="bo">${s.hasReport ? orders + ' 单 · ' : ''}${posts} 帖</span>${s.hasReport ? `<b>${rm(comm)}</b>` : ''}</div>
      <div class="bt"><i class="${strat ? k : ''}" style="width:${((s.hasReport ? comm : posts) / mx * 100).toFixed(1)}%"></i></div>
    </div>`).join('')}</div>`;
  };
  const body = `
    <header class="rv-head">
      <div class="grow"><h1>数据</h1><div class="hsub">${s.hasReport ? `Shopee 转化报告 · 上次 ${esc(s.reportAt)}` : '订单和佣金还没接上 Shopee 的成交报告，现在只统计发了几帖'}</div></div>
      <form class="seg seg-mini" action="/stats" method="get">${[['7', '7 天'], ['30', '30 天']].map(([k, l]) => `<button type="submit" name="r" value="${k}" aria-pressed="${range === k}">${l}</button>`).join('')}</form>
    </header>
    <div class="rv-scroll" id="scroll">
      <div class="kpis">
        <div class="kpi"><b>${s.posts}</b><span>帖子</span></div>
        <div class="kpi"><b>${s.hasReport ? s.orders : '—'}</b><span>订单</span></div>
        <div class="kpi"><b>${s.hasReport ? `<small>RM</small>${s.comm.toFixed(2)}` : '—'}</b><span>佣金</span></div>
      </div>
      <div class="lbl">按策略</div>${bars(s.strat, true)}
      <div class="lbl">按模板</div>${bars(s.tpl, false)}
      <div class="endpad"></div>
    </div>`;
  return page({ title: '数据', brand, body, tab: 'stats', count });
}
