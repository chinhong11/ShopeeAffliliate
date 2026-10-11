/* tiny HTML helpers + page layout */
/* the click-by-click guide (setup, token renewal, settings); the pause banner links its sections */
export const GUIDE = 'https://github.com/chinhong11/ShopeeAffliliate/blob/main/SETUP.md';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/* JSON for <script type="application/json"> */
export const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

export const bag = size => `<svg viewBox="0 0 24 24" fill="none" width="${size}" height="${size}" aria-hidden="true"><path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 7z" stroke="#fff" stroke-width="2" stroke-linejoin="round"></path><path d="M9 7a3 3 0 0 1 6 0" stroke="#fff" stroke-width="2" stroke-linecap="round"></path></svg>`;

const TABS = [['queue', '待审核', '/'], ['log', '已发布', '/log'], ['stats', '数据', '/stats']];
const tabButtons = (tab, count) => TABS.map(([k, l, href]) =>
  `<a role="tab" class="tab" href="${href}" aria-selected="${tab === k}">${l}${k === 'queue' && count > 0 ? `<span class="bdg">${count}</span>` : ''}</a>`).join('');

export function page({ title, brand, body, tab = null, count = 0, nav = true, script = '', data = null }) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title ? title + ' · ' : '')}${esc(brand)} 带货后台</title>
<meta name="theme-color" content="#15131a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${esc(brand)} 后台">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Noto+Sans+SC:wght@400;500;700;900&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/studio-ui-v3.css">
<link rel="stylesheet" href="/static/review-app.css">
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
<div class="rv" id="rv"><script>document.getElementById('rv').classList.add(innerWidth>=900?'desk':'phone')</script>
${nav ? `<div class="topnav"><div class="tn-brand"><span class="tn-logo">${bag(18)}</span><b>${esc(brand)} 带货后台</b></div><nav role="tablist">${tabButtons(tab, count)}</nav></div>` : ''}
<main class="rv-main" id="main">${body}</main>
${nav ? `<nav class="tabs" role="tablist">${tabButtons(tab, count)}</nav>` : ''}
<div id="toast-slot" role="status" aria-live="polite"></div>
</div>
${data ? `<script type="application/json" id="data">${json(data)}</script>` : ''}
<script type="module" src="/static/app.js"></script>
${script ? `<script type="module" src="${script}"></script>` : ''}
</body>
</html>`;
}
