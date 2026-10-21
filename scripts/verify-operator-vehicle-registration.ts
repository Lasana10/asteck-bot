import assert from 'node:assert/strict';
import {validateOperatorVehicleRegistration} from '../src/services/operatorVehicleRegistration';
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
console.log('PASS AFAT vehicle classification matches production constrained types and keeps registration unreviewed');
