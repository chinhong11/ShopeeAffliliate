/* public privacy policy + data deletion instructions: the two URLs Meta asks for before an app can go Live (SETUP.md 2h).
   English, because Meta reviews it. Change "Last updated" when the text changes. */
import { esc } from './html.js';

export function privacyView({ page }) {
  const p = esc(page);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy policy · ${p}</title>
<style>body{margin:0;background:#fbf6ee;color:#1c1c1e;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 48px}h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 6px}p,li{margin:6px 0}.soft{color:#5c5c5c;font-size:14px}</style>
</head><body><main>
<h1>Privacy policy</h1>
<p class="soft">${p} · Last updated 4 November 2026</p>

<h2>What this app is</h2>
<p>This app is a private tool. Only the owner of the Facebook Page ${p} uses it, to prepare posts and publish them on that Page. It is not offered to anyone else.</p>

<h2>What it uses from Facebook</h2>
<p>An access token for the owner's own Page. The app uses it to publish posts and the first comment on that Page, to read the link of a post it published, and to check once a day that the token still works.</p>
<p>It does not read, collect or store information about people who see, like, share or comment on the Page.</p>

<h2>What it stores</h2>
<ul>
<li>The posts it prepares (pictures, text, product details and links) and a list of what it published, on the owner's own server.</li>
<li>For sign-in protection, the IP address of a failed sign-in attempt to the owner's login page, for 15 minutes.</li>
</ul>
<p>Nothing is sold or shared with anyone for advertising.</p>

<h2>Other services it uses</h2>
<ul>
<li>Shopee Affiliate Open API: product details and affiliate links.</li>
<li>Google Gemini (optional): product details, product photos and post text are sent to suggest designs and post text.</li>
<li>Telegram (optional): messages to the owner only.</li>
</ul>

<h2 id="delete">Data deletion</h2>
<p>This app does not keep personal data about Facebook users, so there is normally nothing to delete. If you believe it holds data about you, send a message to the Page ${p} and ask for it to be deleted. The owner will delete it and reply to tell you it is done.</p>
<p>The Page's admin can stop the app at any time by removing it from their Facebook settings. Facebook then no longer accepts its token.</p>
</main></body></html>`;
}
