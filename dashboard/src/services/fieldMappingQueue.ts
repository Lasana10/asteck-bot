import { supabase } from '../supabaseClient';

const DB_NAME='afat-field-mapper-v1';
const STORE='observations';

export type OfflineFieldObservation={
  id:string; userId:string; cityKey:string; type:string; latitude:number; longitude:number; accuracyM:number;
  movementMode?:string|null; label?:string|null; description?:string|null; observedAt:string; photo?:File|null;
};

function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function queueFieldObservation(item:OfflineFieldObservation){
  const d=await db(); await new Promise<void>((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); d.close();
}
export async function pendingFieldObservations(userId:string){
  const d=await db(); const all=await new Promise<OfflineFieldObservation[]>((resolve,reject)=>{const req=d.transaction(STORE).objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});d.close();return all.filter(x=>x.userId===userId);
}
export async function flushFieldObservations(userId:string){
  if(!navigator.onLine)return {flushed:0,pending:(await pendingFieldObservations(userId)).length};
  const auth=(await supabase.auth.getUser()).data.user;
  if(auth?.id!==userId)return {flushed:0,pending:(await pendingFieldObservations(userId)).length};
  const items=await pendingFieldObservations(userId); let flushed=0;
  for(const item of items){
    const mediaPaths:string[]=[];
    if(item.photo){
      const safe=item.photo.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${userId}/${Date.now()}-${item.id}-${safe}`;
      const up=await supabase.storage.from('afat-field-evidence').upload(path,item.photo,{upsert:false,contentType:item.photo.type});
      if(up.error)continue; mediaPaths.push(path);
    }
    const {error}=await supabase.rpc('afat_submit_mapping_observation',{
      p_city_key:item.cityKey,p_observation_type:item.type,p_latitude:item.latitude,p_longitude:item.longitude,
      p_accuracy_m:item.accuracyM,p_movement_mode:item.movementMode||null,p_label:item.label||null,p_description:item.description||null,
      p_attributes:{offline_replay:true},p_media_paths:mediaPaths,p_observed_at:item.observedAt,
    });
    if(error)continue;
    const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(item.id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});d.close();flushed++;
  }
  return {flushed,pending:(await pendingFieldObservations(userId)).length};
}
