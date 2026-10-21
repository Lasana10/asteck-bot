import {authenticatedApiHeaders,getApiBaseUrl,supabase} from '../supabaseClient';

type ComplianceRecord={id:string;profile_id:string;role:string;document_type:string;status:string;file_url?:string|null;verified_at?:string|null;due_at?:string|null};
async function api(path:string,init:RequestInit={}){
 const auth=await authenticatedApiHeaders();
 const response=await fetch(`${getApiBaseUrl()}${path}`,{
  ...init,headers:{'content-type':'application/json',...auth,...init.headers},
  signal:AbortSignal.timeout(25000),
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.error||'AFAT compliance evidence service unavailable');
 return data;
}
export async function getOperatorComplianceRecords(profileId:string):Promise<ComplianceRecord[]>{
 const result=await api(`/api/compliance/summary/${encodeURIComponent(profileId)}`);
 return (result.records||[]).filter((r:ComplianceRecord)=>r.profile_id===profileId&&['operator','bike_rider'].includes(r.role));
}
export async function submitOperatorComplianceDocument(recordId:string,file:File){
 const mime=file.type.toLowerCase();
 if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime)||
    file.size<1||file.size>8*1024*1024)
  throw new Error('Choose a PDF or JPEG/PNG/WebP document of 8 MB maximum.');
 const permit=await api(`/api/compliance/${encodeURIComponent(recordId)}/upload-authorize`,{
  method:'POST',body:JSON.stringify({mime_type:mime,bytes:file.size}),
 });
 if(!permit.private||permit.review_status!=='not_verified'||!permit.token)
  throw new Error('Secure private upload authorization missing');
 const uploaded=await supabase.storage.from(permit.bucket)
   .uploadToSignedUrl(permit.path,permit.token,file,{contentType:mime,upsert:false});
 if(uploaded.error)throw new Error(uploaded.error.message);
 return api(`/api/compliance/${encodeURIComponent(recordId)}/upload-confirm`,{
  method:'POST',body:JSON.stringify({path:permit.path}),
 });
}
export async function getStaffComplianceReviewFile(recordId:string):Promise<string>{
 const data=await api(`/api/compliance/${encodeURIComponent(recordId)}/review-file`);
 if(!data.success||typeof data.url!=='string'||data.automatically_verified!==false)
  throw new Error('Verified private evidence link was not issued');
 return data.url;
}

/** Reconcile missing required documentation rows only; never mark them verified. */
export async function ensureOperatorRequiredDocuments(){
 const result=await api('/api/compliance/operator/ensure-required',{
  method:'POST',body:JSON.stringify({}),
 });
 if(result.automatically_verified!==false||result.review_required!==true)
  throw new Error('Operator credential safety contract not confirmed');
 return result.created_missing as string[];
}
