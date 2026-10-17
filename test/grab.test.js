/* Shopee import bookmark (public/grab.js) on a stand-in Shopee product page: no network, the browser's requests
   to shopee.com.my and Shopee's image host are answered here. Needs Playwright's Chromium; skipped otherwise. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { grab } from '../public/grab.js';

const can = !!process.env.CHROMIUM_PATH || fs.existsSync(chromium.executablePath());
const IMG = 'https://down-my.img.susercontent.com/file/';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Kimchi Ramen 5 pack | Shopee Malaysia</title>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"Product","name":"辛拉面 甜辣泡菜炒面 5包装","image":"${IMG}my-111-main",
 "offers":{"@type":"AggregateOffer","lowPrice":"12.90","highPrice":"15.90","priceCurrency":"MYR"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","ratingCount":"15200"}}</script>
</head><body style="margin:0;font-size:14px">
  <header style="height:40px"><img src="${IMG}my-avatar-me_tn" width="28" height="28" style="border-radius:50%"></header>
  <div style="display:flex;gap:30px">
    <div id="gallery" style="width:450px"><img src="${IMG}my-111-main" width="450" height="450">
      <div style="display:flex"><img src="${IMG}my-111-main_tn" width="80"><img src="${IMG}my-111-side_tn" width="80"><div style="width:80px;height:80px;background-image:url('${IMG}my-111-pack_tn')"></div>
      <img src="${IMG}my-111-side" width="80"><img src="https://example.com/file/not-shopee" width="80"></div></div>
    <div style="width:500px"><img src="${IMG}my-shop-logo_tn" width="60" height="60"><p>Shop</p></div>
  </div>
  <section><h3>Product Ratings</h3><img src="${IMG}my-review-photo_tn" width="72" height="72"><img src="${IMG}my-review-avatar_tn" width="32" height="32" style="border-radius:50%"></section>
  <h1>辛拉面 甜辣泡菜炒面 5包装</h1>
  <div><span>4.9</span> <span>15.2k Ratings</span> <span>1.2k Sold</span></div>
  <div style="text-decoration:line-through;color:#888">RM19.90</div>
  <div style="font-size:30px;color:#ee4d2d"><span>RM</span><span>12.90</span></div>
  <div>RM5 off voucher</div>
  <div style="height:3000px"></div>
  <section><h2>You may also like</h2><img src="${IMG}my-999-other_tn" width="80"><div style="font-size:40px">RM1.00</div><div>10k+ sold</div></section>
</body></html>`;

/* Shopee's price markup varies: "RM" in its own box, or drawn by CSS */
const VARIANTS = {
  'RM in a separate box': '<div style="font-size:30px"><span>RM</span><span>12.90</span></div>',
  'RM drawn by CSS ::before': '<style>.cur::before{content:"RM"}</style><div class="cur" style="font-size:30px">12.90</div>',
  'RM in the previous box': '<div><span style="font-size:14px">RM</span><span style="font-size:30px">12.90</span></div>'
};
test('import bookmark finds the price however Shopee draws "RM"', { skip: !can && 'no Chromium' }, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const [name, html] of Object.entries(VARIANTS)) {
      const page = await b.newPage();
      await page.route('https://shopee.com.my/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta charset="utf-8"><title>x</title><body><div style="font-size:14px">4.9 Ratings</div><div style="text-decoration:line-through">RM19.90</div>${html}</body>` }));
      await page.goto('https://shopee.com.my/x-i.1.2');
      const opened = await page.evaluate(`(() => { let u = ''; window.open = x => { u = x; }; (${grab})('http://app.test'); return u; })()`);
      const r = JSON.parse(decodeURIComponent(opened.split('#import=')[1]));
      assert.equal(r.price, '12.90', name); assert.equal(r.was, '19.90', name);
      await page.close();
    }
  } finally { await b.close(); }
});

test('import bookmark reads name, prices, rating, sold and the gallery photos from a product page', { skip: !can && 'no Chromium' }, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await b.newPage();
    await page.route('https://shopee.com.my/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
    await page.route('https://down-my.img.susercontent.com/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('89504e470d0a1a0a', 'hex') }));
    await page.route('https://example.com/**', r => r.fulfill({ status: 404 }));
    await page.goto('https://shopee.com.my/Kimchi-Ramen-i.501.9001?sp_atk=x');
    const opened = await page.evaluate(`(() => { let u = ''; window.open = x => { u = x; }; (${grab})('http://app.test'); return u; })()`);
    assert.ok(opened.startsWith('http://app.test/new#import='), opened);
    const r = JSON.parse(decodeURIComponent(opened.split('#import=')[1]));
    assert.equal(r.name, '辛拉面 甜辣泡菜炒面 5包装');
    assert.equal(r.price, '12.90');   // the large on-screen price
    assert.equal(r.was, '19.90');     // struck through
    assert.equal(r.rating, '4.9');
    assert.equal(r.sales, '1200');    // the product's, not the recommendation's 10k+
    assert.equal(r.url, 'https://shopee.com.my/Kimchi-Ramen-i.501.9001');
    assert.deepEqual(r.images, [`${IMG}my-111-main`, `${IMG}my-111-side`, `${IMG}my-111-pack`]); // full size, once each, no recommendations

    const elsewhere = await b.newPage();
    await elsewhere.route('https://example.com/**', r => r.fulfill({ contentType: 'text/html', body: '<p>hi</p>' }));
    await elsewhere.goto('https://example.com/');
    const said = await elsewhere.evaluate(`(() => { let m = ''; window.alert = x => { m = x; }; window.open = () => { m += ' OPENED'; }; (${grab})('http://app.test'); return m; })()`);
    assert.equal(said, '请在 Shopee 商品页上点这个书签');
  } finally { await b.close(); }
});
