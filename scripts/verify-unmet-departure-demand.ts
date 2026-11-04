import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104094500_afat_departure_demand_aggregate.sql','utf8');
const receiptSql=readFileSync('supabase/migrations/20261104094600_afat_gap_review_receipt_contract.sql','utf8');
const ui=readFileSync('dashboard/src/components/commuter/UnmetDepartureDemand.tsx','utf8');
const board=readFileSync('dashboard/src/components/commuter/DepartureBoard.tsx','utf8');
const planner=readFileSync('dashboard/src/components/admin/DepartureDemandInsights.tsx','utf8');
const activation=readFileSync('dashboard/src/components/admin/OperationalActivationLadder.tsx','utf8');
for(const token of [
 "public.afat_has_permission('planning.aggregate.view')",
 "public.afat_has_permission('system.configure')",
 "d.metadata->>'departure_demand'='true'",
 "d.source_kind='afat_runtime'",
 "having sum(signal_count)>=3",
 "'represents_unique_passengers',false",
 "'scheduled_departures_verified',false",
 "revoke all on function public.afat_departure_demand_snapshot(text) from public,anon,authenticated",
])assert.ok(sql.includes(token),'privacy-safe demand snapshot: '+token);
for(const token of [
 'user_opted_in:true',
 "signalType:'supply_gap'",
 "recordMobilityGap({",
 "supabase.from('afat_city_profiles')",
 'No phone number or GPS coordinates are included',
 "if(!canSubmit)return",
 "setConsent(false)",
])assert.ok(ui.includes(token),'voluntary unmet trip report: '+token);
assert.ok(board.includes("feedHealthy&&originQuery.trim()&&destinationQuery.trim()"));
assert.ok(board.includes("key={[originQuery,destinationQuery,travelDate,seatsNeeded,maxFare].join('|')}"));
assert.ok(planner.includes("minimum_report_count_to_display===3"));
assert.ok(planner.includes('opt-in request event(s)'));
assert.ok(activation.includes('<DepartureDemandInsights cityKey={cityKey}/>'));
for(const token of [
  'public.afat_record_mobility_gap(',
  "'status','pending'",
  "'automatic_truth',false",
  "'human_reviewed',false",
  "'published_transport_service',false",
  "on conflict(city_key,fingerprint,signal_type) do update",
  "revoke all on function public.afat_record_mobility_gap",
])assert.ok(receiptSql.includes(token),'replayable demand signal receipt: '+token);
const mobility=readFileSync('dashboard/src/services/mobilityEvidenceClient.ts','utf8');
assert.ok(mobility.includes("if (!data || data.status !== 'pending' || data.automatic_truth !== false || !data.id)"));
assert.ok(mobility.includes("acknowledgeMobilityEvidence(storage,item)"));
console.log('PASS consented unmet departure demand and privacy-thresholded authorized planner metrics');
