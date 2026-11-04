import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const demand=readFileSync('dashboard/src/components/operator/OperatorRouteOpportunities.tsx','utf8');
const publisher=readFileSync('dashboard/src/components/operator/ScheduledDeparturePublisher.tsx','utf8');
const ops=readFileSync('dashboard/src/components/operator/OperatorDepartureOperations.tsx','utf8');
const home=readFileSync('dashboard/src/components/operator/OperatorWorkspaceHome.tsx','utf8');
for(const token of [
  'onPlanRoute(parts[0].trim(),parts[1].trim())',
  'item.corridor.split',
  'Plan a real departure for this corridor',
])assert.ok(demand.includes(token),'operator demand selection: '+token);
assert.ok(ops.includes('<OperatorRouteOpportunities onPlanRoute={onPlanRoute}/>'));
assert.ok(home.includes('suggestedRoute={suggestedRoute}'));
assert.ok(home.includes('onPlanRoute={(origin,destination)=>setSuggestedRoute'));
for(const token of [
  'setOrigin(null);setDestination(null)',
  'setDepartAt',
  'setFare',
  'setExpanded(true)',
  "vehicle.clearance_status!=='verified'",
  "if(!origin||!destination)",
  'publishScheduledDeparture({',
])assert.ok(publisher.includes(token),'real departure authority: '+token);
assert.ok(!demand.includes('publishScheduledDeparture('),'demand must not publish transport supply');
console.log('PASS operator demand can prefill only unverified route text, never skip mapped-place and vehicle controls');
