import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  fetchMobilityPreferences,
  saveMobilityPreferences,
  type MobilityMode,
  type MobilityOptimization,
} from '../../services/mobilityPreferencesClient';

const modes: Array<{id:MobilityMode;label:string}> = [
  {id:'walk',label:'Walk'},
  {id:'moto',label:'Moto'},
  {id:'car',label:'Taxi / car'},
  {id:'minibus',label:'Shared'},
];

export function MobilityPreferencesPanel() {
  const [open,setOpen]=useState(false);
  const [preferred,setPreferred]=useState<MobilityMode[]>([]);
  const [optimization,setOptimization]=useState<MobilityOptimization>('reliability');
  const [maxWalk,setMaxWalk]=useState(1200);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    void fetchMobilityPreferences().then(({data})=>{
      if(!data) return;
      setPreferred(data.preferred_modes||[]);
      setOptimization(data.optimization||'reliability');
      setMaxWalk(Number(data.max_walk_m||1200));
    });
  },[]);

  const toggle=(mode:MobilityMode)=>setPreferred((current)=>current.includes(mode)?current.filter((item)=>item!==mode):[...current,mode]);

  const save=async()=>{
    setBusy(true); setNotice('');
    const {error}=await saveMobilityPreferences({preferred_modes:preferred,avoided_modes:[],optimization,max_walk_m:maxWalk,accessibility:{}});
    setBusy(false);
    setNotice(error?error.message:'Saved. AFAT will use these explicit preferences only when the underlying route evidence exists.');
  };

  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-left">
    <span className="flex items-center gap-3"><SlidersHorizontal className="h-4 w-4 text-cyan-200"/><span><span className="block text-xs font-black">How should AFAT move you?</span><span className="mt-0.5 block text-[10px] text-white/35">Set reliability, walking and mode preferences explicitly.</span></span></span>
    <span className="text-[9px] font-black uppercase text-white/35">Set</span>
  </button>;

  return <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Journey preferences</p><h3 className="mt-1 text-base font-black">Choose what matters to you</h3><p className="mt-1 text-[10px] leading-5 text-white/40">AFAT uses these settings to rank evidence-backed options. It does not infer them from raw movement history.</p></div><button onClick={()=>setOpen(false)} className="text-[9px] font-black uppercase text-white/35">Close</button></div>
    <div className="mt-4 flex flex-wrap gap-2">{modes.map((mode)=><button key={mode.id} type="button" onClick={()=>toggle(mode.id)} className={`min-h-10 rounded-xl border px-3 text-[10px] font-black ${preferred.includes(mode.id)?'border-cyan-300/40 bg-cyan-300/15 text-cyan-100':'border-white/10 bg-black/15 text-white/50'}`}>{mode.label}</button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[9px] font-black uppercase text-white/35">Priority<select value={optimization} onChange={(e)=>setOptimization(e.target.value as MobilityOptimization)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs normal-case text-white"><option value="reliability">Most reliable known</option><option value="balanced">Balanced</option><option value="time">Fastest when ETA is trusted</option><option value="low_walk">Minimize walking</option></select></label>
      <label className="text-[9px] font-black uppercase text-white/35">Maximum walk<input type="number" min={100} max={10000} step={100} value={maxWalk} onChange={(e)=>setMaxWalk(Math.max(100,Math.min(10000,Number(e.target.value)||1200)))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs normal-case text-white"/><span className="mt-1 block text-[9px] normal-case text-white/30">{maxWalk.toLocaleString()} m</span></label>
    </div>
    <button type="button" onClick={save} disabled={busy} className="mt-4 min-h-11 w-full rounded-xl bg-cyan-300 px-4 text-[10px] font-black uppercase text-slate-950 disabled:opacity-40">{busy?'Saving…':'Save preferences'}</button>
    {notice&&<p className="mt-3 text-[10px] leading-5 text-white/55">{notice}</p>}
  </section>;
}

export default MobilityPreferencesPanel;
