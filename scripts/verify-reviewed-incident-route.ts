import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync('supabase/migrations/20261025070709_afat_reviewed_incident_route_corridor.sql','utf8');
const client=readFileSync('dashboard/src/services/reviewedIncidentRoute.ts','utf8');
const brief=readFileSync('dashboard/src/services/groundedJourneyBrief.ts','utf8');
const ui=readFileSync('dashboard/src/components/commuter/ReviewedRouteEnvironment.tsx','utf8');
for(const token of ['security definer',"i.status='verified'","i.verification_status='verified'",
 "r.status in ('validated','published')",'r.reviewer_id<>i.reporter_id','i.expires_at>now()',
 'public.st_dwithin(i.location,v_line::public.geography,100)',"'raw_incident_details_exposed',false",
 'revoke all on function public.afat_reviewed_incident_route_advisory(text,jsonb) from public,anon'])
 assert.ok(migration.includes(token),token);
assert.ok(!migration.includes("'description',"),'raw incident descriptions must not be returned');
for(const token of ["supabase.rpc('afat_reviewed_incident_route_advisory'",'raw_incident_details_exposed!==false'])
 assert.ok(client.includes(token),token);
assert.ok(brief.includes('Proximity does not establish a closure'));
assert.ok(ui.includes('inspectReviewedIncidentRoute'));
console.log('PASS independently reviewed current incident aggregate -> selected route CityBrain brief without raw reports or closure claims');
