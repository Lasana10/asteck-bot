import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Gauge, Globe2, RefreshCw, Satellite, ShieldCheck, Target } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type SourceRow={
  source_key:string; display_name:string; provider_name?:string; data_mode:string; coverage_scope:string;
  feature_classes?:string[]; imagery_kinds?:string[]; durable_storage_allowed:boolean; derivative_use_reviewed:boolean;
  coverage_score?:number|null; freshness_score?:number|null; confidence?:number|null; sample_size?:number|null; usage_constraints?:string|null;
};
type GapRow={
  id:string; type:string; headline:string; detail?:string|null; source_keys?:string[]; information_value:number;
  severity:number; uncertainty:number; freshness_risk:number; verification_cost:number; recommended_method?:string|null; status:string;
};
type ReviewRow={
  mission_id:string; title:string; question?:string; answer?:Record<string,unknown>; evidence?:Record<string,any>;
  target_edge_id?:string|null; claimed_by?:string|null; submitted_at?:string|null; priority?:number;
  discrepancy_id:string; discrepancy_type:string; headline:string; information_value:number; uncertainty:number;
  edge_name?:string|null; edge_status?:string|null; edge_confidence?:number|null;
};
type Snapshot={city?:any;summary?:{enabled_sources:number;open_discrepancies:number;high_value_gaps:number;source_missions:number};sources?:SourceRow[];discrepancies?:GapRow[]};

export function SourceIntelligencePanel({cityKey='cm-yaounde'}:{cityKey?:string}){
  const [data,setData]=useState<Snapshot>({});
  const [busy,setBusy]=useState(false);
  const [reviewBusy,setReviewBusy]=useState<string|null>(null);
  const [reviews,setReviews]=useState<ReviewRow[]>([]);
  const [notice,setNotice]=useState('');

  const load=async()=>{
    const [snapshot,queue]=await Promise.all([
      supabase.rpc('afat_source_intelligence_snapshot',{p_city_key:cityKey}),
      supabase.rpc('afat_source_mission_review_queue',{p_city_key:cityKey}),
    ]);
    if(snapshot.error){setNotice(snapshot.error.message);return;}
    setData(snapshot.data||{});
    if(queue.error){setReviews([]);setNotice(queue.error.message);return;}
    setReviews(Array.isArray(queue.data)?queue.data:[]);
    setNotice('');
  };
  useEffect(()=>{void load();},[cityKey]);

  const refresh=async()=>{
    setBusy(true);setNotice('');
    const {data:refreshData,error}=await supabase.rpc('afat_refresh_source_intelligence',{p_city_key:cityKey,p_limit:300});
    if(!error){
      await supabase.rpc('afat_generate_source_verification_missions',{p_city_key:cityKey,p_limit:20});
      setNotice('Source intelligence refreshed · '+(refreshData?.source_scores_refreshed||0)+' source scores · '+(refreshData?.edge_gaps_refreshed||0)+' edge gaps evaluated.');
      await load();
    }else setNotice(error.message);
    setBusy(false);
  };

  const reviewMission=async(missionId:string,decision:'accept'|'reject')=>{
    setReviewBusy(missionId);setNotice('');
    const {data:result,error}=await supabase.rpc('afat_review_source_mission',{
      p_mission_id:missionId,p_decision:decision,p_notes:null,
    });
    setReviewBusy(null);
    if(error){setNotice(error.message);return;}
    const state=result?.edge_status?(' · edge '+String(result.edge_status)):'';
    setNotice('Evidence '+decision+'ed'+state+'. AFAT kept the independent-contributor verification rule.');
    await load();
  };

  const summary=data.summary||{enabled_sources:0,open_discrepancies:0,high_value_gaps:0,source_missions:0};
  const sources=data.sources||[];
  const gaps=data.discrepancies||[];
  const ingest=sources.filter(x=>x.data_mode==='open_ingest'||x.data_mode==='afat_owned');
  const reference=sources.filter(x=>x.data_mode==='reference_only'||x.data_mode==='review_required');
  const top=useMemo(()=>gaps.slice(0,8),[gaps]);

  return <section className="space-y-4 rounded-[1.6rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.08] via-slate-950/80 to-cyan-400/[0.05] p-5 sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-violet-200"><Globe2 className="h-4 w-4"/><p className="text-[10px] font-black uppercase tracking-[0.24em]">World Model · Source Federation</p></div>
        <h2 className="mt-2 text-xl font-black sm:text-2xl">What does AFAT still need to learn?</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-white/45">Open sources can seed AFAT. Commercial/regional references can expose gaps. Neither silently becomes AFAT truth: discrepancies become prioritized independent verification work.</p>
      </div>
      <button onClick={refresh} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-400 px-4 text-[10px] font-black uppercase text-slate-950 disabled:opacity-40"><RefreshCw className={'h-4 w-4 '+(busy?'animate-spin':'')}/>Recalculate gaps</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={DatabaseZap} label="Active source systems" value={summary.enabled_sources}/>
      <Metric icon={Target} label="Open discrepancies" value={summary.open_discrepancies}/>
      <Metric icon={Gauge} label="High-value gaps" value={summary.high_value_gaps}/>
      <Metric icon={ShieldCheck} label="Verification missions" value={summary.source_missions}/>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-emerald-200"/><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Ingestible / AFAT-owned</p></div>
        <div className="mt-3 grid gap-2">{ingest.map(s=><SourceCard key={s.source_key} source={s}/>)}</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2"><Satellite className="h-4 w-4 text-amber-200"/><p className="text-[9px] font-black uppercase tracking-widest text-amber-200">Reference / review-only</p></div>
        <div className="mt-3 grid gap-2">{reference.map(s=><SourceCard key={s.source_key} source={s}/>)}</div>
      </div>
    </div>

    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.04] p-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Human evidence gate</p><h3 className="mt-1 text-lg font-black">Field evidence awaiting review</h3><p className="mt-1 text-[10px] leading-4 text-white/40">One accepted independent mission can corroborate a provisional edge. Verification requires a second accepted mission from a different contributor.</p></div><span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-black text-emerald-100">{reviews.length} pending</span></div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{reviews.slice(0,10).map(r=><article key={r.mission_id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{r.edge_name||r.title}</p><p className="mt-1 text-[10px] leading-4 text-white/40">{r.headline}</p></div><span className="rounded-lg bg-emerald-300/10 px-2 py-1 text-[9px] font-black text-emerald-100">{Math.round(Number(r.information_value||0))}</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5"><Tag>{String(r.edge_status||'evidence').replace(/_/g,' ')}</Tag><Tag>accuracy {Math.round(Number(r.evidence?.accuracy_m||0))}m</Tag><Tag>distance {Math.round(Number(r.evidence?.target_distance_m||0))}m</Tag>{r.claimed_by&&<Tag>contributor {r.claimed_by.slice(0,8)}</Tag>}</div>
        <p className="mt-2 text-[9px] text-white/45">Answer: {typeof r.answer==='object'?JSON.stringify(r.answer):String(r.answer||'—')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>reviewMission(r.mission_id,'accept')} disabled={!!reviewBusy} className="min-h-9 rounded-lg bg-emerald-300 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Accept evidence</button><button onClick={()=>reviewMission(r.mission_id,'reject')} disabled={!!reviewBusy} className="min-h-9 rounded-lg border border-rose-300/20 bg-rose-400/10 text-[9px] font-black uppercase text-rose-100 disabled:opacity-40">Reject / reopen</button></div>
      </article>)}
      {!reviews.length&&<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">No source-driven field evidence is awaiting human review.</p>}</div>
    </div>

    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Information Value Engine</p><h3 className="mt-1 text-lg font-black">Highest-value uncertainties</h3></div><span className="text-[9px] font-bold text-white/35">Priority = uncertainty + impact + freshness + demand − collection cost</span></div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{top.map(g=><article key={g.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{g.headline}</p><p className="mt-1 text-[10px] leading-4 text-white/40">{g.detail}</p></div><span className="rounded-lg bg-cyan-300/10 px-2 py-1 text-[9px] font-black text-cyan-100">{Math.round(Number(g.information_value||0))}</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-black uppercase text-white/40"><Tag>{String(g.type).replace(/_/g,' ')}</Tag><Tag>{g.status}</Tag>{g.source_keys?.slice(0,2).map(k=><Tag key={k}>{k}</Tag>)}</div>
        {g.recommended_method&&<p className="mt-2 text-[9px] text-violet-200/70">Next: {String(g.recommended_method).replace(/_/g,' ')}</p>}
      </article>)}
      {!top.length&&<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">Run source intelligence to generate prioritized gaps from real AFAT/source evidence.</p>}</div>
    </div>

    {notice&&<p className="rounded-xl border border-violet-300/15 bg-violet-400/10 p-3 text-xs text-violet-50">{notice}</p>}
  </section>;
}
function Metric({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:React.ReactNode}){return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-violet-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div>}
function SourceCard({source:s}:{source:SourceRow}){return <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black">{s.display_name}</p><p className="mt-1 text-[9px] text-white/35">{s.data_mode.replace(/_/g,' ')} · {s.coverage_scope}</p></div><span className="text-[9px] font-black text-cyan-100">{Math.round(Number(s.coverage_score||0))}%</span></div><div className="mt-2 flex flex-wrap gap-1">{s.feature_classes?.slice(0,4).map(x=><Tag key={x}>{x}</Tag>)}</div><p className="mt-2 text-[9px] text-white/30">{s.durable_storage_allowed?'Durable AFAT use permitted by current source profile':'Reference only / no durable copying'}{s.sample_size?' · '+s.sample_size+' local records':''}</p></div>}
function Tag({children}:{children:React.ReactNode}){return <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[7px] font-black uppercase text-white/45">{children}</span>}
