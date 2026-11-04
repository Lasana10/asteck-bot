/** Project only operational seat state, never a passenger identity or claimed settlement. */
export type ManifestBooking={
 id:string;route_id:string|null;seat_label:string|null;status:string;
 payment_status:string|null;
};
export function buildDepartureManifest(bookings:ManifestBooking[],capacity:number){
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>200)throw new Error('Approved vehicle capacity unavailable');
 const cells=new Map<string,{seat_label:string;boarding_status:string;payment_readiness:string}>();
 for(const booking of bookings){
  if(!['pending','accepted','confirmed','boarded','in_progress','completed'].includes(booking.status))continue;
  const label=String(booking.seat_label||'').trim().toUpperCase();
  const match=label.match(/^(?:[A-Z])?([0-9]{1,3})$/);
  if(!match)continue;
  const ordinal=Number(match[1]);
  if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>capacity)continue;
  // Multiple active claims must be flagged for staff review, not silently merged.
  if(cells.has(label)){
   cells.set(label,{seat_label:label,boarding_status:'conflict_review',payment_readiness:'review'});
   continue;
  }
  const boarding_status=booking.status==='boarded'||booking.status==='in_progress'||booking.status==='completed'
   ?'boarded':booking.status==='confirmed'||booking.status==='accepted'?'awaiting_scan':'booking_pending';
  const payment_readiness=['paid','paid_momo','paid_cash'].includes(String(booking.payment_status||''))
   ?'provider_or_cash_confirmed':['cash_due'].includes(String(booking.payment_status||''))
    ?'cash_due_unverified':booking.payment_status==='collection_pending'
     ?'provider_pending':'unpaid_or_unverified';
  cells.set(label,{seat_label:label,boarding_status,payment_readiness});
 }
 const seats=Array.from(cells.values()).sort((a,b)=>a.seat_label.localeCompare(b.seat_label,undefined,{numeric:true}));
 return {capacity,booked_seats:seats.length,
  boarded_seats:seats.filter(s=>s.boarding_status==='boarded').length,
  requiring_review:seats.filter(s=>s.boarding_status==='conflict_review').length,
  seats,from_server_bookings:true,passenger_identity_exposed:false,live_boarding_truth:false};
}
