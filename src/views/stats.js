/* 数据: posts from our log; orders + commission only once the conversion report (Step 9) has data — never invented */
import { esc, page } from './html.js';
import { rm } from '../mapping.js';
import { fmtTime } from '../slots.js';

/* Gemini usage as counted by the app; Google's own limits are only on AI Studio */
const KIND = { caption: '写文案', design: '自动设计', designs: '4 款设计' };
function gemBox(g) {
  if (!g || !g.on) return '';
  const t = g.today, l = g.lastLimit, k = Object.entries(t.kinds || {}).map(([x, n]) => `${KIND[x] || x} ${n}`).join(' · ');
  const lim = l && l.at > Date.now() - 86400e3 ? `<p class="gem-lim">上次碰到上限：${fmtTime(l.at)} · ${l.scope === 'day' ? '每天的次数' : '每分钟的次数'}${l.retryS ? `（要等 ${l.retryS} 秒）` : ''}</p>` : '';
  const lims = g.limits || {}, used = t.models || {}, alias = g.alias || {};
  const ids = [...new Set([g.model, ...(g.models || [])])];
  const num = (id, k) => { const v = (lims[id] || lims[alias[id]] || {})[k]; return v == null ? '' : v; };
  const rows = ids.map(id => {
    const rpd = num(id, 'rpd'), n = used[id] || 0, cur = id === g.model;
    return `<tr class="${cur ? 'cur' : ''}"><td><b>${esc(id)}</b>${alias[id] ? `<small>= ${esc(alias[id])}</small>` : ''}</td>
      ${['rpm', 'tpm', 'rpd'].map(k => `<td><input type="number" min="1" step="1" inputmode="numeric" placeholder="?" value="${num(id, k)}" data-limit="${k}" data-model="${esc(id)}" aria-label="${esc(id)} ${k.toUpperCase()}"></td>`).join('')}
      <td class="${rpd && n >= rpd ? 'over' : ''}">${n}${rpd ? ' / ' + rpd : ''}</td>
      <td>${cur ? '<span class="chip man">使用中</span>' : `<button class="btn btn-ghost btn-sm" data-act="gmodel" data-id="${esc(id)}">用这个</button>`}</td></tr>`;
  }).join('');
  const table = `<div class="lbl">Gemini 模型和限额</div><div class="gem"><div class="gtab"><table><thead><tr><th>模型</th><th>每分钟 RPM</th><th>每分钟 TPM</th><th>每天 RPD</th><th>今天用了</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${g.modelsError ? `<p class="gem-lim">${esc(g.modelsError)}</p>` : ''}
      <p class="soft">限额要在 <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener">AI Studio 的 Rate Limit 页 ↗</a> 看，填在这里方便对照（碰到上限时也会自动记下）。每天的次数在马来西亚时间下午 3–4 点重置。换模型后，设计和文案都用新模型。</p></div>`;
  return `<div class="lbl">Gemini 用量 · 今天</div>
      <div class="kpis"><div class="kpi"><b>${t.req}</b><span>次请求</span></div><div class="kpi"><b>${g.lastMinute}</b><span>最近 1 分钟</span></div><div class="kpi"><b>${t.tokens >= 1000 ? (t.tokens / 1000).toFixed(1) + 'k' : t.tokens}</b><span>tokens</span></div></div>
      <div class="gem"><p>${k ? esc(k) + ' · ' : ''}${t.limited ? `被限额 ${t.limited} 次 · ` : ''}模型 ${esc(g.model)}</p>${lim}<p class="soft">免费额度有每分钟和每天两种上限，一下子点很多次就会碰到每分钟的上限，等一会儿就好。Google 不让应用直接读剩下多少，<a href="https://aistudio.google.com/usage" target="_blank" rel="noopener">在 AI Studio 看用量 ↗</a></p></div>
      ${table}`;
}

export function statsView({ brand, range, s, count, gem = null }) {
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
      ${gemBox(gem)}
      <div class="endpad"></div>
    </div>`;
  return page({ title: '数据', brand, body, tab: 'stats', count });
}
