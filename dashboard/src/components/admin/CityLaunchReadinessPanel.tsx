import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, MapPinned, Network, Radar, Route, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { fetchCityExpansionCells } from '../../services/cityExpansionClient';

type Props = { cityKey: string; cityName?: string | null };
type Proof = { proof_key?: string; observed_count?: number; target_count?: number; status?: string };
type Stage = { key:string; label:string; detail:string; done:boolean; count?:string; icon:React.ComponentType<{className?:string}> };

export function CityLaunchReadinessPanel({ cityKey, cityName }: Props) {
  const [loading,setLoading]=useState(false);
  const [cells,setCells]=useState<any[]>([]);
  const [proof,setProof]=useState<Proof[]>([]);
  const [graph,setGraph]=useState<any|null>(null);
  const [notice,setNotice]=useState('');

  const load=async()=>{
    if(!cityKey)return;
    setLoading(true);setNotice('');
    const [cellResult,proofResult,graphResult]=await Promise.all([
      fetchCityExpansionCells(cityKey),
      supabase.rpc('afat_refresh_activation_missions',{p_city_key:cityKey}),
      supabase.rpc('afat_graph_health_snapshot',{p_city_key:cityKey}),
    ]);
    if(!cellResult.error)setCells(cellResult.data||[]);
    if(!proofResult.error)setProof(proofResult.data?.missions||[]);
    if(!graphResult.error)setGraph(graphResult.data||null);
    const firstError=cellResult.error||proofResult.error||graphResult.error;
    if(firstError)setNotice(firstError.message||'Some launch-readiness evidence could not be loaded.');
    setLoading(false);
  };

  useEffect(()=>{void load();},[cityKey]);

  const readiness=useMemo(()=>{
    const completedCells=cells.filter(cell=>['completed','completed_with_errors'].includes(String(cell.status))).length;
    const queuedCells=cells.filter(cell=>['pending','running','failed'].includes(String(cell.status))).length;
    const largestShare=Number(graph?.largest_component_share_pct||0);
    const routableNodes=Number(graph?.routable_nodes||0);
    const completedProofs=proof.filter(item=>String(item.status).toLowerCase()==='completed'||Number(item.observed_count||0)>=Math.max(1,Number(item.target_count||1))).length;
    const stages:Stage[]=[
      {key:'identity',label:'City identity',detail:'City profile, jurisdiction, timezone, currency and operating pack exist.',done:Boolean(cityKey),icon:ShieldCheck},
      {key:'envelope',label:'Reviewed working envelope',detail:'Ingestion cells exist only after a human-approved geographic envelope is supplied.',done:cells.length>0,count:cells.length?`${cells.length} cells`:'not seeded',icon:MapPinned},
      {key:'ingestion',label:'Source ingestion',detail:'Road/place source cells have actually been processed; registration alone does not count.',done:completedCells>0,count:`${completedCells} processed · ${queuedCells} queued`,icon:Radar},
      {key:'graph',label:'Usable mobility graph',detail:'AFAT measures connected routing topology instead of treating raw source volume as readiness.',done:routableNodes>0&&largestShare>=70,count:routableNodes?`${routableNodes} routable · ${largestShare.toFixed(1)}% largest component`:'no measured graph yet',icon:Network},
      {key:'proof',label:'Physical operating proof',detail:'Real contributions, journeys, entrances, transit, supply, dispatch, settlement and ETA evidence activate the city.',done:completedProofs>0,count:`${completedProofs}/${Math.max(proof.length,10)} proof missions`,icon:Route},
    ];
    return {stages,completed:stages.filter(stage=>stage.done).length};
  },[cells,graph,proof]);

  return <section className="rounded-[1.6rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.1),transparent_34%),rgba(2,6,23,.48)] p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">City launch path</p><h3 className="mt-1 text-lg font-black">{cityName||cityKey} becomes operational through evidence, not a switch.</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-white/42">The same launch contract applies to Yaoundé, Douala and future cities. Registration, geographic coverage, graph usability and real-world proof remain separate so expansion cannot manufacture readiness.</p></div><button type="button" onClick={()=>void load()} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-white/50 disabled:opacity-35">{loading?'Reading…':'Refresh proof'}</button></div>
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/15"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><span className="text-[9px] font-black uppercase tracking-wider text-white/35">Launch readiness</span><span className="text-sm font-black text-cyan-100">{readiness.completed} / {readiness.stages.length} stages evidenced</span></div><div className="h-1.5 bg-white/5"><div className="h-full bg-cyan-300 transition-all" style={{width:`${(readiness.completed/readiness.stages.length)*100}%`}}/></div><div className="divide-y divide-white/8">{readiness.stages.map((stage,index)=>{const Icon=stage.icon;return <div key={stage.key} className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"><div className={`grid h-10 w-10 place-items-center rounded-2xl border ${stage.done?'border-emerald-300/20 bg-emerald-400/10 text-emerald-200':'border-white/10 bg-white/[0.035] text-white/35'}`}>{stage.done?<CheckCircle2 className="h-4 w-4"/>:<Icon className="h-4 w-4"/>}</div><div><div className="flex items-center gap-2"><span className="text-[8px] font-black text-white/25">0{index+1}</span><p className="text-xs font-black text-white">{stage.label}</p></div><p className="mt-1 text-[10px] leading-4 text-white/38">{stage.detail}</p></div><div className="flex items-center gap-2 sm:justify-end">{stage.count&&<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[8px] font-bold text-white/42">{stage.count}</span>}{!stage.done&&<CircleDashed className="h-4 w-4 text-white/20"/>}</div></div>})}</div></div>
    {notice&&<p className="mt-3 text-[10px] text-amber-100/65">{notice}</p>}
  </section>;
}

export default CityLaunchReadinessPanel;
