# Setup guide (click by click)

This guide is for whoever sets the app up and keeps it running. Approving posts every day happens in the review app on your phone and doesn't need it.

Websites rename their buttons from time to time. If a button in this guide has a slightly different name on your screen, use the closest match. Steps we could not confirm in the official documentation are marked **(unconfirmed)**.

**What you need**
- A Shopee Affiliate account (Malaysia) with Open API access
- A Facebook Page you are an admin of, and the Facebook account you use to manage it
- This GitHub repository, `chinhong11/ShopeeAffliliate`
- A hosting account that keeps the app running day and night. This guide uses Railway.
- Optional but recommended: Telegram on your phone, for posters, reminders and alerts

Shopee and Facebook may take a while to approve things, so start with Steps 1 and 2.

## Step 1: Shopee Affiliate Open API keys
1. If you aren't a Shopee affiliate yet, sign up in the Shopee app: **Me** → **Shopee Affiliate**, then follow the steps (account type, platform, link, phone and email, declaration, social media authorisation). Shopee reviews applications. You need a public social media account, to be a local user in Malaysia and to be 18 or older. ([Shopee help](https://help.shopee.com.my/portal/10/article/205759-How-to-Sign-Up-for-the-Shopee-Affiliate-Program))
2. On a computer, log in at https://affiliate.shopee.com.my and open **Open API**, near the bottom of the left menu **(unconfirmed: from third-party guides)**. Copy your **AppID** and **Secret**.
3. If it says you don't have access to the Open API, access may need a separate request **(unconfirmed)**. Ask Shopee through the [affiliate enquiry form](https://help.shopee.com.my/portal/webform/99dbea1dc4894accae65f606c2f91af5).
4. Keep both for Step 3: they become `SHOPEE_APP_ID` and `SHOPEE_APP_SECRET`.

The app calls `https://open-api.affiliate.shopee.com.my/graphql`. If your Open API page shows a different address, set it as `SHOPEE_ENDPOINT` in Step 3.

## Step 2: A Facebook Page token that never expires
You'll make a small Meta app that only you use. It doesn't need Meta's App Review while only people with a role on the app use it. ([Meta: app roles](https://developers.facebook.com/documentation/development/build-and-test/app-roles))

**2a. Developer account.** Log in to Facebook, open https://developers.facebook.com and click **Get Started**. Confirm your phone number and email with the codes Meta sends.

**2b. Create the app.**
1. Open https://developers.facebook.com/apps/creation/ and enter an app name and your email. Click **Next**.
2. For the use case, choose **Manage everything on your Page**.
3. When asked about a business portfolio, you can skip connecting one for now **(the exact wording of that choice is unconfirmed)**.
4. Click **Go to dashboard**.
5. In the left menu, click **Dashboard**, open your use case, choose **Customize**, and click **Add** next to `pages_manage_posts`, `pages_read_engagement` and `pages_read_user_content`. ([Meta: create an app](https://developers.facebook.com/documentation/pages-api/create-an-app))

**2c. App ID and App Secret.** In the left menu, open **App settings** → **Basic**. The **App ID** is at the top. Click **Show** next to **App secret** and type your Facebook password. These become `FB_APP_ID` and `FB_APP_SECRET`. Never share the secret; if it leaks, reset it on the same page.

**2d. A first (short-lived) token.**
1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Under **Meta App**, pick your app. Under **User or Page**, pick **User Token**.
3. Use **Add a permission** to add: `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement`, `pages_read_user_content`, `pages_show_list`. If your Page belongs to a business portfolio, also add `business_management`: people on Meta's developer forum report that without it, the list of Pages in 2f can come back empty.
4. Click **Generate Access Token** and allow it in the Facebook window. If the window asks which Pages to allow, tick your Page **(the window's contents are unconfirmed)**. The token appears in the **Access Token** box at the top right.

**2e. Make it long-lived (about 60 days).** Use either way:
- **Button:** open the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/), paste the token, click **Debug**, then click **Extend Access Token** at the bottom **(unconfirmed: third-party guides still show this button, Meta's docs don't mention it)**. Copy the new token.
- **Address (documented by Meta):** in your browser, open this address after replacing the three CAPITAL parts:
  `https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=TOKEN_FROM_2D`
  The page shows `{"access_token":"…"}`, and that is the long-lived token. This address contains your app secret, so don't share it or send it to anyone. ([Meta: long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/))

**2f. The Page token.** Back in the Graph API Explorer, paste the **long-lived** token from 2e into the **Access Token** box, type `me/accounts` in the query box and click **Submit**. Find your Page in the answer:
- `id` is your **Page ID**: `FB_PAGE_ID`
- `access_token` is the **Page token**: `FB_PAGE_TOKEN`

Use the long-lived token here: a Page token made from the short-lived one stops working soon (after about an hour, according to older Meta docs). A Page token made from a long-lived one has no expiry date. It can still stop working for other reasons, listed under [If the Facebook token stops working](#if-the-facebook-token-stops-working). ([Meta: access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/))

**2g. Check it.** In the Access Token Debugger, paste the Page token and click **Debug**. It should show that it's a Page token for your Page and that it never expires **(the exact labels are unconfirmed)**. The app checks the same thing every day and shows a red banner if anything is wrong.

**2h. Important: check that everyone can see the posts.** Posts made through an app that is still in **Development** mode may be visible only to people with a role on the app. Older Meta docs and recent reports from other tools say so; we could not test it.
1. After the first real post (Step 5), open your Page in a private or incognito window where you're not logged in, and check that the post is there.
2. If it isn't, open your app's dashboard, then **Publish** → **Go live**. Meta asks for a privacy policy URL, data deletion instructions, an app icon and a category.
3. Whether posting keeps working in Live mode without App Review is **unconfirmed**: Meta's docs disagree. After going live, post once more and check again.

## Step 3: Put the app online (Railway)
**Plan:** Railway's Free plan allows only 0.5 GB of memory, and this app needs about 1 GB while it makes posters. Use the **Hobby** plan ($5 a month, which includes $5 of usage) or higher. Railway bills memory and CPU by use, and we measured the app's memory, not its Railway bill, so look at Railway's usage page after the first week. Don't turn on **Serverless**: it puts the app to sleep, and then it misses posting times. (Prices from [Railway's docs](https://docs.railway.com/pricing/plans) in October 2026.)

1. Open https://railway.com/new and choose **Deploy from GitHub Repo**. Connect GitHub if asked, and pick `chinhong11/ShopeeAffliliate`.
2. Choose **Add variables**, not **Deploy Now**, so the first start already has its settings.
3. In the service, open **Variables** → **Raw Editor**, paste this with your own values, and save **(the save button's name is unconfirmed)**:
   ```
   SHOPEE_APP_ID=…
   SHOPEE_APP_SECRET=…
   FB_APP_ID=…
   FB_APP_SECRET=…
   FB_PAGE_ID=…
   FB_PAGE_TOKEN=…
   ADMIN_PASSWORD=a password for the review app
   SESSION_SECRET=any long random text, 32 characters or more
   DATA_DIR=/data
   PUBLIC_URL=
   ```
   `PUBLIC_URL` gets its value in step 5. For Telegram, add its three lines too (Step 4).
4. Add storage: right-click the service and choose **Attach Volume** (or create a volume from the command palette, ⌘K). Set the mount path to `/data`. The drafts, posts and posters are kept there.
5. Open the service's **Settings** → **Networking** → **Public Networking** → **Generate Domain**. Copy the `https://….up.railway.app` address and set it as `PUBLIC_URL` in **Variables**.
6. In **Settings** → **Deploy**, set **Healthcheck Path** to `/healthz`.
7. Click **Deploy** at the top of the canvas. Railway builds the app from its `Dockerfile` (the build log says "Using detected Dockerfile!"), then starts it. Open `PUBLIC_URL` once it's running.

Good to know:
- **Changing a variable later:** edit it in **Variables**, then click **Deploy** on the banner that appears. Until you do, the change is only staged and the app keeps the old value. ([Railway: staged changes](https://docs.railway.com/deployments/staged-changes))
- **A change on GitHub** (for example in `config.json`) redeploys the app automatically. ([Railway: GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys))
- **One copy only:** Railway doesn't run extra copies of a service that has a volume, which is what this app needs. Every redeploy has a short downtime.
- **Logs:** open the service's latest deployment to see its logs **(the menu name is unconfirmed)**.

## Step 4: Telegram (optional, recommended)
With Telegram, the app sends each day's posters with ✅ 批准 / ❌ 跳过 / ✏️ 编辑 buttons, reminds you an hour before a posting time nothing is approved for, and tells you when a post goes out, fails, or posting pauses. Without it, nothing reminds you; you have to open the app.

1. In Telegram, open **@BotFather** and send `/newbot`. Choose a name, then a username that ends in `bot`. BotFather replies with the bot's **token**. Anyone with the token can control the bot; if it leaks, send `/token` to BotFather for a new one. ([Telegram: BotFather](https://core.telegram.org/bots/features#botfather))
2. Open your new bot's chat, tap **Start**, and send it any message.
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, with your token right after `bot`. Find `"chat":{"id":` followed by a number. That number is your **chat ID**.
   - If you see `"result":[]`, send the bot another message and reload.
   - If you see an error about a webhook (the app is already using the bot), open `https://api.telegram.org/bot<TOKEN>/deleteWebhook` first, then try again. The app sets its webhook again when it restarts.
4. In Railway **Variables**, add these three lines and click **Deploy**:
   ```
   TELEGRAM_BOT_TOKEN=the token from BotFather
   TELEGRAM_CHAT_ID=the chat ID
   TELEGRAM_WEBHOOK_SECRET=16 or more letters, digits, _ or -
   ```

## Step 5: First run
1. On your phone, open the app's address (the `PUBLIC_URL` from Step 3) and log in with your `ADMIN_PASSWORD`.
2. Add it to your home screen so it opens like an app:
   - iPhone (Safari): tap the **Share** button, then **Add to Home Screen**.
   - Android (Chrome): tap **⋮**, then **Add to Home screen** or **Install app**.
3. Make sure `categories` in `config.json` lists what you want to collect (see [Change settings](#change-settings-configjson)). It is empty at first, and 抓取 stops and says so.
4. Tap **↻ 抓取**. New drafts appear as cards, and their posters fill in by themselves.
5. Approve one card with **批准**. The message tells you when it will post, for example 「已批准 · 今天 20:30 发布」.
6. After that time, open your Facebook Page and check the post and its first comment with the Shopee link. The app can't pin the comment; pin it by hand if you want it on top.
7. Do the visibility check in Step 2h.

## Every day
- At the collect time (08:00 unless you change it) the app collects new products and makes drafts. With Telegram set up, the posters arrive on your phone.
- Approve the ones you like. Approved posts go out at the next posting times (12:30 and 20:30 unless you change them), in the order you approved them.
- **跳过** the ones you don't want. If you skip one by mistake, tap **撤销** right away, or open **已跳过** at the bottom of 待审核 and tap **恢复**.
- **编辑** lets you change the template, headline, photos and text. Changes save by themselves; tap **↻ 重新生成海报** to see the new poster.
- A draft you don't approve within 3 days expires. On its last day the card says 「⏳ … 过期」.
- Nothing is ever posted without your approval. A posting time with nothing approved is skipped. With Telegram, you get a reminder about an hour before.

## Change settings (config.json)
All settings are in the file `config.json` in the repository. To change one:
1. Open https://github.com/chinhong11/ShopeeAffliliate and tap **config.json**.
2. Tap the pencil icon (**Edit this file**).
3. Change the value. Keep the quotes `"…"`, commas, and `[ ]` / `{ }` brackets exactly as they are, because one missing comma stops the app from starting.
4. Tap **Commit changes…**, keep **Commit directly to the main branch**, and tap **Commit changes**.
5. Railway sees the change on GitHub and redeploys the app by itself. A few minutes later the app uses the new setting.

If the app stops working after a change, the file most likely has a typo. Open `config.json` on GitHub, tap **History**, open the change before yours and use **View file** to see the old text. Copy it, then edit the file again and paste it back.

| Setting | What it does | Example |
|---|---|---|
| `collectAt` | Time the app collects new products each day | `"08:00"` |
| `postTimes` | Posting times. Each one moves by up to `jitterMinutes` so posts don't look automatic. They are kept at least 3 hours apart. | `["12:30", "20:30"]` |
| `jitterMinutes` | How far a posting time may move, earlier or later | `10` |
| `postsPerDay` | Most posts in one day | `2` |
| `categories` | What to collect. `name` is also used as the search word when `productCatId` is `null`. | `[{"name": "Home & Living", "productCatId": null}]` |
| `strategies` | How many drafts per day from each list: `topSellers` 爆卖, `highestCommission` 高佣, `biggestDiscount` 大折扣. Set `"enabled": false` to turn one off. | `"topSellers": {"enabled": true, "perDay": 2}` |
| `filters.minRating` | Lowest product rating to accept | `4.7` |
| `filters.minSales` | Fewest sales to accept | `500` |
| `filters.excludeKeywords` | Skip products whose name contains any of these words | `["二手", "refurbished"]` |
| `noRepeatDays` | Don't post the same product again within this many days | `30` |
| `voucherCode` | A voucher code to mention in posts. `""` means none. | `"LEE10"` |
| `hashtags` | Hashtags at the end of each post: one for Chinese posts (`zh`) and one for Malay posts (`ms`). A single `"…"` is used for both. | `{"zh": "#shopee #好物分享", "ms": "#shopee #barangviral"}` |
| `linkMode` | `"comment"`: the link goes in the first comment. `"direct"`: the link goes in the post itself. | `"comment"` |
| `language` | The language new posts start in: `"zh"` Chinese, `"ms"` Bahasa Melayu (`"mix"`, Chinese mixed with English, still works). You can switch any draft on its edit page under 海报和文案的语言. The review app itself stays in Chinese. | `"ms"` |
| `brand` | The round badge on posters: `bName`, `bTag`, `bInit`, `bstyle` (`"lee"` or `"pill"`), `badgec` (colour) | `{"bName": "LEE", "bTag": "Sharing"}` |
| `timezone` | Leave as is | `"Asia/Kuala_Lumpur"` |

## If the Facebook token stops working
You'll see the red banner 「发布已暂停 · Facebook token 有问题」 (and 🛑 in Telegram). Approved drafts stay in the queue; nothing is lost.

1. Make a new Page token: repeat Step 2d to 2f, and check it with 2g.
2. In Railway, open the service → **Variables** → `FB_PAGE_TOKEN`, paste the new token, and click **Deploy** on the banner.
3. The app checks the token when it starts again (and every day), and lifts the pause by itself once the new token works. You can also tap **重试** on the red banner; it should say 「Token 正常 · 已恢复发布」.

Facebook doesn't warn before a token stops working; the next post fails. Common reasons, from Meta's docs and developer reports:
- You changed your Facebook password. Facebook's own words say 「The session has been invalidated because the user changed their password…」. ([Meta](https://developers.facebook.com/docs/facebook-login/for-devices/))
- The app was removed in Facebook under **Settings & privacy** → **Settings** → **Security and login** → **Business integrations**.
- You lost your role on the Page, or Facebook put the account through a security check.
- A permission wasn't used for 90 days and has to be granted again.

## If posting is paused for another reason
The red banner 「发布已暂停」 can also mean:
- **「Facebook 说请求太频繁」** (Facebook error 4, 17 or 32): Facebook limits how often an app may call it. Wait a while, then tap **重试**.
- **「Facebook 暂时挡住了这个专页发帖」** (error 368): Facebook treated a post as possible spam or against its rules. Check your Page's notifications on Facebook first. Wait a while, then tap **重试**.

The banner shows Facebook's own words under 「Facebook 原话」. Approved drafts stay in the queue while posting is paused.

## Other messages in the app
| You see | What it means | What to do |
|---|---|---|
| 「抓取失败：…」 in red under 待审核 | Collecting from Shopee failed | Check `SHOPEE_APP_ID` and `SHOPEE_APP_SECRET` in the host's variables, then tap **↻ 抓取** again. If Shopee itself has a problem, try later. |
| 「海报没生成出来」 with **重试** on a card | The poster couldn't be made | Tap **重试**. If it keeps failing, look at the app's logs in Railway (Step 3). |
| 「价格变了 RM … → RM …」 | Just before posting, the price had moved more than 3 %, so the post was held back | Look at the new poster and approve again |
| 「失败」 in 已发布, with **重试** | The post didn't go out | Read the message. If it says 「可能已经发出去了」, check your Page first so it isn't posted twice. |
| 「帖子已发，但第一条评论没发出去」 | The post is live but the link comment failed | Add the link as a comment by hand on Facebook |
| 「⏳ 明天 08:00 过期」 on a card | Last day to approve this draft | Approve or skip it |
