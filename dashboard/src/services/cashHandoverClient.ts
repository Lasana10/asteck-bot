import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
export type AfatCashHandover={
 booking_id:string;amount_xaf:number;passenger_attested:boolean;operator_attested:boolean;
 dual_attested:boolean;bank_or_provider_settlement_verified:false;operator_wallet_credited:false;
 payment_status?:string;
};
function verified(data:any,id:string):data is AfatCashHandover{
 return data?.booking_id===id&&
  data.bank_or_provider_settlement_verified===false&&data.operator_wallet_credited===false&&
  typeof data.passenger_attested==='boolean'&&typeof data.operator_attested==='boolean'&&
  typeof data.dual_attested==='boolean'&&data.dual_attested===(data.passenger_attested&&data.operator_attested)&&
  Number.isSafeInteger(data.amount_xaf)&&data.amount_xaf>0;
}
export async function getCashHandover(bookingId:string){
 try{
  const response=await fetch(`${getApiBaseUrl()}/api/booking/${encodeURIComponent(bookingId)}/cash-handover`,{
   headers:await authenticatedApiHeaders(),cache:'no-store',signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.success||!verified(result.handover,bookingId))
   return {data:null,error:{message:result?.error||'Verified cash handover status unavailable.'}};
  return {data:result.handover as AfatCashHandover,error:null};
 }catch(error:any){return {data:null,error:{message:error?.message||'Cash receipt status unavailable.'}};}
}
export async function attestPhysicalCashHandover(bookingId:string){
 try{
  const response=await fetch(`${getApiBaseUrl()}/api/booking/${encodeURIComponent(bookingId)}/cash-handover`,{
   method:'POST',headers:{'Content-Type':'application/json',...await authenticatedApiHeaders()},
   body:JSON.stringify({received_or_handed_over:true}),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.success||!verified(result.handover,bookingId))
   return {data:null,error:{message:result?.error||'Cash attestation was not verified by the server.'}};
  return {data:result.handover as AfatCashHandover,error:null};
 }catch(error:any){return {data:null,error:{message:error?.message||'No cash handover receipt was confirmed.'}};}
}
