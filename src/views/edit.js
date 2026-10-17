/* 编辑 — shell + data; /static/edit.js builds the form */
import { esc, page } from './html.js';
import { STRATS, commOf } from '../mapping.js';
import { posterBlock, priceRow, priceWarn } from './queue.js';

export function editView({ brand, d, st, cfg, count, dirty }) {
  const p = d.p;
  const body = `<div class="ed" id="ed">
    <div class="ed-top">
      <a class="back" href="/" id="back">‹ 返回</a>
      <b class="tt">${d.status === 'approved' ? '已批准的草稿' : '编辑草稿'}<small class="sv" id="sv" aria-live="polite"></small></b>
      <span class="chip ${d.strat}">${STRATS[d.strat].zh}</span>
    </div>
    <div class="rv-scroll" id="scroll"><div class="ed-grid">
      <div class="ed-pv">
        ${posterBlock(d, st, { dirty, big: true })}
        <div class="pages" id="pages" hidden></div>
        <div class="ed-meta">
          <h3 class="nm">${esc(p.name)}</h3>
          ${priceRow(p)}
          <div class="cm"><b>${commOf(p)}</b></div>
          ${priceWarn(d.priceChanged, '海报已按新价格更新。')}
          <div class="look-note" id="lookNote"${d.form.look ? '' : ' hidden'}><span>${d.form.look && d.form.look.why ? `✨ AI 设计：${esc(d.form.look.why)}` : '✨ 这张海报用了自己的样式（颜色、字体、照片位置等）'}</span><button class="btn btn-ghost btn-sm" id="lookClear">用基本样式</button></div>
          ${cfg.ai ? `<a class="btn btn-ghost btn-sm" id="aiDesign" href="/d/${d.id}/designs">✨ AI 设计 · 4 款选 1</a>` : ''}
        </div>
      </div>
      <div class="ed-form" id="form"></div>
    </div></div>
    <div class="ed-bar">
      <button class="btn btn-ghost" id="regen">↻ 重新生成海报</button>
      <button class="btn btn-primary" id="approve">${d.status === 'approved' ? '保存修改' : '批准'}</button>
    </div>
  </div>`;
  const data = {
    d: { id: d.id, status: d.status, strat: d.strat, p, form: d.form, shortLink: d.shortLink, posterKey: d.posterKey },
    cfg: { postTimes: cfg.postTimes, language: cfg.language, voucherCode: cfg.voucherCode, hashtags: cfg.hashtags, linkMode: cfg.linkMode, brand: cfg.brand, ai: !!cfg.ai }
  };
  return page({ title: '编辑', brand, body, tab: '', count, data, script: '/static/edit.js' });
}
