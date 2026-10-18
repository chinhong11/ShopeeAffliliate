/* 贴士 / 梗图: posts that aren't products — a daily-life tip card or a two-line text meme — drawn from a few fields.
   Plain ESM with no Node imports: the page previews with the same HTML the server turns into the PNG (render.js renderHtml).
   540×540 CSS px, exported at 2× = 1080×1080. */
export const KINDS = { tip: '贴士', meme: '梗图' };
export const SIZE = { w: 540, h: 540 };
export const MEME_STYLES = { text: '文字 + emoji', photo: '照片' };
const PHOTO = /^ct-[0-9a-f]{12}\.(jpg|png|webp|avif)$/; // a file saved by service.saveContentPhoto
const HEX = /^#[0-9a-f]{6}$/i;
/* whole characters (an emoji never cut in half), trimmed */
const str = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* what the page or Gemini sends → only these fields, short texts, a #rrggbb accent; the brand fills the badge */
export function cleanContent(kind, o, b = {}) {
  o = o && typeof o === 'object' ? o : {};
  const base = { lang: o.lang === 'ms' ? 'ms' : 'zh', caption: str(o.caption, 1500), accent: HEX.test(o.accent) ? o.accent.toLowerCase() : '#ee4d2d',
    name: str(b.bName || 'LIM', 20), tag: str(b.bTag || '', 20) };
  if (kind === 'meme') return { ...base, top: str(o.top, 60), bottom: str(o.bottom, 60), e1: str(o.e1, 3) || '😎', e2: str(o.e2, 3) || '🫠',
    style: o.style === 'photo' ? 'photo' : 'text', photo: PHOTO.test(o.photo) ? o.photo : '' };
  const points = (Array.isArray(o.points) ? o.points : String(o.points || '').split('\n')).map(p => str(p, 70)).filter(Boolean).slice(0, 5);
  return { ...base, title: str(o.title, 50), points };
}
/* one line naming the post (lists, 已发布, Telegram, the ideas Gemini must not repeat) */
export const titleOf = (kind, c) => kind === 'tip' ? c.title || '' : [c.top, c.bottom].filter(Boolean).join(' / ');
/* what is still missing before it can be posted ('' = ready) */
export const missing = (kind, c) => kind === 'tip' ? (c.title && c.points.length ? '' : '标题和至少一条贴士都要写')
  : c.style === 'photo' ? (c.photo && (c.top || c.bottom) ? '' : '要有照片和至少一行字') : (c.top && c.bottom ? '' : '上下两行都要写');

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800;900&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">';
const KICK = { zh: '💡 生活小贴士', ms: '💡 TIP HARIAN' };

/* src: the photo of a photo meme (the page shows /img/…, the server passes a data: URL) */
export function contentHtml(kind, c, src = c.photo ? '/img/' + c.photo : '') {
  const a = c.accent, badge = `<div class="bdg"><b>${esc(c.name)}</b>${c.tag ? `<span>${esc(c.tag)}</span>` : ''}</div>`;
  const photo = kind === 'meme' && c.style === 'photo';
  const body = photo
    ? `${src ? `<img class="ph" src="${esc(src)}" alt="">` : '<div class="ph none">📷</div>'}${c.top ? `<p class="t">${esc(c.top)}</p>` : ''}${c.bottom ? `<p class="b">${esc(c.bottom)}</p>` : ''}${badge}`
    : kind === 'meme'
    ? `<div class="row r1"><span class="em">${esc(c.e1)}</span><p>${esc(c.top)}</p></div><div class="row r2"><span class="em">${esc(c.e2)}</span><p>${esc(c.bottom)}</p></div>${badge}`
    : `<div class="kick">${KICK[c.lang]}</div><h1>${esc(c.title)}</h1><ol>${c.points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>${badge}`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:${SIZE.w}px;height:${SIZE.h}px;overflow:hidden}
#cv{width:${SIZE.w}px;height:${SIZE.h}px;position:relative;overflow:hidden;font-family:"Montserrat","Noto Sans SC",sans-serif;color:#1c1c1e}
.bdg{position:absolute;right:22px;bottom:18px;display:flex;align-items:baseline;gap:6px;background:#fff;border-radius:99px;padding:7px 14px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
.bdg b{font-weight:900;font-size:15px}.bdg span{font-size:12px;font-weight:600;color:#6b6b6b}
.tip{background:#fbf6ee;padding:40px 44px 76px;display:flex;flex-direction:column;justify-content:center}
.tip .kick{font-weight:800;font-size:14px;letter-spacing:.12em;color:${a}}
.tip h1{font-weight:900;font-size:36px;line-height:1.18;margin:12px 0 28px;text-wrap:balance}
.tip ol{list-style:none;counter-reset:n;display:flex;flex-direction:column;gap:16px}
.tip li{counter-increment:n;display:flex;gap:14px;font-size:20px;font-weight:600;line-height:1.38}
.tip li::before{content:counter(n);flex:none;width:30px;height:30px;border-radius:50%;background:${a};color:#fff;font-weight:900;font-size:16px;display:grid;place-items:center;margin-top:-1px}
.meme{display:flex;flex-direction:column;background:#fff}
.meme .row{flex:1;display:flex;align-items:center;gap:22px;padding:0 34px}
.meme .r1{background:#fbf6ee}.meme .r2{background:${a};color:#fff}
.meme .em{font-size:92px;line-height:1;flex:none}
.meme p{font-weight:900;font-size:30px;line-height:1.22;text-wrap:balance}
.meme .r2 p{padding-bottom:24px}
.photo{background:#1c1c1e}
.photo .ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.photo .none{display:grid;place-items:center;font-size:80px;opacity:.5}
.photo p{position:absolute;left:24px;right:24px;text-align:center;color:#fff;font-weight:900;font-size:36px;line-height:1.15;text-transform:uppercase;text-wrap:balance;
  -webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:0 2px 8px rgba(0,0,0,.55)}
.photo .t{top:22px}.photo .b{bottom:64px}
</style></head><body><div id="cv" class="${photo ? 'photo' : kind === 'meme' ? 'meme' : 'tip'}">${body}</div></body></html>`;
}
