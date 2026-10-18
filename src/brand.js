/* 主页图: the Facebook Page's cover and profile picture, drawn from the brand and a few choices.
   Plain ESM with no Node imports: the page previews with the same HTML the server turns into the PNG (render.js renderHtml).
   Cover: 820×360 CSS px, exported at 2× = 1640×720. Facebook shows about 820×312 on a computer and 640×360 on a phone,
   so everything that matters stays in the middle 640×312. Profile picture: 360×360 → 720×720, shown as a circle. */
export const SIZE = { cover: { w: 820, h: 360 }, avatar: { w: 360, h: 360 } };
export const COVER_STYLES = { cream: '暖白', dark: '深色', white: '白底圆点', orange: 'Shopee 橙' };
export const AVATAR_STYLES = { badge: '圆章（和海报一样）', initial: '大字母', name: '名字' };
export const TEXT = {
  zh: { line: '每天分享 Shopee 好物', sub: '好价 · 好评 · 链接在评论区' },
  ms: { line: 'Barang Shopee terbaik setiap hari', sub: 'Harga best · Review power · Link di komen' }
};
const HEX = /^#[0-9a-f]{6}$/i;
const str = (v, n, d) => { const s = String(v ?? '').trim().slice(0, n); return s || d; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* what the page sends → only known styles, short texts, a #rrggbb accent; the brand from config.json fills the gaps */
export function cleanBrand(o, b = {}) {
  o = o && typeof o === 'object' ? o : {};
  const lang = o.lang === 'ms' ? 'ms' : 'zh', t = TEXT[lang];
  return {
    lang,
    name: str(o.name, 30, b.bName || 'LIM'), tag: str(o.tag, 20, b.bTag || 'Sharing'), init: str(o.init, 2, b.bInit || (b.bName || 'L')[0]),
    line: str(o.line, 40, t.line), sub: str(o.sub, 60, t.sub),
    cover: COVER_STYLES[o.cover] ? o.cover : 'cream', avatar: AVATAR_STYLES[o.avatar] ? o.avatar : 'badge',
    accent: HEX.test(o.accent) ? o.accent.toLowerCase() : '#ee4d2d'
  };
}

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800;900&family=Noto+Sans+SC:wght@500;900&family=Caveat:wght@700&display=swap" rel="stylesheet">';
const doc = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden}
#cv{width:${w}px;height:${h}px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:"Montserrat","Noto Sans SC",sans-serif}
${css}</style></head><body><div id="cv">${body}</div></body></html>`;
/* "Shopee" in the main line takes the accent colour */
const mark = s => esc(s).replace(/Shopee/g, '<b>Shopee</b>');

export function coverHtml(o) {
  const a = o.accent, { w, h } = SIZE.cover;
  const css = `
.in{width:640px;text-align:center;position:relative;z-index:1}
.kick{font:800 13px/1 "Montserrat",sans-serif;letter-spacing:.32em;text-transform:uppercase}
h1{font:900 44px/1.15 "Montserrat","Noto Sans SC",sans-serif;letter-spacing:.01em;margin:16px 0 14px;text-wrap:balance}
h1 b{color:${a}}
.sub{font:500 16px/1.3 "Montserrat","Noto Sans SC",sans-serif;letter-spacing:.06em}
.rule{width:44px;height:3px;border-radius:2px;margin:0 auto;background:${a}}
.cream{background:#fbf6ee;color:#1c1c1e}.cream .kick{color:#6b5f52}.cream .sub{color:#4a4038}.cream .rule{margin-top:22px}
.dark{background:radial-gradient(120% 140% at 50% 0%,#221d2b 0%,#15131a 60%);color:#fff}.dark .kick{color:#b9b0c8}.dark .sub{color:#d6cfe0}.dark .rule{margin-bottom:22px}
.white{background:#fff;color:#16141a}.white .in{text-align:left;padding-left:20px}.white h1{max-width:470px}.white .kick{color:#5c5566}.white .sub{color:#3d3845}.white .rule{margin:0 0 20px;background:#16141a}
.white::before{content:"";position:absolute;width:300px;height:300px;border-radius:50%;background:${a};right:-70px;top:-90px}
.white::after{content:"";position:absolute;width:120px;height:120px;border-radius:50%;border:3px solid ${a};left:-40px;bottom:-50px}
.orange{background:linear-gradient(135deg,${a},#ff8a3d);color:#fff}.orange h1 b{color:#fff;text-decoration:underline;text-decoration-thickness:4px;text-underline-offset:6px}.orange .kick,.orange .sub{color:rgba(255,255,255,.92)}.orange .rule{background:#fff;margin-top:22px}`;
  const top = o.cover === 'dark' || o.cover === 'white' ? '<div class="rule"></div>' : '';
  const end = top ? '' : '<div class="rule"></div>';
  return doc(w, h, css, `<div class="in">${top}<div class="kick">${esc(o.name)} ${esc(o.tag)}</div><h1>${mark(o.line)}</h1><div class="sub">${esc(o.sub)}</div>${end}</div>`)
    .replace('<div id="cv">', `<div id="cv" class="${o.cover}">`);
}

export function avatarHtml(o) {
  const a = o.accent, { w, h } = SIZE.avatar;
  /* Facebook cuts it to a circle: everything sits inside the middle 80 %; a longer name gets smaller letters */
  const fit = (max, room) => Math.min(max, Math.floor(room / Math.max(1, [...o.name].length) * 1.7));
  const css = `
.badge{background:#fbf6ee}.badge .c{width:270px;height:270px;border-radius:50%;background:#fff;border:6px solid ${a};display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.12)}
.badge b{font:900 ${fit(76, 140)}px/1 "Montserrat","Noto Sans SC",sans-serif;color:#1c1c1e;letter-spacing:-.01em}
.badge span{font:700 46px/1 "Caveat",cursive;color:#1c1c1e;margin-top:4px}
.initial{background:${a}}.initial b{font:900 190px/1 "Montserrat","Noto Sans SC",sans-serif;color:#fff}
.name{background:#15131a;flex-direction:column}.name b{font:900 ${fit(70, 175)}px/1 "Montserrat","Noto Sans SC",sans-serif;color:#fff}
.name span{font:800 22px/1 "Montserrat",sans-serif;color:#fff;letter-spacing:.28em;text-transform:uppercase;margin-top:16px}
.name i{display:block;width:60px;height:5px;border-radius:3px;background:${a};margin-top:18px}`;
  const body = o.avatar === 'initial' ? `<b>${esc(o.init)}</b>`
    : o.avatar === 'name' ? `<b>${esc(o.name)}</b><span>${esc(o.tag)}</span><i></i>`
    : `<div class="c"><b>${esc(o.name)}</b><span>${esc(o.tag)}</span></div>`;
  return doc(w, h, css, body).replace('<div id="cv">', `<div id="cv" class="${o.avatar}">`);
}
