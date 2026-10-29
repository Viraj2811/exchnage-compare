'use strict';
// Run on YOUR machine or server to test the real exchange APIs:  npm run check-live
const X = require('../lib/exchanges.js');
(async () => {
  console.log('Checking live order books (BTC)...\n');
  for (const cur of ['USD', 'INR']) {
    const rows = await X.probe('BTC', cur);
    console.log('--- ' + cur + ' ---');
    rows.filter((r) => r.quote).forEach((r) => {
      console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name.padEnd(10) + (r.quote || '').padEnd(6) +
        (r.ok ? 'bid ' + r.bestBid + '  ask ' + r.bestAsk + '  ' + r.ms + 'ms' : r.error));
    });
    console.log('');
  }
  console.log('FAIL lines show which exchanges are blocked or unreachable from this network. The app hides them gracefully.');
})().catch((e) => { console.error(e); process.exit(1); });
