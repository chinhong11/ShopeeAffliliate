/* renderer recovery: a crashed or stuck Chromium fails that render quickly and the next one works.
   Needs Playwright's Chromium and Linux `ps`; skipped otherwise. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'render-'));
Object.assign(process.env, { GEMINI_API_KEY: '', // never the real key from .env
  DATA_DIR: tmp, CONFIG_FILE: path.join(tmp, 'none.json'), RENDER_TIMEOUT_MS: '15000' });
const can = process.platform === 'linux' && (process.env.CHROMIUM_PATH || fs.existsSync(chromium.executablePath()));
const { renderState, closeBrowser } = await import('../src/render.js');
test.after(() => closeBrowser());

const photo = 'data:image/jpeg;base64,' + fs.readFileSync(new URL('../design/review-photos/p-cd-skate.jpg', import.meta.url)).toString('base64');
const state = src => ({ tpl: 't1', layout: 1, lang: 'zh', photos: [src], l1: '测试', l2: 'x', price: true, now: 'RM 1.00', was: '', pct: '', seal: false, sealLabel: 'OFF', proof: false, rate: '', sold: '已售 1', voucher: false, voucherCode: '', cta: true, ctaText: '评论区拿链接 👇', arrow: true, shopee: true, badge: true, bstyle: 'lee', bInit: 'L', bName: 'LEE', bTag: 'S', badgec: '#000', cd: { h: '00', m: '00', s: '00' }, stockTxt: '', stockPct: 0, review: { quote: '', author: '' }, chat: { title: '', sub: '', m1: '', m2: '', m3: '' }, cap: { mode: 'comment', name: 'x', link: '', price: 'RM 1.00', code: '', tags: '' } });
/* renderer processes of the Chromium this test launched (descendants of this process only — never anyone else's browser) */
function renderers() {
  const rows = execSync('ps -eo pid=,ppid=,args=').toString().trim().split('\n').map(l => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], args: m[3] }; }).filter(Boolean);
  const mine = new Set([process.pid]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } }
  return rows.filter(r => mine.has(r.pid) && r.args.includes('--type=renderer')).map(r => r.pid);
}

test('renderer killed mid-render (e.g. out of memory): that render fails fast, the next one works', { skip: !can && 'no Chromium' }, async () => {
  const t0 = Date.now();
  const job = renderState(state(photo));
  let killed = 0;
  for (let i = 0; i < 100 && !killed; i++) { await new Promise(r => setTimeout(r, 100)); for (const p of renderers()) { try { process.kill(p, 'SIGKILL'); killed++; } catch {} } }
  assert.ok(killed, 'found a renderer to kill');
  await assert.rejects(job, /崩溃|超时|closed|crash/i);
  assert.ok(Date.now() - t0 < 30000);
  const ok = await renderState(state(photo));
  assert.ok(ok.png.length > 10000);
});

test('stuck render (a photo that never loads): fails at the deadline, the next one works', { skip: !can && 'no Chromium' }, async () => {
  const hang = http.createServer(() => {}); // accepts, never answers
  await new Promise(r => hang.listen(0, '127.0.0.1', r));
  const t0 = Date.now();
  await assert.rejects(renderState(state(`http://127.0.0.1:${hang.address().port}/x.jpg`)), /超时|timeout/i);
  assert.ok(Date.now() - t0 < 30000); // the 15 s deadline: a fresh Chromium start next to other test files' renders needs more than 8 s
  hang.close();
  const ok = await renderState(state(photo));
  assert.ok(ok.png.length > 10000);
});
