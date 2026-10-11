import {createHmac} from 'node:crypto';
export type AfatAiTask='mobility'|'general';
export async function invokeAfatAiCore(input:{tenantId:string;task:AfatAiTask;prompt:string;publicEvidenceOnly:true}):Promise<{output:string;requestId:string;model:string;requiresHumanReview:boolean}>{
 const base=process.env.AI_CORE_URL,key=process.env.AI_CORE_KEY_AFAT;
 if(!base||!key)throw Error('AI_CORE_NOT_CONFIGURED');
 const url=new URL(base);
 if(url.protocol!=='https:')throw Error('AI_CORE_REQUIRES_HTTPS');
 const tenant=input.tenantId;
 if(typeof tenant!=='string'||!(/^[A-Za-z0-9_-]{2,64}$/).test(tenant))throw Error('AI_CORE_INVALID_TENANT');
 if(input.publicEvidenceOnly!==true||typeof input.prompt!=='string'||input.prompt.length>6000||!input.prompt.trim())throw Error('AI_CORE_INVALID_PUBLIC_INPUT');
 const timestamp=String(Date.now());
 const signature=createHmac('sha256',key).update(JSON.stringify(['AFAT',tenant,timestamp])).digest('hex');
 const response=await fetch(new URL('/v1/infer',url),{method:'POST',signal:AbortSignal.timeout(35000),
  headers:{'content-type':'application/json','x-ai-product':'AFAT','x-ai-key':key,'x-ai-tenant':tenant,'x-ai-timestamp':timestamp,'x-ai-tenant-signature':signature},
  body:JSON.stringify({task:input.task,sensitivity:'public',approvedExternalProcessing:false,prompt:input.prompt})
 });
 const data=await response.json() as {output?:unknown;requestId?:unknown;model?:unknown;requiresHumanReview?:unknown;error?:unknown};
 if(!response.ok)throw Error(typeof data.error==='string'?data.error:'AI_CORE_FAILED');
 if(typeof data.output!=='string'||typeof data.requestId!=='string'||typeof data.model!=='string')throw Error('AI_CORE_BAD_RESPONSE');
 return {output:data.output,requestId:data.requestId,model:data.model,requiresHumanReview:data.requiresHumanReview===true};
}
