import React, { useEffect, useState } from 'react';
import { Boxes, PackageCheck, RadioTower, RefreshCw, Route, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export function MobilityEvolutionPanel({cityKey}:{cityKey:string}) {
  const [snapshot,setSnapshot]=useState<any>(null);
  const [demand,setDemand]=useState<any[]>([]);
  const [channels,setChannels]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const load=async()=>{
    if(!cityKey) return;
    setBusy(true); setNotice('');
    const [s,d,c]=await Promise.all([
      supabase.rpc('afat_city_mobility_evolution_snapshot',{p_city_key:cityKey}),
      supabase.from('afat_demand_signals').select('id,signal_type,label,intent_type,requested_mode,signal_count,status,last_seen_at').eq('city_key',cityKey).in('status',['open','investigating']).order('signal_count',{ascending:false}).limit(8),
      supabase.from('afat_fulfilment_channels').select('id,display_name,channel_type,service_types,transport_modes,integration_mode,status,authority_state,priority').eq('city_key',cityKey).in('status',['available','pilot']).order('priority',{ascending:false}),
    ]);
    setBusy(false);
    if(s.error){setNotice(s.error.message);return;}
    setSnapshot(s.data||null);
    setDemand(d.data||[]);
    setChannels(c.data||[]);
  };

  useEffect(()=>{void load();},[cityKey]);

  const cards=[
    ['Demand',snapshot?.demand_volume||0,'Unresolved and underserved intent',RadioTower],
    ['Fulfilment',snapshot?.fulfilment_channels||0,'Ways AFAT can execute movement',Boxes],
    ['Deliveries',snapshot?.deliveries||0,'Item movement through the same kernel',PackageCheck],
    ['Transit',Number(snapshot?.transit_nodes||0)+Number(snapshot?.transit_lines||0),'Formal + informal mobility graph',Route],
  ] as const;

  return <section className="rounded-[1.6rem] border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,.10),transparent_38%),rgba(15,23,42,.76)] p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-violet-200"><Sparkles className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">AFAT Mobility Operating System</p></div>
        <h2 className="mt-2 text-xl font-black">Demand → reach → fulfilment → journey → evidence</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">One city loop for rides, delivery, transit and future partner fulfilment. Demand is operational evidence; unavailable supply is never presented as live.</p>
      </div>
      <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-white/55"><RefreshCw className={`h-3.5 w-3.5 ${busy?'animate-spin':''}`}/>Refresh</button>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label,value,copy,Icon])=><article key={label} className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-violet-200"/><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wide text-white/45">{label}</p><p className="mt-2 text-[10px] leading-4 text-white/30">{copy}</p></article>)}
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/15 p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Demand intelligence</p>
        <div className="mt-3 space-y-2">
          {demand.map(item=><div key={item.id} className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{item.label}</p><p className="mt-1 text-[9px] uppercase text-white/35">{String(item.signal_type).replace(/_/g,' ')}{item.requested_mode?` · ${item.requested_mode}`:''}</p></div><span className="rounded-full border border-amber-300/15 bg-amber-400/8 px-2 py-1 text-[8px] font-black text-amber-100">{item.signal_count}×</span></div></div>)}
          {!demand.length&&<p className="rounded-lg border border-dashed border-white/10 p-3 text-[10px] text-white/30">No unresolved demand signal has crossed into this city loop yet.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/15 p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Fulfilment marketplace</p>
        <div className="mt-3 space-y-2">
          {channels.map(channel=><div key={channel.id} className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{channel.display_name}</p><p className="mt-1 text-[9px] uppercase text-white/35">{String(channel.channel_type).replace(/_/g,' ')} · {String(channel.integration_mode).replace(/_/g,' ')}</p><p className="mt-2 text-[10px] leading-4 text-white/40">{(channel.service_types||[]).slice(0,5).join(' · ')}</p></div><span className="rounded-full border border-emerald-300/15 bg-emerald-400/8 px-2 py-1 text-[8px] font-black uppercase text-emerald-100">{channel.status}</span></div></div>)}
          {!channels.length&&<p className="rounded-lg border border-dashed border-white/10 p-3 text-[10px] text-white/30">No active fulfilment channel configured for this city.</p>}
        </div>
      </div>
    </div>
    {notice&&<p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-400/8 p-3 text-xs text-rose-100">{notice}</p>}
  </section>;
}
export default MobilityEvolutionPanel;
