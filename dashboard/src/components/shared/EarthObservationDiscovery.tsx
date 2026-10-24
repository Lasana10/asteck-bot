import React,{useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
type Bounds={south:number;west:number;north:number;east:number};
type Scene={id:string;datetime:string|null;collection?:string|null;cloud_cover?:number|null};
type Discovery={label:string;source:string;sceneCount:number;scenes:Scene[];collections?:{id:string;title:string;license?:string|null}[];discoveries?:{collection_id:string;item_count:number;latest_item_at?:string|null;http_status:number}[];notice:string;checkedAt:string};
type Provider='sentinel'|'landsat'|'digital_earth_africa';
const LABELS:Record<Provider,string>={sentinel:'Copernicus Sentinel-2',landsat:'USGS Landsat',digital_earth_africa:'Digital Earth Africa'};
const validBounds=(box:Bounds|null)=>!!box&&[box.south,box.north,box.east,box.west].every(Number.isFinite)&&box.south<box.north&&box.west<box.east&&(box.north-box.south)<=1&&(box.east-box.west)<=1;
export function EarthObservationDiscovery({cityKey,bounds}:{cityKey:string;bounds:Bounds|null}){
 const [busy,setBusy]=useState<Provider|null>(null);
 const [results,setResults]=useState<Partial<Record<Provider,Discovery>>>({});
 const [notice,setNotice]=useState('');
 const [days,setDays]=useState(60);
 useEffect(()=>{setResults({});setNotice('');},[cityKey]);
 const discover=async(provider:Provider)=>{
  if(busy||!cityKey)return;
  if(provider!=='digital_earth_africa'&&!validBounds(bounds)){
   setNotice('Satellite queries require reviewed city bounds no larger than 1° in each direction.');return;
  }
  setBusy(provider);setNotice('');
  const name=provider==='sentinel'?'afat-copernicus-scene-discovery':
    provider==='landsat'?'afat-landsat-scene-discovery':'afat-deafrica-discovery';
  const body=provider==='digital_earth_africa'?{action:'discover',city_key:cityKey,days,collection_ids:[]}:
    {city_key:cityKey,bbox:bounds,days:Math.min(days,provider==='sentinel'?90:180),limit:20};
  try{
   const {data,error}=await supabase.functions.invoke(name,{body});
   if(error||data?.error)throw new Error(error?.message||String(data?.error));
   if(data?.city_key!==cityKey)throw new Error('Provider result belongs to a different city.');
   const collections=Array.isArray(data?.discoveries)?data.discoveries:[];
   const scenes=Array.isArray(data?.scenes)?data.scenes.slice(0,20).map((s:any)=>({
    id:String(s.id||''),datetime:s.datetime?String(s.datetime):null,
    collection:s.collection||null,
    cloud_cover:typeof s.cloud_cover==='number'&&Number.isFinite(s.cloud_cover)?s.cloud_cover:null,
   })):[];
   const discovery:Discovery={
    label:LABELS[provider],source:String(data.source_key||provider),
    sceneCount:provider==='digital_earth_africa'?collections.reduce((n:number,s:any)=>n+Number(s.item_count||0),0):Number(data.scene_count||0),
    scenes,discoveries:collections,collections:Array.isArray(data.collections)?data.collections:[],
    notice:String(data.notice||'Scene metadata is not a verified surface condition.'),
    checkedAt:new Date().toISOString(),
   };
   setResults(old=>({...old,[provider]:discovery}));
   setNotice(`${LABELS[provider]} catalog checked for ${cityKey}. No flood, closure or route truth was inferred.`);
  }catch(e:any){setNotice(`${LABELS[provider]} discovery unavailable: ${e?.message||'request failed'}`);}
  finally{setBusy(null);}
 };
 return <section className="mt-4 rounded-2xl border border-blue-300/15 bg-black/20 p-4">
  <h3 className="text-sm font-black">Earth-observation scene inventory</h3>
  <p className="mt-1 text-xs leading-5 text-white/55">Query existing authenticated Sentinel, Landsat and Digital Earth Africa catalogs for this active city. Satellite scenes are research inputs, not evidence that any road is passable, flooded, blocked or safe.</p>
  <div className="mt-3 flex flex-wrap items-center gap-2">
   <label className="text-xs text-white/65">Lookback
    <select aria-label="Satellite lookback window" value={days} onChange={e=>setDays(Number(e.target.value))} disabled={!!busy} className="ml-2 rounded-lg border border-white/15 bg-slate-950 p-2 text-xs"><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select>
   </label>
   {(['sentinel','landsat','digital_earth_africa'] as Provider[]).map(provider=><button type="button" key={provider} disabled={!!busy||!cityKey||(provider!=='digital_earth_africa'&&!validBounds(bounds))}
    className="min-h-10 rounded-lg border border-blue-300/25 px-3 text-xs text-blue-100 disabled:opacity-30" onClick={()=>void discover(provider)}>
    {busy===provider?'Checking…':`Discover ${LABELS[provider]}`}
   </button>)}
  </div>
  <div className="mt-4 grid gap-3 lg:grid-cols-3">
   {(['sentinel','landsat','digital_earth_africa'] as Provider[]).map(provider=>{
    const r=results[provider];return <article key={provider} className="rounded-xl border border-white/10 p-3">
     <p className="text-xs font-bold">{LABELS[provider]}</p>
     {!r?<p className="mt-2 text-xs text-white/40">Not checked during this session</p>:<>
      <p className="mt-2 text-lg font-black">{r.sceneCount} <span className="text-xs font-normal text-white/45">returned scene records</span></p>
      <p className="mt-1 text-[10px] text-white/40">Queried {new Date(r.checkedAt).toLocaleString()} · {r.source}</p>
      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
       {r.scenes.slice(0,6).map((scene,i)=><div key={scene.id||i} className="rounded-lg bg-white/[0.04] p-2">
        <p className="break-all text-[10px] text-white/75">{scene.id}</p>
        <p className="mt-1 text-[10px] text-white/45">{scene.datetime||'Date not supplied'}{scene.cloud_cover!==null&&scene.cloud_cover!==undefined?` · scene cloud ${scene.cloud_cover}%`:''}</p>
       </div>)}
       {r.discoveries?.map((entry,i)=><div key={entry.collection_id||i} className="rounded-lg bg-white/[0.04] p-2">
        <p className="text-[10px] text-white/75">{entry.collection_id} · {entry.item_count} catalog items</p>
        <p className="mt-1 text-[10px] text-white/45">Last item {entry.latest_item_at||'unavailable'} · provider HTTP {entry.http_status}</p>
       </div>)}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-amber-100/65">Availability only · no automatic terrain, flood or mobility decision.</p>
     </>}
    </article>;
   })}
  </div>
  {notice&&<p role="status" className="mt-3 rounded-lg border border-amber-300/15 p-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
