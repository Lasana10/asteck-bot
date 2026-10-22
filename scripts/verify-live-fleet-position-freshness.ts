import assert from 'node:assert/strict';
import {mayRefreshFleetPosition} from '../src/services/fleetPositionFreshness';
const live={replayed:false,source:'telemetry_service',signalType:'movement',accuracy:15,speed:31,heading:180};
assert.equal(mayRefreshFleetPosition(live).allowed,true);
for(const candidate of [
 {...live,replayed:true},
 {...live,source:'offline_sync'},
 {...live,signalType:'incident'},
 {...live,accuracy:null},{...live,accuracy:121},
 {...live,accuracy:NaN},{...live,accuracy:-1},
 {...live,speed:-2},{...live,speed:900},
 {...live,heading:400},
]){
 assert.equal(mayRefreshFleetPosition(candidate).allowed,false,
  'Historical, duplicate or uncertain movement cannot replace live vehicle position');
}
console.log('PASS AFAT movement history cannot promote replayed/uncertain samples into live fleet position');
