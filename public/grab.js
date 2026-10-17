/* Shopee import bookmark: runs on a Shopee product page in the person's own browser (new.js turns it into a
   javascript: bookmark) and opens 手动添加 with what the page shows. Self-contained: only APP comes from outside.
   shortcut: reads the page by its visible text and JSON-LD, not Shopee's class names; a Shopee redesign can
   blank some fields (they stay editable in the form), upgrade to the Open API once access is granted. */
export function grab(APP) {
  if (!/(^|\.)shopee\.com\.my$/.test(location.hostname)) { alert('请在 Shopee 商品页上点这个书签'); return; }
  const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? m[0] : ''; };
  const top = el => el.getBoundingClientRect().top + scrollY < 1600; // the product's own block; recommendations come further down
  const out = { name: '', price: '', was: '', rating: '', sales: '', url: location.origin + location.pathname, images: [] };
  const seen = new Set();
  const img = u => {
    const m = String(u || '').match(/https:\/\/[^"'()\s]*susercontent\.com\/file\/([\w-]+)/);
    if (!m) return;
    const id = m[1].replace(/_tn$/, ''); // _tn = thumbnail; without it Shopee serves the full photo
    if (seen.has(id) || out.images.length >= 12) return;
    seen.add(id); out.images.push(m[0].slice(0, m[0].length - m[1].length) + id);
  };

  /* structured data Shopee puts in the page for search engines */
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let list; try { list = [].concat(JSON.parse(s.textContent)); } catch (e) { continue; }
    for (const j of list) {
      if (!j || j['@type'] !== 'Product') continue;
      out.name = j.name || out.name;
      const o = [].concat(j.offers || [])[0] || {};
      out.price = num(o.price || o.lowPrice) || out.price;
      if (j.aggregateRating) out.rating = num(j.aggregateRating.ratingValue);
      [].concat(j.image || []).forEach(img);
    }
  }
  if (!out.name) out.name = (document.querySelector('meta[property="og:title"]') || {}).content || document.title.replace(/\s*\|.*$/, '');

  /* prices on screen: the largest price is the price, a struck-through one the original price. Shopee may write
     "RM12.90" in one box, "RM" and "12.90" in two, or draw "RM" with CSS (::before), so a bare "12.90" counts
     when "RM" is next to it in any of those ways */
  const AMT = /^(RM\s?)?\d[\d,]*(\.\d{1,2})?(\s*-\s*(RM\s?)?\d[\d,]*(\.\d{1,2})?)?$/;
  const said = el => el.textContent.replace(/\s+/g, ' ').trim();
  const pseudo = el => ['::before', '::after'].map(w => getComputedStyle(el, w).content).join(' ');
  const hasRM = (el, t) => /^RM/.test(t) || /RM/.test(pseudo(el)) || (el.parentElement && /^RM/.test(said(el.parentElement))) ||
    (el.previousElementSibling && /RM\s*$/.test(said(el.previousElementSibling)) || /RM/.test(pseudo(el.previousElementSibling || el)));
  let big = 0;
  for (const el of document.querySelectorAll('body *')) {
    const t = said(el);
    if (!t || t.length > 30 || !AMT.test(t) || !/\d/.test(t) || [...el.children].some(c => AMT.test(said(c)) && /\d/.test(said(c)))) continue;
    if (!el.getBoundingClientRect().width || !top(el) || !hasRM(el, t)) continue;
    const struck = [el, el.parentElement, ...el.querySelectorAll('*')].some(n => n && /line-through/.test(getComputedStyle(n).textDecorationLine));
    const size = Math.max(...[el, ...el.querySelectorAll('*')].map(n => parseFloat(getComputedStyle(n).fontSize) || 0));
    if (struck) { if (!out.was) out.was = num(t); }
    else if (size > big) { big = size; out.price = num(t); }
  }
  /* last resorts: price tags in the page's head, then the first "RM…" written anywhere near the top */
  if (!out.price) out.price = num((document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"]') || {}).content);
  if (!out.price) { const m = document.body.innerText.slice(0, 3000).match(/RM\s?(\d[\d,]*(\.\d{1,2})?)/); if (m) out.price = num(m[1]); }

  /* sold: "1.2k sold" / "已售 1.2k" / "1.2k Terjual"; the first one on the page is the product's */
  const txt = document.body.innerText;
  const m = txt.match(/([\d.,]+\s*[kK]?)\+?\s*(?:sold|Sold|已售出|已售|terjual|Terjual)/) || txt.match(/(?:已售出?|Sold)\s*([\d.,]+\s*[kK]?)/);
  if (m) { const s = m[1].replace(/[,\s]/g, ''); out.sales = String(/k$/i.test(s) ? Math.round(parseFloat(s) * 1000) : parseInt(s, 10)); }
  if (!out.rating) { const r = txt.match(/\b([1-5]\.\d)\s*\n?\s*(?:Ratings?|评分|ratings)/); if (r) out.rating = r[1]; }

  /* gallery photos only: the largest Shopee picture near the top is the main photo, and the box around it that is
     about its size (the gallery with its thumbnail strip) holds the others. Profile pictures, shop logos and
     buyer-review photos sit outside that box; round pictures are avatars either way. */
  const src = el => el.currentSrc || el.src || el.getAttribute('srcset') || (el.style && el.style.backgroundImage) || '';
  const pics = [...document.querySelectorAll('img, [style*="background-image"]')].filter(el => top(el) && /susercontent\.com\/file\//.test(src(el)));
  const area = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const main = pics.reduce((a, b) => (area(b) > area(a) ? b : a), pics[0]);
  if (main) {
    const m = main.getBoundingClientRect();
    let box = main;
    for (let p = main.parentElement; p && p !== document.body; p = p.parentElement) {
      const r = p.getBoundingClientRect();
      if (r.height > m.height + 260 || r.width > m.width + 120) break;
      box = p;
    }
    for (const el of pics) if (box.contains(el) && getComputedStyle(el).borderRadius !== '50%') img(src(el));
  }
  window.open(APP + '/new#import=' + encodeURIComponent(JSON.stringify(out)), '_blank');
}
