/* env (.env) + config.json */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* .env parser (dotenv rules): KEY=value, optional `export `, values trimmed, "quoted" / 'quoted' values kept
   as written, ` # comment` after an unquoted value dropped */
export function parseDotEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue; // blank lines and # comments
    let v = m[2].trim();
    const q = v[0];
    if (q === '"' || q === "'") {
      const end = v.indexOf(q, 1);
      v = end > 0 ? v.slice(1, end) : v.slice(1);
      if (q === '"') v = v.replace(/\\n/g, '\n');
    } else v = v.replace(/(^|\s)#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}
/* real environment variables win */
(function loadDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const [k, v] of Object.entries(parseDotEnv(fs.readFileSync(f, 'utf8')))) if (process.env[k] === undefined) process.env[k] = v;
})();

const e = process.env;
export const env = {
  SHOPEE_APP_ID: e.SHOPEE_APP_ID || '',
  SHOPEE_APP_SECRET: e.SHOPEE_APP_SECRET || '',
  SHOPEE_ENDPOINT: e.SHOPEE_ENDPOINT || 'https://open-api.affiliate.shopee.com.my/graphql',
  SHOPEE_MOCK: e.SHOPEE_MOCK === '1',
  FB_APP_ID: e.FB_APP_ID || '',
  FB_APP_SECRET: e.FB_APP_SECRET || '',
  FB_PAGE_ID: e.FB_PAGE_ID || '',
  FB_PAGE_TOKEN: e.FB_PAGE_TOKEN || '',
  FB_GRAPH_VERSION: e.FB_GRAPH_VERSION || 'v26.0',
  FB_GRAPH_BASE: (e.FB_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, ''), // tests point this at a local fake
  ADMIN_PASSWORD: e.ADMIN_PASSWORD || '',
  SESSION_SECRET: e.SESSION_SECRET || '',
  PUBLIC_URL: (e.PUBLIC_URL || '').replace(/\/$/, ''),
  PORT: Number(e.PORT || 4545),
  DATA_DIR: path.resolve(ROOT, e.DATA_DIR || './data'),
  TELEGRAM_BOT_TOKEN: e.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: e.TELEGRAM_CHAT_ID || '',
  TELEGRAM_WEBHOOK_SECRET: e.TELEGRAM_WEBHOOK_SECRET || '',
  CHROMIUM_PATH: e.CHROMIUM_PATH || ''
};

export const CONFIG_FILE = e.CONFIG_FILE ? path.resolve(ROOT, e.CONFIG_FILE) : path.join(ROOT, 'config.json');

const DEFAULTS = {
  timezone: 'Asia/Kuala_Lumpur', collectAt: '08:00', postTimes: ['12:30', '20:30'], jitterMinutes: 10, postsPerDay: 2,
  language: 'zh', linkMode: 'comment', brand: {}, voucherCode: '', hashtags: '', noRepeatDays: 30, categories: [],
  strategies: { topSellers: { enabled: true, perDay: 2 }, highestCommission: { enabled: true, perDay: 2 }, biggestDiscount: { enabled: true, perDay: 2 } },
  filters: { minRating: 4.7, minSales: 500, excludeKeywords: [] }
};

export function loadConfig() {
  let file = CONFIG_FILE;
  if (!fs.existsSync(file)) file = path.join(ROOT, 'config.example.json');
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ...DEFAULTS, ...c,
    brand: { ...DEFAULTS.brand, ...(c.brand || {}) },
    strategies: { ...DEFAULTS.strategies, ...(c.strategies || {}) },
    filters: { ...DEFAULTS.filters, ...(c.filters || {}) }
  };
}

export const dirs = {
  data: env.DATA_DIR,
  img: path.join(env.DATA_DIR, 'img'),
  out: path.join(env.DATA_DIR, 'out'),
  backup: path.join(env.DATA_DIR, 'backup')
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

/* all day/slot math uses local time in config.timezone — the same zone the scheduler (croner) is given,
   so a different TZ in the environment (the Dockerfile sets one) can't split them */
process.env.TZ = loadConfig().timezone || process.env.TZ || 'Asia/Kuala_Lumpur';
