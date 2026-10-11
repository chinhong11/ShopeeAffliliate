/* Shopee offer → product → studio state (README Step 1 mapping).
   Plain ESM with no Node imports: also served to the review app at /shared/mapping.js. */

export const STRATS = { top: { zh: '爆卖', key: 'topSellers' }, com: { zh: '高佣', key: 'highestCommission' }, disc: { zh: '大折扣', key: 'biggestDiscount' } };
export const STRAT_CODE = { topSellers: 'top', highestCommission: 'com', biggestDiscount: 'disc' };
export const TPL = { t1: '爆款分享', t2: '价格暴击', t3: '限时抢购', t4: '好友爆料', t5: '真实好评', t6: '杂志封面', t8: '轮播套图' };
export const TPL_NOTE = { t1: '照片为主', t2: '大字价格', t6: '杂志风', t5: '买家原话', t3: '倒计时', t4: '聊天截图风', t8: '4 张一组' };
export const TPL_LOCK = { t5: '先填买家真实评价', t3: '需要真实结束时间', t4: '需要你写聊天内容', t8: '需要 4 张照片' };
export const TPL_ORDER = ['t1', 't2', 't6', 't5', 't3', 't4', 't8'];
export const LAYOUT = ['', '单图', '双图', '三图', '四宫格'];
export const GRID_TPLS = ['t1', 't2', 't3', 't5', 't6'];

export const rm = n => 'RM ' + Number(n).toFixed(2);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

/* sales → 已售 860 / 已售 1.2k+ / 已售 12k+ (zh) or 860 sold / 1.2k+ sold (mix) */
export function fmtSoldNum(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return Math.floor(n / 100) / 10 + 'k+';
  return Math.floor(n / 1000) + 'k+';
}
export const fmtSold = (n, lang = 'zh') => lang === 'mix' ? fmtSoldNum(n) + ' sold' : '已售 ' + fmtSoldNum(n);

/* strip 【…】, emoji, "Ready Stock" / "COD" noise; ≤ 24 characters */
export function shortName(s) {
  s = String(s || '')
    .replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '')
    /* emoji incl. flags (regional indicators), skin tones, tag sequences, ZWJ, variation selectors, keycaps */
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\bReady\s*Stock\b/gi, '')
    .replace(/\bCOD\b/g, '') // cash on delivery, written in capitals; keeps e.g. "Cod Liver Oil"
    .replace(/\(\s*\)|（\s*）/g, '')
    .replace(/[|｜]+/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s\-–—,:;]+|[\s\-–—,:;]+$/g, '').trim();
  const cps = Array.from(s); // cut whole code points, never half a surrogate pair
  return cps.length > 24 ? cps.slice(0, 23).join('') + '…' : s;
}

export const hasDisc = p => num(p.disc) !== null && p.disc >= 10;
export const hasRating = p => num(p.rating) !== null && p.rating > 0;
/* was = now / (1 - rate/100), 2 decimals; prefer a real original price if the API gave one */
export const wasOf = p => !hasDisc(p) ? '' : rm(num(p.originalPrice) || p.price / (1 - p.disc / 100));
export const pctOf = p => hasDisc(p) ? '-' + Math.round(p.disc) + '%' : '';
export const rateOf = p => hasRating(p) ? Number(p.rating).toFixed(1) : '';
export const commOf = p => '佣金 ' + +(p.comm * 100).toFixed(1) + '% ≈ ' + rm(p.price * p.comm) + '/单';

/* productOfferV2 node → product (numbers parsed; the API returns several as strings) */
export function productFromOffer(n) {
  let comm = num(n.commissionRate) || 0;
  if (comm > 1) comm = comm / 100; // tolerate "8" meaning 8%
  return {
    itemId: String(n.itemId), shopId: String(n.shopId),
    name: n.productName || '', shopName: n.shopName || '',
    imageUrl: n.imageUrl || '',
    price: num(n.priceMin), priceMax: num(n.priceMax),
    disc: num(n.priceDiscountRate) || 0,
    rating: num(n.ratingStar),
    sales: num(n.sales) || 0,
    comm,
    productLink: n.productLink || '', offerLink: n.offerLink || ''
  };
}

/* draft → window.PostStudio.load() patch.
   Every field the studio defaults to a demo value is set explicitly here (empty when there is no data),
   so no placeholder survives; see placeholderProblems(). `photoSrc` maps stored photo refs → URLs. */
export function studioState(d, cfg, photoSrc = x => x) {
  const p = d.p, f = d.form, lang = cfg.language === 'mix' ? 'mix' : 'zh';
  const photos = (f.photos || []).slice(0, 4);
  const n = Math.max(1, Math.min(4, photos.length));
  const code = (cfg.voucherCode || '').trim();
  const mode = cfg.linkMode === 'direct' ? 'direct' : 'comment';
  const b = cfg.brand || {};
  const st = {
    tpl: f.tpl, layout: n, lang,
    l1: f.l1 || '', l2: f.l2 || '',
    photos: photos.map(photoSrc),
    price: hasDisc(p) || f.tpl === 't2', now: rm(p.price), was: wasOf(p), pct: pctOf(p),
    seal: hasDisc(p) && p.disc >= 20, sealLabel: 'OFF',
    proof: hasRating(p) && p.rating >= 4.5, rate: rateOf(p), sold: fmtSold(p.sales, lang),
    voucher: !!code, voucherCode: code,
    cta: true, ctaText: mode === 'direct' ? (lang === 'mix' ? 'Link 在 caption 👆' : '点链接直接买 🛒') : (lang === 'mix' ? 'Link 在评论区 👇' : '评论区拿链接 👇'),
    arrow: true, shopee: true,
    badge: true, bstyle: b.bstyle || 'lee', bInit: b.bInit || '', bName: b.bName || '', bTag: b.bTag || '', badgec: b.badgec || '#1c1c1e',
    /* never shown unless the template is chosen with real data — blanked so no demo value survives */
    cd: { h: '00', m: '00', s: '00' }, stockTxt: '', stockPct: 0,
    review: { quote: '', author: '' },
    chat: { title: '', sub: '', m1: '', m2: '', m3: '' },
    cap: { mode, name: shortName(p.name), link: d.shortLink || '', price: rm(p.price), code, tags: cfg.hashtags || '' }
  };
  if (!hasRating(p)) st.proof = false;
  if (f.tpl === 't5') st.review = { quote: f.review.quote, author: f.review.author || '— Shopee 买家' };
  if (f.tpl === 't3') {
    st.cd = countdown(f.flash, d.now);
    st.stockTxt = '限时闪购中';
    st.stockPct = Math.max(1, Math.min(99, +f.flash.pct || 1));
  }
  if (f.tpl === 't4') st.chat = { title: '好物分享群 🔥', sub: '群聊', m1: f.chat.m1, m2: f.chat.m2, m3: f.chat.m3 };
  if (f.tpl === 't8') st.set = { pages: photos.map(photoSrc).map((src, i) => ({ src, cap: ['', '为什么值得买 ✅', '细节实拍 🔍', '怎么下单 👇'][i] })) };
  return st;
}

/* t3: the sale's end as a timestamp. "HH:MM" entered in the edit screen means the next time it is HH:MM
   (later today, or tomorrow if that time has passed). 0 = invalid. */
export function endAtFrom(hhmm, now = Date.now()) {
  const m = /^(\d\d):(\d\d)$/.exec(hhmm || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return 0;
  const d = new Date(now);
  d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
/* time left until flash.endAt (never wraps: an ended sale shows 00:00:00 and is never posted, see publish.js) */
export function countdown(flash, now = Date.now()) {
  const end = (flash && flash.endAt) || endAtFrom(flash && flash.end, now);
  const r = Math.max(0, Math.floor((end - now) / 1000));
  const p = n => String(n).padStart(2, '0');
  return { h: p(Math.floor(r / 3600)), m: p(Math.floor(r / 60) % 60), s: p(r % 60) };
}
export const flashEnded = (flash, now = Date.now()) => !(flash && flash.endAt > now);

/* studio demo values (post-studio-v3.js freshDef) that must never reach a saved poster unless the data says so */
export const STUDIO_DEMO = {
  was: 'RM 29.90', now: 'RM 9.90', rate: '4.9', sold: '已售 12k+', voucherCode: 'LEE10', stockTxt: '只剩最后 37 件',
  l2: '用过都说回不去了',
  cd: { h: '02', m: '47', s: '19' },
  review: '真的好用，已经回购第 3 次了！朋友看到也叫我帮她下单 😆',
  chat: ['姐！上次你说的那个还有货吗？？', '有！！Shopee 促销中 才 RM9.90 😍', '快发我！我也要买 🥳']
};
/* compare the studio's live state (PostStudio.getState()) with the patch built from product data */
export function placeholderProblems(live, patch) {
  const bad = [];
  const same = (k) => live[k] === patch[k];
  for (const k of ['was', 'now', 'rate', 'sold', 'voucherCode', 'stockTxt', 'l2']) {
    if (live[k] === STUDIO_DEMO[k] && !same(k)) bad.push(k + '=' + live[k]);
  }
  if (live.price && !live.now) bad.push('price on without a price');
  if (live.proof && !live.rate) bad.push('proof on without a rating');
  const cd = live.cd || {};
  if (live.tpl === 't3' && cd.h === STUDIO_DEMO.cd.h && cd.m === STUDIO_DEMO.cd.m && cd.s === STUDIO_DEMO.cd.s && JSON.stringify(patch.cd) !== JSON.stringify(live.cd)) bad.push('countdown demo');
  if (live.review && live.review.quote === STUDIO_DEMO.review) bad.push('review demo');
  if (live.tpl === 't5' && !(live.review && live.review.quote && live.review.quote.trim())) bad.push('t5 without a real review');
  if (live.chat && [live.chat.m1, live.chat.m2, live.chat.m3].some(m => STUDIO_DEMO.chat.includes(m))) bad.push('chat demo');
  if (live.tpl === 't4' && !(live.chat && live.chat.m1 && live.chat.m2 && live.chat.m3)) bad.push('t4 without chat lines');
  return bad;
}

/* poster cache key: the studio state the poster is rendered from (countdown time excluded: fixed clock).
   The caption builder's fields (cap) don't change the picture, so a new short link or caption doesn't
   re-render it, except on 好友爆料 (t4), whose chat bubble shows the link. */
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + '_' + s.length; }
export const posterKey = (d, cfg) => {
  const { cap, ...st } = studioState({ ...d, now: 0 }, cfg);
  return hash(JSON.stringify(st.tpl === 't4' ? { ...st, link: cap.link } : st));
};
