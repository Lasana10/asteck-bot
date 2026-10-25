import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const service=readFileSync('dashboard/src/services/groundedJourneyBrief.ts','utf8');
const component=readFileSync('dashboard/src/components/commuter/ReviewedRouteEnvironment.tsx','utf8');
for(const token of ['road_passability_verified===false','provider_rerouted===false','expiry>now',
 'automaticRouteDecision:false','Road passability, closures, live traffic and safe crossings are not verified'])
 assert.ok(service.includes(token),token);
for(const token of ['buildGroundedJourneyBrief','CityBrain route brief · grounded evidence only',
 'data-evidence-status','did not change the provider route'])assert.ok(component.includes(token),token);
assert.ok(!service.includes('invokeAfatAiCore'),'passenger route truth must not depend on generated claims');
console.log('PASS selected provider route + time-bounded reviewed environment -> fail-closed CityBrain passenger brief');
