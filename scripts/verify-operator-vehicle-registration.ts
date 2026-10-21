import assert from 'node:assert/strict';
import {validateOperatorVehicleRegistration} from '../src/services/operatorVehicleRegistration';
assert.deepEqual(validateOperatorVehicleRegistration({
 plate_number:' ce 123 xy ',vehicle_type:'minibus',capacity:14,
}),{plate_number:'CE 123 XY',type:'minibus',capacity:14});
for(const patch of [
 {plate_number:''},{plate_number:'<script>'},{plate_number:'AB'},
 {vehicle_type:'unknown'},{vehicle_type:'gunship'},
 {capacity:null},{capacity:0},{capacity:-1},{capacity:2.5},{capacity:201},
]){
 assert.throws(()=>validateOperatorVehicleRegistration({
  plate_number:'CE 123 XY',vehicle_type:'minibus',capacity:14,...patch,
 }),undefined,'Malformed or unreviewed vehicle input must never enter dispatch data');
}
console.log('PASS AFAT signed operator vehicle registration request inputs; review state must remain unreviewed');
