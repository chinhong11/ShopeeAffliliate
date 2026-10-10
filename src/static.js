/* tiny static server for /studio/ when the renderer runs outside the web server (CLI scripts) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

export function startStudioServer() {
  const base = path.join(ROOT, 'studio');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!u.startsWith('/studio/')) { res.writeHead(404).end(); return; }
    const f = path.join(base, path.normalize(u.slice('/studio/'.length)));
    if (!f.startsWith(base + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}
