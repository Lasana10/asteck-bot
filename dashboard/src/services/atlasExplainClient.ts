import {authenticatedApiHeaders,getApiBaseUrl} from '../supabaseClient';
export type AtlasExplanation={
 status:'explained'|'reviewed_context'|'source_context'|'insufficient_evidence'|'ai_unavailable'|'atlas_unavailable';
 text?:string|null;message?:string;evidence?:Array<{id:string;kind:'place'|'road';name:string;confidence:number;evidence_status:string}>;
 advisory_only?:boolean;ai_used?:boolean;source_context_only?:boolean;source_places?:Array<{id:string;name:string;place_type:string;source_key:string;evidence_status:string;distance_m:number;verified_access:false}>;requires_human_review?:boolean;request_id?:string;
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
 if(response.ok&&body.status==='reviewed_context'&&body.advisory_only===true&&
   body.ai_used===false&&body.requires_human_review===true&&typeof body.text==='string'&&
   Array.isArray(body.evidence)&&body.evidence.length>0&&
   body.evidence.every((item:any)=>item&&['place','road'].includes(item.kind)&&
     ['verified','corroborated'].includes(item.evidence_status)&&
     typeof item.name==='string'&&Number.isFinite(item.confidence)&&item.confidence>=0&&item.confidence<=100))
   return body as AtlasExplanation;
 if(response.ok&&body.status==='source_context'&&body.source_context_only===true&&body.advisory_only===true&&
   typeof body.text==='string'&&Array.isArray(body.source_places)&&Array.isArray(body.evidence)&&body.evidence.length===0&&
   body.source_places.every((p:any)=>p&&p.verified_access===false&&['overture_maps','openstreetmap'].includes(p.source_key)))
    return body as AtlasExplanation;
 if(body.status==='insufficient_evidence'||body.status==='ai_unavailable'||body.status==='atlas_unavailable')return body as AtlasExplanation;
 throw new Error(typeof body.message==='string'?body.message:'Grounded Atlas interpretation failed.');
}
