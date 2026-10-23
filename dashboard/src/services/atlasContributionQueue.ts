import { ingestAtlasContributionSample } from './livingAtlasClient';
import { supabase } from '../supabaseClient';

const PREFIX='afat_atlas_sample_v1:';
let flushing:Promise<void>|null=null;

export type QueuedAtlasSample={
  sessionId:string; userId:string; latitude:number; longitude:number; accuracyM?:number|null;
  speedKph?:number|null; heading?:number|null; recordedAt:string; idempotencyKey:string;
};

export function enqueueAtlasSample(sample:QueuedAtlasSample){
  const pending=Object.keys(localStorage).filter(k=>k.startsWith(PREFIX));
  const key=`${PREFIX}${sample.userId}:${sample.sessionId}:${sample.idempotencyKey}`;
  if(localStorage.getItem(key)!==null)return; // Exact replay keeps the original observation.
  if(pending.length>=1500) throw new Error('Atlas offline queue is full. Reconnect to synchronize.');
  localStorage.setItem(key,JSON.stringify(sample));
}

export function pendingAtlasSamples(userId:string,sessionId?:string){
  const prefix=sessionId?`${PREFIX}${userId}:${sessionId}:`:`${PREFIX}${userId}:`;
  return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length;
}

export async function flushAtlasSamples(userId:string){
  if(flushing) return flushing.then(()=>flushAtlasSamples(userId));
  if(!navigator.onLine) return;
  flushing=(async()=>{
    const {data}=await supabase.auth.getUser();
    if(data.user?.id!==userId) return;
    const keys=Object.keys(localStorage).filter(k=>k.startsWith(`${PREFIX}${userId}:`)).sort();
    for(const key of keys){
      let item:QueuedAtlasSample;
      try{ item=JSON.parse(localStorage.getItem(key)||'{}'); }catch{ return; }
      if(item.userId!==userId || !item.sessionId || !item.idempotencyKey ||
         !Number.isFinite(Date.parse(item.recordedAt)))return;
      // A returned HTTP success is not durable evidence if the RPC indicates
      // 'rejected' or omits the exact saved sample identity.
      const {data,error}=await ingestAtlasContributionSample(item);
      if(error)return; // Preserve unresolved samples for operator/user review.
      if(!data?.sample_id || data.match_state==='rejected')return;
      localStorage.removeItem(key);
    }
  })().finally(()=>{flushing=null;});
  return flushing;
}
