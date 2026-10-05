import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDot, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Mission={
  id:string;
  proof_key:string;
  title:string;
  instruction:string;
  actor_hint:string;
  target_count:number;
  observed_count:number;
  status:'open'|'completed';
  completed_at?:string|null;
};
type Ladder={city_key:string;city_name:string;completed:number;total:number;missions:Mission[];generated_at?:string};

export function OperationalActivationLadder({cityKey}:{cityKey:string}){
  const [data,setData]=useState<Ladder|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('afat_refresh_activation_missions',{p_city_key:cityKey});
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setData(data as Ladder);
  },[cityKey]);
  useEffect(()=>{void load();},[load]);
  const next=useMemo(()=>data?.missions?.find(m=>m.status==='open')||null,[data]);
  const pct=data?.total?Math.round((Number(data.completed||0)/Number(data.total))*100):0;

  return <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-400/[0.035] p-5">
    <div className="flex items-start justify-between gap-4">
      <div><div className="flex items-center gap-2"><Route className="h-4 w-4 text-cyan-200"/><p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Operational activation</p></div><h2 className="mt-2 text-lg font-black">Turn built capability into real proof</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">These missions are not checkboxes. AFAT closes them only when the production proof counters show real evidence.</p></div>
      <button onClick={()=>void load()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button>
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-4xl font-black text-white">{data?.completed||0}<span className="text-lg text-white/25">/{data?.total||10}</span></p>
        <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-white/35">proof missions complete</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{width:`${pct}%`}}/></div>
        <p className="mt-2 text-[10px] text-white/35">{pct}% operationally proven · derived from production evidence</p>
      </div>
      <div className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.05] p-4">
        <p className="text-[8px] font-black uppercase tracking-widest text-amber-200/70">Next physical proof</p>
        {next?<><h3 className="mt-2 text-base font-black text-white">{next.title}</h3><p className="mt-2 text-xs leading-5 text-white/55">{next.instruction}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[9px] font-bold text-white/45">Actor · {next.actor_hint}</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[9px] font-bold text-white/45">Observed · {next.observed_count}/{next.target_count}</span></div></>:<div className="flex items-center gap-2 py-4 text-sm font-black text-emerald-200"><ShieldCheck className="h-5 w-5"/>All activation proofs currently satisfied.</div>}
      </div>
    </div>

    <div className="mt-4 grid gap-2 lg:grid-cols-2">{(data?.missions||[]).map((mission,index)=><article key={mission.id} className={`rounded-xl border p-4 ${mission.status==='completed'?'border-emerald-300/15 bg-emerald-400/[0.05]':'border-white/10 bg-black/15'}`}>
      <div className="flex items-start gap-3"><div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${mission.status==='completed'?'bg-emerald-400/15 text-emerald-200':'bg-white/5 text-white/35'}`}>{mission.status==='completed'?<CheckCircle2 className="h-4 w-4"/>:<CircleDot className="h-4 w-4"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-[8px] font-black uppercase tracking-widest text-white/30">{String(index+1).padStart(2,'0')} · {mission.proof_key}</p><span className={`text-[8px] font-black uppercase ${mission.status==='completed'?'text-emerald-200':'text-amber-200/60'}`}>{mission.status}</span></div><h3 className="mt-1 text-sm font-black text-white">{mission.title}</h3><p className="mt-1 text-[11px] leading-5 text-white/45">{mission.instruction}</p><p className="mt-2 text-[9px] text-white/30">{mission.actor_hint} · evidence {mission.observed_count}/{mission.target_count}</p></div></div>
    </article>)}</div>
    {data?.generated_at&&<p className="mt-3 text-[9px] text-white/25">Activation state refreshed from production · {new Date(data.generated_at).toLocaleString()}</p>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default OperationalActivationLadder;
