import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, MapPinned, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const YAOUNDE_PRESETS: Record<string,{label:string;south:number;west:number;north:number;east:number}> = {
  central:{label:'Central Yaoundé',south:3.84,west:11.495,north:3.89,east:11.545},
  west:{label:'West Yaoundé',south:3.82,west:11.445,north:3.89,east:11.495},
  east:{label:'East Yaoundé',south:3.82,west:11.545,north:3.89,east:11.595},
  north:{label:'North Yaoundé',south:3.89,west:11.47,north:3.95,east:11.56},
  south:{label:'South Yaoundé',south:3.77,west:11.47,north:3.84,east:11.56},
};

export function AtlasIngestionControl(){
 const [cities,setCities]=useState<any[]>([]); const [cityKey,setCityKey]=useState('cm-yaounde'); const [scope,setScope]=useState('central');
 const [bbox,setBbox]=useState({south:'3.84',west:'11.495',north:'3.89',east:'11.545'});
 const [running,setRunning]=useState(false); const [result,setResult]=useState<any>(null);
 useEffect(()=>{void supabase.from('afat_city_profiles').select('city_key,city_name,country_code,learning_stage').eq('status','active').order('city_name').then(({data})=>setCities(data||[]));},[]);
 const city=useMemo(()=>cities.find(c=>c.city_key===cityKey),[cities,cityKey]);
 const choosePreset=(key:string)=>{setScope(key);const p=YAOUNDE_PRESETS[key];if(p)setBbox({south:String(p.south),west:String(p.west),north:String(p.north),east:String(p.east)});};
 const run=async()=>{
   setRunning(true);setResult(null);
   const payload={city_key:cityKey,scope_label:scope||'custom-cell',bbox:{south:Number(bbox.south),west:Number(bbox.west),north:Number(bbox.north),east:Number(bbox.east)}};
   const {data,error}=await supabase.functions.invoke('afat-osm-city-ingest',{body:payload});
   setRunning(false);setResult(error?{error:error.message}:data||{});
 };
 return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-500/[0.04] p-5">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div><div className="flex items-center gap-2 text-emerald-200"><DatabaseZap className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">Atlas source ingestion</p></div><h2 className="mt-2 text-lg font-black">OpenStreetMap → City Genesis candidate topology</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Imports a controlled road cell for any registered AFAT city. OSM remains attributed source evidence; topology stays candidate-only until AFAT review and corroboration.</p></div>
    <div className="flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-black/20 px-3 py-2 text-[9px] font-bold text-emerald-100/70"><ShieldCheck className="h-3.5 w-3.5"/>JWT + planner/admin gate</div>
   </div>
   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label className="text-[9px] font-black uppercase text-white/35">City<select value={cityKey} onChange={e=>setCityKey(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-white">{cities.map(c=><option key={c.city_key} value={c.city_key}>{c.city_name} · {c.country_code}</option>)}</select></label>
    <label className="text-[9px] font-black uppercase text-white/35">Scope label<input value={scope} onChange={e=>setScope(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm normal-case text-white" placeholder="central-1"/></label>
    {cityKey==='cm-yaounde'&&<label className="text-[9px] font-black uppercase text-white/35">Yaoundé preset<select value={scope} onChange={e=>choosePreset(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-white">{Object.entries(YAOUNDE_PRESETS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>}
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[9px] text-white/45"><p className="font-black uppercase">Target</p><p className="mt-2 text-sm font-black text-white">{city?.city_name||cityKey}</p><p className="mt-1 capitalize">{city?.learning_stage||'seed'} stage</p></div>
   </div>
   <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
    {(['south','west','north','east'] as const).map(k=><label key={k} className="text-[8px] font-black uppercase text-white/30">{k}<input value={bbox[k]} onChange={e=>setBbox(x=>({...x,[k]:e.target.value}))} inputMode="decimal" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm normal-case text-white"/></label>)}
   </div>
   <button onClick={run} disabled={running||!cityKey} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35">{running?<RefreshCw className="h-4 w-4 animate-spin"/>:<MapPinned className="h-4 w-4"/>}{running?'Ingesting controlled cell…':'Ingest city road cell'}</button>
   {result&&<div className={`mt-4 rounded-xl border p-4 ${result.error?'border-rose-300/20 bg-rose-400/10':'border-emerald-300/15 bg-black/20'}`}>{result.error?<p className="text-xs font-bold text-rose-100">{result.error}</p>:<><div className="grid gap-3 sm:grid-cols-5"><K l="Status" v={result.status||'completed'}/><K l="Processed" v={result.processed_way_count||0}/><K l="Accepted source" v={result.accepted_count||0}/><K l="Rejected" v={result.rejected_count||0}/><K l="Topology" v={result.topology?.segments_prepared||0} icon/></div><p className="mt-3 text-[9px] leading-5 text-white/35">{result.note}</p></>}</div>}
 </section>;
}
function K({l,v,icon}:{l:string;v:React.ReactNode;icon?:boolean}){return <div><p className="text-[8px] font-black uppercase text-white/30">{l}</p><p className="mt-1 flex items-center gap-1 text-xs font-black">{icon&&<Route className="h-3.5 w-3.5 text-cyan-300"/>}{v}</p></div>}
export default AtlasIngestionControl;
