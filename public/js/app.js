(function () {
  'use strict';

  var CFG = window.SITE_CONFIG || {};
  var REFRESH = Math.max(5, Number(CFG.refreshSeconds) || 15);
  var COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'LTC'];
  var CURS = ['USD', 'EUR', 'GBP', 'INR'];
  var DEFAULT_BUY = { USD: 1000, EUR: 1000, GBP: 1000, INR: 50000 };
  var DEFAULT_SELL = { BTC: 0.05, ETH: 1, SOL: 10, XRP: 1000, DOGE: 5000, ADA: 2000, LTC: 10 };
  var QUICK_BUY = { USD: [100, 500, 1000, 5000], EUR: [100, 500, 1000, 5000], GBP: [100, 500, 1000, 5000], INR: [10000, 50000, 100000, 500000] };
  var QUICK_SELL = { BTC: [0.01, 0.05, 0.1, 0.5], ETH: [0.1, 1, 5, 10], SOL: [1, 10, 50, 100], XRP: [100, 1000, 5000, 10000], DOGE: [1000, 5000, 20000, 50000], ADA: [500, 2000, 10000, 50000], LTC: [1, 10, 50, 100] };
  var STORE = 'priceboard.v1';

  var $ = function (id) { return document.getElementById(id); };
  var state = { coin: 'BTC', cur: 'USD', side: 'buy', amount: '', feesOn: true, fees: {}, data: null, err: '', lastOk: 0, nextAt: 0, loading: false, req: 0 };

  /* ---------- helpers ---------- */
  function parse(v) {
    var s = String(v == null ? '' : v).replace(/[,\s]/g, '');
    return /^(\d*\.?\d+|\d+\.)$/.test(s) ? parseFloat(s) : NaN;
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function money(v) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v), d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
    try {
      return new Intl.NumberFormat(state.cur === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: state.cur, minimumFractionDigits: a >= 1000 ? 2 : 2, maximumFractionDigits: d }).format(v);
    } catch (e) { return v.toFixed(2) + ' ' + state.cur; }
  }
  function coinFmt(v) {
    if (!isFinite(v)) return '—';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: v >= 1000 ? 2 : v >= 1 ? 4 : 8 }).format(v);
  }
  function plain(v) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(v); }
  function safeUrl(u) { return /^https:\/\//.test(u || '') ? u : ''; }
  function track(name, props) { try { if (window.plausible) window.plausible(name, props ? { props: props } : undefined); } catch (e) { /* never break the tool */ } }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ coin: state.coin, cur: state.cur, side: state.side, feesOn: state.feesOn, fees: state.fees })); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!o) return false;
      if (COINS.indexOf(o.coin) >= 0) state.coin = o.coin;
      if (CURS.indexOf(o.cur) >= 0) state.cur = o.cur;
      if (o.side === 'buy' || o.side === 'sell') state.side = o.side;
      state.feesOn = o.feesOn !== false;
      if (o.fees && typeof o.fees === 'object') Object.keys(o.fees).forEach(function (k) { var n = Number(o.fees[k]); if (isFinite(n) && n >= 0 && n < 10) state.fees[k] = n; });
      return true;
    } catch (e) { return false; }
  }
  function defaultAmount() { return String(state.side === 'buy' ? DEFAULT_BUY[state.cur] : DEFAULT_SELL[state.coin]); }
  function feeFor(ex) { return !state.feesOn ? 0 : (state.fees[ex.id] != null ? state.fees[ex.id] : ex.fee); }

  /* ---------- data loading ---------- */
  function fetchData() {
    var id = ++state.req, coin = state.coin, cur = state.cur;
    state.loading = true;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    fetch('/api/compare?coin=' + coin + '&cur=' + cur, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (id !== state.req) return;
      if (!d || !Array.isArray(d.exchanges)) throw new Error('bad data');
      state.data = d; state.err = ''; state.lastOk = Date.now();
      buildFeePanel(d.exchanges);
    }).catch(function (e) {
      if (id !== state.req) return;
      state.err = e && e.message === 'HTTP 429' ? 'Too many refreshes. Waiting a moment.' : 'Could not reach the price server.';
    }).then(function () {
      if (timer) clearTimeout(timer);
      if (id !== state.req) return;
      state.loading = false; state.nextAt = Date.now() + REFRESH * 1000;
      render(); tick();
    });
  }

  /* ---------- rendering ---------- */
  function buildFeePanel(exs) {
    var grid = $('fee-grid');
    if (grid.childNodes.length) return;
    exs.forEach(function (ex) {
      var lab = el('label'); lab.appendChild(el('span', null, ex.name + (ex.feeVerified ? '' : ' (est.)')));
      var inp = el('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = String(state.fees[ex.id] != null ? state.fees[ex.id] : ex.fee);
      inp.setAttribute('aria-label', ex.name + ' fee percent'); inp.setAttribute('data-id', ex.id); inp.setAttribute('data-default', String(ex.fee));
      inp.addEventListener('input', function () {
        var n = parse(inp.value);
        if (isFinite(n) && n >= 0 && n < 10) state.fees[ex.id] = n; else delete state.fees[ex.id];
        save(); render();
      });
      lab.appendChild(inp); grid.appendChild(lab);
    });
  }

  function msg(text, bad) { var d = el('div', 'msg' + (bad ? ' bad' : ''), text); return d; }

  function render() {
    var summary = $('summary'), rows = $('rows'), note = $('board-note');
    summary.textContent = ''; rows.textContent = ''; note.textContent = '';
    var buy = state.side === 'buy';
    $('th-out').textContent = buy ? 'You get (' + state.coin + ')' : 'You receive (' + state.cur + ')';

    var d = state.data;
    var fresh = d && d.coin === state.coin && d.cur === state.cur;
    if (!fresh) { summary.appendChild(msg(state.err ? state.err + ' Retrying automatically.' : 'Loading live order books…', !!state.err)); return; }
    var amt = parse(state.amount);
    if (!(amt > 0)) { summary.appendChild(msg(buy ? 'Enter how much you want to spend.' : 'Enter how many ' + state.coin + ' you want to sell.')); return; }

    var evald = d.exchanges.map(function (ex) { return window.Engine.evaluate(ex, state.side, amt, feeFor(ex)); });
    var ranked = window.Engine.rank(evald);
    var sum = window.Engine.summarize(ranked, state.side);

    if (sum.best) {
      var b = sum.best, v = el('div', 'verdict'), left = el('div');
      left.appendChild(el('div', 'k', 'Best place to ' + (buy ? 'buy' : 'sell')));
      left.appendChild(el('div', 'v', b.ex.name + ' · ' + (buy ? 'you get ' + coinFmt(b.output) + ' ' + state.coin : 'you receive ' + money(b.output))));
      left.appendChild(el('div', 's', 'Effective price ' + money(b.effPrice) + ' per ' + state.coin + (sum.worst ? '. Worst of ' + sum.count + ': ' + sum.worst.ex.name + '.' : '. Only one exchange can fill this order.')));
      v.appendChild(left);
      if (sum.worst) {
        var g = el('div', 'gain', (buy ? '+' : '+') + money(sum.gain));
        g.appendChild(el('small', null, 'vs ' + sum.worst.ex.name + ' (' + sum.gainPct.toFixed(2) + '% more)'));
        v.appendChild(g);
      }
      summary.appendChild(v);
    } else if (ranked.some(function (r) { return r.ok; })) {
      summary.appendChild(msg('No exchange has enough depth in its top 50 orders for this size. Try a smaller amount.', true));
    } else {
      summary.appendChild(msg('No exchange returned data for ' + state.coin + ' in ' + state.cur + ' right now.' + (state.cur === 'INR' ? ' Indian exchange APIs can be blocked from some server locations.' : ''), true));
    }
    if (state.err) summary.appendChild(msg(state.err + ' Showing data from ' + new Date(state.lastOk).toLocaleTimeString() + '.', true));

    ranked.forEach(function (r) { rows.appendChild(buildRow(r, buy)); });
    var anyUsdt = ranked.some(function (r) { return r.ok && /USDT|USDC/.test(r.ex.quote || ''); });
    note.textContent = 'Order book data from ' + new Date(d.ts).toLocaleTimeString() + '.' + (anyUsdt ? ' Rows tagged USDT trade against a stablecoin that is close to, but not exactly, one US dollar.' : '');
  }

  function buildRow(r, buy) {
    var ex = r.ex, tr = el('tr', r.rank === 1 ? 'best' : (!r.ok || !r.rank ? 'dim' : ''));
    function cell(cls, label) { var td = el('td', cls); if (label) td.setAttribute('data-l', label); tr.appendChild(td); return td; }

    cell('rk').textContent = r.rank ? String(r.rank) : '–';
    var c = cell('exc'); var rkm = el('span', 'rkm', r.rank ? '#' + r.rank : '–'); c.appendChild(rkm); c.appendChild(el('span', 'ex', ex.name));
    if (ex.quote) c.appendChild(el('span', 'tag', ex.quote));

    if (!r.ok) {
      var e = cell('err-cell'); e.colSpan = 5; e.textContent = ex.error || 'Unavailable';
    } else {
      cell('num', 'Effective price').textContent = money(r.effPrice);
      var o = cell('num out', buy ? 'You get' : 'You receive');
      o.textContent = buy ? coinFmt(r.output) + ' ' + state.coin : money(r.output);
      if (!r.filled) o.appendChild(el('span', 'sub', 'partial fill: depth ends'));
      else if (r.slippagePct > 0.005) o.appendChild(el('span', 'sub', 'slippage ' + r.slippagePct.toFixed(3) + '%'));
      var vs = cell('num', 'Vs best');
      if (r.rank === 1) { vs.textContent = 'Best'; vs.className += ' zero'; }
      else if (r.rank) { vs.textContent = r.vsBest.toFixed(2) + '%'; vs.className += ' neg'; }
      else vs.textContent = '—';
      cell('num', 'Spread').textContent = r.spreadPct.toFixed(3) + '%';
      var f = cell('num', 'Fee'); f.textContent = r.feePct + '%';
      if (!ex.feeVerified && state.feesOn && state.fees[ex.id] == null) f.appendChild(el('span', 'tag warn', 'est.'));
    }
    var act = cell('act'); act.className = 'act';
    var href = safeUrl((CFG.referrals || {})[ex.id]), sponsored = !!href;
    if (!href) href = safeUrl(ex.site);
    if (href) {
      var a = el('a', 'go', 'Trade ↗'); a.href = href; a.target = '_blank';
      a.rel = sponsored ? 'sponsored nofollow noopener noreferrer' : 'noopener noreferrer';
      a.addEventListener('click', function () { track('Exchange Click', { exchange: ex.name }); });
      act.appendChild(a);
    }
    return tr;
  }

  function pills(containerId, items, current, onPick, labelFn) {
    var box = $(containerId); box.textContent = '';
    items.forEach(function (it) {
      var b = el('button', it === current ? 'is-on' : '', labelFn ? labelFn(it) : String(it)); b.type = 'button';
      b.setAttribute('aria-pressed', it === current ? 'true' : 'false');
      b.addEventListener('click', function () { onPick(it); });
      box.appendChild(b);
    });
  }

  function syncControls() {
    var buy = state.side === 'buy';
    pills('coins', COINS, state.coin, function (c) { state.coin = c; if (state.side === 'sell') state.amount = defaultAmount(); changed(true); });
    pills('curs', CURS, state.cur, function (c) { state.cur = c; if (state.side === 'buy') state.amount = defaultAmount(); changed(true); });
    $('side-buy').className = buy ? 'is-on' : ''; $('side-buy').setAttribute('aria-pressed', buy);
    $('side-sell').className = buy ? '' : 'is-on'; $('side-sell').setAttribute('aria-pressed', !buy);
    $('amount-label').textContent = buy ? 'Amount to spend' : 'Amount to sell';
    $('amount-unit').textContent = buy ? state.cur : state.coin;
    $('amount').value = state.amount;
    $('feesOn').checked = state.feesOn;
    var quick = buy ? QUICK_BUY[state.cur] : QUICK_SELL[state.coin];
    pills('quick', quick, null, function (q) { state.amount = String(q); $('amount').value = state.amount; render(); },
      function (q) { return buy ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(q) : plain(q); });
  }

  function changed(refetch) {
    save(); syncControls();
    if (refetch) { state.data = null; state.err = ''; render(); fetchData(); } else render();
  }

  /* ---------- live status ---------- */
  function tick() {
    var dot = $('live-dot'), text = $('live-text'), now = Date.now();
    if (state.loading && !state.lastOk) { dot.className = 'dot'; text.textContent = 'Loading…'; }
    else if (state.err && !state.loading) { dot.className = 'dot err'; text.textContent = 'Offline · retrying in ' + Math.max(0, Math.ceil((state.nextAt - now) / 1000)) + 's'; }
    else { dot.className = 'dot on'; text.textContent = 'Live · updated ' + Math.max(0, Math.round((now - state.lastOk) / 1000)) + 's ago'; }
    if (!document.hidden && !state.loading && state.nextAt && now >= state.nextAt) fetchData();
  }

  function init() {
    var had = load();
    if (!had) { try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') state.cur = 'INR'; } catch (e) { /* default USD */ } }
    state.amount = defaultAmount();

    $('side-buy').addEventListener('click', function () { state.side = 'buy'; state.amount = defaultAmount(); changed(false); });
    $('side-sell').addEventListener('click', function () { state.side = 'sell'; state.amount = defaultAmount(); changed(false); });
    $('amount').addEventListener('input', function (e) { state.amount = e.target.value; render(); });
    $('feesOn').addEventListener('change', function (e) { state.feesOn = e.target.checked; save(); render(); });
    $('refresh').addEventListener('click', function () { fetchData(); });
    $('fees-reset').addEventListener('click', function () {
      state.fees = {}; save();
      Array.prototype.forEach.call($('fee-grid').querySelectorAll('input'), function (i) { i.value = i.getAttribute('data-default'); });
      render();
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

    var d = (CFG.analytics || {}).plausibleDomain;
    if (d) {
      window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
      var s = document.createElement('script'); s.defer = true; s.setAttribute('data-domain', d); s.src = 'https://plausible.io/js/script.js'; document.head.appendChild(s);
    }

    syncControls(); render(); fetchData();
    setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
