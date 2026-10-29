'use strict';
// Response shapes of each exchange's public order-book endpoint (values are made up).
const arr = [['100.5', '1.5'], ['100.4', '2']];
const askArr = [['100.6', '1'], ['100.7', '3']];
module.exports = {
  binance: { lastUpdateId: 1, bids: arr, asks: askArr },
  coinbase: { sequence: 1, bids: [['100.5', '1.5', 2], ['100.4', '2', 1]], asks: [['100.6', '1', 1], ['100.7', '3', 2]] },
  kraken: { error: [], result: { XXBTZUSD: { asks: [['100.6', '1', 1700000000], ['100.7', '3', 1700000001]], bids: [['100.5', '1.5', 1700000000], ['100.4', '2', 1700000001]] } } },
  bitstamp: { timestamp: '1', bids: arr, asks: askArr },
  gemini: { bids: [{ price: '100.5', amount: '1.5', timestamp: '1' }, { price: '100.4', amount: '2', timestamp: '1' }], asks: [{ price: '100.6', amount: '1' }, { price: '100.7', amount: '3' }] },
  kucoin: { code: '200000', data: { time: 1, sequence: '1', bids: arr, asks: askArr } },
  okx: { code: '0', msg: '', data: [{ asks: [['100.6', '1', '0', '2'], ['100.7', '3', '0', '1']], bids: [['100.5', '1.5', '0', '1'], ['100.4', '2', '0', '1']], ts: '1' }] },
  coindcx: { bids: { '100.4': '2', '100.5': '1.5' }, asks: { '100.7': '3', '100.6': '1' }, ts: 1 },
  wazirx: { timestamp: 1, asks: askArr, bids: arr }
};
