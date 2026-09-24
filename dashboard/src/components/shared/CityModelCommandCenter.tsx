import React,{useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,ChevronDown,ChevronUp,DatabaseZap,Globe2,RefreshCw,ShieldCheck,Target} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Snapshot={
 city?:{city_key:string;city_name:string;country_code:string;health:number};
 metrics?:{sources_connected:number;sources_working:number;important_uncertainties:number;evidence_awaiting_review:number};
 sources?:Array<{source_key:string;display_name:string;state:string;priority:number;adapter_key?:string;run_policy?:string;last_success_at?:string|null}>;
 gaps?:Array<{id:string;type:string;headline:string;information_value:number;recommended_method?:string;status:string}>;
};
type Probe={provider:string;configured?:boolean;ok?:boolean;skipped?:boolean;reason?:string;http_status?:number;result_count?:number};

function Metric({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:React.ReactNode}){
 return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5"><div className="flex items-center justify-between gap-3"><Icon className="h-4 w-4 text-emerald-200"/><p className="text-lg font-black text-white">{value}</p></div><p className="mt-2 text-[8px] font-black uppercase tracking-[0.17em] text-white/35">{label}</p></div>;
}

function badge(state:string){
 return 'rounded-full px-2 py-1 text-[8px] font-black uppercase '+(state==='ready'?'bg-emerald-300/10 text-emerald-200':state==='disabled'?'bg-white/5 text-white/30':state==='reference_only'?'bg-amber-300/10 text-amber-200':state==='error'?'bg-rose-300/10 text-rose-200':'bg-cyan-300/10 text-cyan-100');
}

export function CityModelCommandCenter({cityKey='cm-yaounde'}:{cityKey?:string}){
 const [data,setData]=useState<Snapshot>({});
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [probe,setProbe]=useState<Probe[]>([]);
 const [sourcesOpen,setSourcesOpen]=useState(false);
 const [reachability,setReachability]=useState<any>({});
 const [demand,setDemand]=useState<any>({});

 const load=async()=>{
  const [cityModel,reachabilityModel,demandModel]=await Promise.all([
   supabase.rpc('afat_city_model_snapshot',{p_city_key:cityKey}),
   supabase.rpc('afat_reachability_gap_snapshot',{p_city_key:cityKey}),
   supabase.rpc('afat_reachability_demand_snapshot',{p_city_key:cityKey}),
  ]);
  if(cityModel.error){setNotice(cityModel.error.message);return;}
  setData(cityModel.data||{});
  if(!reachabilityModel.error)setReachability(reachabilityModel.data||{});
  if(!demandModel.error)setDemand(demandModel.data||{});
 };
 useEffect(()=>{void load();},[cityKey]);

 const build=async()=>{
  setBusy(true);setNotice('');
  const {data:built,error}=await supabase.rpc('afat_build_city_model',{p_city_key:cityKey});
  if(error){setBusy(false);setNotice(error.message);return;}
  const reachBuild=await supabase.rpc('afat_refresh_reachability_city',{p_city_key:cityKey,p_mission_limit:24});
  if(reachBuild.error){setBusy(false);setNotice(reachBuild.error.message);return;}
  const [providers,deafrica]=await Promise.all([
   supabase.functions.invoke('afat-provider-reference-query',{body:{action:'probe',city_key:cityKey}}),
   supabase.functions.invoke('afat-deafrica-discovery',{body:{action:'discover',city_key:cityKey,days:365}})
  ]);
  const providerRows=Array.isArray(providers.data?.providers)?providers.data.providers:[];
  setProbe(providerRows);
  const pOk=providerRows.filter((x:any)=>x.ok).length;
  const pSkip=providerRows.filter((x:any)=>x.skipped).length;
  const deCount=Number(deafrica.data?.discoveries?.length||0);
  const reachMissions=Number(reachBuild.data?.missions?.missions_created||0);
  setNotice(`City model refreshed · ${reachBuild.data?.places_refreshed||0} destinations re-linked · ${reachMissions} reachability missions created · provider probes ${pOk} working / ${pSkip} skipped · Digital Earth Africa ${deCount} product families checked.`);
  if(built?.snapshot)setData(built.snapshot);else await load();
  setBusy(false);
 };

 const m=data.metrics||{sources_connected:0,sources_working:0,important_uncertainties:0,evidence_awaiting_review:0};
 const sortedSources=useMemo(()=>[...(data.sources||[])].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)),[data.sources]);
 const topGaps=(data.gaps||[]).slice(0,5);

 return <aside className="h-full rounded-[1.6rem] border border-white/10 bg-[#07101d]/95 p-4 shadow-2xl backdrop-blur-2xl sm:p-5">
  <div className="flex items-start justify-between gap-3">
   <div>
    <div className="flex items-center gap-2 text-emerald-200"><Globe2 className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">City intelligence</p></div>
    <h2 className="mt-2 text-xl font-black">{data.city?.city_name||'City'}</h2>
    <p className="mt-1 text-xs text-white/40">{Math.round(Number(data.city?.health||0))}% model health · external evidence remains evidence until independently confirmed.</p>
   </div>
   <button onClick={build} disabled={busy} title="Build / refresh city model" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-300 text-slate-950 disabled:opacity-40"><RefreshCw className={'h-4 w-4 '+(busy?'animate-spin':'')}/></button>
  </div>

  <div className="mt-4 grid grid-cols-2 gap-2">
   <Metric icon={DatabaseZap} label="Connected" value={m.sources_connected}/>
   <Metric icon={Activity} label="Working" value={m.sources_working}/>
   <Metric icon={AlertTriangle} label="Uncertainty" value={m.important_uncertainties}/>
   <Metric icon={ShieldCheck} label="Review" value={m.evidence_awaiting_review}/>
  </div>

  <div className="mt-5 rounded-2xl border border-violet-300/10 bg-violet-400/[0.04] p-3">
   <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-200">Reachability gaps</p><span className="text-[8px] uppercase text-white/30">last-metre reality</span></div>
   <div className="mt-3 grid grid-cols-2 gap-2">
    <Metric icon={Target} label="No access" value={reachability?.destinations_without_access??0}/>
    <Metric icon={Target} label="No meeting" value={reachability?.destinations_without_meeting??0}/>
    <Metric icon={AlertTriangle} label="Unresolved demand" value={reachability?.unresolved_demand??0}/>
    <Metric icon={ShieldCheck} label="Claims review" value={reachability?.open_claims??0}/>
   </div>
   {Number(reachability?.weak_access_links||0)>0&&<p className="mt-3 rounded-xl border border-amber-300/10 bg-amber-400/[0.06] p-2 text-[9px] text-amber-100/70">{reachability.weak_access_links} access or meeting links still need a stronger Atlas connection.</p>}
  </div>

  {Array.isArray(demand?.top_unresolved)&&demand.top_unresolved.length>0&&<div className="mt-5 rounded-2xl border border-amber-300/10 bg-amber-400/[0.035] p-3">
   <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200">What people cannot find yet</p><span className="text-[8px] uppercase text-white/30">${demand.open_count||0} open</span></div>
   <div className="mt-3 space-y-2">{demand.top_unresolved.slice(0,5).map((item:any)=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-black">{item.query_text}</p><span className="rounded-full bg-amber-300/10 px-2 py-1 text-[8px] font-black text-amber-100">×{item.demand_count}</span></div><p className="mt-1 text-[8px] uppercase tracking-wide text-white/30">{String(item.intent_type||'go').replace(/_/g,' ')} · {item.requested_mode||'any mode'} · unresolved demand only</p></div>)}</div>
  </div>}

  <div className="mt-5">
   <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-amber-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200">Verify next</p></div><span className="text-[9px] text-white/30">highest value</span></div>
   <div className="mt-2 space-y-2">
    {topGaps.map(g=><article key={g.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
     <div className="flex items-start justify-between gap-3"><p className="text-xs font-black leading-5 text-white">{g.headline}</p><span className="shrink-0 rounded-full bg-cyan-300/10 px-2 py-1 text-[9px] font-black text-cyan-100">{Math.round(Number(g.information_value||0))}</span></div>
     <p className="mt-1 text-[8px] uppercase tracking-wide text-white/30">{String(g.type).replace(/_/g,' ')} · {g.status}</p>
     {g.recommended_method&&<p className="mt-2 text-[9px] text-violet-200/70">Next: {String(g.recommended_method).replace(/_/g,' ')}</p>}
    </article>)}
    {!topGaps.length&&<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">No high-value verification gap is queued.</p>}
   </div>
  </div>

  {probe.length>0&&<div className="mt-4 flex flex-wrap gap-1.5">{probe.map(p=><span key={p.provider} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase text-white/50">{p.provider.replace(/_reference$/,'').replace(/_/g,' ')} · {p.skipped?'skipped':p.ok?'live':p.configured===false?'missing key':'error'}</span>)}</div>}

  <button type="button" onClick={()=>setSourcesOpen(value=>!value)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left">
   <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Source readiness</p><p className="mt-1 text-xs text-white/40">{sortedSources.filter(s=>s.state==='ready').length} ready · {sortedSources.length} planned</p></div>
   {sourcesOpen?<ChevronUp className="h-4 w-4 text-white/45"/>:<ChevronDown className="h-4 w-4 text-white/45"/>}
  </button>
  {sourcesOpen&&<div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
   {sortedSources.map(s=><div key={s.source_key} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black">{s.display_name}</p><p className="mt-1 text-[8px] uppercase text-white/30">{s.adapter_key||'reference'} · priority {Math.round(Number(s.priority||0))}</p></div><span className={badge(s.state)}>{s.state.replace(/_/g,' ')}</span></div>{s.run_policy==='do_not_run_for_city'&&<p className="mt-2 text-[9px] text-amber-200/70">Registered globally · not queried for this city.</p>}{s.last_success_at&&<p className="mt-2 text-[9px] text-emerald-200/60">Working {new Date(s.last_success_at).toLocaleString()}</p>}</div>)}
  </div>}

  {notice&&<p className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-50">{notice}</p>}
 </aside>;
}
