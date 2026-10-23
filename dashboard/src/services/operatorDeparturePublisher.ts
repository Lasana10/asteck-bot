import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
import type {ScheduleDraft} from '../../../src/services/scheduledDeparturePublishing';

export async function publishScheduledDeparture(input:ScheduleDraft){
 try{
  const auth=await authenticatedApiHeaders();
  const response=await fetch(`${getApiBaseUrl()}/api/mobility/departures/publish`,{
   method:'POST',headers:{'content-type':'application/json',...auth},
   body:JSON.stringify(input),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.success||!result.departure?.id)
   return {data:null,error:{message:result?.error||'The verified operator departure could not be published.'}};
  return {data:result,error:null};
 }catch(error:any){
  return {data:null,error:{message:error?.message||'Unable to contact the departure service.'}};
 }
}

export type ManagedDeparture={
 id:string;vehicle_id:string;origin:string;destination:string;departure_time:string;
 price_per_seat:number;capacity:number;is_active:boolean;
 has_booking_history:boolean;has_active_holds:boolean;can_withdraw:boolean;
};
export async function fetchMyScheduledDepartures():Promise<{data:ManagedDeparture[]|null;error:{message:string}|null}>{
 try{
  const response=await fetch(`${getApiBaseUrl()}/api/mobility/departures/mine`,{
   headers:await authenticatedApiHeaders(),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.success!==true||!Array.isArray(result.departures))
   return {data:null,error:{message:result?.error||'Operator departure list unavailable.'}};
  return {data:result.departures,error:null};
 }catch(error:any){
  return {data:null,error:{message:error?.message||'Could not load departure inventory.'}};
 }
}
export async function withdrawScheduledDeparture(id:string,reason:string){
 try{
  const response=await fetch(`${getApiBaseUrl()}/api/mobility/departures/${encodeURIComponent(id)}/withdraw`,{
   method:'POST',headers:{...await authenticatedApiHeaders(),'Content-Type':'application/json'},
   body:JSON.stringify({reason}),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.success!==true)
   return {data:null,error:{message:result?.error||'Departure cannot be withdrawn.'}};
  return {data:result.departure,error:null};
 }catch(error:any){
  return {data:null,error:{message:error?.message||'Departure withdrawal not confirmed.'}};
 }
}
