#!/usr/bin/env node

const baseUrl = (process.env.AFAT_API_URL || 'https://asteck-bot.onrender.com').replace(/\/$/, '');

const checks = [
  ['fare browse', '/api/onboard/fare/browse'],
  ['fare market stats', '/api/onboard/fare/market-stats?origin=A&destination=B'],
  ['driver fatigue', '/api/onboard/driver/fatigue/00000000-0000-0000-0000-000000000000'],
  ['driver contract', '/api/onboard/driver/contract/00000000-0000-0000-0000-000000000000'],
  ['active dispatch', '/api/dispatch/active']
];

const response = await fetch(`${baseUrl}/health`, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`health returned HTTP ${response.status}`);
const health = await response.json();
console.log(`health: HTTP ${response.status} build=${health.build || 'unknown'}`);

let failed = 0;
for (const [name, path] of checks) {
  const result = await fetch(`${baseUrl}${path}`, { headers: { accept: 'application/json' } });
  const marker = result.status === 401 ? 'PASS' : 'FAIL';
  console.log(`${marker} ${name}: HTTP ${result.status} (expected 401)`);
  if (result.status !== 401) failed += 1;
}

if (failed) {
  console.error(`\n${failed} authorization boundary check(s) failed. Do not treat this deployment as production-ready.`);
  process.exit(1);
}

console.log('\nProduction anonymous authorization smoke test passed.');
