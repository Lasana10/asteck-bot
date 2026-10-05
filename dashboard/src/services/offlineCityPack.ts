import { supabase } from '../supabaseClient';
import { elapsedMs, performanceNow, recordAfatMetric } from './performanceMetrics';

export type AfatOfflineCityPack = {version:number;city_key:string;city_name:string;country_code?:string|null;timezone?:string|null;currency_code?:string|null;generated_at:string;fresh_for_hours:number;places:any[];access_points:any[];transit_nodes:any[];transit_lines:any[];live_data_included:false;notice:string;automatic_truth:false};
const DB_NAME='afat-offline-v1';const STORE='city-packs';
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'city_key'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Offline storage could not open'))})}
async function transact<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(reason?:any)=>void)=>void):Promise<T>{const db=await openDb();return new Promise<T>((resolve,reject)=>{const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);run(store,resolve,reject);tx.onerror=()=>reject(tx.error||new Error('Offline storage transaction failed'));tx.oncomplete=()=>db.close()})}
export async function saveOfflineCityPack(pack:AfatOfflineCityPack){return transact<AfatOfflineCityPack>('readwrite',(store,resolve,reject)=>{const request=store.put(pack);request.onsuccess=()=>resolve(pack);request.onerror=()=>reject(request.error)})}
export async function readOfflineCityPack(cityKey:string){return transact<AfatOfflineCityPack|null>('readonly',(store,resolve,reject)=>{const request=store.get(cityKey);request.onsuccess=()=>resolve((request.result as AfatOfflineCityPack)||null);request.onerror=()=>reject(request.error)})}
export async function removeOfflineCityPack(cityKey:string){return transact<boolean>('readwrite',(store,resolve,reject)=>{const request=store.delete(cityKey);request.onsuccess=()=>resolve(true);request.onerror=()=>reject(request.error)})}
export async function downloadOfflineCityPack(cityKey:string){
 const start=performanceNow();
 try{
  const{data,error}=await supabase.rpc('afat_offline_city_pack',{p_city_key:cityKey,p_place_limit:3000});
  if(error)throw new Error(error.message||'AFAT could not prepare this city pack.');
  const pack=data as AfatOfflineCityPack;await saveOfflineCityPack(pack);
  recordAfatMetric({operation:'offline_pack',durationMs:elapsedMs(start),outcome:'success',cityKey,cacheState:'network',resultCount:(pack.places?.length||0)+(pack.access_points?.length||0)+(pack.transit_nodes?.length||0),surface:'offline_city_pack'});
  return pack;
 }catch(error:any){recordAfatMetric({operation:'offline_pack',durationMs:elapsedMs(start),outcome:typeof navigator!=='undefined'&&!navigator.onLine?'offline':'error',cityKey,errorClass:error?.name||'offline_pack_error',cacheState:'network',surface:'offline_city_pack'});throw error;}
}
export function cityPackAge(pack:AfatOfflineCityPack|null){if(!pack?.generated_at)return{ageHours:null,stale:true};const ageHours=Math.max(0,(Date.now()-Date.parse(pack.generated_at))/3_600_000);return{ageHours,stale:ageHours>Number(pack.fresh_for_hours||168)}}
export function estimatePackBytes(pack:AfatOfflineCityPack|null){if(!pack)return 0;try{return new Blob([JSON.stringify(pack)]).size}catch{return JSON.stringify(pack).length*2}}
