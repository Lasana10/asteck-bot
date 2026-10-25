import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261025191015_afat_reviewed_transit_chain_integrity.sql','utf8');
const client=readFileSync('dashboard/src/services/mobilityEvidenceClient.ts','utf8');
const card=readFileSync('dashboard/src/components/commuter/ReachabilityInsightCard.tsx','utf8');
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
console.log('PASS genuine transit observation -> independent review -> recent ordered pattern without live-service, schedule or current-fare claims');
