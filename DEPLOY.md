# Launch checklist

## 0. Test the real exchange APIs
```
npm run check-live
```
`OK` lines are working. `FAIL ... Blocked from the server location` means that exchange blocks your network or hosting region. The app simply shows that row as unavailable, but you should know before launch.

## 1. Set your domain and contact details
```
node scripts/set-domain.js https://your-domain.com
```
Updates canonical links, sitemap, robots.txt and the privacy page contact email (`contact@your-domain.com`; edit `public/privacy.html` if that mailbox does not exist).

## 2. Fill in `public/js/config.js`
- `analytics.plausibleDomain`: your domain after creating a site at plausible.io (blank = no analytics)
- `referrals`: your affiliate URL per exchange (must start with `https://`; blank = plain exchange link)
- `refreshSeconds`: how often the page refreshes (default 15)

Fees live in `lib/exchanges.js` (`fee`, `feeVerified`). Re-check them every few months.

## 3. Deploy
**Render:** push to GitHub, New, Blueprint (reads `render.yaml`) or Web Service with start command `npm start`. Set `TRUST_PROXY=1`. Add your custom domain in Settings, HTTPS is automatic.

**Railway:** New Project from GitHub, add variable `TRUST_PROXY=1`, then Generate Domain or add a custom domain.

**Docker:** `docker build -t priceboard . && docker run -p 3000:3000 priceboard`

**VPS:** Node 20, run `PORT=3000 TRUST_PROXY=1 node server.js` under pm2 or systemd, with Caddy for HTTPS: `your-domain.com { reverse_proxy localhost:3000 }`

**Region matters:** pick a hosting region where the exchanges answer. Binance market data is read from `data-api.binance.vision`, which usually works globally, but Bybit-style US blocks exist for some others. Check `/api/status` after deploying.

## 4. After launch
- Open `/healthz` (ok) and `/api/status` (shows each exchange: ok or the reason it failed)
- Submit `https://your-domain.com/sitemap.xml` in Google Search Console
- Click each Trade button once

## Environment variables
| Name | Default | Purpose |
|---|---|---|
| PORT | 3000 | Port to listen on |
| TRUST_PROXY | off | Set `1` behind Render/Railway/Caddy/nginx |
| RATE_LIMIT | 60 | Max /api/compare requests per IP per minute |
