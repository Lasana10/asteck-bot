import assert from 'node:assert/strict';
import {validateOperatorVehicleRegistration,vehicleRegistrationOwnership} from '../src/services/operatorVehicleRegistration';
import {readFileSync} from 'node:fs';
assert.deepEqual(validateOperatorVehicleRegistration({
 plate_number:' ce 123 xy ',vehicle_type:'minibus',capacity:14,
}),{plate_number:'CE 123 XY',type:'minibus',capacity:14});
for(const patch of [
 {plate_number:''},{plate_number:'<script>'},{plate_number:'AB'},
 {vehicle_type:'unknown'},{vehicle_type:'gunship'},
 {vehicle_type:'shared_taxi'},{vehicle_type:'moto_taxi'},{vehicle_type:'car'},{vehicle_type:'van'},
 {capacity:null},{capacity:0},{capacity:-1},{capacity:2.5},{capacity:201},
]){
 assert.throws(()=>validateOperatorVehicleRegistration({
  plate_number:'CE 123 XY',vehicle_type:'minibus',capacity:14,...patch,
 }),undefined,'Malformed or unreviewed vehicle input must never enter dispatch data');
}
for(const type of ['moto','taxi','minibus','bus','private']){
 assert.equal(validateOperatorVehicleRegistration({
  plate_number:'CE 123 XY',vehicle_type:type,capacity:4,
 }).type,type,'Published vehicle type must be supported by production CHECK constraint');
}

// Ownership is invariant across retries, races and plate spelling changes.
assert.equal(vehicleRegistrationOwnership(null,'operator-a'),'absent');
assert.equal(vehicleRegistrationOwnership({operator_id:'operator-a'},'operator-a'),'recover');
assert.equal(vehicleRegistrationOwnership({operator_id:'operator-b'},'operator-a'),'conflict');
assert.equal(vehicleRegistrationOwnership({operator_id:null},'operator-a'),'conflict');
const api=readFileSync('src/api/onboarding.ts','utf8');
const start=api.indexOf("router.post('/vehicle/register'");
const end=api.indexOf('// ── PASSENGER REGISTRATION',start);
const registration=api.slice(start,end);
assert.ok(registration.includes("supabase.rpc('afat_find_vehicle_by_plate'"),
 'registration must use normalized globally unique lookup');
assert.ok(registration.includes("error?.code==='23505'"),
 'concurrent registrations must recover only owner or return conflict');
assert.ok(registration.includes("vehicleRegistrationOwnership(existing.data,resolvedOperatorId)!=='recover'"));
assert.ok(registration.includes("vehicleRegistrationOwnership(concurrent.data,resolvedOperatorId)==='recover'"));
assert.ok(registration.includes('resumed:true'),'retry must not create another vehicle');
assert.ok(registration.includes("clearance_status:'unreviewed',is_available:false"),
 'new vehicle registration never approves itself');
const index=readFileSync('supabase/migrations/20261106143436_afat_global_vehicle_plate_custody.sql','utf8');
assert.ok(index.includes('create unique index if not exists vehicles_plate_global_normalized_uidx'));
const lookup=readFileSync('supabase/migrations/20261106144753_afat_vehicle_plate_owner_lookup.sql','utf8');
assert.ok(lookup.includes('security definer'));
assert.ok(lookup.includes('grant execute on function public.afat_find_vehicle_by_plate(text) to service_role'));
assert.ok(lookup.includes('revoke all on function public.afat_find_vehicle_by_plate(text) from public,anon,authenticated'));
const ui=readFileSync('dashboard/src/components/operator/OperatorVehicleRegistration.tsx','utf8');
assert.ok(ui.includes('if(inFlight.current||registered)return'),'rapid duplicate registration clicks must be blocked');
assert.ok(ui.includes('Retry with the same plate'),'lost API response must suggest idempotent recovery');
assert.ok(ui.includes("data.resumed?'recovered':'registered'"),'recovered vs new registration distinguished');

console.log('PASS AFAT vehicle classification matches production constrained types and keeps registration unreviewed');
