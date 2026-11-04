import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
export type CashHandoverBooking={
 id:string;status:string;payment_status:string;price_paid:number;seat_label:string;
 routes?:{origin?:string;destination?:string;departure_time?:string}|null;
 handover?:{
  passenger_confirmed_at:string|null;operator_confirmed_at:string|null;confirmed_at:string|null;
 }|null;
};
export type CashHandoverReceipt={
 booking_id:string;status:'awaiting_other_party'|'confirmed';changed:boolean;
 passenger_attested:boolean;operator_attested:boolean;
 operator_holds_cash:boolean;platform_holds_cash:false;
 provider_settled:false;operator_wallet_credited:false;
};
async function api(path:string,method:'GET'|'POST',body?:unknown){
 const response=await fetch(`${getApiBaseUrl()}${path}`,{
  method,headers:{...await authenticatedApiHeaders(),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  cache:'no-store',signal:AbortSignal.timeout(20000),
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.success)throw new Error(result?.error||'Cash handover authority unavailable.');
 return result;
}
export async function fetchCashHandoverBookings(role:'passenger'|'operator',departureId?:string){
 try{
  const path=role==='passenger'?'/api/booking/cash-handover/mine':
   `/api/mobility/departures/${encodeURIComponent(departureId||'')}/cash-handovers`;
  const result=await api(path,'GET');
  if(!Array.isArray(result.bookings)||
    (role==='operator'&&(result.passenger_identifiers_exposed!==false||
     result.cash_platform_custody!==false)))
    throw new Error('AFAT could not validate cash booking visibility.');
  return {data:result.bookings as CashHandoverBooking[],error:null};
 }catch(error:any){return {data:[] as CashHandoverBooking[],error:{message:error?.message||'Cash handover list unavailable.'}};}
}
export async function attestCashHandover(bookingId:string){
 try{
  const result=await api(`/api/booking/${encodeURIComponent(bookingId)}/cash-handover/attest`,'POST',{confirm:true});
  const r=result.handover;
  if(!r||r.booking_id!==bookingId||!['confirmed','awaiting_other_party'].includes(r.status)||
     r.platform_holds_cash!==false||r.provider_settled!==false||
     r.operator_wallet_credited!==false||r.passenger_attested!==Boolean(r.passenger_attested)||
     r.operator_attested!==Boolean(r.operator_attested))
    throw new Error('AFAT has not confirmed a safe cash handover receipt.');
  return {data:r as CashHandoverReceipt,error:null};
 }catch(error:any){return {data:null,error:{message:error?.message||'Cash confirmation unavailable.'}};}
}
