/* Collector: categories × strategies → filters → drafts (README Step 1). `npm run collect` */
import { pathToFileURL } from 'node:url';
import { loadConfig, env } from './config.js';
import { drafts, kv, newDraftId, dayStr, ymd } from './db.js';
import * as shopee from './shopee.js';
import { productFromOffer, STRAT_CODE } from './mapping.js';
import { newForm } from './draft.js';

export const STRATEGY_ORDER = ['topSellers', 'highestCommission', 'biggestDiscount'];

async function fetchList(cat, sortType, log) {
  const base = cat.productCatId ? { productCatId: cat.productCatId } : { keyword: cat.keyword || cat.name };
  const out = [];
  for (let page = 1; page <= 2; page++) {
    const r = await shopee.offers({ ...base, sortType, page, limit: 50 });
    out.push(...r.nodes);
    if (!r.hasNextPage) break;
  }
  log(`  ${cat.name}: sortType ${sortType} → ${out.length}`);
  return out;
}

/* round-robin merge so each category gets a turn */
const interleave = lists => { const out = []; for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]); return out; };

export function makeFilter(cfg, today) {
  const f = cfg.filters, ex = (f.excludeKeywords || []).map(s => String(s).toLowerCase()).filter(Boolean);
  const shops = drafts.shopsOnDay(today);
  const reasons = {};
  const no = r => { reasons[r] = (reasons[r] || 0) + 1; return false; };
  const ok = p => {
    if (!(p.rating >= f.minRating)) return no('rating');
    if (!(p.sales >= f.minSales)) return no('sales');
    if (!p.imageUrl) return no('image');
    if (!(p.price > 0)) return no('price');
    const name = p.name.toLowerCase();
    if (ex.some(k => name.includes(k))) return no('keyword');
    if (drafts.postedWithin(p.itemId, cfg.noRepeatDays)) return no('posted');
    if (drafts.queuedItem(p.itemId)) return no('queued');
    if (shops.has(p.shopId)) return no('shop');
    return true;
  };
  return { ok, shops, reasons };
}

export async function collect({ log = console.log } = {}) {
  const cfg = loadConfig();
  if (!cfg.categories || !cfg.categories.length) {
    throw new Error('config.json "categories" is empty. Add e.g. [{"name":"Home & Living","productCatId":null}] and run again.');
  }
  const today = dayStr(), stamp = ymd();
  log(`collect ${today}${env.SHOPEE_MOCK ? ' (SHOPEE_MOCK)' : ''}`);

  const top = [], com = [];
  for (const cat of cfg.categories) {
    if (!cat.productCatId) log(`  ${cat.name}: no productCatId, searching by keyword "${cat.keyword || cat.name}"`);
    top.push((await fetchList(cat, shopee.SORT.SALES_DESC, log)).map(productFromOffer));
    com.push((await fetchList(cat, shopee.SORT.COMMISSION_DESC, log)).map(productFromOffer));
  }
  const lists = {
    topSellers: interleave(top),
    highestCommission: interleave(com),
    /* the API has no discount sort: rank the pooled 爆卖 + 高佣 candidates by priceDiscountRate */
    biggestDiscount: [...new Map(interleave([...top, ...com]).map(p => [p.itemId, p])).values()]
      .filter(p => p.disc > 0).sort((a, b) => b.disc - a.disc)
  };

  const { ok, shops, reasons } = makeFilter(cfg, today);
  const taken = new Set(), picks = [];
  for (const key of STRATEGY_ORDER) {
    const s = cfg.strategies[key];
    if (!s || !s.enabled) continue;
    let n = 0;
    for (const p of lists[key]) {
      if (n >= (s.perDay || 0)) break;
      if (taken.has(p.itemId) || !ok(p)) continue;
      taken.add(p.itemId); shops.add(p.shopId);
      picks.push({ p, strat: STRAT_CODE[key] }); n++;
    }
    log(`  ${key}: ${n}/${s.perDay}`);
  }

  const created = [];
  const pickState = kv.get('pickState', { prev: null, rot: {} });
  for (const { p, strat } of picks) {
    const id = newDraftId();
    try {
      p.img = await shopee.downloadImage(p.imageUrl, p.itemId);
      if (env.SHOPEE_MOCK) p.mock = true;
      const form = newForm({ p, strat }, cfg, pickState);
      const subIds = shopee.cleanSubIds(['fb', form.tpl, strat, stamp, id]);
      const shortLink = await shopee.shortLink(p.productLink || p.offerLink, subIds);
      const d = { id, itemId: p.itemId, shopId: p.shopId, strat, p, form, shortLink, subIds, collectedDay: today };
      drafts.insert(d);
      created.push(d);
      log(`  + ${id} ${strat} ${form.tpl} ${p.name.slice(0, 40)} · RM ${p.price} · -${p.disc}% · ★${p.rating} · ${p.sales} sold`);
    } catch (e) {
      log(`  ! ${p.itemId} skipped: ${e.message}`);
    }
  }
  kv.set('pickState', pickState);
  const summary = { at: Date.now(), day: today, created: created.length, ids: created.map(d => d.id), filtered: reasons };
  kv.set('lastCollect', summary);
  log(`done: ${created.length} drafts · filtered out ${JSON.stringify(reasons)}`);
  return { ...summary, drafts: created };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  collect().then(async r => {
    if (process.argv.includes('--render') && r.drafts.length) {
      const { renderDraft, closeBrowser } = await import('./render.js');
      for (const d of r.drafts) { await renderDraft(d.id); console.log('  rendered', d.id); }
      await closeBrowser();
    }
    process.exit(0);
  }, e => { console.error('collect failed:', e.message); process.exit(1); });
}
