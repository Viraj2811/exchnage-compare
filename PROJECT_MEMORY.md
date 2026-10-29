# Project memory: Priceboard (Exchange Price Comparison Tool)

Project 2 of the crypto tool suite (project 1 = Crypto Buy Calculator, separate folder). To resume with Claude, upload this zip or paste this file and say what to do next.
Last updated: 2026-10-29

## Goal
Show where a coin is cheapest to buy or most valuable to sell, using real exchange order books, for the user's actual trade size, after fees. Audience includes India (INR via CoinDCX and WazirX; INR auto-selected for Indian timezones). Revenue plan: affiliate links on Trade buttons. Traffic plan: SEO.

## How it differs from project 1
Dark terminal-style UI, live multi-exchange data via a Node backend (browsers cannot call exchange APIs because of CORS), ranking table instead of a calculator form. Shares: zero-dependency approach, legal pages, SEO setup, set-domain script, rate limiting, port fallback.

## Architecture
- `lib/exchanges.js`: one adapter per exchange (URL builder, response parser, quote asset per currency). `toLevels()` normalises arrays, object lists and price-to-qty maps. Errors become friendly codes (unlisted, blocked, timeout, limited, empty, unsupported). Cache: 5s for good data, 10s for failures, in-flight requests shared.
- `server.js`: `/api/compare?coin=&cur=` (60/min per IP), `/api/status` (6/min), `/healthz`, static files, CSP and security headers, port fallback.
- `public/js/engine.js`: walks the book (buy spends quote through asks, sell walks bids), applies fee to output, ranks full fills first, then partial fills, then failures.
- Client polls every 15s while the tab is visible; fee overrides and choices are kept in localStorage.

## Exchanges and pairs
| Exchange | Endpoint | USD | EUR | GBP | INR |
|---|---|---|---|---|---|
| Binance | data-api.binance.vision /api/v3/depth | USDT | yes | yes | no |
| Coinbase | api.exchange.coinbase.com /products/X-Y/book?level=2 | yes | yes | yes | no |
| Kraken | api.kraken.com /0/public/Depth (XBT, XDG aliases) | yes | yes | yes | no |
| Bitstamp | bitstamp.net /api/v2/order_book/pair/ | yes | yes | yes | no |
| Gemini | api.gemini.com /v1/book/pair | yes | yes | yes | no |
| KuCoin | api.kucoin.com /api/v1/market/orderbook/level2_100 | USDT | yes | no | no |
| OKX | okx.com /api/v5/market/books | USDT | yes | no | no |
| CoinDCX | public.coindcx.com /market_data/orderbook?pair=I-BTC_INR | no | no | no | yes |
| WazirX | api.wazirx.com /sapi/v1/depth | no | no | no | yes |
Coins: BTC ETH SOL XRP DOGE ADA LTC. Keep the lists in `lib/exchanges.js`, `public/js/app.js` and the server whitelist in sync.

## Verification status (IMPORTANT)
- Adapter parsers are unit-tested against response SHAPES (tests/fixtures.js), not live data, because the build sandbox could not reach the exchanges.
- CoinDCX orderbook format (price-to-quantity maps) was confirmed from CoinDCX docs via search. The INR pair name `I-BTC_INR`, plus the Bitstamp, Gemini, KuCoin, OKX, WazirX endpoints and shapes, come from general knowledge and are NOT confirmed live.
- TODO first thing after getting network access: run `npm run check-live` and `/api/status`, fix any adapter that fails, and add the real response as a fixture.

## Fees (entry-tier spot taker, percent)
| Exchange | Fee | Status |
|---|---|---|
| Binance | 0.10 | checked 2026-10-28 from several secondary sources (not Binance's own page) |
| Coinbase | 0.90 | US intro tier after the Sep 2026 change, secondary sources; lower in EU/UK |
| Kraken | 0.80 | kraken.com fee schedule entry tier; changed Jul 2026 |
| Bitstamp 0.40, Gemini 0.40, KuCoin 0.10, OKX 0.10, CoinDCX 0.20, WazirX 0.20 | est. | NOT verified, shown with an "est." tag. CoinDCX sources conflicted (0.20 to 0.50) |
TODO: verify each on the exchange's own fee page, then set `feeVerified: true` in `lib/exchanges.js`.

## Launch status
- DONE: working app, 21 tests (engine, adapters, server), SEO (meta, FAQ JSON-LD, sitemap, robots), privacy and disclaimer templates, affiliate and analytics hooks, rate limits, CSP, Dockerfile, render.yaml, DEPLOY.md.
- NOT DONE (owner):
  - [ ] Run `npm run check-live` and fix failing adapters
  - [ ] Verify fees on exchange pages
  - [ ] Domain: `node scripts/set-domain.js https://domain`; deploy with TRUST_PROXY=1 in a region where exchanges answer
  - [ ] Plausible domain and affiliate links in `public/js/config.js`
  - [ ] Lawyer review of legal pages, real contact email
  - [ ] Add an Open Graph image; submit sitemap in Search Console
  - [ ] Check the licensing and terms of use of each exchange API for a commercial site

## Known limits and ideas
- Quote assets differ (USDT vs USD); shown as tags, not converted.
- Compares trading price and fees only. Deposit costs (UPI, card, bank), withdrawal fees and taxes (GST, TDS) are not included. Link this with project 1 for payment charges and GST.
- Only the top 50 levels per side are used; very large orders show "partial fill".
- Polling, not websockets. Prices can be up to about 20 seconds old.
- Ideas: more exchanges (CoinSwitch, Mudrex, Bitbns, ZebPay), maker/taker toggle, price history of the spread, share-link of a comparison, withdrawal-fee comparison (roadmap item #4).

## Commands
`npm start`, `npm test`, `npm run check-live`, `node scripts/set-domain.js https://domain`

## Decisions log
- 2026-10-29: Chose order-book simulation over headline prices so rankings reflect trade size.
- 2026-10-29: Server-side fetching with caching (5s) to avoid CORS, bans and exchange rate limits.
- 2026-10-29: Failed or blocked exchanges are shown as unavailable instead of breaking the page.
- 2026-10-29: Binance read from data-api.binance.vision (market data host) to reduce regional blocking.
