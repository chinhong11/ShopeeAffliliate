/* daily backup of app.db on the volume, keep 7 (README Step 8). `npm run backup` */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dirs } from './config.js';
import { db, dayStr } from './db.js';

export const KEEP = 7;
export async function backup({ log = console.log } = {}) {
  const file = path.join(dirs.backup, `app-${dayStr()}.db`);
  await db.backup(file); // consistent online copy (WAL-safe)
  const all = fs.readdirSync(dirs.backup).filter(f => /^app-\d{4}-\d\d-\d\d\.db$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(dirs.backup, f));
  log(`backup → ${file} (keeping ${Math.min(all.length, KEEP)})`);
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) backup().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
