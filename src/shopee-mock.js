/* Offline stand-in for the Affiliate Open API (SHOPEE_MOCK=1). For local testing only:
   drafts made from it are flagged `mock` and can never be posted for real (publish.js). */
const P = 'mock:design/review-photos/';
const N = (itemId, shopId, productName, img, priceMin, disc, ratingStar, sales, commissionRate) => ({
  itemId, shopId, productName, imageUrl: P + img, priceMin: String(priceMin), priceMax: String(priceMin),
  priceDiscountRate: disc, ratingStar: String(ratingStar), sales, commissionRate: String(commissionRate),
  productLink: `https://shopee.com.my/product/${shopId}/${itemId}`, offerLink: `https://shope.ee/mock${itemId}`, shopName: 'Mock Shop ' + shopId
});
export const NODES = [
  N(9001, 501, '【Ready Stock】辛拉面 甜辣泡菜炒面 5包装 🔥 COD', 'p-ramen5.jpg', 12.9, 32, 4.9, 15200, 0.05),
  N(9002, 502, '奇奇蒂蒂 贴贴日常系列 植绒盲盒 单盒', 'p-cd-pair.jpg', 39.9, 15, 4.9, 3400, 0.08),
  N(9003, 503, '奇奇蒂蒂 植绒盲盒 整盒 6 款', 'p-cd-cuddle.jpg', 219, 12, 4.7, 640, 0.12),
  N(9004, 504, '奇奇蒂蒂 滑板款 公仔摆件', 'p-cd-skate.jpg', 49.9, 42, 4.8, 1300, 0.10),
  N(9005, 505, '奇奇蒂蒂 眼镜款 桌面摆件', 'p-cd-glasses.jpg', 19.9, 60, 4.7, 2100, 0.07),
  N(9006, 506, '辛拉面 甜辣泡菜炒面 单包 137g', 'p-ramen1.jpg', 2.9, 41, 4.8, 8700, 0.05),
  N(9007, 507, '奇奇蒂蒂 刷漆款 公仔', 'p-cd-paint.jpg', 45.9, 20, 4.9, 5600, 0.08),
  N(9008, 508, '奇奇蒂蒂 树枝款 摆件', 'p-cd-branch.jpg', 29.9, 8, 4.6, 900, 0.09),
  N(9009, 501, '辛拉面 10包箱装 (same shop as 9001)', 'post-ramen.jpg', 24.9, 25, 4.9, 9100, 0.06),
  N(9010, 509, 'Low rated item', 'post-cd.jpg', 9.9, 50, 4.1, 3000, 0.15)
];
export function offers({ sortType, page }) {
  if (page > 1) return { nodes: [], hasNextPage: false };
  const key = sortType === 5 ? 'commissionRate' : 'sales';
  const nodes = [...NODES].sort((a, b) => Number(b[key]) - Number(a[key]));
  return { nodes, hasNextPage: false };
}
export function product(shopId, itemId) {
  return NODES.find(n => String(n.itemId) === String(itemId)) || null;
}
export function shortLink(originUrl, subIds) {
  let h = 0; for (const c of originUrl + subIds.join('')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 'https://s.shopee.com.my/MOCK' + h.toString(36);
}
