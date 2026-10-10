/* env (.env) + config.json */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* minimal .env loader; real environment variables win */
(function loadDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
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

export function saveConfig(c) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2) + '\n');
}

export const dirs = {
  data: env.DATA_DIR,
  img: path.join(env.DATA_DIR, 'img'),
  out: path.join(env.DATA_DIR, 'out'),
  backup: path.join(env.DATA_DIR, 'backup')
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

/* all day/slot math uses local time in the configured timezone */
if (!process.env.TZ) process.env.TZ = loadConfig().timezone || 'Asia/Kuala_Lumpur';
