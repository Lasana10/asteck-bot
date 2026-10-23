import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261023234500_afat_licensed_cross_source_field_missions.sql','utf8');
const ui=readFileSync('dashboard/src/components/planner/AtlasSourceDisagreementDesk.tsx','utf8');
const workspace=readFileSync('dashboard/src/components/planner/AtlasLearningControl.tsx','utf8');
const client=readFileSync('dashboard/src/services/livingAtlasClient.ts','utf8');
for(const contract of ['afat_atlas_cross_source_road_checks','afat_request_cross_source_field_check','commercial_use_reviewed=true','source_geometry','st_dwithin','35','80','field.mission.manage','ATLAS_FIELD_REVIEW_REASON_REQUIRED','target_edge_id','status in (\'open\',\'claimed\',\'submitted\')','on conflict do nothing','automatic_truth', 'passability_verified']){
 assert.ok(sql.includes(contract),contract);
}
assert.ok(ui.includes('review?.discrepancies'));
assert.ok(ui.includes('requestCrossSourceFieldCheck(item.source_record_id,cityKey,notes)'));
assert.ok(ui.includes('No existing Atlas edge nearby'));
assert.ok(ui.includes('field evidence')||ui.includes('Field evidence'));
assert.ok(workspace.includes('<AtlasSourceDisagreementDesk />'));
assert.ok(client.includes("supabase.rpc('afat_atlas_cross_source_road_checks'"));
assert.ok(client.includes("supabase.rpc('afat_request_cross_source_field_check'"));
assert.ok(!sql.includes('insert into public.afat_atlas_edges'));
assert.ok(!sql.includes('update public.afat_geo_source_records'));
console.log('PASS AFAT licensed OSM-Overture source comparison → human-approved anchored field missions, no automatic road claims');
