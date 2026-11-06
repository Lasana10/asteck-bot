import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPublishedDepartures} from '../src/services/publishedDepartureTruth';
const now=Date.parse('2026-10-21T12:00:00Z');
const route={id:'route-1',is_active:true,operator_id:'operator-1',vehicle_id:'vehicle-1',name:'Yaounde to Douala',
 origin:'Yaounde',destination:'Douala',departure_time:'2026-10-21T16:00:00Z',price_per_seat:3500,capacity:14,vehicle_type:'minibus'};
const operator={id:'operator-1',full_name:'Approved transport',operator_application_status:'APPROVED',verification_status:'verified'};
const vehicle={id:'vehicle-1',type:'minibus',capacity:14,clearance_status:'verified',plate_number:'CE-123'};
const project=(patch={},operatorPatch={},vehiclePatch={},bookings=[])=>projectPublishedDepartures({
 routes:[{...route,...patch}],operators:[{...operator,...operatorPatch}],vehicles:[{...vehicle,...vehiclePatch}],bookings,nowMs:now});
const accepted=project({}, {}, {},[{route_id:'route-1',seat_label:'1',status:'confirmed'},{route_id:'route-1',seat_label:'01',status:'confirmed'},{route_id:'route-1',seat_label:'2',status:'pending'}]);
assert.equal(accepted.length,1);
assert.equal(accepted[0].available_seats,12);
assert.equal(accepted[0].booked_seats,2);
assert.equal(accepted[0].inventory_note.includes('seat hold'),true);
for(const patch of [
 {departure_time:'2026-10-21T11:59:59Z'},
 {departure_time:null},{price_per_seat:0},{price_per_seat:-1},
 {capacity:0},{is_active:false},{destination:''}
])assert.equal(project(patch).length,0,'Invalid or old departure was published');
assert.equal(project({}, {verification_status:'pending'}).length,0);
assert.equal(project({}, {operator_application_status:'DRAFT'}).length,0);
assert.equal(project({}, {}, {clearance_status:'pending'}).length,0);
assert.equal(project({}, {}, {},Array.from({length:14},(_,i)=>({route_id:'route-1',seat_label:String(i+1),status:'confirmed'}))).length,0);
const reclaimed=project({}, {}, {},[
 {route_id:'route-1',seat_label:'1',status:'confirmed'},
 {route_id:'route-1',seat_label:'2',status:'cancelled'},
 {route_id:'route-1',seat_label:'3',status:'expired'},
 {route_id:'route-1',seat_label:'4',status:'refunded'},
 {route_id:'route-1',seat_label:'5',status:'no_show'},
 {route_id:'route-1',seat_label:'06',status:'accepted'},
 {route_id:'route-1',seat_label:'6',status:'pending'},
 {route_id:'route-1',seat_label:'999',status:'confirmed'},
 {route_id:'route-1',seat_label:'not-a-seat',status:'confirmed'},
]);
assert.equal(reclaimed.length,1);
assert.deepEqual(reclaimed[0].occupied_seats,['1','6']);
assert.equal(reclaimed[0].available_seats,12);
assert.equal(project({}, {}, {},[{route_id:'route-1',seat_label:'1'}])[0].booked_seats,0,
 'unknown booking status must not consume inventory');
assert.equal(project({departure_time:'2026-10-21T16:00:00Z'}, {}, {},[]).length,1);
const api=readFileSync('src/api/routes.ts','utf8');
assert.ok(api.includes(".select('route_id,seat_label,status')"),
 'exact departure must supply booking status to capacity projection');
assert.ok(api.includes("EXACT_DEPARTURE_BOOKINGS_EXCEEDS_SAFE_LIMIT"),
 'exact departure may never claim free seats from a potentially truncated booking page');
assert.ok(api.includes("loadActiveDepartureSeatClaims(supabase,routeIds)"),
 'public departure search must read all active booking records or fail closed');
const reader=readFileSync('src/services/departureSeatInventory.ts','utf8');
assert.ok(reader.includes(".select('id,route_id,seat_label,status')"),
 'paginated public departure search must propagate active booking status');
assert.equal((api.match(/projectPublishedDepartures\(/g)||[]).length,2,
 'both public and exact-seat endpoints must use the same occupancy projection');
console.log('PASS AFAT verified operator → published future departure → provisional seat inventory contract');
