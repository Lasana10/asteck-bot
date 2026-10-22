import assert from 'node:assert/strict';
import {mayPublishVehicleLocation} from '../src/services/mapSignalFleetAuthorization';
const base={vehicleId:'vehicle-real',operatorId:'operator-real',clearanceStatus:'verified',actorId:'operator-real',role:'operator'};
assert.deepEqual(mayPublishVehicleLocation(base),{allowed:true,reason:null});
for(const status of ['unreviewed','partial','under_review','restricted','suspended','expired',null]){
 assert.equal(mayPublishVehicleLocation({...base,clearanceStatus:status}).allowed,false,
 'GPS report cannot clear or activate a '+status+' vehicle');
}
assert.equal(mayPublishVehicleLocation({...base,actorId:'other-operator'}).allowed,false);
assert.equal(mayPublishVehicleLocation({...base,role:'commuter'}).allowed,false);
assert.equal(mayPublishVehicleLocation({...base,role:'admin',clearanceStatus:'restricted'}).allowed,false);
assert.equal(mayPublishVehicleLocation({...base,role:'planner'}).allowed,true);
assert.equal(mayPublishVehicleLocation({...base,vehicleId:''}).allowed,false);
console.log('PASS AFAT verified-fleet-only map telemetry and no location-based presence promotion');
