/* SQLite at $DATA_DIR/app.db */
import Database from 'better-sqlite3';
import path from 'node:path';
import crypto from 'node:crypto';
import { dirs } from './config.js';

export const DB_FILE = path.join(dirs.data, 'app.db');
export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  strategy TEXT NOT NULL,            -- top | com | disc
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | skipped | expired | posting | posted | failed
  product TEXT NOT NULL,             -- JSON (mapping.productFromOffer + img)
  form TEXT NOT NULL,                -- JSON (tpl, l1, l2, photos, used, review, flash, chat, cap1, cap2, …)
  short_link TEXT,
  sub_ids TEXT,                      -- JSON array
  poster_key TEXT,                   -- hash of the studio state the poster was rendered from
  poster_error TEXT,
  price_changed TEXT,                -- JSON {from, fromPct, to, toPct} when the pre-post check returned it
  is_new INTEGER NOT NULL DEFAULT 1,
  collected_day TEXT NOT NULL,       -- yyyy-mm-dd
  created_at INTEGER NOT NULL,
  approved_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS drafts_item ON drafts(item_id);
CREATE INDEX IF NOT EXISTS drafts_status ON drafts(status);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,                -- posted | failed | returned
  at INTEGER NOT NULL,
  slot_id INTEGER,
  name TEXT, tpl TEXT, strategy TEXT, layout INTEGER,
  sub_ids TEXT,
  fb_post_id TEXT, permalink TEXT, comment_id TEXT,
  message TEXT, payload TEXT
);
CREATE INDEX IF NOT EXISTS posts_item ON posts(item_id, kind, at);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                 -- yyyy-mm-dd
  label TEXT NOT NULL,               -- configured time, e.g. 12:30
  planned_at INTEGER NOT NULL,       -- epoch ms incl. jitter
  status TEXT NOT NULL DEFAULT 'open', -- open | used | skipped | returned | failed
  draft_id TEXT,
  UNIQUE(day, label)
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_from TEXT, report_to TEXT,
  purchase_time INTEGER, sub_ids TEXT, strategy TEXT, tpl TEXT, layout INTEGER, draft_id TEXT,
  orders INTEGER, commission REAL, raw_key TEXT UNIQUE
);
`);

export const kv = {
  get(k, def = null) { const r = db.prepare('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : def; },
  set(k, v) { db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v)); },
  del(k) { db.prepare('DELETE FROM kv WHERE k=?').run(k); }
};

export const newDraftId = () => 'd' + crypto.randomBytes(4).toString('hex');

const parse = r => r && {
  id: r.id, itemId: r.item_id, shopId: r.shop_id, strat: r.strategy, status: r.status,
  p: JSON.parse(r.product), form: JSON.parse(r.form),
  shortLink: r.short_link, subIds: r.sub_ids ? JSON.parse(r.sub_ids) : [],
  posterKey: r.poster_key, posterError: r.poster_error,
  priceChanged: r.price_changed ? JSON.parse(r.price_changed) : null,
  isNew: !!r.is_new, collectedDay: r.collected_day,
  createdAt: r.created_at, approvedAt: r.approved_at, updatedAt: r.updated_at
};

export const drafts = {
  get: id => parse(db.prepare('SELECT * FROM drafts WHERE id=?').get(id)),
  list: (status) => db.prepare('SELECT * FROM drafts WHERE status=? ORDER BY ' + (status === 'approved' ? 'approved_at' : 'created_at DESC, rowid')).all(status).map(parse),
  insert(d) {
    const now = Date.now();
    db.prepare(`INSERT INTO drafts(id,item_id,shop_id,strategy,status,product,form,short_link,sub_ids,is_new,collected_day,created_at,updated_at)
      VALUES(@id,@itemId,@shopId,@strat,'draft',@p,@form,@shortLink,@subIds,1,@collectedDay,@now,@now)`)
      .run({ ...d, p: JSON.stringify(d.p), form: JSON.stringify(d.form), subIds: JSON.stringify(d.subIds || []), now });
  },
  update(id, fields) {
    const map = { status: 'status', p: 'product', form: 'form', shortLink: 'short_link', subIds: 'sub_ids', posterKey: 'poster_key', posterError: 'poster_error',
      priceChanged: 'price_changed', isNew: 'is_new', approvedAt: 'approved_at' };
    const sets = [], vals = {};
    for (const [k, v] of Object.entries(fields)) {
      const col = map[k]; if (!col) throw new Error('unknown draft field ' + k);
      sets.push(`${col}=@${k}`);
      vals[k] = (k === 'p' || k === 'form' || k === 'subIds' || k === 'priceChanged') ? (v === null ? null : JSON.stringify(v)) : (typeof v === 'boolean' ? +v : v);
    }
    sets.push('updated_at=@_now'); vals._now = Date.now();
    db.prepare(`UPDATE drafts SET ${sets.join(',')} WHERE id=@_id`).run({ ...vals, _id: id });
  },
  /* item already pending / approved */
  queuedItem: itemId => !!db.prepare("SELECT 1 FROM drafts WHERE item_id=? AND status IN ('draft','approved','posting','failed')").get(String(itemId)),
  /* item posted within the last `days` days */
  postedWithin: (itemId, days) => !!db.prepare("SELECT 1 FROM posts WHERE item_id=? AND kind='posted' AND at>=?").get(String(itemId), Date.now() - days * 86400e3),
  shopsOnDay: day => new Set(db.prepare('SELECT shop_id FROM drafts WHERE collected_day=?').all(day).map(r => r.shop_id))
};

/* yyyy-mm-dd / yyyymmdd in local (TZ) time */
export const dayStr = (t = new Date()) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export const ymd = (t = new Date()) => dayStr(t).replace(/-/g, '');
