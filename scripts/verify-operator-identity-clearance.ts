import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261106151324_afat_owner_identity_licence_vehicle_clearance.sql','utf8');
for(const term of [
 'afat_operator_credential_evidence_current',
 "d.document_type in ('national_id','license')",
 "d.vehicle_id=v.id and d.profile_id=v.operator_id",
 "d.status='verified' and d.verified_at is not null",
 "d.due_at is null or d.due_at>now()",
 "d.file_url like 'afat-operator-compliance/'",
 "trg_afat_vehicle_operator_credentials",
 "before update of clearance_status on public.vehicles",
 "OPERATOR_ID_LICENSE_NOT_VERIFIED",
 "and public.afat_operator_credential_evidence_current(v.id)",
 'revoke all on function public.afat_operator_credential_evidence_current(uuid) from public,anon,authenticated',
]){
 assert.ok(migration.includes(term),'mandatory operator credential custody: '+term);
}
const api=readFileSync('src/api/routes.ts','utf8');
const queue=api.slice(api.indexOf("router.get('/mobility/vehicle-clearance/queue'"),
 api.indexOf("router.post('/mobility/vehicle-clearance/:id/review'"));
assert.ok(queue.includes("'insurance','license','national_id'"),'review queue must expose ID and licence');
const ui=readFileSync('dashboard/src/components/admin/VehicleClearanceReview.tsx','utf8');
assert.ok(ui.includes("['national_id','license',item.type==='moto'"),'staff approval eligibility must inspect both operator credentials');
assert.ok(ui.includes("item.operator?.operator_application_status==='APPROVED'"),'operator approval gate must remain');
assert.ok(ui.includes('getStaffComplianceReviewFile(id)'),'staff must inspect private uploaded original');
assert.ok(ui.includes('if(decision===\'verified\'&&!window.confirm('),'physical check requires human attestation');
console.log('PASS owner-bound ID/licence required for verified fleet, live seat discovery and human clearance');
