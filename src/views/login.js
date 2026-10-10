import { esc, bag, page } from './html.js';

export const loginView = ({ brand, error = '' }) => page({
  title: '登录', brand, nav: false,
  body: `<div class="login">
    <div class="lg-logo">${bag(30)}</div>
    <h1>${esc(brand)} 带货后台</h1>
    <p class="lg-sub">Shopee 好物自动做图，你批准了才发到 Facebook 专页。</p>
    <form method="post" action="/login" novalidate>
      <div class="field"><label for="pw">密码</label><input id="pw" type="password" name="password" placeholder="后台密码" autocomplete="current-password" required autofocus></div>
      ${error ? `<div class="ferr">${esc(error)}</div>` : ''}
      <button class="btn btn-primary" type="submit">登录</button>
    </form>
    <div class="hint">连续输错 5 次锁 15 分钟。登录后 30 天内不用再输入。</div>
  </div>`
});
