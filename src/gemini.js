/* ✨ AI 写文案 (optional, GEMINI_API_KEY): Gemini writes caption ① and comment ② from the draft's own data.
   The link is never left to the model: it writes {link} and the real affiliate link goes in here. */
import { env } from './config.js';
import { kv, dayStr } from './db.js';
import { rm, shortName, wasOf, pctOf, rateOf, fmtSold, hasDisc, hasRating, langOf, tagsOf, contrast, darkHex } from './mapping.js';
import { COMMENT_MS } from './pick.js';

export const enabled = () => !!env.GEMINI_API_KEY;
const LINK = '{link}';

export function prompt(d, cfg) {
  const p = d.p, f = d.form, direct = cfg.linkMode === 'direct', code = (cfg.voucherCode || '').trim(), ms = langOf(cfg, f) === 'ms';
  const facts = [
    `商品：${shortName(p.name)}（完整名称：${p.name}）`,
    `现价：${rm(p.price)}`,
    hasDisc(p) ? `原价：${wasOf(p)}（${pctOf(p)}）` : '',
    hasRating(p) ? `评分：${rateOf(p)} / 5` : '',
    p.sales ? fmtSold(p.sales) : '',
    code ? `折扣码：${code}` : '',
    f.l1 ? `海报标题：${f.l1.replace(/\n/g, ' ')}` : ''
  ].filter(Boolean).join('\n');
  return `你在帮一个马来西亚的 Facebook 专页写 Shopee 好物分享帖的文案。
语气：像朋友真心分享一个好东西，轻松、亲切、自然，可以用几个 emoji，不要硬销，不要夸张。
只能用下面的资料，不要编造功能、材质、尺寸、效果、买家评价或别的优惠。${f.used ? '专页主人用过这个商品，可以用第一人称说用过。' : '专页主人没说自己用过：不要写「我用过」「我买了」「亲测」之类的话。'}

${facts}

${ms ? '用马来文写两段（Bahasa Melayu，马来西亚 Facebook 上轻松自然的口语，可以夹一点常用英文，不要用中文）' : '用简体中文写两段'}：
1. post：帖子正文，4 到 7 行。第一句要吸引人，正文里提到价格${code ? '和折扣码' : ''}。${direct ? `要有一行放购买链接，链接只写 ${LINK}（会自动换成真的链接）。` : `最后一行写「${ms ? COMMENT_MS : '👉 购买链接放在第一条评论 👇'}」。`}不要写任何网址，不要写 hashtag。
2. comment：第一条评论。${direct ? '写空字符串。' : `1 到 3 行短句，里面放购买链接，链接只写 ${LINK}。`}`;
}

export async function captions(d, cfg, fetchImpl = fetch) {
  if (!enabled()) throw new Error('还没设置 GEMINI_API_KEY（在 Google AI Studio 免费申请）');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt(d, cfg) }] }],
    generationConfig: {
      temperature: 1, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { post: { type: 'STRING' }, comment: { type: 'STRING' } }, required: ['post', 'comment'] }
    }
  };
  const out = await ask(body, fetchImpl, 'caption');
  /* any address the model wrote anyway is dropped; {link} becomes the real affiliate link */
  const clean = s => String(s || '').replace(/https?:\/\/\S+/g, '').split(LINK).join(d.shortLink || '').replace(/[ \t]+\n/g, '\n').trim().slice(0, 1800);
  let post = clean(out.post);
  const comment = cfg.linkMode === 'direct' ? '' : clean(out.comment);
  if (!post) throw new Error('Gemini 没有写出文案，再试一次');
  const tags = tagsOf(cfg, langOf(cfg, d.form));
  if (tags) post += '\n\n' + tags;
  return { cap1: post, cap2: comment };
}

/* one JSON answer from Gemini, with errors in plain words */
/* usage, counted here (an API key can't read its own quota from Google): per day (Malaysia time), the last minute,
   tokens, and the last limit Google reported */
function count(kind, { ok = false, limited = null, tokens = 0, model: real = '' } = {}) {
  /* real: the model that answered (an alias like gemini-flash-latest resolves to e.g. gemini-3.8-flash); m: the one asked */
  const k = 'gemini:' + dayStr(), u = kv.get(k, { req: 0, ok: 0, limited: 0, tokens: 0, kinds: {} }), m = model();
  u.models = { ...(u.models || {}), [m]: ((u.models || {})[m] || 0) + 1 };
  u.req++; if (ok) u.ok++; if (limited) u.limited++; u.tokens += tokens; u.kinds[kind] = (u.kinds[kind] || 0) + 1;
  kv.set(k, u);
  const now = Date.now();
  kv.set('gemini:recent', [...kv.get('gemini:recent', []).filter(t => t > now - 60e3), now]);
  if (real && real !== m) kv.set('gemini:alias', { ...kv.get('gemini:alias', {}), [m]: real });
  if (limited) kv.set('gemini:lastLimit', { at: now, model: m, ...limited });
  /* a 429 says what the limit is: remember it for this model */
  if (limited && limited.value && limited.scope) setLimits(m, { ...(limits()[m] || {}), [limited.scope === 'day' ? 'rpd' : 'rpm']: limited.value });
}
export function usage(now = Date.now()) {
  return { on: enabled(), model: model(), alias: kv.get('gemini:alias', {}), limits: limits(), today: kv.get('gemini:' + dayStr(now), { req: 0, ok: 0, limited: 0, tokens: 0, kinds: {} }),
    lastMinute: kv.get('gemini:recent', []).filter(t => t > now - 60e3).length, lastLimit: kv.get('gemini:lastLimit') };
}
/* Google's 429 → which limit (per minute / per day) and how long to wait */
export function limitOf(j) {
  const det = (j && j.error && j.error.details) || [], ids = det.flatMap(d => (d.violations || []).map(v => v.quotaId || ''));
  const retry = det.map(d => d.retryDelay).find(Boolean), s = retry ? Math.ceil(parseFloat(retry)) : 0;
  const value = +(det.flatMap(d => (d.violations || []).map(v => v.quotaValue)).find(Boolean) || 0) || 0;
  return { value, scope: ids.some(x => /PerDay/i.test(x)) ? 'day' : ids.some(x => /PerMinute/i.test(x)) ? 'minute' : '', retryS: s || 0 };
}

export const opts = { busyWaitMs: [2000, 6000] }; // waits before retrying an overloaded model (tests set them to 0)
async function ask(body, fetchImpl = fetch, kind = 'other') {
  let res, j;
  /* 500 / 503 "high demand" is Google's side and usually passes in seconds: try again twice before giving up */
  for (let i = 0; ; i++) {
    try {
      res = await fetchImpl(`${env.GEMINI_BASE}/v1beta/models/${encodeURIComponent(model())}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
      });
    } catch (e) { throw new Error('连不上 Gemini：' + e.message); }
    j = await res.json().catch(() => ({}));
    if (!(res.status === 503 || res.status === 500) || i >= opts.busyWaitMs.length) break;
    count(kind);
    await new Promise(r => setTimeout(r, opts.busyWaitMs[i]));
  }
  if (res.status === 503 || res.status === 500) {
    count(kind);
    throw new Error(`Gemini 的 ${model()} 现在太忙（Google 那边的高峰，通常几分钟就好）。等一下再试，或在「数据」换一个模型。`);
  }
  if (res.status === 429) {
    const lim = limitOf(j);
    count(kind, { limited: lim });
    throw Object.assign(new Error(lim.scope === 'day' ? '今天的 Gemini 免费次数用完了（每天马来西亚时间下午 3–4 点重置）'
      : `Gemini 每分钟的免费次数到上限了，${lim.retryS || 60} 秒后再试`), { retryMs: lim.scope === 'day' ? 0 : (lim.retryS || 60) * 1000 });
  }
  if (!res.ok) { count(kind); throw new Error('Gemini 出错：' + ((j.error && j.error.message) || 'HTTP ' + res.status)); }
  count(kind, { ok: true, tokens: (j.usageMetadata && j.usageMetadata.totalTokenCount) || 0, model: j.modelVersion || '' });
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  let out;
  try { out = JSON.parse(parts.map(x => x.text || '').join('')); } catch { throw new Error('Gemini 没有写出结果，再试一次'); }
  return out;
}

/* ---------- ✨ AI 设计海报: Gemini picks each post's look, the app draws it (real photo, exact price) ----------
   The answer only fills fields the poster engine already has (form.look + template); colours that would be hard
   to read are replaced before anything is saved. */
export const FONTS = {
  rounded: '"Noto Sans SC","Nunito"', cute: '"Baloo 2","Noto Sans SC"', handwritten: '"Ma Shan Zheng","Noto Sans SC"',
  modern: '"Montserrat","Noto Sans SC"', bold: '"Anton","Noto Sans SC"'
};
const HEX = /^#[0-9a-f]{6}$/i;

export function designPrompt(d) {
  const p = d.p;
  return `你是 Facebook 好物分享帖的海报设计师。海报 1080×1080：上半部是商品照片（附上了，不会被文字盖住），下半部是一个纯色面板，放标题、价格和按钮。
请看照片和商品资料，为这一帖设计独特又好看的配色和风格，要配合商品和照片的颜色，不要每次都用红色。
商品：${p.name}
现价：${rm(p.price)}${hasDisc(p) ? `（原价 ${wasOf(p)}，${pctOf(p)}）` : ''}
海报标题：${(d.form.l1 || '').replace(/\n/g, ' ')} / ${d.form.l2 || ''}

要选的：
- tpl：t1「爆款分享」标题在左、价格贴纸在右，适合大部分商品；t2「价格暴击」超大价格，适合折扣大的；t6「杂志封面」大标题，有质感
- panel：面板底色（#rrggbb）
- accent：强调色，用在价格、按钮和折扣贴纸，上面是白色字，要够深
- c1：主标题颜色，c2：副标题颜色，都要在 panel 上清楚好读
- font：rounded 圆润 / cute 可爱 / handwritten 手写 / modern 现代 / bold 粗体
- align：left 或 center
- marker：主标题要不要荧光笔底色，markerColor：荧光笔颜色
- why：一句话（简体中文，20 字以内）说明这个设计的想法`;
}

export { contrast };

/* the model's answer → { tpl, look, why }, every value checked; unreadable colours replaced */
export function cleanDesign(o) {
  o = o && typeof o === 'object' ? o : {};
  const look = {}, panel = HEX.test(o.panel) ? o.panel.toLowerCase() : '';
  const ink = panel && darkHex(panel) ? '#ffffff' : '#1c1c1e'; // the same rule as the poster's bar text (mapping.js)
  if (panel) look.panel = panel;
  if (HEX.test(o.accent) && contrast(o.accent, '#ffffff') >= 3) look.accent = o.accent.toLowerCase();
  const bg = panel || '#ffffff';
  look.c1 = HEX.test(o.c1) && contrast(o.c1, bg) >= 3 ? o.c1.toLowerCase() : (look.accent && contrast(look.accent, bg) >= 3 ? look.accent : ink);
  look.c2 = HEX.test(o.c2) && contrast(o.c2, bg) >= 3 ? o.c2.toLowerCase() : ink;
  if (FONTS[o.font]) look.font = FONTS[o.font];
  if (o.align === 'left' || o.align === 'center') look.align = o.align;
  look.hl = !!o.marker && HEX.test(o.markerColor);
  if (look.hl) look.hlc = o.markerColor.toLowerCase();
  return { tpl: ['t1', 't2', 't6'].includes(o.tpl) ? o.tpl : 't1', look, why: String(o.why || '').slice(0, 40) };
}

export async function design(d, photo, fetchImpl = fetch) {
  if (!enabled()) throw new Error('还没设置 GEMINI_API_KEY（在 Google AI Studio 免费申请）');
  const parts = [{ text: designPrompt(d) }];
  if (photo) parts.push({ inline_data: { mime_type: photo.type, data: photo.buf.toString('base64') } });
  const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 1, responseMimeType: 'application/json', responseSchema: ITEM } };
  return cleanDesign(await ask(body, fetchImpl, 'design'));
}
const S = { type: 'STRING' };
const ITEM = { type: 'OBJECT', required: ['tpl', 'panel', 'accent', 'c1', 'c2', 'font', 'align', 'marker', 'why'], properties: {
  tpl: { type: 'STRING', enum: ['t1', 't2', 't6'] }, panel: S, accent: S, c1: S, c2: S,
  font: { type: 'STRING', enum: Object.keys(FONTS) }, align: { type: 'STRING', enum: ['left', 'center'] },
  marker: { type: 'BOOLEAN' }, markerColor: S, why: S } };

/* the AI 设计 page: 4 designs to choose from, deliberately different from each other */
export async function designs(d, photo, fetchImpl = fetch) {
  if (!enabled()) throw new Error('还没设置 GEMINI_API_KEY（在 Google AI Studio 免费申请）');
  const parts = [{ text: designPrompt(d) + '\n\n请给出 4 款风格明显不同的设计（配色、字体、模板都要有变化，至少用到 2 种模板，其中一款用深色面板），放在 designs 里。' }];
  if (photo) parts.push({ inline_data: { mime_type: photo.type, data: photo.buf.toString('base64') } });
  const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 1, responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT', required: ['designs'], properties: { designs: { type: 'ARRAY', items: ITEM } } } } };
  const out = await ask(body, fetchImpl, 'designs');
  const list = (Array.isArray(out.designs) ? out.designs : []).slice(0, 4).map(cleanDesign);
  if (!list.length) throw new Error('Gemini 没有给出设计，再试一次');
  return list;
}

/* ---------- 贴士 / 梗图: 4 ideas for a post that isn't a product ---------- */
const IDEA = {
  tip: { type: 'OBJECT', required: ['title', 'points', 'caption'], properties: { title: S, points: { type: 'ARRAY', items: S }, caption: S } },
  meme: { type: 'OBJECT', required: ['top', 'bottom', 'e1', 'e2', 'caption'], properties: { top: S, bottom: S, e1: S, e2: S, caption: S } }
};
export function ideasPrompt(kind, lang, now = Date.now(), recent = []) {
  const ms = lang === 'ms';
  const what = kind === 'meme'
    ? `4 个两行的文字梗图（不用图片）：top 是「情况」（20 字以内），bottom 是「反应 / 结果」（20 字以内），e1 / e2 各一个配合的 emoji。
笑点要来自大家都懂的日常：塞车、天气热、下大雨、发薪日前、月底、打包食物、mamak、Grab、Shopee 半夜刷、双11 / 12.12 大促、开斋节或新年回乡、学校假期、老板的 WhatsApp。轻松好笑，不要嘲笑任何群体。`
    : `4 个实用的生活小贴士：title 是标题（16 字以内），points 是 3 到 4 条具体的做法（每条 30 字以内），要真的能马上用。
题目选马来西亚人日常最关心的：省钱、省电费 / 水费、天气热或雨季怎么办、塞车和通勤、网购防骗、食物保存、家里清洁、小孩上学、健康小习惯（只说常识，不做医疗建议）。`;
  return `你在帮一个马来西亚的 Facebook 专页（平时分享 Shopee 好物）写不卖东西的日常帖子，让粉丝觉得有用或好笑、愿意分享。
今天是 ${dayStr(now)}，可以配合这个时候的季节、节日或大促，但不确定的事就不要提。
写 ${what}
caption：帖子正文，2 到 4 行，自然亲切，可以用 emoji，最后可以问粉丝一个简单的问题，不要 hashtag，不要网址，不要卖东西。
规则：不碰宗教、种族、皇室和政治（3R）；不编造数字、价格、统计、新闻、政府政策或优惠；不确定的不写。
${ms ? '全部用马来文写（Bahasa Melayu，马来西亚 Facebook 上轻松自然的口语，可以夹一点常用英文，不要用中文）。' : '全部用简体中文写（马来西亚华人的口吻）。'}
4 个点子的题目要不一样，放在 ideas 里。${recent.length ? `
最近已经写过下面这些，不要重复同样的题目或笑点：\n${recent.map(t => '- ' + t).join('\n')}` : ''}`;
}
export async function contentIdeas(kind, lang, fetchImpl = fetch, recent = []) {
  if (!enabled()) throw new Error('还没设置 GEMINI_API_KEY（在 Google AI Studio 免费申请）');
  const body = { contents: [{ role: 'user', parts: [{ text: ideasPrompt(kind, lang, Date.now(), recent) }] }], generationConfig: { temperature: 1, responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT', required: ['ideas'], properties: { ideas: { type: 'ARRAY', items: IDEA[kind] } } } } };
  const out = await ask(body, fetchImpl, kind);
  /* any address the model wrote anyway is dropped */
  const list = (Array.isArray(out.ideas) ? out.ideas : []).slice(0, 4).filter(o => o && typeof o === 'object')
    .map(o => ({ ...o, caption: String(o.caption || '').replace(/https?:\/\/\S+/g, '').trim() }));
  if (!list.length) throw new Error('Gemini 没有给出点子，再试一次');
  return list;
}

/* ---------- which model, and its limits (chosen on 数据; Google shows free-tier limits only in AI Studio) ---------- */
export const model = () => kv.get('gemini:choice') || env.GEMINI_MODEL;
/* limits typed in on 数据 or learned from a 429; 3.8 Flash from AI Studio on 2026-10-17 */
export const limits = () => kv.get('gemini:limits', { 'gemini-3.8-flash': { rpm: 5, tpm: 250000, rpd: 20 } });
export function setLimits(id, l) {
  if (typeof id !== 'string' || !/^[\w.-]{1,80}$/.test(id)) throw new Error('模型名不对');
  const all = limits(), v = {};
  for (const k of ['rpm', 'tpm', 'rpd']) { const n = l && l[k]; if (n !== '' && n != null) { if (!(Number.isInteger(+n) && +n > 0 && +n < 1e9)) throw new Error('限额要填正整数'); v[k] = +n; } }
  all[id] = v;
  kv.set('gemini:limits', all);
  return v;
}
/* text models this key can call (no image / speech / live / embedding ones), cached for a day */
const NOT_TEXT = /image|imagen|banana|tts|audio|live|transcribe|embed|veo|lyria|omni|research|customtools|computer-use|robotics|aqa|gemma|learnlm/i;
export async function listModels(fetchImpl = fetch, now = Date.now()) {
  const c = kv.get('gemini:models');
  if (c && c.at > now - 86400e3 && c.ids.length) return c.ids;
  if (!enabled()) return [];
  const res = await fetchImpl(`${env.GEMINI_BASE}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('读不到模型列表：' + ((j.error && j.error.message) || 'HTTP ' + res.status));
  const ids = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name).replace(/^models\//, '')).filter(id => /^gemini-/.test(id) && !NOT_TEXT.test(id)).sort();
  kv.set('gemini:models', { at: now, ids });
  return ids;
}
export async function choose(id, fetchImpl = fetch) {
  const ids = await listModels(fetchImpl);
  if (!(ids.includes(id) || id === env.GEMINI_MODEL)) throw new Error('这个模型用不了：' + id);
  if (id === env.GEMINI_MODEL) kv.del('gemini:choice'); else kv.set('gemini:choice', id);
  return model();
}
