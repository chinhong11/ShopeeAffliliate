/* 主页图 — the Facebook Page's cover and profile picture; /static/brand.js previews and generates them */
import { esc, page } from './html.js';
import { COVER_STYLES, AVATAR_STYLES } from '../brand.js';
import { LANGS } from '../mapping.js';

export function brandView({ brand, count, o, b, pageId }) {
  const seg = (name, list) => Object.entries(list).map(([k, v]) => `<button type="button" class="btn btn-ghost btn-sm" data-${name}="${k}" aria-pressed="${o[name] === k}">${esc(v)}</button>`).join('');
  const field = (id, label, max, soft = '') => `<div class="field"><label for="${id}">${label}${soft ? ` <span class="soft">${soft}</span>` : ''}</label><input id="${id}" type="text" maxlength="${max}" value="${esc(o[id])}"></div>`;
  const fbPage = 'https://www.facebook.com/' + encodeURIComponent(pageId || '');
  const body = `
    <header class="rv-head"><div class="grow"><h1>主页图</h1><div class="hsub">Facebook 专页的封面和头像。选好样式就能预览，满意了再生成、下载，自己决定要不要换上去。</div></div></header>
    <div class="rv-scroll" id="scroll"><div class="bp">
      <div class="bp-pv">
        <div class="lbl">封面 <span class="soft">1640×720 · 电脑上下边会被裁掉一点，字都在安全区里</span></div>
        <div class="bp-cover" id="pvCover"><iframe title="封面预览" tabindex="-1" scrolling="no"></iframe></div>
        <div class="lbl">头像 <span class="soft">720×720 · Facebook 会剪成圆形</span></div>
        <div class="bp-avatar" id="pvAvatar"><iframe title="头像预览" tabindex="-1" scrolling="no"></iframe></div>
      </div>
      <div class="bp-form">
        <section class="sec">
          <div class="sec-h"><span class="ic">🌐</span><h2>图上的语言</h2></div>
          <div class="when" id="lang">${seg('lang', LANGS)}</div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">✍️</span><h2>文字</h2></div>
          ${field('name', '名字', 30)}${field('tag', '小字', 20, '名字旁边，例如 Sharing')}${field('line', '主句', 40, 'Shopee 会用主色')}${field('sub', '副句', 60)}${field('init', '头像字母', 2, '「大字母」头像用')}
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">🎨</span><h2>样式</h2></div>
          <div class="field"><label>封面</label><div class="bp-seg" id="cover">${seg('cover', COVER_STYLES)}</div></div>
          <div class="field"><label>头像</label><div class="bp-seg" id="avatar">${seg('avatar', AVATAR_STYLES)}</div></div>
          <div class="field"><label for="accent">主色</label><div class="bp-color"><input id="accent" type="color" value="${esc(o.accent)}"><span class="soft" id="accentHex">${esc(o.accent)}</span></div></div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">🖼️</span><h2>生成</h2></div>
          <div class="when"><button type="button" class="btn btn-primary" data-make="cover">生成封面</button><button type="button" class="btn btn-primary" data-make="avatar">生成头像</button></div>
          <div class="bp-out" id="out" hidden><img id="outImg" alt="生成的图片"><a class="btn btn-ghost" id="outDl" download>⬇ 下载</a></div>
          <div class="hint">生成的就是要上传的图（和预览一样，画质是 2 倍）。不满意就改了再生成，不会自动换到 Facebook 上。</div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">📲</span><h2>换到 Facebook 上</h2></div>
          <ol class="bp-steps">
            <li>先下载图片，再<a href="${esc(fbPage)}" target="_blank" rel="noopener">打开你的 Facebook 专页</a>（用管理专页的账号）。</li>
            <li><b>封面：</b>点封面上的「编辑封面照片」→「上传照片」→ 选下载的封面 → 拖到合适的位置 → 保存。</li>
            <li><b>头像：</b>点头像上的相机图标 →「上传照片」→ 选下载的头像 → 保存。</li>
          </ol>
          <div class="hint">Facebook 的按钮名称偶尔会改，找最接近的就行。App 不会自己换：Facebook 现在的公开 API 文档里找不到修改专页封面和头像的接口，所以由你下载后自己上传。</div>
        </section>
        <section class="sec">
          <div class="sec-h"><span class="ic">🚪</span><h2>退出登录</h2></div>
          <div class="hint">用别人的手机或电脑登录过，用完点一下。改 ADMIN_PASSWORD 会让所有设备都退出。</div>
          <form method="post" action="/logout"><button class="btn btn-ghost">退出</button></form>
        </section>
      </div>
    </div><div class="endpad"></div></div>`;
  return page({ title: '主页图', brand, body, tab: 'brand', count, data: { o, b }, script: '/static/brand.js' });
}
