import assert from 'node:assert/strict';
import {validateScheduleDraft} from '../src/services/scheduledDeparturePublishing';
const now=Date.parse('2026-10-21T13:00:00Z');
const draft={
 vehicle_id:'31c823cc-453b-40e2-87f9-bb828d6abe9f',
 origin:'Helios High Tech Academy',destination:'Central Douala market',
 origin_lat:3.866,origin_lng:11.516,dest_lat:4.0511,dest_lng:9.7679,
 departure_time:'2026-10-22T08:00:00+01:00',price_per_seat:4500,
};
const parsed=validateScheduleDraft(draft,now);
assert.equal(parsed.price_per_seat,4500);
assert.equal(parsed.origin_lat,3.866);
assert.equal(parsed.departure_time,'2026-10-22T07:00:00.000Z');
for(const invalid of [
 {vehicle_id:'fake'},{origin:' '},{destination:''},{origin_lat:'3.866'},
 {origin_lat:92},{dest_lng:181},{dest_lat:draft.origin_lat,dest_lng:draft.origin_lng},
 {price_per_seat:0},{price_per_seat:2.5},{price_per_seat:Infinity},
 {departure_time:'2026-10-21T12:00:00Z'},
 {departure_time:'2026-10-21T13:09:00Z'},
 {departure_time:'2026-12-21T08:00:00Z'},
]){
 assert.throws(()=>validateScheduleDraft({...draft,...invalid},now),undefined,
  'Invalid operator schedule must never become public booking inventory: '+JSON.stringify(invalid));
}
assert.equal(validateScheduleDraft({...draft,origin:'  Mokolo  <public>  stop '},now).origin.includes('<'),false);
console.log('PASS AFAT approved operator future scheduled departure geography/fare contract');
