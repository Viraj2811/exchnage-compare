# Priceboard: Crypto Exchange Price Comparison

Pick a coin and currency, enter how much you want to buy or sell, and see which exchange gives you the most. It reads **live order books** from the exchanges, simulates your trade against them (so large orders get the real, worse price), and applies trading fees.

## Features
- Live order books from Binance, Coinbase, Kraken, Bitstamp, Gemini, KuCoin, OKX (USD, EUR, GBP) and CoinDCX, WazirX (INR)
- Buy mode (coins you get) and sell mode (money you receive), ranked best to worst
- Trade-size aware: slippage, spread and partial-fill detection from real depth
- Editable fees per exchange, fees on/off switch, unverified rates flagged "est."
- Auto-refresh every 15 seconds, graceful handling of blocked or down exchanges
- SEO content, FAQ, privacy and disclaimer pages, optional affiliate links and Plausible analytics
- Zero dependencies, mobile friendly, 21 automated tests

## Run it (Node 18+)
```
npm start        # http://localhost:3000 (tries 3001, 3002... if the port is busy)
npm test         # automated tests
npm run check-live   # tests the REAL exchange APIs from your network
```
PowerShell, another port: `$env:PORT=4000; npm start`

**Important:** run `npm run check-live` once on the machine or host you deploy from. It shows which exchanges answer from that location (some block certain countries or cloud regions). Also visit `/api/status` after deploying.

## Deploy
See **DEPLOY.md**. This app needs a Node server (browsers cannot call exchange APIs directly), so use Render, Railway, Docker or a VPS, not static-only hosting.

## Files
```
server.js              static server + /api/compare + /api/status, rate limiting
lib/exchanges.js       exchange adapters, normalising, caching, error mapping
public/js/engine.js    pure pricing engine (order-book walking, fees, ranking)
public/js/app.js       UI            public/js/config.js  site settings
tests/                 engine, adapter and server tests
PROJECT_MEMORY.md      project status, decisions, roadmap
```
