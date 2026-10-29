'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures.js');
const X = require('../lib/exchanges.js');

const realFetch = globalThis.fetch;
let calls = [];
function mockFetch(handler) {
  globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
}
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const idFromUrl = (u) => u.includes('binance.vision') ? 'binance' : u.includes('coinbase') ? 'coinbase' : u.includes('kraken') ? 'kraken'
  : u.includes('bitstamp') ? 'bitstamp' : u.includes('gemini') ? 'gemini' : u.includes('kucoin') ? 'kucoin' : u.includes('okx') ? 'okx'
  : u.includes('coindcx') ? 'coindcx' : u.includes('wazirx') ? 'wazirx' : null;

test.beforeEach(() => { X.clearCache(); calls = []; });
test.after(() => { globalThis.fetch = realFetch; });

test('toLevels handles arrays, objects and maps, sorts and cleans', () => {
  assert.deepEqual(X.toLevels([['2', '1'], ['3', '1'], ['x', '1'], ['4', '0']], true), [[3, 1], [2, 1]]);
  assert.deepEqual(X.toLevels([{ price: '5', amount: '2' }, { price: '4', quantity: '1' }], false), [[4, 1], [5, 2]]);
  assert.deepEqual(X.toLevels({ '10': '1', '12': '3' }, true), [[12, 3], [10, 1]]);
  assert.deepEqual(X.toLevels(null, true), []);
  assert.equal(X.toLevels(Array.from({ length: 80 }, (_, i) => [i + 1, 1]), false).length, 50);
});

test('every adapter parses its response shape (USD)', async () => {
  mockFetch((u) => json(fixtures[idFromUrl(u)]));
  const d = await X.compare('BTC', 'USD');
  for (const e of d.exchanges.filter((x) => x.quote)) {
    assert.equal(e.ok, true, e.id + ' ' + e.error);
    assert.equal(e.bids[0][0], 100.5, e.id); assert.equal(e.asks[0][0], 100.6, e.id);
    assert.ok(e.bids[0][0] < e.asks[0][0]);
  }
});

test('INR only queries Indian exchanges; others are marked unsupported without a request', async () => {
  mockFetch((u) => json(fixtures[idFromUrl(u)]));
  const d = await X.compare('ETH', 'INR');
  assert.deepEqual(calls.map(idFromUrl).sort(), ['coindcx', 'wazirx']);
  const binance = d.exchanges.find((e) => e.id === 'binance');
  assert.equal(binance.ok, false); assert.equal(binance.code, 'unsupported');
  assert.ok(calls.some((u) => u.includes('I-ETH_INR')));
});

test('Kraken uses XBT and XDG symbols', async () => {
  mockFetch((u) => json(fixtures[idFromUrl(u)]));
  await X.compare('BTC', 'USD'); assert.ok(calls.some((u) => u.includes('pair=XBTUSD')));
  X.clearCache(); calls = [];
  await X.compare('DOGE', 'USD'); assert.ok(calls.some((u) => u.includes('pair=XDGUSD')));
});

test('errors are mapped to friendly messages and never throw', async () => {
  mockFetch((u) => {
    const id = idFromUrl(u);
    if (id === 'binance') return json({}, 451);
    if (id === 'coinbase') return json({}, 404);
    if (id === 'kraken') return json({ error: ['EQuery:Unknown asset pair'] });
    if (id === 'bitstamp') throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    if (id === 'gemini') return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } };
    if (id === 'kucoin') return json({}, 429);
    if (id === 'okx') return json({ code: '0', data: [{ bids: [], asks: [] }] });
    throw new Error('network down');
  });
  const d = await X.compare('BTC', 'USD'); const by = Object.fromEntries(d.exchanges.map((e) => [e.id, e]));
  assert.equal(by.binance.code, 'blocked'); assert.equal(by.coinbase.code, 'unlisted'); assert.equal(by.kraken.code, 'unlisted');
  assert.equal(by.bitstamp.code, 'timeout'); assert.equal(by.gemini.code, 'bad'); assert.equal(by.kucoin.code, 'limited');
  assert.equal(by.okx.code, 'empty');
  assert.ok(d.exchanges.every((e) => e.ok === false && typeof e.error === 'string'));
});

test('good data is cached and shared between concurrent callers', async () => {
  mockFetch((u) => json(fixtures[idFromUrl(u)]));
  await Promise.all([X.compare('BTC', 'USD'), X.compare('BTC', 'USD')]);
  const first = calls.length; assert.equal(first, 7);
  await X.compare('BTC', 'USD'); assert.equal(calls.length, first);
});

test('rejects unsupported coin or currency', async () => {
  await assert.rejects(() => X.compare('FAKE', 'USD'), RangeError);
  await assert.rejects(() => X.compare('BTC', 'XYZ'), RangeError);
});
