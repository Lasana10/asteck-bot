import assert from 'node:assert/strict';
import {departureWithdrawalEligibility} from '../src/services/operatorDepartureOperations';

const now=Date.parse('2026-10-23T17:00:00Z');
const base={is_active:true,departure_time:'2026-10-23T20:00:00Z',has_booking_history:false,has_active_holds:false};
assert.deepEqual(departureWithdrawalEligibility(base,now),{canWithdraw:true,reason:'ready'});
for(const [change,reason] of [
 [{is_active:false},'inactive'],
 [{departure_time:'2026-10-23T16:59:59Z'},'past'],
 [{departure_time:'not-a-time'},'past'],
 [{has_booking_history:true},'bookings'],
 [{has_active_holds:true},'holds'],
 [{has_booking_history:true,has_active_holds:true},'bookings']
] as const){
 assert.deepEqual(departureWithdrawalEligibility({...base,...change},now),{canWithdraw:false,reason});
}
console.log('PASS AFAT operator departure owner-control projection with passenger commitment restrictions');
