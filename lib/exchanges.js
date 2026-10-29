'use strict';
/* Exchange adapters: fetch public order books and normalise them to { bids, asks } = [[price, qty], ...]. */

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'LTC'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];
const DEPTH = 50;            // levels kept per side
const TIMEOUT_MS = 6000;
const OK_TTL_MS = 5000;      // reuse good data for 5s (protects exchanges from our own traffic)
const FAIL_TTL_MS = 10000;   // back off for failed exchanges

/* fee = entry-tier spot TAKER fee in percent. feeVerified = checked against sources on feeChecked date. */
const EXCHANGES = [
  { id: 'binance', name: 'Binance', site: 'https://www.binance.com', fee: 0.1, feeVerified: true,
    quotes: { USD: 'USDT', EUR: 'EUR', GBP: 'GBP' },
    url: (b, q) => 'https://data-api.binance.vision/api/v3/depth?symbol=' + b + q + '&limit=100',
    book: (j) => [j.bids, j.asks] },
  { id: 'coinbase', name: 'Coinbase', site: 'https://www.coinbase.com', fee: 0.9, feeVerified: true,
    quotes: { USD: 'USD', EUR: 'EUR', GBP: 'GBP' },
    url: (b, q) => 'https://api.exchange.coinbase.com/products/' + b + '-' + q + '/book?level=2',
    book: (j) => [j.bids, j.asks] },
  { id: 'kraken', name: 'Kraken', site: 'https://www.kraken.com', fee: 0.8, feeVerified: true,
    quotes: { USD: 'USD', EUR: 'EUR', GBP: 'GBP' }, alias: { BTC: 'XBT', DOGE: 'XDG' },
    url: (b, q) => 'https://api.kraken.com/0/public/Depth?pair=' + b + q + '&count=100',
    book: (j) => {
      if (j.error && j.error.length) throw coded('unlisted', 'Pair not listed');
      const r = Object.values(j.result || {})[0];
      if (!r) throw coded('empty', 'Empty order book');
      return [r.bids, r.asks];
    } },
  { id: 'bitstamp', name: 'Bitstamp', site: 'https://www.bitstamp.net', fee: 0.4, feeVerified: false,
    quotes: { USD: 'USD', EUR: 'EUR', GBP: 'GBP' },
    url: (b, q) => 'https://www.bitstamp.net/api/v2/order_book/' + b.toLowerCase() + q.toLowerCase() + '/',
    book: (j) => [j.bids, j.asks] },
  { id: 'gemini', name: 'Gemini', site: 'https://www.gemini.com', fee: 0.4, feeVerified: false,
    quotes: { USD: 'USD', EUR: 'EUR', GBP: 'GBP' },
    url: (b, q) => 'https://api.gemini.com/v1/book/' + b.toLowerCase() + q.toLowerCase() + '?limit_bids=50&limit_asks=50',
    book: (j) => [j.bids, j.asks] },
  { id: 'kucoin', name: 'KuCoin', site: 'https://www.kucoin.com', fee: 0.1, feeVerified: false,
    quotes: { USD: 'USDT', EUR: 'EUR' },
    url: (b, q) => 'https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=' + b + '-' + q,
    book: (j) => {
      if (String(j.code) !== '200000' || !j.data) throw coded('unlisted', 'Pair not listed');
      return [j.data.bids, j.data.asks];
    } },
  { id: 'okx', name: 'OKX', site: 'https://www.okx.com', fee: 0.1, feeVerified: false,
    quotes: { USD: 'USDT', EUR: 'EUR' },
    url: (b, q) => 'https://www.okx.com/api/v5/market/books?instId=' + b + '-' + q + '&sz=100',
    book: (j) => {
      if (String(j.code) !== '0' || !j.data || !j.data[0]) throw coded('unlisted', 'Pair not listed');
      return [j.data[0].bids, j.data[0].asks];
    } },
  { id: 'coindcx', name: 'CoinDCX', site: 'https://coindcx.com', fee: 0.2, feeVerified: false,
    quotes: { INR: 'INR' },
    url: (b, q) => 'https://public.coindcx.com/market_data/orderbook?pair=I-' + b + '_' + q,
    book: (j) => [j.bids, j.asks] },
  { id: 'wazirx', name: 'WazirX', site: 'https://wazirx.com', fee: 0.2, feeVerified: false,
    quotes: { INR: 'INR' },
    url: (b, q) => 'https://api.wazirx.com/sapi/v1/depth?symbol=' + b.toLowerCase() + q.toLowerCase() + '&limit=50',
    book: (j) => [j.bids, j.asks] }
];

function coded(code, message) { const e = new Error(message); e.code = code; return e; }

/** Accepts [[p,q,...]], [{price,amount}], or {price: qty}. Returns sorted, cleaned, trimmed levels. */
function toLevels(src, descending) {
  let out = [];
  if (Array.isArray(src)) {
    out = src.map((r) => Array.isArray(r)
      ? [Number(r[0]), Number(r[1])]
      : [Number(r && (r.price !== undefined ? r.price : r.p)),
         Number(r && (r.amount !== undefined ? r.amount : r.quantity !== undefined ? r.quantity : r.size !== undefined ? r.size : r.q))]);
  } else if (src && typeof src === 'object') {
    out = Object.keys(src).map((p) => [Number(p), Number(src[p])]);
  }
  out = out.filter((l) => isFinite(l[0]) && isFinite(l[1]) && l[0] > 0 && l[1] > 0);
  out.sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]));
  return out.slice(0, DEPTH);
}

function friendly(e) {
  if (e && e.code) {
    if (e.code === 'http') {
      const s = e.status;
      if (s === 400 || s === 404) return { code: 'unlisted', error: 'Pair not listed' };
      if (s === 403 || s === 451) return { code: 'blocked', error: 'Blocked from the server location' };
      if (s === 429) return { code: 'limited', error: 'Exchange rate limit hit' };
      return { code: 'http', error: 'Exchange error (HTTP ' + s + ')' };
    }
    return { code: e.code, error: e.message };
  }
  if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { code: 'timeout', error: 'Timed out' };
  if (e instanceof SyntaxError) return { code: 'bad', error: 'Unreadable response' };
  return { code: 'network', error: 'Could not connect' };
}

const cache = new Map();
const inflight = new Map();

async function fetchBook(ex, coin, cur) {
  const meta = { id: ex.id, name: ex.name, site: ex.site, fee: ex.fee, feeVerified: ex.feeVerified, quote: ex.quotes[cur] || null };
  if (!meta.quote) return Object.assign(meta, { ok: false, code: 'unsupported', error: 'No ' + cur + ' market' });

  const base = (ex.alias && ex.alias[coin]) || coin;
  const key = ex.id + '|' + base + '|' + meta.quote;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const t0 = Date.now();
    let value;
    try {
      const res = await fetch(ex.url(base, meta.quote), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json', 'user-agent': 'ExchangePriceCompare/1.0' }
      });
      if (!res.ok) { const err = coded('http', 'HTTP ' + res.status); err.status = res.status; throw err; }
      const pair = ex.book(await res.json());
      const bids = toLevels(pair[0], true);
      const asks = toLevels(pair[1], false);
      if (!bids.length || !asks.length) throw coded('empty', 'Empty order book');
      value = Object.assign({}, meta, { ok: true, bids: bids, asks: asks, ms: Date.now() - t0, ts: Date.now() });
    } catch (e) {
      const f = friendly(e);
      value = Object.assign({}, meta, { ok: false, code: f.code, error: f.error, ms: Date.now() - t0 });
    }
    cache.set(key, { value: value, until: Date.now() + (value.ok ? OK_TTL_MS : FAIL_TTL_MS) });
    return value;
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

async function compare(coin, cur) {
  if (COINS.indexOf(coin) < 0) throw new RangeError('Unsupported coin');
  if (CURRENCIES.indexOf(cur) < 0) throw new RangeError('Unsupported currency');
  const exchanges = await Promise.all(EXCHANGES.map((ex) => fetchBook(ex, coin, cur)));
  return { coin: coin, cur: cur, ts: Date.now(), exchanges: exchanges };
}

/** Health probe used by /api/status and scripts/check-exchanges.js */
async function probe(coin, cur) {
  const d = await compare(coin, cur);
  return d.exchanges.map((e) => ({ id: e.id, name: e.name, quote: e.quote, ok: e.ok, error: e.error || null, ms: e.ms || 0,
    bestBid: e.ok ? e.bids[0][0] : null, bestAsk: e.ok ? e.asks[0][0] : null }));
}

function clearCache() { cache.clear(); inflight.clear(); }

module.exports = { COINS, CURRENCIES, EXCHANGES, toLevels, compare, probe, fetchBook, clearCache };
