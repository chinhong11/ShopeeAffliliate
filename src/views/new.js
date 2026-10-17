/* ＋ 手动添加 — a product typed in by hand (no Shopee API); /static/new.js uploads it */
import { page, esc } from './html.js';

export function newView({ brand, count }) {
  const body = `<div class="ed" id="nw">
    <div class="ed-top">
      <a class="back" href="/">‹ 返回</a>
      <b class="tt">手动添加商品</b>
    </div>
    <div class="rv-scroll" id="scroll"><form class="ed-form" id="nf" novalidate>
      <section class="sec desk-only bm-sec">
        <div class="sec-h"><span class="ic">⚡</span><h2>从 Shopee 一键导入</h2><span class="tip">电脑 Chrome</span></div>
        <p class="hint">① 把下面的按钮<b>拖到书签栏</b>（只要做一次）　② 打开 Shopee 商品页　③ 点书签：资料和照片会自动填到这里。</p>
        <a class="btn btn-ghost bm" id="bm" href="#" onclick="event.preventDefault();alert('把这个按钮拖到书签栏，再到 Shopee 商品页上点它')">📥 导入到 ${esc(brand)} 后台</a>
      </section>
      <section class="sec" id="imp" hidden>
        <div class="sec-h"><span class="ic">📥</span><h2>从 Shopee 导入的照片</h2><span class="tip" id="pickTip"></span></div>
        <div class="phs pick" id="pick"></div>
        <div class="field imp-url"><label>商品网址 <span class="soft">在 Shopee Affiliate「自定义链接」贴上它，生成你的推广链接</span></label>
          <div class="imp-row"><code id="impUrl"></code><button type="button" class="btn btn-ghost btn-sm" id="impCopy">复制</button></div></div>
      </section>
      <section class="sec">
        <div class="sec-h"><span class="ic">📷</span><h2>照片</h2><span class="tip" id="phTip">0 / 4</span></div>
        <div class="phs" id="phs"></div>
        <input id="file" type="file" accept="image/*" multiple hidden>
        <div class="hint">从 Shopee 下载的商品图。第 1 张是主图，最多 4 张。</div>
      </section>
      <section class="sec">
        <div class="sec-h"><span class="ic">🛍️</span><h2>商品</h2></div>
        <div class="field"><label for="name">商品名称</label><input id="name" type="text" maxlength="200" required></div>
        <div class="field"><label for="price">现价 RM</label><input id="price" type="number" inputmode="decimal" step="0.01" min="0.01" required></div>
        <div class="field"><label for="was">原价 RM <span class="soft">选填 · 有折扣才填</span></label><input id="was" type="number" inputmode="decimal" step="0.01" min="0.01"></div>
        <div class="field"><label for="rating">评分 <span class="soft">选填 · 例如 4.8</span></label><input id="rating" type="number" inputmode="decimal" step="0.1" min="0.1" max="5"></div>
        <div class="field"><label for="sales">已售</label><input id="sales" type="number" inputmode="numeric" step="1" min="0" required placeholder="例如 1200（10k+ 就填 10000）"></div>
      </section>
      <section class="sec">
        <div class="sec-h"><span class="ic">🔗</span><h2>推广链接</h2></div>
        <div class="field"><label for="link">Shopee Affiliate 链接</label><input id="link" type="url" inputmode="url" required placeholder="https://s.shopee.com.my/…"></div>
        <div class="hint">在 Shopee Affiliate 用「自定义链接」生成，或在 Shopee App 商品页点分享复制联盟链接。发帖时原样放进评论（或帖子）里，佣金才会算你的。</div>
      </section>
    </form></div>
    <div class="ed-bar">
      <a class="btn btn-ghost" href="/">取消</a>
      <button class="btn btn-primary" id="save" type="submit" form="nf">加到待审核</button>
    </div>
  </div>`;
  return page({ title: '手动添加', brand, body, tab: '', count, script: '/static/new.js' });
}
