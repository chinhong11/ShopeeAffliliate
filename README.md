# Handoff: Shopee → Facebook Page auto-poster (cloud)

Target repo: `chinhong11/ShopeeAffliliate` (private, branch `main`, empty at handoff). This package becomes its first commit.

## Start here
1. Clone the repo (GitHub Desktop, or `git clone https://github.com/chinhong11/ShopeeAffliliate.git`).
2. Unzip this package into the repo folder so `README.md`, `studio/`, `.gitignore`, `.env.example` and `config.example.json` sit at the repo root.
3. Copy `.env.example` → `.env` and fill it in. Copy `config.example.json` → `config.json` and fill `categories` (format in Step 1).
4. Open a terminal in the repo folder, run `claude`, and paste:

> Read README.md and build the app it describes, Step 1 to Step 8 in order. After each step, run it locally, show me the result, then commit and push to main. Check the current Shopee Affiliate Open API and Facebook Graph API docs as you go; if they differ from the README, follow the docs and tell me. Never commit .env.

Your PC needs Node 20+ and Git for building. The app itself runs in the cloud (Step 8).

## Overview
```
08:00 daily (Asia/Kuala_Lumpur)
  Shopee Affiliate Open API · your categories · 3 strategies
    爆卖 top sellers · 高佣 highest commission · 大折扣 biggest discount today
  → filters, no repeats → 6 drafts (2 per strategy)
  → template + headline from the real data → 1080×1080 poster (studio in headless Chromium)
  → review app on your phone (password): 批准 / 跳过 / 编辑
12:30 and 20:30 (±10 min)
  → oldest approved draft → re-check price → photo + caption ① to the Page → comment ② with the short link
  → log · sub IDs on every link → report of which strategy / template earns
```
Nothing is posted without approval. A slot with no approved draft is skipped.

## Architecture
- One Node.js 20 service, plain JavaScript (ESM), no build step, running 24/7 in one Docker container.
- Playwright Chromium renders posters. SQLite at `$DATA_DIR/app.db`; product images in `$DATA_DIR/img/`, posters in `$DATA_DIR/out/`. `$DATA_DIR` is a persistent volume.
- The scheduler runs inside the service (croner or node-cron, timezone Asia/Kuala_Lumpur). Exactly one instance.
- HTTP routes: review app, `/studio/` (static from `studio/`), `/posters/:id.png` (login required), `/healthz`.
- Scripts: `npm run dev`, `npm run collect`, `npm run publish-due -- --dry-run` (logs the Facebook payload, no API calls).

## About the design files
`studio/` is the working Shopee Post Studio v3 (HTML/CSS/JS), hi-fi and final. It exposes `window.PostStudio` for automation (Step 3). Use it as-is as the poster renderer; do not re-implement the templates. Everything else is new code.

## Fidelity
- Posters: hi-fi, identical to the studio's own ⬇ 下载海报 export (same code path).
- Review app: hi-fi, clickable design in `design/Review App.html` (Step 4). Recreate it closely with server-rendered HTML + small vanilla JS; keep `design/review-app.css` and `studio/studio-ui-v3.css` as the stylesheets.

## Keys (already set up)
Put them in `.env` locally and in the host's environment settings (Step 8).

### Shopee Affiliate Open API
- `POST https://open-api.affiliate.shopee.com.my/graphql`, body `{"query": "...", "variables": {...}}`.
- Header: `Authorization: SHA256 Credential={AppId}, Timestamp={unixSeconds}, Signature={sha256hex(AppId + Timestamp + Payload + Secret)}`, where Payload is the exact body string sent.

### Facebook Page token
Check it: `GET /debug_token?input_token={FB_PAGE_TOKEN}&access_token={FB_APP_ID}|{FB_APP_SECRET}` must show `type: PAGE`, your Page as `profile_id`, scopes `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement`, and `expires_at: 0` (never expires).
If not: exchange your user token for a long-lived one (`GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={user-token}`), call `GET /me/accounts` with it, and use your Page's `access_token`. An app in Development mode works for a Page you admin, as long as you have a role on the app.

## Step 1: Shopee client + collector (`src/shopee.js`, `src/collect.js`)
- `gql(query, variables)`: signs every request; retries 429 / 5xx with backoff, 3 tries.
- `offers({productCatId, keyword, sortType, page, limit})` → `productOfferV2` nodes with `itemId shopId productName imageUrl priceMin priceMax priceDiscountRate ratingStar sales commissionRate productLink offerLink shopName`.
- `config.categories`: `[{"name": "Home & Living", "productCatId": 123}]`. If `productCatId` is null, look the ID up (docs / Shopee category tree) and write it into config.json; fall back to `keyword: name`. If `categories` is empty, stop and ask the user.
- Strategies, run per category (use the `sortType` values from the docs):
  - 爆卖 `topSellers`: sort by sales, descending; pages 1–2, limit 50.
  - 高佣 `highestCommission`: sort by commission, descending; pages 1–2.
  - 大折扣 `biggestDiscount`: if the API has no discount sort, rank the pooled 爆卖 + 高佣 candidates by `priceDiscountRate`, descending.
- Filters (`config.filters`): `ratingStar ≥ minRating`, `sales ≥ minSales`, has an image, name contains none of `excludeKeywords`, not posted within `noRepeatDays`, not already queued, max 1 item per shop per day.
- Take `strategies.<name>.perDay` items from each enabled strategy, in the order above; an item taken by one strategy is skipped by the next.
- `shortLink(productLink, subIds)`: `generateShortLink(input:{originUrl, subIds})` → `shortLink`. subIds = `["fb", tpl, strategyCode, yyyymmdd, draftId]`, letters and digits only; strategyCode `top` / `com` / `disc`.
- Download `imageUrl` → `$DATA_DIR/img/{itemId}.jpg`.

### Mapping → studio state
| Shopee field | Studio state | Rule |
|---|---|---|
| productName | `cap.name` | strip 【…】, emoji, "Ready Stock" / "COD" noise; ≤ 24 chars |
| priceMin | `now`, `cap.price` | `RM 12.90` |
| priceDiscountRate | `pct`, `was` | `pct:"-67%"`; `was = now / (1 - rate/100)`, 2 decimals (use an original-price field instead if the docs have one). `price:false` if rate < 10; `seal:false` if rate < 20 |
| ratingStar | `rate` | 1 decimal; `proof:false` if < 4.5 or missing |
| sales | `sold` | zh `已售 860` / `已售 1.2k+` / `已售 12k+`; mix `1.2k+ sold` |
| imageUrl | `photos[0]` | pass as `data:image/jpeg;base64,…`; `layout:1` |
| shortLink | `cap.link` | |
| commissionRate | (draft only) | review app shows `佣金 8% ≈ RM 1.03/单` (priceMin × rate) |
| config | `voucher`, `voucherCode`, `cap.code`, brand fields, `cap.tags`, `cap.mode`, `lang` | `voucher:false` if no code |

## Step 2: template + headline (`src/pick.js`)
**Template** (first match wins):
1. `priceDiscountRate ≥ 40` → `t2` 价格暴击
2. `ratingStar ≥ 4.8` and `sales ≥ 1000` and a real buyer review was entered in the review app → `t5` 真实好评
3. `sales ≥ 5000` → `t1` 爆款分享
4. else alternate `t1` / `t6` 杂志封面 (never the same template twice in a row)

Never chosen automatically: `t3` 限时抢购 (needs a real sale end time), `t4` 好友爆料 (staged chat), `t8` 轮播套图 (needs 4 photos). Layout = number of photos (1–4).

**Headline** (`l1` / `l2`): first matching condition. zh has two variants; alternate A / B per condition so back-to-back posts don't repeat. `{sold}` is the formatted value (`已售 15k+`).
| Condition | zh A | zh B | mix |
|---|---|---|---|
| discount ≥ 40 | `把价格\n打下来了！` / `现在只要 {now}` | `直接砍到\n{now}！` / `原价 {was}` | `{now} ONLY!!\n不冲对不起自己` / `{pct} OFF` |
| sales ≥ 5000 | `全网都在抢的\n爆款` / `{sold} 件` | `大家都在买的\n这个` / `{sold} 件 · ★{rate}` | `Viral 爆款\n大家都在买` / `{sold}` |
| rating ≥ 4.8 | `评分 {rate} 的\n宝藏好物` / `买过的都说值` | `{rate} 分好评\n闭眼入` / `{sold}` | `{rate}★ 宝藏好物\n被我挖到` / `Reviews 超好` |
| fallback | `我不允许你\n还不知道这个` / `{now} · ★{rate}` | `这个必须\n分享给你们` / `{now} · ★{rate}` | `OMG 这个必须\n分享给你们！` / `{now} · ★{rate}` |

Hooks that claim personal use (`这玩意儿也太\n好用了吧？！`, `闺蜜看到我用…`) only on drafts marked **我用过**. Never use scarcity or time claims (`最后一批`, `今晚恢复原价`, `历史最低价`, `最后 50 件`, `清货`) or the studio's fixed-number hooks unless the data proves them.

**Caption ①** (comment mode). If marked 我用过, use `PostStudio.caption().post`. Otherwise:
```
{l1 without \n}🔥

发现这个「{name}」，评分 {rate}、{sold}，看了评价决定分享给你们 👀
💰 现在 {now}（{pct}）
🎟 结账输入折扣码【{code}】再省        ← only if code
👉 购买链接放在第一条评论 👇

{tags}
```
**Comment ②**:
```
🛒 「{name}」链接在这 👇
{shortLink}
💰 {now}｜🎟 折扣码 {code}              ← parts only if present
```
Direct mode (`linkMode:"direct"`): link goes in ①, no comment.

## Step 3: render (`src/render.js`)
Serve `studio/` at `/studio/` and render over HTTP, not file://. One shared browser; a new page per draft, closed after.
```js
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`http://127.0.0.1:${PORT}/studio/Shopee%20Post%20Maker%20v3.html`);
await page.waitForFunction(() => window.PostStudio);
await page.evaluate(s => PostStudio.load(s), studioState);   // images as data: URLs
const png = await page.evaluate(() => PostStudio.exportPng()); // data:image/png;base64, 1080×1080
```
Save to `$DATA_DIR/out/{draftId}.png`.

### `window.PostStudio`
- `load(patch, {keep=false, persist=false})` → Promise. Starts from defaults (or the current state with `keep`), merges `patch`, loads images, re-renders, waits for fonts. `persist` saves to the browser (interactive use only).
- `exportPng()` → Promise<dataURL>. `exportSet()` → Promise<dataURL[4]> (t8).
- `caption()` → `{post, comment}` from the studio's built-in builder. `getState()` → state JSON.

`patch` fields (all optional):
- `tpl` `t1|t2|t3|t4|t5|t6|t8` · `layout` 1–4 (t1 t2 t3 t5 t6) · `lang` `zh|mix`
- `l1` (`\n` = line break), `l2`
- `photos`: up to 4 × `"src"` or `{src, zoom:100–280, x:0–100, y:0–100}` · `set.pages`: 4 × `{src?, cap}` (t8)
- `price was now pct seal sealLabel` · `proof rate sold` · `voucher voucherCode` · `cta ctaText` · `arrow shopee`
- `badge bstyle(lee|pill) bInit bName bTag badgec` · `c1 c2 ol hl hlc font size(70–140) align scrim(0–80) bg`
- `cd{h,m,s} stockTxt stockPct` (t3) · `review{quote,author}` (t5) · `chat{title,sub,m1,m2,m3}` (t4)
- `cap{mode(comment|direct), name, link, price, code, tags}`

**Placeholder guard:** studio defaults are demo values (`RM 29.90`, `RM 9.90`, `4.9`, `已售 12k+`, countdown `02:47:19`, the default review quote and chat lines). Before saving a draft, fail if any survive without coming from the product data. Missing data → switch the element off (`price:false`, `proof:false`).

**Fonts:** the container needs `fonts-noto-cjk` and `fonts-noto-color-emoji`. Acceptance test: render `studio/samples/ramen.png` with t1, t2, t5, t6 at every layout and compare to the studio's browser export of the same state.

## Step 4: review app (`src/server.js`, `src/views/`)
**Design reference: `design/Review App.html`**, hi-fi and clickable. Run `npx serve .` in the repo and open `/design/Review%20App.html` (posters render live through the studio, so it must be served, not opened as a file). Match its layout, copy and states. `design/review-app.css` is the stylesheet (it builds on `studio/studio-ui-v3.css`). `design/review-data.js` implements the Step 1–2 mapping, template and headline rules in plain JS; port it. The design uses React only as a prototype; the real app can be plain JS. Its Tweaks toolbar switches phone / desktop and the demo states (Token 失效, 空队列, 登录页).

Chinese UI, phone first; add a web app manifest so it can be added to the home screen. Desktop (≥ 900px): tabs move to a top bar, cards go into a grid, 编辑 has two columns (poster left, form right).
- **登录**: one password (`ADMIN_PASSWORD`), signed cookie (`SESSION_SECRET`), 30 days, max 5 tries per 15 min. Everything except `/login` and `/healthz` requires it.
1. **待审核** (home): title with pending count and 抓取 button; Token banner when publishing is paused; today's two slots (time, planned minute, scheduled product or 空); one card per pending draft (poster, strategy chip, name, price, discount, rating, sold, commission estimate, template, 跳过 / 编辑 / 批准). 价格变了 cards show old → new price. Below: 已批准 · 排队中 rows with slot label and 撤回. Approved drafts fill slots in approval order (today 12:30, today 20:30, tomorrow 12:30, …). 跳过 shows a toast with 撤销.
2. **编辑**: poster with an 有改动 badge until re-rendered; template grid where locked templates say what unlocks them (t5 real buyer review, t3 real end time + progress, t4 chat lines you write, t8 four photos); 标题 with data-based suggestions (personal hooks only when 我用过 is on); 照片 (Shopee image + up to 3 uploads, sets the layout); 我用过; 买家真实评价; caption ① and comment ② (auto-written until edited); bottom bar 重新生成海报 / 批准. Back saves. Desktop only: 在 Studio 精修 (opens `/studio/` with `PostStudio.load(state,{persist:true})`).
3. **已发布**: grouped by day; 已发布 rows (time, template, strategy, sub IDs, Facebook link), 失败 rows (error + 重试), 退回 rows (price check stopped a post).
4. **数据**: Step 9; 7 / 30 days; posts, orders, commission; bars by strategy and by template.

## Step 5: publish (`src/facebook.js`)
- Only approved drafts, only at a slot.
- Right before posting, re-fetch the product: price moved > 3% or item gone → re-render, back to 待审核 marked `价格变了`, do not post.
- Single image: `POST /{page-id}/photos` multipart `source`=PNG, `message`=caption ①, `published=true` → `{id, post_id}`. Then `POST /{post_id}/comments` `message`=comment ②.
- Carousel (t8): upload 4 photos with `published=false` → ids; `POST /{page-id}/feed` with `message` + `attached_media=[{"media_fbid":id},…]`; then comment.
- Rate-limit, spam or token errors (codes 4, 17, 32, 368, 190): stop all publishing, red banner in the app. Retry 5xx once after 60 s.
- Save `post_id`, `permalink_url`, comment id, sub IDs. Pinning the comment isn't available via the API; pin by hand if wanted.

## Step 6: scheduler (`src/jobs.js`)
- `collect` daily at `collectAt` → drafts → notify (Step 7).
- 00:05: plan today's slots = `postTimes` ± random `jitterMinutes`, at least 3 h apart, max `postsPerDay`.
- Every 5 min: each due, unused slot → oldest approved draft → Step 5. None approved → slot skipped.
- Daily `debug_token` check: invalid or missing a scope → stop publishing, red banner.
- Drafts not approved within 3 days expire.

## Step 7 (optional): Telegram
If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set: after collect, send each poster (`sendPhoto`) with `{name} · {now} · {strategy}` and buttons ✅ 批准 / ❌ 跳过 / ✏️ 编辑 (link to the draft). Callbacks via webhook `/telegram/{TELEGRAM_WEBHOOK_SECRET}`. Also report post success / failure and token problems.

## Step 8: deploy
- `Dockerfile`: base `mcr.microsoft.com/playwright:v{same version as the npm package}-noble`; install `fonts-noto-cjk fonts-noto-color-emoji`; `ENV TZ=Asia/Kuala_Lumpur`; `npm ci --omit=dev`; `CMD ["node","src/server.js"]`.
- Host: any always-on container host that deploys from this GitHub repo and has a persistent volume (e.g. Railway, Render with a disk, Fly.io), or a small VPS with Docker Compose. 1 GB RAM, 1 GB volume mounted at `/data` (`DATA_DIR=/data`), exactly 1 instance, health check `/healthz`.
- Set every `.env` value in the host's settings. `PUBLIC_URL` = the host's https URL.
- Daily backup of `app.db` on the volume, keep 7.
- First run: 重新抓取 → approve one → `publish-due --dry-run` → one real post → check the Page post and the comment.

## Step 9 (optional): which strategy and template earn
Weekly `conversionReport` grouped by sub ID → 数据 tab: orders and commission by strategy, template and layout. Use it to tune Step 2 and `strategies.*.perDay`.

## Safety rules (must implement)
- Product data only from the Affiliate Open API. No scraping of Shopee pages: it breaks Shopee's terms and gets blocked.
- No placeholder or invented numbers, reviews, chats or countdowns.
- First-person claims only on drafts marked 我用过.
- Nothing posts without approval. Respect `postsPerDay` and `noRepeatDays`.
- Secrets only in env vars, never in git. Review app behind the password.

## Design tokens (review app, from `studio/studio-ui-v3.css`)
- Background `#15131a` / `#1c1924`; panels `#1b1822`, `#241f2c`, `#2c2636`; lines `#352e40`, `#43394f`
- Text `#f2eef6`; muted `#9b91a8`, `#6f6680`
- Accent `#ee4d2d` → `#ff6b3d` gradient (primary button, shadow `0 6px 18px rgba(238,77,45,.32)`); deal `#f5123e`; gold `#ffb400`; proof `#16a34a`
- Radius 14px (cards), 10px (small), 11px (buttons), 999px (pills)
- Type: Nunito + Noto Sans SC (UI), Montserrat 800 (titles)

## Files
- `studio/Shopee Post Maker v3.html`: editor + renderer, exposes `window.PostStudio`
- `studio/post-studio-v3.js`: engine (templates, 插图 layouts, captions, export; API at the end of `init()`)
- `studio/studio-canvas-v3.css`: poster styles (`#post`, 1080×1080)
- `studio/studio-ui-v3.css`: editor UI styles and tokens
- `studio/samples/`: two test images
- `.env.example`, `config.example.json`, `.gitignore`
- `design/Review App.html` + `review-app.css`, `review-data.js`, `review-render.js`, `review-screens.jsx`, `review-edit.jsx`: review app design (device frames and Tweaks panel are prototype-only)
- `design/review-photos/`: sample product photos used by the design
