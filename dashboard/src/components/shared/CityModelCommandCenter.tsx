import React,{useEffect,useState} from 'react';
import {Activity,AlertTriangle,DatabaseZap,Globe2,RefreshCw,ShieldCheck,Target} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Snapshot={
 city?:{city_key:string;city_name:string;country_code:string;health:number};
 metrics?:{sources_connected:number;sources_working:number;important_uncertainties:number;evidence_awaiting_review:number};
 sources?:Array<{source_key:string;display_name:string;state:string;priority:number;adapter_key?:string;run_policy?:string;last_success_at?:string|null}>;
 gaps?:Array<{id:string;type:string;headline:string;information_value:number;recommended_method?:string;status:string}>;
};
type Probe={provider:string;configured?:boolean;ok?:boolean;skipped?:boolean;reason?:string;http_status?:number;result_count?:number};

export function CityModelCommandCenter({cityKey='cm-yaounde'}:{cityKey?:string}){
 const [data,setData]=useState<Snapshot>({});const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [probe,setProbe]=useState<Probe[]>([]);
 const load=async()=>{const {data,error}=await supabase.rpc('afat_city_model_snapshot',{p_city_key:cityKey});if(error){setNotice(error.message);return;}setData(data||{});};
 useEffect(()=>{void load();},[cityKey]);
 const build=async()=>{
  setBusy(true);setNotice('');
  const {data:built,error}=await supabase.rpc('afat_build_city_model',{p_city_key:cityKey});
  if(error){setBusy(false);setNotice(error.message);return;}
  const [providers,deafrica]=await Promise.all([
   supabase.functions.invoke('afat-provider-reference-query',{body:{action:'probe',city_key:cityKey}}),
   supabase.functions.invoke('afat-deafrica-discovery',{body:{action:'discover',city_key:cityKey,days:365}})
  ]);
  setProbe(Array.isArray(providers.data?.providers)?providers.data.providers:[]);
  const pOk=(providers.data?.providers||[]).filter((x:any)=>x.ok).length;
  const pSkip=(providers.data?.providers||[]).filter((x:any)=>x.skipped).length;
  const deCount=Number(deafrica.data?.discoveries?.length||0);
  setNotice(`City model refreshed · provider probes ${pOk} working / ${pSkip} skipped by relevance · Digital Earth Africa ${deCount} product families checked.`);
  if(built?.snapshot)setData(built.snapshot);else await load();
  setBusy(false);
 };
 const m=data.metrics||{sources_connected:0,sources_working:0,important_uncertainties:0,evidence_awaiting_review:0};
 return <section className="rounded-[1.7rem] border border-emerald-300/15 bg-gradient-to-br from-emerald-400/[0.08] via-slate-950/85 to-cyan-400/[0.05] p-5 sm:p-6">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
   <div><div className="flex items-center gap-2 text-emerald-200"><Globe2 className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">City Model Command Center</p></div><h2 className="mt-2 text-2xl font-black">{data.city?.city_name||'City'} · {Math.round(Number(data.city?.health||0))}% model health</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">One control surface for source relevance, live provider health, Africa intelligence, uncertainty, verification and operational learning. External evidence never silently becomes AFAT truth.</p></div>
   <button onClick={build} disabled={busy} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40"><RefreshCw className={'mr-2 inline h-4 w-4 '+(busy?'animate-spin':'')}/>Build / refresh city model</button>
  </div>
  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Metric icon={DatabaseZap} label="Sources connected" value={m.sources_connected}/>
   <Metric icon={Activity} label="Sources working now" value={m.sources_working}/>
   <Metric icon={AlertTriangle} label="Important uncertainties" value={m.important_uncertainties}/>
   <Metric icon={ShieldCheck} label="Evidence awaiting review" value={m.evidence_awaiting_review}/>
  </div>
  <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
   <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Source readiness</p><h3 className="mt-1 text-lg font-black">What can Yaoundé use now?</h3></div><span className="text-[9px] text-white/35">country-aware</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(data.sources||[]).slice(0,18).map(s=><div key={s.source_key} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black">{s.display_name}</p><p className="mt-1 text-[8px] uppercase text-white/30">{s.adapter_key||'reference'} · priority {Math.round(Number(s.priority||0))}</p></div><span className={badge(s.state)}>{s.state.replace(/_/g,' ')}</span></div>{s.run_policy==='do_not_run_for_city'&&<p className="mt-2 text-[9px] text-amber-200/70">Registered globally · intentionally not queried for this city.</p>}{s.last_success_at&&<p className="mt-2 text-[9px] text-emerald-200/60">Working {new Date(s.last_success_at).toLocaleString()}</p>}</div>)}</div></div>
   <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-amber-200"/><div><p className="text-[9px] font-black uppercase tracking-widest text-amber-200">Highest-value gaps</p><h3 className="mt-1 text-lg font-black">Verify these next</h3></div></div><div className="mt-3 space-y-2">{(data.gaps||[]).map(g=><div key={g.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex justify-between gap-3"><p className="text-xs font-black">{g.headline}</p><span className="text-[10px] font-black text-cyan-100">{Math.round(Number(g.information_value||0))}</span></div><p className="mt-1 text-[8px] uppercase text-white/30">{String(g.type).replace(/_/g,' ')} · {g.status}</p>{g.recommended_method&&<p className="mt-2 text-[9px] text-violet-200/70">Next: {String(g.recommended_method).replace(/_/g,' ')}</p>}</div>)}{!(data.gaps||[]).length&&<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">No high-value source gap is currently queued.</p>}</div></div>
  </div>
  {probe.length>0&&<div className="mt-4 flex flex-wrap gap-2">{probe.map(p=><span key={p.provider} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase text-white/50">{p.provider.replace(/_reference$/,'').replace(/_/g,' ')} · {p.skipped?'skipped':p.ok?'live':p.configured===false?'missing key':'error'}</span>)}</div>}
  {notice&&<p className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3 text-xs text-emerald-50">{notice}</p>}
 </section>;
}
function Metric({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:React.ReactNode}){return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-emerald-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div>}
function badge(state:string){return 'rounded-full px-2 py-1 text-[8px] font-black uppercase '+(state==='ready'?'bg-emerald-300/10 text-emerald-200':state==='disabled'?'bg-white/5 text-white/30':state==='reference_only'?'bg-amber-300/10 text-amber-200':state==='error'?'bg-rose-300/10 text-rose-200':'bg-cyan-300/10 text-cyan-100')}
