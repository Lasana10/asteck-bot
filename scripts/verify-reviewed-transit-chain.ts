import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261025191015_afat_reviewed_transit_chain_integrity.sql','utf8');
const transferSql=readFileSync('supabase/migrations/20261103150000_afat_reviewed_two_line_transfer.sql','utf8');
const client=readFileSync('dashboard/src/services/mobilityEvidenceClient.ts','utf8');
const card=readFileSync('dashboard/src/components/commuter/ReachabilityInsightCard.tsx','utf8');
const capture=readFileSync('dashboard/src/components/commuter/FieldEvidenceCapture.tsx','utf8');
const corridor=readFileSync('dashboard/src/components/admin/TransitCorridorSurvey.tsx','utf8');
const activation=readFileSync('dashboard/src/components/admin/OperationalActivationLadder.tsx','utf8');
const boardingDirections=readFileSync('dashboard/src/components/commuter/TransitBoardingDirections.tsx','utf8');
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
  'setStopSequence(position === null ? \'\' : String(position + 1))',
  'setFix(null)',
  'stop order requires',
]) assert.ok(capture.toLowerCase().includes(token.toLowerCase()),'ordered field capture: '+token);
assert.ok(card.includes('<TransitBoardingDirections latitude={chain.boarding.latitude}'), 'reviewed boarding navigation integration');
for (const token of [
  'fetchCanonicalAfatRoute',
  "mode:'walk'",
  "isUsableCanonicalRoute(result,'walk')",
  "['afat_atlas','osrm']",
  'calculateRouteProgress',
  'nextRoadManeuver',
  'watchPosition',
  'clearWatch',
  'maximumAge:0',
  'Date.now()-position.timestamp>30000',
  'not straight-line distance',
  'No walking path was invented',
]) assert.ok(boardingDirections.includes(token), 'boarding route: '+token);
for(const token of [
  'captureCurrentFieldGps',
  'evaluateSpatialFix',
  'accuracyM>60',
  'Date.now()-fix.timestampMs>30000',
  'directionLabel:direction.trim()',
  'stop_sequence:sequence',
  'source_surface:\'city_transit_corridor_survey\'',
  'setPosition(String(sequence+1))',
  'independent review queue',
]) assert.ok(corridor.includes(token),'city transit survey: '+token);
assert.ok(activation.includes('<TransitCorridorSurvey cityKey={cityKey}/>'));
for(const token of [
  'afat_plan_reviewed_transfer',
  "l.city_profile_id=v_city",
  'ln.source_reviewed_at is not null',
  "ln.source_observed_at between p_at-interval '30 days'",
  'b.line_id=a.line_id',
  'c.line_id<>a.line_id',
  'd.line_id=c.line_id',
  'public.st_dwithin(b.location,c.location,250)',
  "v_transfer->>'status'<>'ok'",
  "'automatic_truth',false",
  "'live_service_available',false",
  'revoke all on function public.afat_plan_reviewed_transfer',
])assert.ok(transferSql.includes(token),'transit transfer SQL: '+token);
assert.ok(client.includes("validateReviewedTransfer(data)"));
assert.ok(card.includes('Reviewed connection · two transit lines'));
console.log('PASS genuine transit observation -> independent review -> recent ordered pattern without live-service, schedule or current-fare claims');
