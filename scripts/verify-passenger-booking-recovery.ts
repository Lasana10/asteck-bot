import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const view=readFileSync('dashboard/src/components/commuter/CommuterDashboard.tsx','utf8');
for(const requirement of [
  'fetchBookingStatus,',
  'const recoverCreatedBooking=async(bookingId:string)=>',
  'data?.booking?.id!==bookingId',
  'Number(data.booking.price_paid ?? data.booking.price_xaf)',
  'setCurrentBookingId(data.booking.id)',
  'setView(\'payment\')',
  'if(currentBookingId){setBookingError(',
  'disabled={bookingInFlight||!!currentBookingId||!currentSeatHoldId||!selectedSeatId}',
  'onClick={()=>void recoverCreatedBooking(currentBookingId)}',
  'ne créez pas une autre réservation',
]){
  assert.ok(view.includes(requirement), 'booking identity and server-fare recovery: '+requirement);
}
const createStart=view.indexOf('const handleFareConfirm = async () =>');
const createEnd=view.indexOf('const publishMissionSignal',createStart);
const creation=view.slice(createStart,createEnd);
assert.ok(creation.includes('bookingInFlight || currentBookingId'),
  'a created booking must block another booking creation');
assert.ok(creation.indexOf('setCurrentBookingId(data.booking.id)')<
  creation.indexOf('if(!Number.isSafeInteger(serverFare)'),
  'persist booking identity before evaluating uncertain fare');
assert.ok(creation.includes('setCurrentBookingId(data.booking.id)'),
  'created booking identity remains available for payment-status recovery');
console.log('PASS AFAT existing-booking recovery and no duplicate creation on unknown fare');
