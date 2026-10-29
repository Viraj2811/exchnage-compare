'use strict';
// Usage: node scripts/set-domain.js https://your-domain.com
// Swaps the placeholder (or your previous) domain in all HTML, sitemap and robots files.
const fs = require('fs');
const path = require('path');
const arg = process.argv[2];
let url;
try { url = new URL(arg); } catch (e) { console.error('Usage: node scripts/set-domain.js https://your-domain.com'); process.exit(1); }
if (url.protocol !== 'https:') { console.error('Use an https:// address.'); process.exit(1); }
const pub = path.join(__dirname, '..', 'public');
const sitemap = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
const m = sitemap.match(/<loc>https?:\/\/([^\/<]+)/);
if (!m) { console.error('Could not find current domain in sitemap.xml'); process.exit(1); }
const oldHost = m[1];
let changed = 0;
for (const f of fs.readdirSync(pub)) {
  if (!/\.(html|xml|txt)$/.test(f)) continue;
  const p = path.join(pub, f);
  const s = fs.readFileSync(p, 'utf8');
  const n = s.split('https://' + oldHost).join(url.origin).split(oldHost).join(url.host);
  if (n !== s) { fs.writeFileSync(p, n); changed++; }
}
console.log('Replaced ' + oldHost + ' with ' + url.host + ' in ' + changed + ' files.');
console.log('Also set contact email in privacy.html if contact@' + url.host + ' is not a real mailbox.');
