import React, { useEffect, useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export function AtlasPrivacyPanel(){
 const [snapshot,setSnapshot]=useState<any>(null);const [days,setDays]=useState(30);const [protect,setProtect]=useState(true);const [aggregate,setAggregate]=useState(true);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const load=async()=>{const {data}=await supabase.rpc('afat_my_privacy_snapshot');if(data){setSnapshot(data);setDays(Number(data.preferences?.raw_trace_retention_days||30));setProtect(Boolean(data.preferences?.protect_sensitive_endpoints??true));setAggregate(Boolean(data.preferences?.allow_aggregate_learning??true));}};
 useEffect(()=>{void load();},[]);
 const save=async()=>{setBusy(true);const {error}=await supabase.rpc('afat_set_privacy_preferences',{p_raw_trace_retention_days:days,p_protect_sensitive_endpoints:protect,p_allow_aggregate_learning:aggregate});setBusy(false);setNotice(error?error.message:'Privacy preferences saved.');if(!error)await load();};
 return <section className="rounded-[1.5rem] border border-blue-300/15 bg-blue-400/[0.04] p-5">
   <div className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-blue-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Contribution privacy</p><h2 className="mt-1 text-lg font-black">You control the raw trace</h2><p className="mt-1 text-xs leading-5 text-white/45">Raw GPS can expire while sanitized aggregate evidence remains useful. Turning aggregate learning off prevents future movement observations and candidate geometry from entering the Atlas.</p></div></div>
   <div className="mt-4 grid gap-3 md:grid-cols-3">
    <label className="text-[9px] font-black uppercase text-white/35">Raw trace retention<select value={days} onChange={e=>setDays(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select></label>
    <Toggle label="Protect sensitive endpoints" value={protect} onChange={setProtect}/>
    <Toggle label="Allow aggregate Atlas learning" value={aggregate} onChange={setAggregate}/>
   </div>
   <div className="mt-4 grid grid-cols-3 gap-3"><Stat label="Raw samples" value={snapshot?.raw_samples||0}/><Stat label="Sessions" value={snapshot?.sessions||0}/><Stat label="Field observations" value={snapshot?.mapping_observations||0}/></div>
   <button onClick={save} disabled={busy} className="mt-4 min-h-11 w-full rounded-xl bg-blue-300 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35">Save privacy settings</button>
   {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
   <p className="mt-3 flex items-center gap-2 text-[9px] text-white/30"><Trash2 className="h-3.5 w-3.5"/>Completed raw sessions can be deleted through AFAT's privacy API without deleting already-sanitized aggregate network evidence.</p>
 </section>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <label className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 text-[9px] font-black uppercase text-white/45">{label}<input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)} className="h-4 w-4"/></label>}
function Stat({label,value}:{label:string;value:React.ReactNode}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-lg font-black">{value}</p><p className="text-[7px] font-black uppercase text-white/30">{label}</p></div>}
