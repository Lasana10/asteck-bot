import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261023224500_afat_vehicle_scoped_private_compliance.sql','utf8');
const routes=readFileSync('src/api/routes.ts','utf8');
const form=readFileSync('dashboard/src/components/operator/OperatorComplianceEvidence.tsx','utf8');
const client=readFileSync('dashboard/src/services/operatorComplianceDocuments.ts','utf8');
const home=readFileSync('dashboard/src/components/operator/OperatorWorkspaceHome.tsx','utf8');
for(const part of [
 'add column if not exists vehicle_id uuid references public.vehicles',
 'afat_guard_vehicle_compliance_owner_trigger',
 'afat_vehicle_evidence_revoked',
 'd.vehicle_id=v.id and d.profile_id=v.operator_id',
 'd.verified_at is not null',
 'VEHICLE_COMPLIANCE_DOCUMENTS_NOT_VERIFIED',
 'insert into public.access_audit_events',
])assert.ok(sql.includes(part),part);
const ensure=routes.slice(routes.indexOf("router.post('/compliance/operator/ensure-required'"),routes.indexOf("router.get('/compliance/summary/:profileId'"));
assert.ok(ensure.includes("requireAuthRole(req,res,['operator'])"));
assert.ok(ensure.includes(".eq('operator_id',operatorId)"));
assert.ok(ensure.includes('vehicle_id:vehicleId'));
const queue=routes.slice(routes.indexOf("router.get('/mobility/vehicle-clearance/queue'"),routes.indexOf("router.post('/mobility/vehicle-clearance/:id/review'"));
assert.ok(queue.includes("d.vehicle_id===vehicle.id"),'review must not borrow another vehicle evidence');
assert.ok(client.includes("r.vehicle_id===vehicleId"),'operator sees only current vehicle evidence');
assert.ok(form.includes("ensureOperatorRequiredDocuments(vehicle.id)"));
assert.ok(home.includes("vehicle={{id:vehicle.id,plate_number:vehicle.plate_number,type:vehicle.type}}"));
console.log('PASS AFAT vehicle-specific private document custody, operator/staff integration and verified fleet gating');
