/** Projection of one authenticated operator's departure.
 * Descriptive only: cancellation itself is rechecked atomically by the SQL RPC.
 */
export function departureWithdrawalEligibility(input:{
 is_active:boolean|null;
 departure_time:string|null;
 has_booking_history:boolean;
 has_active_holds:boolean;
},now=Date.now()):{canWithdraw:boolean;reason:'ready'|'inactive'|'past'|'bookings'|'holds'}{
 if(input.is_active!==true)return {canWithdraw:false,reason:'inactive'};
 const due=Date.parse(String(input.departure_time||''));
 if(!Number.isFinite(due)||due<=now)return {canWithdraw:false,reason:'past'};
 if(input.has_booking_history)return {canWithdraw:false,reason:'bookings'};
 if(input.has_active_holds)return {canWithdraw:false,reason:'holds'};
 return {canWithdraw:true,reason:'ready'};
}
