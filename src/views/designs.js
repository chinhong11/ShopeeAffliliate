/* ✨ AI 设计 — 4 posters Gemini designed for this product; /static/designs.js fills them in */
import { esc, page, GUIDE } from './html.js';
import { shortName } from '../mapping.js';

export function designsView({ brand, d, count, ai }) {
  const body = `<div class="ed" id="ds">
    <div class="ed-top">
      <a class="back" href="/d/${d.id}">‹ 返回</a>
      <b class="tt" role="heading" aria-level="1">AI 设计 · ${esc(shortName(d.p.name))}</b>
    </div>
    <div class="rv-scroll" id="scroll"><div class="ds-wrap">
      ${ai ? `<p class="hint ds-tip" id="dsTip">Gemini 看了商品照片和资料，设计了 4 款海报。照片和价格都是真的，只有配色、字体和排版不同。点一款就用它。</p>
      <div class="ds-grid" id="grid"></div>`
      : '<div class="empty"><b>还没设置 Gemini</b><p>需要一个免费的 Gemini key，加到服务器设置里就能用 AI 设计。</p><a class="btn btn-ghost btn-sm" href="${GUIDE}#optional-ai-design-and-captions-gemini" target="_blank" rel="noopener">怎么设置 ↗</a></div>'}
    </div></div>
    ${ai ? `<div class="ed-bar"><a class="btn btn-ghost" href="/d/${d.id}">返回编辑</a><button class="btn btn-primary" id="again">↻ 再出 4 款</button></div>` : ''}
  </div>`;
  return page({ title: 'AI 设计', brand, body, tab: '', count, data: { id: d.id }, script: ai ? '/static/designs.js' : '' });
}
