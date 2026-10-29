'use strict';
process.env.RATE_LIMIT = '8';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures.js');
const server = require('../server.js');

const realFetch = globalThis.fetch;
const idFromUrl = (u) => ['binance.vision:binance', 'coinbase:coinbase', 'kraken:kraken', 'bitstamp:bitstamp', 'gemini:gemini', 'kucoin:kucoin', 'okx:okx', 'coindcx:coindcx', 'wazirx:wazirx']
  .map((s) => s.split(':')).find((p) => u.includes(p[0]));
let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  globalThis.fetch = async (u, o) => { // local requests are real, exchange requests use fixtures
    if (String(u).startsWith('http://127.0.0.1')) return realFetch(u, o);
    const hit = idFromUrl(String(u));
    return { ok: true, status: 200, json: async () => fixtures[hit[1]] };
  };
});
test.after(() => { globalThis.fetch = realFetch; server.close(); });

test('serves the app, legal pages and SEO files', async () => {
  for (const p of ['/', '/privacy.html', '/disclaimer.html', '/robots.txt', '/sitemap.xml', '/healthz', '/js/engine.js', '/js/config.js']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
  assert.ok((await fetch(base + '/')).headers.get('content-security-policy'));
});
test('blocks traversal and bad methods', async () => {
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
});
test('/api/compare returns normalised books', async () => {
  const r = await fetch(base + '/api/compare?coin=btc&cur=usd');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.coin, 'BTC'); assert.equal(d.exchanges.length, 9);
  assert.equal(d.exchanges.filter((e) => e.ok).length, 7);
});
test('/api/compare validates input', async () => {
  assert.equal((await fetch(base + '/api/compare?coin=FAKE&cur=USD')).status, 400);
  assert.equal((await fetch(base + '/api/compare?coin=BTC&cur=XYZ')).status, 400);
});
test('/api/status reports each exchange', async () => {
  const d = await (await fetch(base + '/api/status')).json();
  assert.equal(d.usd.length, 9); assert.equal(d.inr.length, 2);
});
test('/api/compare is rate limited', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await fetch(base + '/api/compare?coin=ETH&cur=EUR');
  assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) > 0);
});
