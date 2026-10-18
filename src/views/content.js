/* 贴士 / 梗图 — posts that aren't products; /static/content.js previews, generates and posts them */
import { esc, page } from './html.js';
import { KINDS } from '../content.js';
import { LANGS } from '../mapping.js';
import { fmtTime } from '../slots.js';
import { zhDate } from './queue.js';

const INTRO = {
  tip: '马来西亚人日常用得上的小贴士，做成一张卡片发到专页。不卖东西，让粉丝觉得有用、愿意分享。',
  meme: '两行字 + emoji 的梗图，好笑、大家都懂的日常。'
};

export function contentView({ brand, count, kind, list, lang, b, ai, paused }) {
  const name = KINDS[kind], tip = kind === 'tip';
  const field = (id, label, max, soft = '') => `<div class="field"><label for="${id}">${label}${soft ? ` <span class="soft">${soft}</span>` : ''}</label><input id="${id}" type="text" maxlength="${max}"></div>`;
  const area = (id, label, rows, max, soft = '') => `<div class="field"><label for="${id}">${label}${soft ? ` <span class="soft">${soft}</span>` : ''}</label><textarea id="${id}" rows="${rows}" maxlength="${max}"></textarea></div>`;
  const drafts = list.filter(c => c.status !== 'posted'), posted = list.filter(c => c.status === 'posted');
  const line = c => esc(tip ? c.data.title : `${c.data.top} / ${c.data.bottom}`) || '<span class="soft">（还没写）</span>';
  const body = `
    <header class="rv-head"><div class="grow"><h1>${name}</h1><div class="hsub">${INTRO[kind]}先看预览，满意了再生成海报，最后自己决定发不发。</div></div></header>
    <div class="rv-scroll" id="scroll"><div class="bp">
      <div class="bp-pv">
        <div class="lbl">预览 <span class="soft">1080×1080</span></div>
        <div class="bp-cover ct-pv" id="pv"><iframe title="${name}预览" tabindex="-1" scrolling="no"></iframe></div>
      </div>
      <div class="bp-form">
        <section class="sec">
          <div class="sec-h"><span class="ic">🌐</span><h2>语言</h2></div>
          <div class="bp-seg" id="lang">${Object.entries(LANGS).map(([k, v]) => `<button type="button" class="btn btn-ghost btn-sm" data-lang="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">✨</span><h2>点子</h2></div>
          ${ai ? `<div class="when"><button type="button" class="btn btn-primary" id="ideas">✨ Gemini 出 4 个点子</button><button type="button" class="btn btn-ghost" id="blank">自己写</button></div>
          <div class="hint">按今天的日期和马来西亚人关心的日常出主意，不碰 3R（宗教、种族、皇室）和政治，也不编数字。挑一个再改。</div>`
    : `<div class="when"><button type="button" class="btn btn-ghost" id="blank">自己写</button></div><div class="hint">设置 GEMINI_API_KEY 后，这里可以让 Gemini 出点子（看 SETUP.md）。</div>`}
          <div class="ct-ideas" id="ideaList"></div>
        </section>
        <section class="sec" id="editor" hidden>
          <div class="sec-h"><span class="ic">✍️</span><h2>内容</h2></div>
          ${tip ? field('title', '标题', 50) + area('points', '贴士', 5, 400, '一行一条，最多 5 条')
    : field('top', '第一行', 60, '情况') + field('e1', '第一行 emoji', 3) + field('bottom', '第二行', 60, '反应 / 结果') + field('e2', '第二行 emoji', 3)}
          ${area('caption', '帖子文字', 4, 1500, '发在图片上面')}
          <div class="field"><label for="accent">主色</label><div class="bp-color"><input id="accent" type="color"><span class="soft" id="accentHex"></span></div></div>
          <div class="ct-err" id="err" role="alert" hidden></div>
          <div class="when"><button type="button" class="btn btn-primary" id="make">生成海报</button><button type="button" class="btn btn-ghost" id="del" hidden>删除</button></div>
          <div class="bp-out" id="out" hidden><img id="outImg" alt="生成的海报">
            <div class="when"><button type="button" class="btn btn-primary" id="post">发布到 Facebook</button><a class="btn btn-ghost" id="outDl" download>⬇ 下载</a></div>
            <div class="hint">${paused ? '<b>发帖暂停中</b>（看「待审核」顶部的提示），处理好了才能发。' : '马上发到专页，不占每天的发帖时段，也不算在每天几帖里。'}</div>
          </div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">🗂️</span><h2>草稿</h2></div>
          ${drafts.length ? `<ul class="ct-list">${drafts.map(c => `<li><button type="button" class="ct-row" data-open="${c.id}"><b>${line(c)}</b><span>${esc(LANGS[c.data.lang])}${c.error ? ' · 上次没发成' : ''}</span></button></li>`).join('')}</ul>` : '<div class="hint">还没有草稿。</div>'}
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">✅</span><h2>已发布</h2></div>
          ${posted.length ? `<ul class="ct-list">${posted.map(c => `<li><div class="ct-row"><b>${line(c)}</b><span>${esc(zhDate(c.postedAt) + ' ' + fmtTime(c.postedAt))}${c.permalink ? ` · <a href="${esc(c.permalink)}" target="_blank" rel="noopener">看帖子</a>` : ''}</span></div></li>`).join('')}</ul>` : '<div class="hint">还没有发过。</div>'}
        </section>
      </div>
    </div><div class="endpad"></div></div>`;
  return page({ title: name, brand, body, tab: kind, count, data: { kind, lang, b, items: drafts }, script: '/static/content.js' });
}
