import { ingestAtlasContributionSample } from './livingAtlasClient';
import { supabase } from '../supabaseClient';

const PREFIX='afat_atlas_sample_v1:';
const MAX_AGE=48*60*60*1000;
let flushing:Promise<void>|null=null;

export type QueuedAtlasSample={
  sessionId:string; userId:string; latitude:number; longitude:number; accuracyM?:number|null;
  speedKph?:number|null; heading?:number|null; recordedAt:string; idempotencyKey:string;
};

function cleanup(){
  for(const key of Object.keys(localStorage)){
    if(!key.startsWith(PREFIX)) continue;
    try{
      const item=JSON.parse(localStorage.getItem(key)||'{}');
      if(Date.parse(item.recordedAt||'')<Date.now()-MAX_AGE) localStorage.removeItem(key);
    }catch{ localStorage.removeItem(key); }
  }
}

export function enqueueAtlasSample(sample:QueuedAtlasSample){
  cleanup();
  const pending=Object.keys(localStorage).filter(k=>k.startsWith(PREFIX));
  if(pending.length>=1500) throw new Error('Atlas offline queue is full. Reconnect to synchronize.');
  localStorage.setItem(`${PREFIX}${sample.userId}:${sample.sessionId}:${sample.idempotencyKey}`,JSON.stringify(sample));
}

export function pendingAtlasSamples(userId:string,sessionId?:string){
  const prefix=sessionId?`${PREFIX}${userId}:${sessionId}:`:`${PREFIX}${userId}:`;
  return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length;
}

export async function flushAtlasSamples(userId:string){
  if(flushing) return flushing.then(()=>flushAtlasSamples(userId));
  if(!navigator.onLine) return;
  flushing=(async()=>{
    cleanup();
    const {data}=await supabase.auth.getUser();
    if(data.user?.id!==userId) return;
    const keys=Object.keys(localStorage).filter(k=>k.startsWith(`${PREFIX}${userId}:`)).sort();
    for(const key of keys){
      let item:QueuedAtlasSample;
      try{ item=JSON.parse(localStorage.getItem(key)||'{}'); }catch{ localStorage.removeItem(key); continue; }
      const {error}=await ingestAtlasContributionSample(item);
      if(error){
        const msg=String(error.message||'').toLowerCase();
        if(msg.includes('session unavailable')||msg.includes('invalid')) localStorage.removeItem(key);
        else return;
      } else localStorage.removeItem(key);
    }
  })().finally(()=>{flushing=null;});
  return flushing;
}
