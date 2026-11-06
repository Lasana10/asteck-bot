import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const intake=readFileSync('src/api/onboarding.ts','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
const access=readFileSync('src/services/operatorApplicantAccess.ts','utf8');
const onboarding=readFileSync('dashboard/src/components/shared/RoleOnboarding.tsx','utf8');
const ui=readFileSync('dashboard/src/components/operator/OperatorVehicleRegistration.tsx','utf8');
const docs=readFileSync('dashboard/src/services/operatorComplianceDocuments.ts','utf8');
const client=readFileSync('dashboard/src/services/operatorExecutionClient.ts','utf8');
const accessClient=readFileSync('dashboard/src/supabaseClient.ts','utf8');

assert.ok(access.includes(".eq('capability_key','operator')"),'only operator applications authorize preliminary evidence');
assert.ok(access.includes(".in('status',['submitted','under_review','needs_information'])"),'rejected and withdrawn applicants excluded');
const vehicleRoute=intake.slice(intake.indexOf("router.post('/vehicle/register'"),intake.indexOf("router.get('/vehicle/mine'"));
assert.ok(vehicleRoute.includes("const access=await requireAuthRole(req,res)"),'vehicle registration requires auth');
assert.ok(vehicleRoute.includes('hasPendingOperatorApplication(access.profile.id)'), 'applicant requires submitted application');
assert.ok(vehicleRoute.includes('VEHICLE_OWNER_IMPERSONATION_FORBIDDEN'),'applicants cannot register vehicle for another user');
assert.ok(vehicleRoute.includes("clearance_status:'unreviewed',is_available:false"),'new vehicle cannot self-approve');
const mine=intake.slice(intake.indexOf("router.get('/vehicle/mine'"),intake.indexOf('// ── PASSENGER REGISTRATION'));
assert.ok(mine.includes(".eq('operator_id',access.profile.id)"),'owned registry cannot expose another operator');
assert.ok(mine.includes("automatically_verified:false"),'no automatic approval');
const ensure=api.slice(api.indexOf("router.post('/compliance/operator/ensure-required'"),api.indexOf("router.get('/compliance/summary"));
assert.ok(ensure.includes('hasPendingOperatorApplication(access.profile.id)'),'preapproval vehicle document preparation allowed only on server-verified applications');
assert.ok(ensure.includes(".eq('operator_id',operatorId)"),'only own vehicle document checklist');
assert.ok(ensure.includes("document_type:'national_id'"),'ID required');
assert.ok(ensure.includes("document_type:'license'"),'driving licence required');
assert.ok(ensure.includes("automatically_verified:false,review_required:true"),'document submission never means approval');
assert.ok(intake.includes('is_active: true,'),'new applicant maintains passenger account access');
assert.ok(intake.includes("verificationStatus = 'needs_review'"),'AI extraction must not approve identity');

assert.ok(onboarding.includes("['submitted','under_review','needs_information']"),'applicant evidence UI appears only for eligible operator state');
assert.ok(onboarding.includes('<OperatorVehicleRegistration onRegistered={vehicle=>'),'applicant can register real vehicle');
assert.ok(onboarding.includes('<OperatorComplianceEvidence'),'applicant can submit private records');
assert.ok(onboarding.includes('fetchOwnOperatorVehicles()'),'reload durable server-owned inventory');
assert.ok(onboarding.includes('max-h-[92vh]'),'long evidence workflow remains scrollable on mobile');
assert.ok(ui.includes('onRegistered(data.vehicle)'),'registration passes server vehicle identity');
assert.ok(client.includes('/api/onboard/vehicle/mine'),'owner vehicle API connected');
assert.ok(client.includes("'x-afat-workspace-role':'commuter'"),'unapproved applicant never impersonates operator role');
assert.ok(docs.includes('ownerEvidence?'),'owner document upload scoped to commuter workspace');
const ownApplications=accessClient.slice(accessClient.indexOf('export async function fetchMyAccessApplications'),accessClient.indexOf('export async function fetchAccessApprovalInbox'));
assert.ok((ownApplications.match(/'x-afat-workspace-role':'commuter'/g)||[]).length>=2,
 'self-service application status and submission must work before operator role is approved');
console.log('PASS operator application → owned vehicle → private ID/licence/insurance evidence with no self-approval');
