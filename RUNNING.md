# Running the auto-poster

What's built (README Steps 1–8, Step 7 optional) and how to run, deploy and test it.

## Layout
```
src/config.js      .env + config.json (TZ from config.timezone)
src/db.js          SQLite at $DATA_DIR/app.db (drafts, posts, slots, kv, conversions)
src/shopee.js      Affiliate Open API: signed GraphQL, offers, product, short links, images   (Step 1)
src/collect.js     categories × strategies → filters → drafts                               (Step 1)
src/mapping.js     Shopee fields → studio state, placeholder guard (shared with the browser)  (Step 1)
src/pick.js        template, headline, captions (shared with the browser)                   (Step 2)
src/render.js      studio in headless Chromium → $DATA_DIR/out/{draftId}.png                 (Step 3)
src/server.js      review app, /studio/, /posters/, /healthz, JSON API                       (Step 4)
src/views/ public/ server-rendered pages + small vanilla JS, manifest, icons                (Step 4)
src/facebook.js    Graph API: photo post, first comment, carousel, debug_token               (Step 5)
src/publish.js     slot → price re-check → post → log; publish-due CLI                       (Step 5)
src/jobs.js        croner scheduler (Asia/Kuala_Lumpur)                                      (Step 6)
src/telegram.js    optional posters + buttons + reports                                      (Step 7)
src/backup.js      daily app.db backup, keep 7                                               (Step 8)
Dockerfile docker-compose.yml                                                                (Step 8)
```

## Local
```
npm install
cp .env.example .env            # fill it in (never commit .env)
# config.json: fill "categories", e.g. [{"name": "Home & Living", "productCatId": null}]
npm run dev                     # http://localhost:4545 — review app + scheduler
npm run collect                 # collect now (add -- --render to render posters too)
npm run publish-due -- --dry-run   # oldest approved draft → Facebook payload, no API calls
npm run publish-due -- --now       # post the oldest approved draft now (real post)
npm run render-test             # Step 3 acceptance test → $DATA_DIR/render-test/contact.png
npm test                        # unit + flow tests (fake Graph / Telegram servers, no real API calls)
```
`SHOPEE_MOCK=1` runs the whole app on built-in sample products, offline. Mock drafts show a MOCK chip and can never be posted to the real Facebook API.
`DISABLE_JOBS=1` runs the web app without the scheduler.

## Deploy (one container, one instance, volume at /data)
Any always-on Docker host that deploys from this repo and has a persistent volume (Railway, Render with a disk, Fly.io), or a VPS with `docker compose up -d --build`.
1. Create the service from the GitHub repo; it builds the `Dockerfile` (Playwright v1.56.1 base, same as the npm package, plus `fonts-noto-cjk fonts-noto-color-emoji`, `TZ=Asia/Kuala_Lumpur`).
2. Attach a 1 GB volume mounted at `/data`; 1 GB RAM; exactly 1 instance (no autoscaling, no zero-downtime overlap if the host offers to turn it off). A DB lease also keeps a second copy's scheduler idle.
3. Set every `.env` value in the host's environment settings, `DATA_DIR=/data`, and `PUBLIC_URL` = the host's https URL.
4. Health check path: `/healthz`.
5. `config.json` is read from the repo: commit your categories there (it has no secrets).

Backups: `$DATA_DIR/backup/app-YYYY-MM-DD.db`, daily at 03:30, newest 7 kept.

## First run
1. Open `PUBLIC_URL`, log in with `ADMIN_PASSWORD`, tap ↻ 抓取.
2. Approve one draft.
3. In the host's shell: `npm run publish-due -- --dry-run` and check the payload.
4. One real post: `npm run publish-due -- --now` (or wait for the next slot).
5. Check the Page post and the first comment with the link. Pinning the comment isn't available in the API; pin by hand if wanted.

## Where the build differs from the README (and why)
- **Shopee `sortType`**: 2 = sales, 5 = commission (no discount sort), so 大折扣 ranks the pooled 爆卖 + 高佣 candidates by `priceDiscountRate`, as the README allows. The official docs need an affiliate login; the values come from public descriptions of the Open API. Check them against your docs page once you have keys.
- **`productCatId: null`** falls back to `keyword: name`. Category IDs aren't guessed or written back automatically; put real ones into config.json when you have them.
- **Graph API version**: v26.0 (the current version as of Oct 2026); override with `FB_GRAPH_VERSION`.
- **Studio**: one change, `crossorigin="anonymous"` on the Google Fonts `<link>`. Without it, html-to-image can't read the cross-origin `@font-face` rules, and every export (including the studio's own ⬇ 下载海报) silently fell back to system fonts (no Montserrat, Nunito or Caveat). No template code was changed.
- **Renderer**: html-to-image is served from `node_modules` (same 1.11.11) and Google Fonts are cached on disk, so a render doesn't depend on unpkg and takes ~7 s instead of ~20 s.
- **Small price moves (≤ 3 %)** before posting update the poster and captions instead of posting a stale price; > 3 % or gone returns the draft as the README says.
- **数据 tab**: shows real post counts. Orders and commission stay "—" until the conversion report (Step 9, not built) fills the `conversions` table. No invented numbers.
- **Studio caption for 我用过**: ported from `buildMain()` in `post-studio-v3.js` (same text as `PostStudio.caption().post`) so it can update live in the edit form.
