/* Template + headline + captions (README Step 2).
   Plain ESM: also served to the review app at /shared/pick.js. */
import { rm, fmtSold, shortName, wasOf, pctOf, rateOf, hasDisc, hasRating, langOf, tagsOf } from './mapping.js';

/* template: first match wins. t3 / t4 / t8 are never chosen automatically. */
export function pickTemplate(p, prev, hasReview) {
  if (p.disc >= 40) return 't2';
  if (p.rating >= 4.8 && p.sales >= 1000 && hasReview) return 't5';
  if (p.sales >= 5000) return 't1';
  return prev === 't1' ? 't6' : 't1';
}

/* headline table: zh and ms have variants A / B per condition, mix has one. A line is short on purpose:
   the poster shrinks a line that doesn't fit down to 75 %, then wraps it */
export const HL = {
  zh: {
    disc: [['把价格\n打下来了！', '现在只要 {now}'], ['直接砍到\n{now}！', '原价 {was}']],
    sales: [['全网都在抢的\n爆款', '{sold} 件'], ['大家都在买的\n这个', '{sold} 件 · ★{rate}']],
    rate: [['评分 {rate} 的\n宝藏好物', '买过的都说值'], ['{rate} 分好评\n闭眼入', '{sold}']],
    base: [['我不允许你\n还不知道这个', '{now} · ★{rate}'], ['这个必须\n分享给你们', '{now} · ★{rate}']]
  },
  ms: {
    disc: [['Harga dah\njatuh teruk!', 'Sekarang {now} je'], ['Turun terus\nke {now}!', 'Harga asal {was}']],
    sales: [['Barang viral\nramai rebut!', '{sold}'], ['Ramai dah\nbeli yang ni', '{sold} · ★{rate}']],
    rate: [['Rating {rate}\nmemang power', 'Pembeli puas hati'], ['Review {rate}★\ntak menyesal', '{sold}']],
    base: [['Korang wajib\ntahu ni!', '{now} · ★{rate}'], ['Yang ni\nwajib share', '{now} · ★{rate}']]
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
  ms: [['Benda ni\nbest gila!', 'Tak beli memang rugi'], ['Kawan pun\nminta link!', 'Bagus, mesti share']],
  mix: []
};

export const hlKind = p => p.disc >= 40 ? 'disc' : p.sales >= 5000 ? 'sales' : p.rating >= 4.8 ? 'rate' : 'base';

export function fill(t, p, lang = 'zh') {
  if (!hasRating(p)) t = t.replace(/ · ★\{rate\}/g, '');
  return t.replace(/\{now\}/g, rm(p.price)).replace(/\{was\}/g, wasOf(p)).replace(/\{pct\}/g, pctOf(p))
    .replace(/\{sold\}/g, fmtSold(p.sales, lang)).replace(/\{rate\}/g, rateOf(p));
}

/* headline for a new draft; rot = {kind: count} so back-to-back posts alternate A / B */
export function headline(p, cfg, rot = {}, lang = langOf(cfg)) {
  const k = hlKind(p), list = HL[lang][k];
  const v = rot[k] || 0; rot[k] = v + 1;
  return list[v % list.length].map(t => fill(t, p, lang));
}

/* data-based suggestions for the edit screen, in the draft's language (f = its form) */
export function suggest(p, used, cfg, f) {
  const lang = langOf(cfg, f), k = hlKind(p), list = [...HL[lang][k]];
  if (k !== 'base') list.push(...HL[lang].base);
  if (used) list.push(...PERSONAL[lang]);
  return list.map(([a, b]) => [fill(a, p, lang), fill(b, p, lang)]);
}

/* caption ① — `d` = {p, form, shortLink}; 我用过 (zh) → same text as the studio's PostStudio.caption().post */
export function cap1(d, cfg = {}) {
  const p = d.p, f = d.form, lang = langOf(cfg, f), ms = lang === 'ms';
  const hook = (f.l1 || '').replace(/\n/g, ms ? ' ' : ''), name = shortName(p.name), now = rm(p.price);
  const code = (cfg.voucherCode || '').trim(), tags = tagsOf(cfg, lang), direct = cfg.linkMode === 'direct';
  const link = d.shortLink || '';
  const L = [hook + '🔥', ''];
  if (f.used) { /* post-studio-v3.js buildMain() */
    L.push(ms ? `"${name}" ni ramai sangat tanya, aku dah cuba dulu, memang tak menghampakan 👍` : `最近超多人问的「${name}」，我先冲了，真的没让我失望 👍`);
    L.push(ms ? `💰 Sekarang ${now} je, harga ni memang berbaloi` : `💰 现在只要 ${now}，这个价格真的离谱`);
    if (code) L.push(ms ? `🎟 Masa checkout jangan lupa masukkan kod【${code}】untuk jimat lagi` : `🎟 结账记得输折扣码【${code}】还能再省`);
    L.push(ms ? '⭐ Review penuh pujian, yang dah guna semua kata berbaloi' : '⭐ 评价区好评刷屏，用过的都说值');
    L.push('');
    L.push(direct ? (ms ? BUY_MS : BUY_ZH) + link : (ms ? '👉 Link pembelian di komen pertama, ambil sendiri! 👇👇' : '👉 购买链接放在第一条评论，自取！👇👇'));
    L.push(ms ? '⏰ Promosi boleh tamat bila-bila masa, nampak terus grab~' : '⏰ 优惠随时结束，看到就是赚到～');
    if (tags) { L.push(''); L.push(tags); }
    return L.join('\n');
  }
  if (ms) {
    const facts = [hasRating(p) ? `rating ${rateOf(p)}` : '', fmtSold(p.sales, 'ms')].filter(Boolean).join(', ');
    L.push(`Jumpa "${name}" ni, ${facts}, tengok review terus nak share dengan korang 👀`);
    L.push(hasDisc(p) ? `💰 Sekarang ${now} (${pctOf(p)})` : `💰 Sekarang ${now}`);
    if (code) L.push(`🎟 Masukkan kod【${code}】masa checkout untuk jimat lagi`);
    L.push(direct ? BUY_MS + link : COMMENT_MS);
  } else {
    const facts = [hasRating(p) ? `评分 ${rateOf(p)}` : '', fmtSold(p.sales)].filter(Boolean).join('、');
    L.push(`发现这个「${name}」，${facts}，看了评价决定分享给你们 👀`);
    L.push(hasDisc(p) ? `💰 现在 ${now}（${pctOf(p)}）` : `💰 现在 ${now}`);
    if (code) L.push(`🎟 结账输入折扣码【${code}】再省`);
    L.push(direct ? BUY_ZH + link : '👉 购买链接放在第一条评论 👇');
  }
  if (tags) { L.push(''); L.push(tags); }
  return L.join('\n');
}
const BUY_ZH = '👉 直接点这里买：', BUY_MS = '👉 Beli terus di sini: ';
export const COMMENT_MS = '👉 Link pembelian di komen pertama 👇';

/* comment ② (empty in direct mode: the link is in ①) */
export function cap2(d, cfg = {}) {
  if (cfg.linkMode === 'direct') return '';
  const p = d.p, code = (cfg.voucherCode || '').trim(), ms = langOf(cfg, d.form) === 'ms';
  const bits = ['💰 ' + rm(p.price)];
  if (code) bits.push((ms ? '🎟 Kod ' : '🎟 折扣码 ') + code);
  return [ms ? `🛒 Link "${shortName(p.name)}" ada di sini 👇` : `🛒 「${shortName(p.name)}」链接在这 👇`, d.shortLink || '', bits.join(ms ? ' | ' : '｜')].join('\n');
}

/* which templates the form unlocks (edit screen) */
export function availability(f, now = Date.now()) {
  return {
    t1: true, t2: true, t6: true,
    t5: !!(f.review && f.review.quote.trim()),
    /* a real end time + progress; once saved, the end must still be ahead (endAt is set by the server) */
    t3: !!(f.flash && f.flash.end && f.flash.pct) && !(f.flash.endAt && f.flash.endAt <= now),
    t4: !!(f.chat && f.chat.m1.trim() && f.chat.m2.trim() && f.chat.m3.trim()),
    t8: (f.photos || []).length === 4
  };
}

/* is this one of the first-person hooks (only allowed with 我用过), in any language? */
export const isPersonal = l1 => Object.values(PERSONAL).some(list => list.some(([a]) => a === l1));

/* replace the old numbers in free text (hand-edited headline / captions) with the new ones */
export function swapNumbers(text, o, n) {
  if (!text) return text;
  const pairs = [[rm(o.price), rm(n.price)], [wasOf(o), wasOf(n)], [pctOf(o), pctOf(n)], ...['zh', 'ms', 'mix'].map(l => [fmtSold(o.sales, l), fmtSold(n.sales, l)])];
  const ro = rateOf(o), rn = rateOf(n);
  if (ro && rn) pairs.push(['★' + ro, '★' + rn], [ro + '★', rn + '★'], ['评分 ' + ro, '评分 ' + rn], [ro + ' 分', rn + ' 分'], ['rating ' + ro, 'rating ' + rn], ['Rating ' + ro, 'Rating ' + rn]);
  /* one pass: a number swapped in is never swapped again (RM 10 → RM 20 while the old 原价 was RM 20) */
  const map = new Map(pairs.filter(([a, b]) => a && b && a !== b));
  if (!map.size) return text;
  const keys = [...map.keys()].sort((x, y) => y.length - x.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp(keys.join('|'), 'g'), m => map.get(m));
}

/* product data changed (pre-post price check): a headline built from the data is rebuilt from the new data
   (the new data's own condition if that changed); a hand-written one gets its numbers swapped */
export function refreshHeadline(f, o, n, cfg) {
  const lang = langOf(cfg, f);
  if (isPersonal(f.l1)) return { l1: f.l1, l2: f.l2 };
  for (const [k, list] of Object.entries(HL[lang])) {
    for (const v of list) {
      if (fill(v[0], o, lang) !== f.l1 || fill(v[1], o, lang) !== f.l2) continue;
      const nk = hlKind(n), use = nk === k ? v : HL[lang][nk][0];
      return { l1: fill(use[0], n, lang), l2: fill(use[1], n, lang) };
    }
  }
  return { l1: swapNumbers(f.l1, o, n), l2: swapNumbers(f.l2, o, n) };
}

/* what goes to Facebook: caption ① and comment ②, always carrying the affiliate link
   (in the caption in direct mode, in the first comment otherwise), whatever mode the captions were written in */
export function postTexts(d, cfg = {}) {
  const direct = cfg.linkMode === 'direct', link = d.shortLink || '';
  let message = d.form.cap1 || cap1(d, cfg);
  let comment = direct ? null : (d.form.cap2 || cap2(d, cfg));
  if (link && direct && !message.includes(link)) {
    const buy = (langOf(cfg, d.form) === 'ms' ? BUY_MS : BUY_ZH) + link;
    const said = ['👉 购买链接放在第一条评论，自取！👇👇', '👉 购买链接放在第一条评论 👇', '👉 Link pembelian di komen pertama, ambil sendiri! 👇👇', COMMENT_MS].find(t => message.includes(t));
    message = said ? message.split(said).join(buy) : `${message}\n\n${buy}`;
  }
  if (link && !direct && !comment.includes(link)) comment = `${comment}\n${link}`;
  return { message, comment };
}

/* recompute auto-written captions unless edited by hand */
export function refreshCaptions(d, cfg) {
  const f = d.form;
  if (!f.cap1Manual) f.cap1 = cap1(d, cfg);
  if (!f.cap2Manual) f.cap2 = cap2(d, cfg);
  return f;
}
