/* one-password login: signed cookie (SESSION_SECRET), 30 days, max 5 failed tries per 15 min */
import crypto from 'node:crypto';
import { env } from './config.js';
import { db } from './db.js';

const COOKIE = 'rv_s';
const DAYS30 = 30 * 86400e3;
const WINDOW = 15 * 60e3, MAX_TRIES = 5, MAX_GLOBAL = 50;

let secret = env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET not set: using a random one (logins reset on restart)');
}
/* the password is part of the key: changing ADMIN_PASSWORD logs out every device */
const mac = s => crypto.createHmac('sha256', secret + '\0' + (env.ADMIN_PASSWORD || '')).update(s).digest('base64url');
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function sessionCookie() {
  const exp = Date.now() + DAYS30;
  const v = `${exp}.${mac(String(exp))}`;
  const secure = env.PUBLIC_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS30 / 1000}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function isAuthed(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  return !!sig && Number(exp) > Date.now() && eq(sig, mac(exp));
}

/* returns {ok} or {ok:false, error, locked} */
export function tryLogin(ip, password) {
  const since = Date.now() - WINDOW;
  db.prepare('DELETE FROM login_attempts WHERE at<?').run(since);
  const mine = db.prepare('SELECT COUNT(*) n FROM login_attempts WHERE ip=?').get(ip).n;
  const all = db.prepare('SELECT COUNT(*) n FROM login_attempts').get().n;
  if (mine >= MAX_TRIES || all >= MAX_GLOBAL) return { ok: false, locked: true, error: '输错太多次了，15 分钟后再试' };
  if (!env.ADMIN_PASSWORD) return { ok: false, error: '服务器还没设置 ADMIN_PASSWORD' };
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  if (crypto.timingSafeEqual(h(password), h(env.ADMIN_PASSWORD))) {
    db.prepare('DELETE FROM login_attempts WHERE ip=?').run(ip);
    return { ok: true };
  }
  db.prepare('INSERT INTO login_attempts(ip,at) VALUES(?,?)').run(ip, Date.now());
  const left = MAX_TRIES - mine - 1;
  return { ok: false, error: left > 0 ? `密码不对，还可以试 ${left} 次` : '输错太多次了，15 分钟后再试', locked: left <= 0 };
}
