import React,{useEffect,useState} from 'react';
import {DatabaseZap,FileUp,Globe2,RefreshCw,Satellite} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type SourcePlan={source_key:string;display_name:string;provider_name?:string;data_mode:string;adapter_key?:string;plan_state:string;priority:number;feature_classes?:string[];last_run_at?:string|null;last_success_at?:string|null;last_result?:any;durable_storage_allowed:boolean;usage_constraints?:string|null};
type Snapshot={city?:any;bounds?:{south:number;west:number;north:number;east:number}|null;summary?:Record<string,number>;sources?:SourcePlan[]};

export function CitySourcePlanPanel({cityKey='cm-yaounde'}:{cityKey?:string}){
 const [data,setData]=useState<Snapshot>({}); const [busy,setBusy]=useState(''); const [notice,setNotice]=useState('');
 const [batchSource,setBatchSource]=useState('overture_maps'); const [uploadProgress,setUploadProgress]=useState('');
 const load=async()=>{const {data,error}=await supabase.rpc('afat_city_source_plan_snapshot',{p_city_key:cityKey});if(error){setNotice(error.message);return;}setData(data||{});};
 useEffect(()=>{void load();},[cityKey]);
 const seed=async()=>{setBusy('seed');const {error}=await supabase.rpc('afat_seed_city_source_plan',{p_city_key:cityKey});setBusy('');setNotice(error?error.message:'City source strategy refreshed.');await load();};
 const sentinel=async()=>{if(!data.bounds){setNotice('Seed city map bounds first with OSM or another approved source.');return;}setBusy('sentinel');const {data:result,error}=await supabase.functions.invoke('afat-copernicus-scene-discovery',{body:{city_key:cityKey,bbox:data.bounds,days:30,limit:20}});setBusy('');setNotice(error?error.message:`Sentinel discovery: ${result?.scene_count||0} scenes · latest ${result?.latest_scene_at||'unknown'}.`);await load();};
 const landsat=async()=>{if(!data.bounds){setNotice('Seed city map bounds first with OSM or another approved source.');return;}setBusy('landsat');const {data:result,error}=await supabase.functions.invoke('afat-landsat-scene-discovery',{body:{city_key:cityKey,bbox:data.bounds,days:60,limit:20}});setBusy('');setNotice(error?error.message:`Landsat discovery: ${result?.scene_count||0} scenes · latest ${result?.latest_scene_at||'unknown'}.`);await load();};
 const uploadExtract=async(file:File|null)=>{
  if(!file)return;
  const source=data.sources?.find(x=>x.source_key===batchSource);
  if(!source||source.adapter_key!=='afat-source-batch-ingest'){setNotice('Choose a source configured for durable batch ingestion.');return;}
  setBusy('upload');setUploadProgress('Reading extract…');setNotice('');
  try{
    const parsed=JSON.parse(await file.text());
    const records=Array.isArray(parsed?.records)?parsed.records:Array.isArray(parsed)?parsed:[];
    if(!records.length)throw new Error('Extract has no normalized records.');
    const manifest=parsed?.manifest||{};
    const mb=Array.isArray(manifest.bbox)&&manifest.bbox.length===4?{west:Number(manifest.bbox[0]),south:Number(manifest.bbox[1]),east:Number(manifest.bbox[2]),north:Number(manifest.bbox[3])}:null;
    const bbox=mb&&Object.values(mb).every(Number.isFinite)?mb:data.bounds;
    if(!bbox)throw new Error('No valid extract/city bounds are available.');
    const datasetVersion=String(records[0]?.dataset_version||manifest.release||manifest.dataset_version||manifest.version||new Date().toISOString().slice(0,10));
    let accepted=0,rejected=0;
    const chunks=Math.ceil(records.length/500);
    for(let i=0;i<records.length;i+=500){
      const n=Math.floor(i/500)+1;setUploadProgress('Uploading batch '+n+' / '+chunks);
      const {data:result,error}=await supabase.functions.invoke('afat-source-batch-ingest',{body:{
        city_key:cityKey,source_key:batchSource,dataset_version:datasetVersion,
        scope_label:(file.name||'extract').slice(0,100),bbox,records:records.slice(i,i+500),
      }});
      if(error)throw error;
      accepted+=Number(result?.accepted_count||0);rejected+=Number(result?.rejected_count||0);
    }
    setNotice('Extract ingested: '+accepted+' accepted · '+rejected+' rejected · '+records.length+' processed. All records remain candidate/source evidence.');
    await load();
  }catch(error:any){setNotice(error?.message||'Could not ingest source extract.');}
  finally{setBusy('');setUploadProgress('');}
 };
 const s=data.summary||{};
 const batchSources=(data.sources||[]).filter(x=>x.adapter_key==='afat-source-batch-ingest');
 return <section className="rounded-[1.5rem] border border-blue-300/15 bg-gradient-to-br from-blue-400/[0.06] to-slate-950/70 p-5">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
   <div><div className="flex items-center gap-2 text-blue-200"><Globe2 className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">City source plan</p></div><h2 className="mt-2 text-lg font-black">Bootstrap the best available world model</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">AFAT tracks what can run now, what is reference-only, and what still needs a bounded bulk extract or credentials. Source state never overrides AFAT evidence rules.</p></div>
   <div className="flex flex-wrap gap-2"><button onClick={seed} disabled={!!busy} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase"><RefreshCw className={'mr-2 inline h-3.5 w-3.5 '+(busy==='seed'?'animate-spin':'')}/>Refresh plan</button><button onClick={sentinel} disabled={!!busy||!data.bounds} className="min-h-10 rounded-xl bg-blue-300 px-3 text-[9px] font-black uppercase text-slate-950"><Satellite className="mr-2 inline h-3.5 w-3.5"/>Discover Sentinel</button><button onClick={landsat} disabled={!!busy||!data.bounds} className="min-h-10 rounded-xl border border-blue-300/20 bg-blue-300/10 px-3 text-[9px] font-black uppercase text-blue-100"><Satellite className="mr-2 inline h-3.5 w-3.5"/>Discover Landsat</button></div>
  </div>
  <div className="mt-4 grid gap-3 sm:grid-cols-4">
   <Metric label="Ready" value={s.ready||0}/><Metric label="Reference only" value={s.reference_only||0}/><Metric label="Needs bulk extract" value={s.needs_bulk_extract||0}/><Metric label="Needs credentials" value={s.needs_credentials||0}/>
  </div>
  {batchSources.length>0&&<div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4">
   <div className="flex items-start gap-3"><FileUp className="mt-0.5 h-4 w-4 text-cyan-200"/><div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Open-source extract gateway</p><p className="mt-1 text-xs text-white/45">Upload a normalized Overture/open-dataset extract. AFAT chunks large files, preserves provenance and stores candidate evidence only.</p></div></div>
   <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr]">
    <select value={batchSource} onChange={e=>setBatchSource(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-xs text-white">{batchSources.map(x=><option key={x.source_key} value={x.source_key}>{x.display_name}</option>)}</select>
    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 text-[9px] font-black uppercase text-slate-950"><FileUp className="h-4 w-4"/>{busy==='upload'?(uploadProgress||'Uploading…'):'Choose normalized JSON extract'}<input type="file" accept="application/json,.json" disabled={!!busy} className="hidden" onChange={e=>{void uploadExtract(e.target.files?.[0]||null);e.currentTarget.value='';}}/></label>
   </div>
  </div>}
  <div className="mt-4 grid gap-2 lg:grid-cols-2">{(data.sources||[]).map(src=><article key={src.source_key} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{src.display_name}</p><p className="mt-1 text-[9px] text-white/35">{src.adapter_key||'no adapter'} · {src.data_mode}</p></div><span className={badge(src.plan_state)}>{src.plan_state.replace(/_/g,' ')}</span></div><div className="mt-2 flex flex-wrap gap-1">{src.feature_classes?.slice(0,5).map(x=><span key={x} className="rounded border border-white/10 px-1.5 py-0.5 text-[7px] uppercase text-white/35">{x}</span>)}</div>{src.last_success_at&&<p className="mt-2 text-[9px] text-emerald-200/60">Last success {new Date(src.last_success_at).toLocaleString()}</p>}</article>)}</div>
  {notice&&<p className="mt-4 rounded-xl border border-blue-300/15 bg-blue-400/10 p-3 text-xs text-blue-50">{notice}</p>}
 </section>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><DatabaseZap className="h-4 w-4 text-blue-200"/><p className="mt-2 text-lg font-black">{value}</p><p className="text-[8px] font-black uppercase text-white/35">{label}</p></div>}
function badge(state:string){return 'rounded-full px-2 py-1 text-[8px] font-black uppercase '+(state==='ready'?'bg-emerald-300/10 text-emerald-200':state==='reference_only'?'bg-amber-300/10 text-amber-200':state==='error'?'bg-rose-300/10 text-rose-200':'bg-white/5 text-white/45')}
