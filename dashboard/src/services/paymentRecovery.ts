import {supabase} from '../supabaseClient';

export type PaymentPhase='ready'|'pending'|'paid'|'cash_due'|'blocked'|'unknown';
export type BookingPaymentState={
 phase:PaymentPhase;
 transactionId:string;
};
export function paymentPhaseFromBooking(value:unknown):BookingPaymentState{
 if(!value||typeof value!=='object')return {phase:'unknown',transactionId:''};
 const booking=value as Record<string,unknown>;
 const status=String(booking.status||'').toLowerCase();
 const payment=String(booking.payment_status||'').toLowerCase();
 const transactionId=typeof booking.transaction_id==='string'&&booking.transaction_id.length<=120
   ? booking.transaction_id : '';
 if(['cancelled','expired','no_show','refunded','disputed'].includes(status))
   return {phase:'blocked',transactionId};
 if(payment==='paid'||payment==='paid_momo'||payment==='paid_cash')return {phase:'paid',transactionId};
 if(payment==='collection_pending')return {phase:'pending',transactionId};
 if(payment==='cash_due')return {phase:'cash_due',transactionId};
 if((payment==='unpaid'||payment==='failed')&&['pending','accepted','confirmed','boarded','in_progress','completed'].includes(status))
   return {phase:'ready',transactionId};
 return {phase:'blocked',transactionId};
}

export type RecoverablePaymentBooking={
 id:string;
 amountXaf:number;
 seatLabel:string;
 routeName:string;
 origin:string;
 destination:string;
 departureTime:string;
 operatorName:string;
 plateNumber:string;
 paymentStatus:string;
 canSelfCancel:boolean;
};
export type PassengerBookingEntry=RecoverablePaymentBooking & {paymentPhase:PaymentPhase;transactionId:string};
export async function fetchPassengerBookingHistory(profileId:string){
 const {data:identity,error:identityError}=await supabase.auth.getUser();
 if(identityError||identity.user?.id!==profileId)
   return {data:[] as PassengerBookingEntry[],error:{message:'Sign in to your own passenger account to recover a booking.'}};
 const {data,error}=await supabase.from('bookings')
  .select('id,passenger_id,status,payment_status,price_paid,price_xaf,seat_label,transaction_id,created_at,routes(name,origin,destination,departure_time),vehicles(plate_number),profiles!operator_id(full_name)')
  .eq('passenger_id',profileId)
  .in('payment_status',['unpaid','failed','collection_pending','cash_due','paid','paid_momo','paid_cash'])
  .order('created_at',{ascending:false}).limit(15);
 if(error)return {data:[] as PassengerBookingEntry[],error:{message:error.message}};
 const rows=(data||[]).flatMap((raw:any)=>{
  const decision=paymentPhaseFromBooking(raw);
  if(!['ready','pending','cash_due','paid'].includes(decision.phase))return [];
  const amount=Number(raw.price_paid??raw.price_xaf);
  if(!Number.isSafeInteger(amount)||amount<=0||!raw?.id||!raw?.seat_label)return [];
  const route=Array.isArray(raw.routes)?raw.routes[0]:raw.routes;
  const operator=Array.isArray(raw.profiles)?raw.profiles[0]:raw.profiles;
  const vehicle=Array.isArray(raw.vehicles)?raw.vehicles[0]:raw.vehicles;
  return [{id:String(raw.id),amountXaf:amount,seatLabel:String(raw.seat_label),
   routeName:String(route?.name||'Booked departure'),
   origin:String(route?.origin||'Origin to confirm'),
   destination:String(route?.destination||'Destination to confirm'),
   departureTime:String(route?.departure_time||''),
   operatorName:String(operator?.full_name||'Verified operator (details unavailable)'),
   plateNumber:String(vehicle?.plate_number||'Not displayed'),
   paymentStatus:String(raw.payment_status),paymentPhase:decision.phase,transactionId:decision.transactionId,
   canSelfCancel:String(raw.status)==='pending'&&
    ['unpaid','failed'].includes(String(raw.payment_status))&&
    !raw.transaction_id&&Number.isFinite(Date.parse(String(route?.departure_time||'')))&&
    Date.parse(String(route?.departure_time))>Date.now()}];
 });
 return {data:rows as PassengerBookingEntry[],error:null};
}

// Backward-compatible outstanding-payment selector for existing callers.
// Paid records are displayed in the booking history, never offered a new collection.
export async function fetchRecoverablePassengerPayments(profileId:string){
 const {data,error}=await fetchPassengerBookingHistory(profileId);
 return {data:data.filter(row=>row.paymentPhase!=='paid') as RecoverablePaymentBooking[],error};
}
