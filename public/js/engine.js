/* Pure pricing engine: walks real order books to get the true price for YOUR order size. Browser + Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EPS = 1e-12;

  /** Spend `spend` (quote currency) buying from asks (ascending). */
  function walkBuy(asks, spend) {
    var left = spend, base = 0, used = 0;
    for (var i = 0; i < asks.length && left > EPS; i++) {
      var p = asks[i][0], q = asks[i][1], cost = p * q;
      used++;
      if (cost >= left) { base += left / p; left = 0; } else { base += q; left -= cost; }
    }
    var spent = spend - left;
    return { base: base, spent: spent, filled: left <= spend * 1e-9, avg: base > 0 ? spent / base : NaN, levels: used };
  }

  /** Sell `qty` coins into bids (descending). */
  function walkSell(bids, qty) {
    var left = qty, quote = 0, used = 0;
    for (var i = 0; i < bids.length && left > EPS; i++) {
      var p = bids[i][0], q = bids[i][1];
      used++;
      if (q >= left) { quote += left * p; left = 0; } else { quote += q * p; left -= q; }
    }
    var sold = qty - left;
    return { quote: quote, sold: sold, filled: left <= qty * 1e-9, avg: sold > 0 ? quote / sold : NaN, levels: used };
  }

  /** side 'buy': amount = money to spend, output = coins received. side 'sell': amount = coins, output = money received. */
  function evaluate(ex, side, amount, feePct) {
    if (!ex || !ex.ok) return { ex: ex, ok: false };
    var fee = feePct > 0 ? feePct : 0;
    var bid = ex.bids[0][0], ask = ex.asks[0][0], mid = (bid + ask) / 2;
    var r = { ex: ex, ok: true, bid: bid, ask: ask, spreadPct: (ask - bid) / mid * 100, feePct: fee };
    if (side === 'buy') {
      var w = walkBuy(ex.asks, amount), net = w.base * (1 - fee / 100);
      r.output = net; r.filled = w.filled; r.used = w.spent; r.levels = w.levels;
      r.effPrice = net > 0 ? w.spent / net : NaN;
      r.slippagePct = w.base > 0 ? (w.avg / ask - 1) * 100 : 0;
    } else {
      var s = walkSell(ex.bids, amount), proceeds = s.quote * (1 - fee / 100);
      r.output = proceeds; r.filled = s.filled; r.used = s.sold; r.levels = s.levels;
      r.effPrice = s.sold > 0 ? proceeds / s.sold : NaN;
      r.slippagePct = s.sold > 0 ? (1 - s.avg / bid) * 100 : 0;
    }
    return r;
  }

  /** Orders rows: complete fills by output, then partial fills, then unavailable. Adds rank and vsBest. */
  function rank(rows) {
    var full = rows.filter(function (r) { return r.ok && r.filled && r.output > 0; });
    var partial = rows.filter(function (r) { return r.ok && !(r.filled && r.output > 0); });
    var bad = rows.filter(function (r) { return !r.ok; });
    full.sort(function (a, b) { return b.output - a.output; });
    partial.sort(function (a, b) { return b.used - a.used; });
    var top = full.length ? full[0].output : NaN;
    full.forEach(function (r, i) { r.rank = i + 1; r.vsBest = (r.output / top - 1) * 100; });
    return full.concat(partial, bad);
  }

  /** Best vs worst among exchanges that can fill the whole order. gain is in money terms. */
  function summarize(ranked, side) {
    var full = ranked.filter(function (r) { return r.rank; });
    if (!full.length) return { best: null, worst: null, gain: 0, gainPct: 0, count: 0 };
    var best = full[0], worst = full[full.length - 1];
    if (full.length < 2) return { best: best, worst: null, gain: 0, gainPct: 0, count: 1 };
    var diff = best.output - worst.output;
    return { best: best, worst: worst, count: full.length,
      gain: side === 'buy' ? diff * best.effPrice : diff,
      gainPct: (best.output / worst.output - 1) * 100 };
  }

  return { walkBuy: walkBuy, walkSell: walkSell, evaluate: evaluate, rank: rank, summarize: summarize };
});
