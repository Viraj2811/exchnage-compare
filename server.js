'use strict';
// Zero-dependency server: serves /public and exposes /api/compare (live order books from exchanges).
const http = require('http');
const fs = require('fs');
const path = require('path');
const X = require('./lib/exchanges.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 60;   // /api/compare requests per IP per minute
const STATUS_LIMIT = 6;                                     // /api/status requests per IP per minute
const WINDOW_MS = 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8'
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://plausible.io; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://plausible.io; frame-ancestors 'self'; base-uri 'self'; form-action 'none'"
};

const hits = new Map();
function clientIp(req) {
  if (TRUST_PROXY) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]; // last hop is added by our own proxy, so it can't be spoofed
  }
  return req.socket.remoteAddress || 'unknown';
}
function retryAfter(key, limit) {
  const now = Date.now();
  let e = hits.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + WINDOW_MS }; hits.set(key, e); }
  e.n++;
  return e.n > limit ? Math.ceil((e.reset - now) / 1000) : 0;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, WINDOW_MS).unref();

function send(res, status, headers, body) {
  res.writeHead(status, Object.assign({}, SECURITY, headers));
  res.end(body);
}
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const sendJson = (res, status, obj, extra) => send(res, status, Object.assign({}, JSON_H, extra), JSON.stringify(obj));

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, {}, 'Bad request'); }

  if (url.pathname === '/healthz') return send(res, 200, { 'Content-Type': 'text/plain' }, 'ok');

  if (url.pathname === '/api/compare') {
    const wait = retryAfter('c:' + clientIp(req), RATE_LIMIT);
    if (wait) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(wait) });
    const coin = (url.searchParams.get('coin') || '').toUpperCase();
    const cur = (url.searchParams.get('cur') || '').toUpperCase();
    if (X.COINS.indexOf(coin) < 0 || X.CURRENCIES.indexOf(cur) < 0) return sendJson(res, 400, { error: 'Unsupported coin or currency' });
    try { return sendJson(res, 200, await X.compare(coin, cur)); }
    catch (e) { return sendJson(res, 502, { error: 'Price sources unavailable' }); }
  }

  if (url.pathname === '/api/status') { // quick health view of every exchange, useful right after deploying
    const wait = retryAfter('s:' + clientIp(req), STATUS_LIMIT);
    if (wait) return sendJson(res, 429, { error: 'Too many requests' }, { 'Retry-After': String(wait) });
    try {
      const [usd, inr] = await Promise.all([X.probe('BTC', 'USD'), X.probe('BTC', 'INR')]);
      return sendJson(res, 200, { checked: new Date().toISOString(), usd: usd, inr: inr.filter((e) => e.quote) });
    } catch (e) { return sendJson(res, 502, { error: 'Probe failed' }); }
  }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, {}, 'Bad request'); }
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, {}, 'Forbidden');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { /* handled below */ }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    const ext = path.extname(file).toLowerCase();
    send(res, 200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }, req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error'));
});

if (require.main === module) {
  // If the default port is busy, try the next ones. If PORT was set on purpose, explain and exit.
  const explicit = Boolean(process.env.PORT);
  const tries = explicit ? 1 : 10;
  let port = PORT, attempt = 0;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      attempt++;
      if (attempt < tries) { port++; return server.listen(port, '0.0.0.0'); }
      console.error('Port ' + port + ' is already in use. Close the other program using it, or pick another port.');
      console.error('PowerShell: $env:PORT=4000; npm start     Mac/Linux: PORT=4000 npm start');
    } else console.error('Server error: ' + err.message);
    process.exit(1);
  });
  server.on('listening', () => console.log('Exchange price compare running on http://localhost:' + server.address().port));
  server.listen(port, '0.0.0.0');
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = server;
