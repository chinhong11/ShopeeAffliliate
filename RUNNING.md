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
`DISABLE_JOBS=1` runs the web app without the scheduler. `RENDER_TIMEOUT_MS` (default 120000) is the deadline for one poster (t8: twice that); a render that runs over, or whose Chromium process dies, fails and Chromium is restarted for the next one.

## Deploy (one container, one instance, volume at /data)
Any always-on Docker host that deploys from this repo and has a persistent volume (Railway, Render with a disk, Fly.io), or a VPS with `docker compose up -d --build`.
1. Create the service from the GitHub repo; it builds the `Dockerfile` (Playwright v1.56.1 base, same as the npm package, plus `fonts-noto-cjk fonts-noto-color-emoji`, `TZ=Asia/Kuala_Lumpur`).
2. Attach a 1 GB volume mounted at `/data`; 1 GB RAM; exactly 1 instance (no autoscaling, no zero-downtime overlap if the host offers to turn it off). A DB lease also keeps a second copy's scheduler idle.
3. Set every `.env` value in the host's environment settings, `DATA_DIR=/data`, and `PUBLIC_URL` = the host's https URL.
   `TRUST_PROXY` (login limit): leave empty — it is 1 on Railway / Render / Fly (their proxy sets X-Forwarded-For) and off on a bare port (docker-compose on a VPS, where clients could fake that header). Set it if you put your own reverse proxy in front.
4. Health check path: `/healthz`.
5. `config.json` is read from the repo: commit your categories there (it has no secrets).

Backups: `$DATA_DIR/backup/app-YYYY-MM-DD.db`, daily at 03:30, newest 7 kept.
Disk: posters / photos of finished drafts are removed at 00:05 (big PNGs after 2 days, thumbnails and photos after 30), so the volume stays around 50 MB.
Daily jobs (collect, token check, plan + expiry + cleanup, backup) run at their time, or as soon as the service is back if it was down or restarting then; each runs once a day.
Memory: a render peaks at ~400–450 MB of Chromium (t1 / t2) and ~600–700 MB (t8, four photos) plus ~150–200 MB for Node; tested in a container limited to 1 GB.

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
- **Renderer**: html-to-image is served from `node_modules` (same 1.11.11) and Google Fonts are cached on disk, so a render doesn't depend on unpkg. Before exporting, the renderer keeps only the font slices the poster can use (its families × the characters in its text): html-to-image otherwise inlines all ~550 Google Fonts slices into every export, which peaked at 0.9–1.4 GB and got Chromium OOM-killed in a 1 GB container. Posters stay pixel-identical to the studio's own export (`npm run render-test`, now also t3, t4 and all four t8 pages). The studio's own ⬇ 下载海报 in your browser still embeds all fonts (slower, fine on a desktop).
- **Small price moves (≤ 3 %)** before posting update the poster, headline and captions instead of posting a stale price; > 3 % or gone returns the draft as the README says (also with the new numbers in its headline).
- **Every post carries the affiliate link**: in comment mode in comment ②, in direct mode in caption ① — even if `linkMode` changed after the captions were written. Auto-written captions are regenerated with the current config at post time.
- **5xx is retried once after 60 s, as specified; a POST that got no answer at all (network cut) is not re-sent**, because Facebook may already have published it. It is logged as 失败 with "先到专页看看" before 重试.
- **t3 限时抢购**: the end time is stored with its date when you enter it. A sale that has ended by post time is not posted (no invented countdown): the draft goes back to 待审核 on the automatic template.
- **Token check**: if Facebook can't be reached for the check (network, 5xx, temporary codes) publishing is not paused; the check is retried a minute later. A token pause lifts itself when a later check passes; rate-limit / spam pauses still wait for 重试.
- **Safety**: a draft is claimed for posting with a check-and-set on its status, so a 撤回 / 跳过 during the pre-post checks, or a second publisher (`npm run publish-due -- --now` next to the scheduler), never posts it (or posts it twice). An error before posting (Shopee lookup, render) is logged as 失败 (with Telegram), so it no longer holds up the queue: the next approved draft takes the next slot. `--now` and 重试 respect `postsPerDay`.
- **数据 tab**: shows real post counts. Orders and commission stay "—" until the conversion report (Step 9, not built) fills the `conversions` table. No invented numbers.
- **Studio caption for 我用过**: ported from `buildMain()` in `post-studio-v3.js` (same text as `PostStudio.caption().post`) so it can update live in the edit form.
