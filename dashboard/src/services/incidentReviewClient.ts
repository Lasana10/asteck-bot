import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
export type PendingIncident={
 id:string;type:string;description:string|null;severity:number;
 latitude:number;longitude:number;source:string;status:string;
 verification_status:string;created_at:string;expires_at:string;
 movement_log_id:string|null;
};
export async function loadIncidentReviewQueue(){
 try{
  const res=await fetch(`${getApiBaseUrl()}/api/ops/incidents/review-queue`,{
   headers:await authenticatedApiHeaders(),signal:AbortSignal.timeout(15000),
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data?.success||!Array.isArray(data.incidents))
    return {data:null as PendingIncident[]|null,error:{message:data?.error||'Incident review unavailable.'}};
  return {data:data.incidents as PendingIncident[],error:null};
 }catch(e:any){return {data:null as PendingIncident[]|null,error:{message:e?.message||'Incident review unavailable.'}};}
}
export async function decidePendingIncident(id:string,decision:'verify'|'dismiss',notes:string){
 try{
  const res=await fetch(`${getApiBaseUrl()}/api/ops/incidents/${encodeURIComponent(id)}/review`,{
   method:'POST',headers:{...await authenticatedApiHeaders(),'Content-Type':'application/json'},
   body:JSON.stringify({decision,notes}),signal:AbortSignal.timeout(15000),
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data?.success||data.review?.reviewed!==true)
   return {data:null,error:{message:data?.error||'Incident review not confirmed.'}};
  return {data:data.review,error:null};
 }catch(e:any){return {data:null,error:{message:e?.message||'Incident review not confirmed.'}};}
}
