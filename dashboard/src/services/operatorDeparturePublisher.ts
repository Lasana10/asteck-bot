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
