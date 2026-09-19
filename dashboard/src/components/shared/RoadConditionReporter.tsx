import React, { useState } from 'react';
import { AlertTriangle, LocateFixed } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const CONDITIONS=[
  ['open','Open'],['slow','Slow'],['blocked','Blocked'],['damaged','Damaged'],['flooded','Flooded'],['unsafe','Unsafe'],
] as const;

export function RoadConditionReporter({mode}:{mode?:string}){
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const report=(condition:string)=>{
    if(!navigator.geolocation){setNotice('Location is not available on this device.');return;}
    setBusy(true); setNotice('');
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {data,error}=await supabase.rpc('afat_report_nearby_road_condition',{
        p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_accuracy_m:pos.coords.accuracy,
        p_condition:condition,p_mode:mode||null,p_notes:null,
      });
      setBusy(false);
      setNotice(error?error.message:`${data?.edge_name||'Road'} recorded as ${condition}. AFAT will compare this with independent movement and reports.`);
    },err=>{setBusy(false);setNotice(err.message);},{enableHighAccuracy:true,timeout:20000,maximumAge:5000});
  };

  return <section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-400/[0.04] p-5">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-300/10 p-2"><LocateFixed className="h-5 w-5 text-amber-200"/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Report what is happening here</p><h2 className="mt-1 text-lg font-black">Road condition</h2><p className="mt-1 text-xs leading-5 text-white/45">No booking is required. AFAT attaches the report to the nearest known road and checks it against other evidence.</p></div></div>
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">{CONDITIONS.map(([value,label])=><button key={value} type="button" disabled={busy} onClick={()=>report(value)} className="min-h-10 rounded-lg border border-white/10 bg-black/20 px-2 text-[9px] font-black uppercase text-white/65 disabled:opacity-35">{label}</button>)}</div>
    {notice&&<p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"/>{notice}</p>}
  </section>;
}
