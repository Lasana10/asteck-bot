import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Snapshot=Record<string,any> & {blockers?:Record<string,string>;generated_at?:string;city_name?:string};

const proofRows=[
  ['Coverage','city_ingestion','has_real_ingestion','completed_cells'],
  ['Contribution','contribution','has_real_sample_proof','saved_samples'],
  ['Navigation','navigation','has_real_journey_proof','samples'],
  ['Entrances','last_100m','has_reviewed_access','active_access_points'],
  ['Transit','transit','has_network_proof','active_lines'],
  ['Live supply','supply','has_live_supply_proof','fresh_verified_vehicles'],
  ['Dispatch','dispatch','has_dispatch_proof','assignments'],
  ['Settlement','money','has_settlement_proof','posted_ride_credits'],
  ['Delivery','delivery','has_delivery_proof','proof_events'],
  ['Trusted ETA','eta_learning','has_trusted_eta_proof','trusted_profiles'],
] as const;

export function OperationalProofPanel({cityKey='cm-yaounde'}:{cityKey?:string}){
  const [data,setData]=useState<Snapshot|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('afat_operational_proof_snapshot',{p_city_key:cityKey});
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setData(data as Snapshot);
  },[cityKey]);
  useEffect(()=>{void load();},[load]);
  const proven=useMemo(()=>proofRows.filter(([,section,flag])=>Boolean(data?.[section]?.[flag])).length,[data]);
  return <section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-400/[0.035] p-5">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Operational proof</p><h2 className="mt-1 text-lg font-black">Built is not the same as proven</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">This reads production evidence, not feature flags. A capability stays unproven until AFAT has real operational evidence behind it.</p></div><button onClick={()=>void load()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>
    <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"><div><p className="text-3xl font-black text-white">{proven}<span className="text-base text-white/30">/{proofRows.length}</span></p><p className="mt-1 text-[9px] font-black uppercase tracking-widest text-white/35">proof categories with real evidence</p></div><p className="max-w-sm text-right text-[10px] leading-5 text-white/35">Not a product score. Zero is valid when infrastructure exists but no real operation has happened yet.</p></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{proofRows.map(([label,section,flag,countKey])=>{const ok=Boolean(data?.[section]?.[flag]);const count=Number(data?.[section]?.[countKey]||0);return <article key={label} className={`rounded-xl border p-3 ${ok?'border-emerald-300/20 bg-emerald-400/[0.06]':'border-white/10 bg-black/15'}`}><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-wider text-white/55">{label}</p>{ok?<CheckCircle2 className="h-4 w-4 text-emerald-300"/>:<CircleAlert className="h-4 w-4 text-amber-200/60"/>}</div><p className="mt-3 text-xl font-black">{count.toLocaleString()}</p><p className="mt-1 text-[9px] text-white/35">{ok?'Real proof exists':'Not proven yet'}</p></article>})}</div>
    {!!data?.blockers&&Object.keys(data.blockers).length>0&&<div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-white/45">Next real proofs</p><div className="mt-3 grid gap-2 lg:grid-cols-2">{Object.entries(data.blockers).map(([key,value])=><div key={key} className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><p className="text-[8px] font-black uppercase tracking-wider text-amber-200/60">{key}</p><p className="mt-1 text-[11px] leading-5 text-white/55">{value}</p></div>)}</div></div>}
    {data?.generated_at&&<p className="mt-3 text-[9px] text-white/25">Production snapshot · {new Date(data.generated_at).toLocaleString()} · aggregate only; no raw personal movement exposed.</p>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default OperationalProofPanel;
