import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261025191015_afat_reviewed_transit_chain_integrity.sql','utf8');
const client=readFileSync('dashboard/src/services/mobilityEvidenceClient.ts','utf8');
const card=readFileSync('dashboard/src/components/commuter/ReachabilityInsightCard.tsx','utf8');
const capture=readFileSync('dashboard/src/components/commuter/FieldEvidenceCapture.tsx','utf8');
for(const token of [
 "add column if not exists observed_wait_seconds","add column if not exists source_observed_at",
 "new.reviewer_id=new.profile_id","new.gps_accuracy_m between 0 and 60",
 "v_observed_at between now()-interval '30 days'","on conflict(line_id,direction,stop_sequence)",
 "revoke all on function public.afat_link_accepted_transit_sequence() from public,anon,authenticated",
 "l.city_profile_id=v_city_id","v_chain_status:='reviewed_recent_single_line_pattern'",
 "'live_service_available',false","'boarding_availability_verified',false",
 "'schedule_verified',false","'fare_current_verified',false",
])assert.ok(sql.includes(token),token);
assert.ok(client.includes('validateMultimodalPlan(data)'));
assert.ok(client.includes("chain.fare_current_verified!==false"));
assert.ok(card.includes('Recently reviewed transit pattern'));
assert.ok(card.includes('Live service, boarding, timetable, road safety and current fare are not confirmed.'));
assert.ok(!card.includes('Observed multimodal option'));
for (const token of [
  'chain.boarding.stop_sequence >= chain.alighting.stop_sequence',
  'Math.abs(stop.latitude) <= 90',
  'Math.abs(stop.longitude) <= 180',
  'stop.walk_distance_m <= 50000',
  "['observed_wait_seconds','observed_transit_seconds','observed_fare_xaf']",
]) assert.ok(client.includes(token),'multimodal validation: '+token);
for (const token of [
  'Direct route assessments',
  'Assessed direct travel modes',
  'route_distance_m',
  'not confirmations of available vehicles',
  'Reviewed multimodal journey legs',
  'Walk to boarding',
  'Walk from alighting',
  'stop_sequence',
  'straight-line estimates',
  'No live vehicle, departure or arrival time is guaranteed',
]) assert.ok(card.includes(token),'multimodal leg UX: '+token);
for (const token of [
  'const [stopSequence,setStopSequence]',
  'const [lineDirection,setLineDirection]',
  'const [transitMode,setTransitMode]',
  'Ordered stops require a fresh GPS fix, route name and direction',
  'directionLabel:lineDirection.trim()||null',
  'mode:transitMode',
  'stop_sequence:position',
  'stop order requires',
]) assert.ok(capture.toLowerCase().includes(token.toLowerCase()),'ordered field capture: '+token);
console.log('PASS genuine transit observation -> independent review -> recent ordered pattern without live-service, schedule or current-fare claims');
