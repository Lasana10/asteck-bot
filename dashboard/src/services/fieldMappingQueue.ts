import { supabase } from '../supabaseClient';

const DB_NAME='afat-field-mapper-v1';
const STORE='observations';
const MAX_PHOTO_BYTES=12*1024*1024;
const ALLOWED_PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp','image/heic']);
const inFlight=new Map<string,Promise<{flushed:number;pending:number}>>();

/** Stable object key: replaying an observation never creates a second photo. */
export function fieldEvidencePath(item:Pick<OfflineFieldObservation,'id'|'userId'|'photo'>):string|null{
  if(!item.photo)return null;
  if(!/^[0-9a-f-]{36}$/i.test(item.id)||!/^[0-9a-f-]{36}$/i.test(item.userId))throw new Error('Invalid field evidence identity');
  const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'};
  if(!ALLOWED_PHOTO_TYPES.has(item.photo.type)||item.photo.size>MAX_PHOTO_BYTES||item.photo.size<=0)throw new Error('Unsupported field photo or file too large (12 MB maximum)');
  return `${item.userId}/${item.id}.${ext[item.photo.type]}`;
}

export function validateFieldObservation(item:OfflineFieldObservation):void{
  if(!/^[0-9a-f-]{36}$/i.test(item.id)||!/^[0-9a-f-]{36}$/i.test(item.userId))throw new Error('Invalid field evidence identity');
  if(!item.cityKey||item.cityKey.length>100||!item.type||item.type.length>80)throw new Error('Invalid observation category');
  if(!Number.isFinite(item.latitude)||Math.abs(item.latitude)>90||!Number.isFinite(item.longitude)||Math.abs(item.longitude)>180)throw new Error('Invalid observation coordinates');
  if(!Number.isFinite(item.accuracyM)||item.accuracyM<0||item.accuracyM>120)throw new Error('Field location accuracy is insufficient');
  const when=Date.parse(item.observedAt);
  if(!Number.isFinite(when)||when>Date.now()+5000||when<Date.now()-31536000000)throw new Error('Observation timestamp is invalid or too old');
  if((item.label?.length??0)>240||(item.description?.length??0)>2000)throw new Error('Field observation text is too long');
  if(item.placeId && !/^[0-9a-f-]{36}$/i.test(item.placeId))throw new Error('Invalid suggested destination link');
  if((item.placeName?.length??0)>180)throw new Error('Place reference label is too long');
  fieldEvidencePath(item);
}


export type OfflineFieldObservation={
  id:string; userId:string; cityKey:string; type:string; latitude:number; longitude:number; accuracyM:number;
  movementMode?:string|null; label?:string|null; description?:string|null; observedAt:string; photo?:File|null;
  placeId?:string|null; placeName?:string|null;
};

function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function queueFieldObservation(item:OfflineFieldObservation){
  validateFieldObservation(item);
  const d=await db(); await new Promise<void>((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); d.close();
}
export async function pendingFieldObservations(userId:string){
  const d=await db(); const all=await new Promise<OfflineFieldObservation[]>((resolve,reject)=>{const req=d.transaction(STORE).objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});d.close();return all.filter(x=>x.userId===userId);
}
/** Serializes replay per user, preserves queued data on errors and avoids duplicate uploads. */
export function flushFieldObservations(userId:string):Promise<{flushed:number;pending:number}>{
  const existing=inFlight.get(userId);
  if(existing)return existing;
  const run=flushFieldObservationsOnce(userId);
  inFlight.set(userId,run);
  void run.finally(()=>{if(inFlight.get(userId)===run)inFlight.delete(userId);}).catch(()=>{});
  return run;
}
/** Uses INSERT-only storage permissions and verifies an existing immutable object before replay. */
export async function uploadFieldEvidence(userId:string,path:string,photo:File):Promise<boolean>{
  if(!path.startsWith(userId+'/'))return false;
  const bucket=supabase.storage.from('afat-field-evidence');
  const up=await bucket.upload(path,photo,{upsert:false,contentType:photo.type});
  if(!up.error)return true;
  if(String((up.error as {statusCode?:string|number}).statusCode||'')!=='409')return false;
  const name=path.slice(path.lastIndexOf('/')+1);
  const listing=await bucket.list(userId,{search:name,limit:10});
  return !listing.error&&!!listing.data?.some(object=>object.name===name);
}

async function flushFieldObservationsOnce(userId:string){
  const pending=()=>pendingFieldObservations(userId);
  if(typeof navigator!=='undefined'&&!navigator.onLine)return {flushed:0,pending:(await pending()).length};
  const {data,error:authError}=await supabase.auth.getUser();
  if(authError||data.user?.id!==userId)return {flushed:0,pending:(await pending()).length};
  const items=await pending();let flushed=0;
  for(const item of items){
    // The active account can change while a queue is replaying.
    const {data:current,error:identityError}=await supabase.auth.getUser();
    if(identityError||current.user?.id!==userId)break;
    try{validateFieldObservation(item);}catch{continue;} // Retain invalid evidence for explicit review, never silently delete it.
    const mediaPaths:string[]=[];
    const path=fieldEvidencePath(item);
    if(path&&item.photo){
      // The deployed storage bucket allows owner INSERT and SELECT, but not UPDATE.
      // Upload immutably; after a retry conflict, verify that the exact owned object exists.
      if(!await uploadFieldEvidence(userId,path,item.photo))continue;
      mediaPaths.push(path);
    }
    // Never turn a failed RPC into a success. Server-side duplicate protection is tracked separately.
    const {error}=await supabase.rpc('afat_submit_mapping_observation',{
      p_city_key:item.cityKey,p_observation_type:item.type,p_latitude:item.latitude,p_longitude:item.longitude,
      p_accuracy_m:item.accuracyM,p_movement_mode:item.movementMode||null,p_label:item.label||null,p_description:item.description||null,
      p_attributes:{offline_replay:true,client_observation_id:item.id,
        suggested_place_id:item.placeId||null,suggested_place_name:item.placeName?.slice(0,180)||null,
        source_surface:item.placeId?'passenger_move_learn':'field_mapper'},p_media_paths:mediaPaths,p_observed_at:item.observedAt,
    });
    if(error)continue;
    const d=await db();
    try{
      await new Promise<void>((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(item.id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
      flushed++;
    }finally{d.close();}
  }
  return {flushed,pending:(await pending()).length};
}
