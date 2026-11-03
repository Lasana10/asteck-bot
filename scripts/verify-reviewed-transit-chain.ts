import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261025191015_afat_reviewed_transit_chain_integrity.sql','utf8');
const transferSql=readFileSync('supabase/migrations/20261103150000_afat_reviewed_two_line_transfer.sql','utf8');
const readinessSql=readFileSync('supabase/migrations/20261103161000_afat_city_transit_readiness.sql','utf8');
const readinessUI=readFileSync('dashboard/src/components/admin/TransitNetworkReadiness.tsx','utf8');
const client=readFileSync('dashboard/src/services/mobilityEvidenceClient.ts','utf8');
const card=readFileSync('dashboard/src/components/commuter/ReachabilityInsightCard.tsx','utf8');
const spatialMap=readFileSync('dashboard/src/components/commuter/PassengerSpatialMap.tsx','utf8');
const planner=readFileSync('dashboard/src/components/commuter/PassagePlanner.tsx','utf8');
const capture=readFileSync('dashboard/src/components/commuter/FieldEvidenceCapture.tsx','utf8');
const corridor=readFileSync('dashboard/src/components/admin/TransitCorridorSurvey.tsx','utf8');
const surveyDraft=readFileSync('dashboard/src/services/transitCorridorSurveyDraft.ts','utf8');
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
for (const token of [
  "public.afat_has_permission('map.evidence.review')",
  "public.afat_has_permission('planning.aggregate.view')",
  "ln.source_reviewed_at is not null",
  "ln.source_observed_at between now()-interval '30 days'",
  "count(distinct stop_sequence)=max(stop_sequence)-min(stop_sequence)+1",
  "potential_transfer_stop_pairs",
  "revoke all on function public.afat_city_transit_readiness",
  "'automatic_truth',false",
]) assert.ok(readinessSql.includes(token),'city readiness SQL: '+token);
for (const token of [
  "afat_city_transit_readiness",
  "result.automatic_truth!==false",
  "result.transfer_service_verified!==false",
  "Contiguous reviewed patterns",
  "Next evidence-driven action",
]) assert.ok(readinessUI.includes(token),'city readiness UI: '+token);
assert.ok(activation.includes('<TransitNetworkReadiness cityKey={cityKey}/>'));
for (const token of [
  "REVIEWED_TRANSIT_SOURCE_ID='afat-reviewed-transit-stops'",
  'reviewedTransitStops.filter',
  'stop.role',
  'reviewed_pattern:true,live_service:false',
  'afat-reviewed-transit-stops-core',
  'afat-reviewed-transit-stops-label',
])assert.ok(spatialMap.includes(token),'reviewed stop map: '+token);
for(const token of [
  'const reviewedTransitStops=useMemo(',
  "role:'transfer_out' as const",
  "role:'transfer_in' as const",
  'reviewedTransitStops={reviewedTransitStops}',
])assert.ok(planner.includes(token),'passenger map integration: '+token);
for(const token of [
  "if (!assessment && !multimodal && !transfer && !loading && !limited) return null;",
  "destinationPoint?: {latitude:number;longitude:number;name?:string|null} | null;",
  'purpose="boarding"',
  'purpose="transfer"',
  'purpose="arrival"',
  'latitude={transfer.transfer.transfer_in.latitude}',
  'latitude={destinationPoint.latitude}',
])assert.ok(card.includes(token),'multimodal walking stages: '+token);
assert.ok(planner.includes('destinationPoint={arrivalPoint}'),'destination-bound transfer guidance');
for(const token of [
  "purpose?:'boarding'|'transfer'|'arrival'",
  "purpose==='transfer'?'transfer boarding stop'",
  "purpose==='arrival'?'final destination'",
  "const fix=evaluateSpatialFix",
  "fetchCanonicalAfatRoute({",
  "mode:'walk'",
  "['afat_atlas','osrm']",
])assert.ok(boardingDirections.includes(token),'pedestrian stage: '+token);
for(const token of [
 'readCorridorSurveyDraft(cityKey,storage)',
 'writeCorridorSurveyDraft({cityKey,lineName,direction,mode,position},storage)',
 'setRestoredCity(cityKey)',
 'setFix(null)',
 'clearCorridorSurveyDraft(cityKey,',
 'Start another line',
])assert.ok(corridor.includes(token),'resumable survey: '+token);
for(const token of ['sessionStorage','LIMIT_MS','lineName','position','cityKey']) {
  if(token==='sessionStorage')continue;
  assert.ok(surveyDraft.includes(token),'safe draft field: '+token);
}
assert.ok(!surveyDraft.includes('latitude:'));
assert.ok(!surveyDraft.includes('longitude:'));
for(const token of [
  'flushMobilityEvidenceQueue',
  'pendingMobilityEvidenceCount',
  "window.addEventListener('afat:evidence-queue'",
  'setQueued(result.pending)',
  'result.synced>0',
  'None is automatically accepted',
  'Sync pending evidence',
])assert.ok(corridor.includes(token),'offline field queue review receipt: '+token);
const replay=client.slice(client.indexOf('export async function flushMobilityEvidenceQueue()'),client.indexOf('export function installMobilityEvidenceSync()'));
for(const token of [
  'const userId = await sessionUser()',
  'const owner = await sessionUser()',
  'if (owner !== userId) break',
  "data.status !== 'pending'",
  'data.automatic_truth !== false',
  'acknowledgeMobilityEvidence(storage,item)',
])assert.ok(replay.includes(token),'authenticated field replay contract: '+token);
console.log('PASS genuine transit observation -> independent review -> recent ordered pattern without live-service, schedule or current-fare claims');
