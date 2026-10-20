import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
export type AtlasExplanation={
 status:'explained'|'insufficient_evidence'|'ai_unavailable'|'atlas_unavailable';
 text?:string|null;message?:string;evidence?:Array<{id:string;kind:'place'|'road';name:string;confidence:number;evidence_status:string}>;
 advisory_only?:boolean;requires_human_review?:boolean;request_id?:string;
};
export async function explainReviewedAtlas(input:{latitude:number;longitude:number;question:string}):Promise<AtlasExplanation>{
 const headers=await authenticatedApiHeaders();
 const response=await fetch(`${getApiBaseUrl()}/api/atlas/explain`,{
  method:'POST',headers:{'Content-Type':'application/json',...headers},
  body:JSON.stringify(input),signal:AbortSignal.timeout(35000),
 });
 const body=await response.json().catch(()=>null);
 if(!body||typeof body!=='object')throw new Error('AFAT could not read the Atlas intelligence response.');
 if(response.ok&&body.status==='explained'&&typeof body.text==='string'&&Array.isArray(body.evidence)&&body.advisory_only===true)return body as AtlasExplanation;
 if(body.status==='insufficient_evidence'||body.status==='ai_unavailable'||body.status==='atlas_unavailable')return body as AtlasExplanation;
 throw new Error(typeof body.message==='string'?body.message:'Grounded Atlas interpretation failed.');
}
