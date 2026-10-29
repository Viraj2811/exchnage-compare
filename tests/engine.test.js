'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const mk = (id, bids, asks) => ({ id, name: id, ok: true, bids, asks });

test('buy walks several ask levels', () => {
  const w = E.walkBuy([[100, 1], [110, 1], [120, 5]], 250); // 100 + 110 + 40 at 120
  near(w.base, 1 + 1 + 40 / 120); near(w.spent, 250); assert.equal(w.filled, true); assert.equal(w.levels, 3);
});
test('buy that exceeds depth is a partial fill', () => {
  const w = E.walkBuy([[100, 1]], 500);
  assert.equal(w.filled, false); near(w.spent, 100); near(w.base, 1);
});
test('sell walks bids downward', () => {
  const w = E.walkSell([[100, 1], [90, 2]], 2); // 1@100 + 1@90
  near(w.quote, 190); assert.equal(w.filled, true);
});
test('fee reduces coins received (buy) and proceeds (sell)', () => {
  const ex = mk('a', [[99, 10]], [[100, 10]]);
  near(E.evaluate(ex, 'buy', 1000, 0).output, 10);
  near(E.evaluate(ex, 'buy', 1000, 1).output, 9.9);
  near(E.evaluate(ex, 'sell', 2, 0.5).output, 2 * 99 * 0.995);
  near(E.evaluate(ex, 'buy', 1000, 1).effPrice, 1000 / 9.9);
});
test('spread and slippage are reported', () => {
  const ex = mk('a', [[99, 10]], [[100, 1], [101, 10]]);
  const r = E.evaluate(ex, 'buy', 201, 0);
  near(r.spreadPct, 1 / 99.5 * 100, 1e-9); assert.ok(r.slippagePct > 0);
});
test('ranking: best output first, partial and failed last', () => {
  const rows = [
    E.evaluate(mk('cheap', [[99, 100]], [[100, 100]]), 'buy', 1000, 0),
    E.evaluate(mk('dear', [[99, 100]], [[101, 100]]), 'buy', 1000, 0),
    E.evaluate(mk('thin', [[99, 1]], [[99, 1]]), 'buy', 1000, 0),
    E.evaluate({ id: 'down', ok: false }, 'buy', 1000, 0)
  ];
  const ranked = E.rank(rows);
  assert.deepEqual(ranked.map((r) => r.ex.id), ['cheap', 'dear', 'thin', 'down']);
  assert.equal(ranked[0].rank, 1); near(ranked[0].vsBest, 0); assert.ok(ranked[1].vsBest < 0); assert.equal(ranked[2].rank, undefined);
});
test('summary reports the gain in money', () => {
  const ranked = E.rank([
    E.evaluate(mk('cheap', [[99, 100]], [[100, 100]]), 'buy', 1000, 0),
    E.evaluate(mk('dear', [[99, 100]], [[101, 100]]), 'buy', 1000, 0)
  ]);
  const s = E.summarize(ranked, 'buy');
  assert.equal(s.best.ex.id, 'cheap'); assert.equal(s.worst.ex.id, 'dear'); assert.ok(s.gain > 9 && s.gain < 11);
  const sell = E.summarize(E.rank([
    E.evaluate(mk('hi', [[100, 5]], [[101, 5]]), 'sell', 2, 0),
    E.evaluate(mk('lo', [[98, 5]], [[99, 5]]), 'sell', 2, 0)
  ]), 'sell');
  near(sell.gain, 4);
});
test('empty summary is safe', () => {
  const s = E.summarize(E.rank([{ ok: false }]), 'buy');
  assert.equal(s.best, null); assert.equal(s.count, 0);
});
