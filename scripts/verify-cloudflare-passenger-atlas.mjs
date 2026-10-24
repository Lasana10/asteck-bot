// Read-only production Cloudflare Pages smoke. No login, no user data or API mutations.
import assert from 'node:assert/strict';
const site=new URL(process.env.AFAT_FRONTEND_URL||'https://asteck-bot.pages.dev');
assert.equal(site.protocol,'https:','Cloudflare acceptance must use HTTPS');
const noCache={headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)};
const page=await fetch(new URL('/?afat_probe='+encodeURIComponent(process.env.GITHUB_SHA||Date.now()),site),noCache);
assert.equal(page.status,200,'Cloudflare dashboard does not serve HTTP 200');
assert.ok((page.headers.get('content-type')||'').includes('text/html'),'Cloudflare response was not application HTML');
const html=await page.text();
assert.ok(html.includes('<html')&&html.includes('assets/'),'Cloudflare did not serve compiled AFAT dashboard assets');
const assets=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g)].map(x=>x[1]);
assert.ok(assets.length>0,'No browser entry modules in published dashboard');
let bundles='';
for(const asset of [...new Set(assets)].slice(0,8)){
 const url=new URL(asset,site);
 assert.equal(url.origin,site.origin,'Cross-origin dashboard executable rejected');
 const response=await fetch(url,noCache);
 assert.equal(response.status,200,'Published JavaScript bundle unavailable: '+url.pathname);
 const js=await response.text();
 assert.ok(js.length>500,'Published dashboard module unexpectedly empty');
 bundles+=js.slice(0,3_500_000);
 console.log('Loaded Cloudflare client JS:',url.pathname,'bytes:',js.length);
}
const signals=['Understand nearby landmarks and reviewed geographic evidence','Real nearby place records','Provisional local map knowledge','Offline place references found','Saved journey restored with its existing navigation session','Next road maneuver','Trip, entrance and informal transit evidence','The routable road ends around','Capture a landmark, entrance or road-condition photo with GPS','GPS observation not accepted',
  'Offline: no matching saved route for this mode and arrival point',
  'Capture a new location before submitting any place or transport observation',
  'AFAT detected meaningful off-route movement',
  'Resume an existing unpaid booking','Verify booking status before another collection'];
for(const signal of signals)assert.ok(bundles.includes(signal),'Cloudflare is serving a stale dashboard: missing '+signal);
console.log('PASS actual Cloudflare passenger discovery → route/navigation → offline custody → field evidence release:',site.origin);
