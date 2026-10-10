/* Template + headline + captions (README Step 2).
   Plain ESM: also served to the review app at /shared/pick.js. */
import { rm, fmtSold, shortName, wasOf, pctOf, rateOf, hasDisc, hasRating } from './mapping.js';

/* template: first match wins. t3 / t4 / t8 are never chosen automatically. */
export function pickTemplate(p, prev, hasReview) {
  if (p.disc >= 40) return 't2';
  if (p.rating >= 4.8 && p.sales >= 1000 && hasReview) return 't5';
  if (p.sales >= 5000) return 't1';
  return prev === 't1' ? 't6' : 't1';
}

/* headline table: zh has variants A / B per condition, mix has one */
export const HL = {
  zh: {
    disc: [['把价格\n打下来了！', '现在只要 {now}'], ['直接砍到\n{now}！', '原价 {was}']],
    sales: [['全网都在抢的\n爆款', '{sold} 件'], ['大家都在买的\n这个', '{sold} 件 · ★{rate}']],
    rate: [['评分 {rate} 的\n宝藏好物', '买过的都说值'], ['{rate} 分好评\n闭眼入', '{sold}']],
    base: [['我不允许你\n还不知道这个', '{now} · ★{rate}'], ['这个必须\n分享给你们', '{now} · ★{rate}']]
  },
  mix: {
    disc: [['{now} ONLY!!\n不冲对不起自己', '{pct} OFF']],
    sales: [['Viral 爆款\n大家都在买', '{sold}']],
    rate: [['{rate}★ 宝藏好物\n被我挖到', 'Reviews 超好']],
    base: [['OMG 这个必须\n分享给你们！', '{now} · ★{rate}']]
  }
};
/* first-person hooks: only on drafts marked 我用过 */
export const PERSONAL = {
  zh: [['这玩意儿也太\n好用了吧？！', '不买真的亏'], ['闺蜜看到我用\n马上叫我发链接', '好东西 一传十十传百']],
  mix: []
};

const langOf = cfg => (cfg && cfg.language === 'mix') ? 'mix' : 'zh';
export const hlKind = p => p.disc >= 40 ? 'disc' : p.sales >= 5000 ? 'sales' : p.rating >= 4.8 ? 'rate' : 'base';

export function fill(t, p, lang = 'zh') {
  if (!hasRating(p)) t = t.replace(/ · ★\{rate\}/g, '');
  return t.replace(/\{now\}/g, rm(p.price)).replace(/\{was\}/g, wasOf(p)).replace(/\{pct\}/g, pctOf(p))
    .replace(/\{sold\}/g, fmtSold(p.sales, lang)).replace(/\{rate\}/g, rateOf(p));
}

/* headline for a new draft; rot = {kind: count} so back-to-back posts alternate A / B */
export function headline(p, cfg, rot = {}) {
  const lang = langOf(cfg), k = hlKind(p), list = HL[lang][k];
  const v = rot[k] || 0; rot[k] = v + 1;
  return list[v % list.length].map(t => fill(t, p, lang));
}

/* data-based suggestions for the edit screen */
export function suggest(p, used, cfg) {
  const lang = langOf(cfg), k = hlKind(p), list = [...HL[lang][k]];
  if (k !== 'base') list.push(...HL[lang].base);
  if (used) list.push(...PERSONAL[lang]);
  return list.map(([a, b]) => [fill(a, p, lang), fill(b, p, lang)]);
}

/* caption ① — `d` = {p, form, shortLink}; 我用过 → same text as the studio's PostStudio.caption().post */
export function cap1(d, cfg = {}) {
  const p = d.p, f = d.form, hook = (f.l1 || '').replace(/\n/g, ''), name = shortName(p.name), now = rm(p.price);
  const code = (cfg.voucherCode || '').trim(), tags = cfg.hashtags || '', direct = cfg.linkMode === 'direct';
  const link = d.shortLink || '';
  const L = [hook + '🔥', ''];
  if (f.used) { /* post-studio-v3.js buildMain() */
    L.push(`最近超多人问的「${name}」，我先冲了，真的没让我失望 👍`);
    L.push(`💰 现在只要 ${now}，这个价格真的离谱`);
    if (code) L.push(`🎟 结账记得输折扣码【${code}】还能再省`);
    L.push('⭐ 评价区好评刷屏，用过的都说值');
    L.push('');
    L.push(direct ? '👉 直接点这里买：' + link : '👉 购买链接放在第一条评论，自取！👇👇');
    L.push('⏰ 优惠随时结束，看到就是赚到～');
    if (tags) { L.push(''); L.push(tags); }
    return L.join('\n');
  }
  const facts = [hasRating(p) ? `评分 ${rateOf(p)}` : '', fmtSold(p.sales)].filter(Boolean).join('、');
  L.push(`发现这个「${name}」，${facts}，看了评价决定分享给你们 👀`);
  L.push(hasDisc(p) ? `💰 现在 ${now}（${pctOf(p)}）` : `💰 现在 ${now}`);
  if (code) L.push(`🎟 结账输入折扣码【${code}】再省`);
  L.push(direct ? '👉 直接点这里买：' + link : '👉 购买链接放在第一条评论 👇');
  if (tags) { L.push(''); L.push(tags); }
  return L.join('\n');
}

/* comment ② (empty in direct mode: the link is in ①) */
export function cap2(d, cfg = {}) {
  if (cfg.linkMode === 'direct') return '';
  const p = d.p, code = (cfg.voucherCode || '').trim();
  const bits = ['💰 ' + rm(p.price)];
  if (code) bits.push('🎟 折扣码 ' + code);
  return [`🛒 「${shortName(p.name)}」链接在这 👇`, d.shortLink || '', bits.join('｜')].join('\n');
}

/* which templates the form unlocks (edit screen) */
export function availability(f) {
  return {
    t1: true, t2: true, t6: true,
    t5: !!(f.review && f.review.quote.trim()),
    t3: !!(f.flash && f.flash.end && f.flash.pct),
    t4: !!(f.chat && f.chat.m1.trim() && f.chat.m2.trim() && f.chat.m3.trim()),
    t8: (f.photos || []).length === 4
  };
}

/* recompute auto-written captions unless edited by hand */
export function refreshCaptions(d, cfg) {
  const f = d.form;
  if (!f.cap1Manual) f.cap1 = cap1(d, cfg);
  if (!f.cap2Manual) f.cap2 = cap2(d, cfg);
  return f;
}
