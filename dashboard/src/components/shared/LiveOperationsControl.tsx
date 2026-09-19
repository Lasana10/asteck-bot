import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Car, Radio, RefreshCw, Route, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { InteractiveMap } from './InteractiveMap';

export function LiveOperationsControl(){
 const [data,setData]=useState<any>({}); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const load=async()=>{setBusy(true);const {data,error}=await supabase.rpc('afat_live_operations_snapshot',{p_city:'Yaoundé'});setBusy(false);if(error)setNotice(error.message);else{setData(data||{});setNotice('');}};
 useEffect(()=>{void load();const id=setInterval(()=>void load(),30000);return()=>clearInterval(id);},[]);
 const s=data.summary||{}; const dispatches=data.dispatches||[]; const vehicles=data.vehicles||[]; const incidents=data.incidents||[]; const demand=data.demand||[];
 const mapTracks=vehicles.filter((v:any)=>Number.isFinite(Number(v.current_lat))&&Number.isFinite(Number(v.current_lng)));
 const mapIncidents=incidents.filter((i:any)=>Number.isFinite(Number(i.latitude))&&Number.isFinite(Number(i.longitude)));
 const unmatched=useMemo(()=>dispatches.filter((d:any)=>!d.operator_id),[dispatches]);
 return <section className="space-y-5">
   <div className="rounded-[1.6rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.09] to-slate-950/80 p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300">Live Operations</p><h2 className="mt-2 text-2xl font-black">Dispatch, supply, journeys and failures in one control room</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/45">This board reads the live operating state. It does not manufacture supply, demand or trips.</p></div><button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button></div>
    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <M icon={Route} label="Open dispatches" value={s.open_dispatches||0}/><M icon={AlertTriangle} label="Unassigned" value={s.unassigned_dispatches||0}/><M icon={Activity} label="Active journeys" value={s.active_journeys||0}/><M icon={Car} label="Available vehicles" value={s.available_vehicles||0}/><M icon={Radio} label="Stale vehicle pings" value={s.stale_available_vehicles||0}/><M icon={AlertTriangle} label="Active incidents" value={s.active_incidents||0}/><M icon={Users} label="Demand / 60 min" value={s.demand_pressure||0}/>
    </div>
   </div>
   <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
    <div className="min-h-[560px]"><InteractiveMap role="planner" mapMode="intel" incidents={mapIncidents} tracks={mapTracks} realtimeOverlay showInformal/></div>
    <div className="space-y-4">
      <Panel title="Unassigned / recovery queue">{unmatched.slice(0,8).map((d:any)=><Row key={d.id} title={`${d.origin||'Origin'} → ${d.destination||'Destination'}`} detail={`${d.status} · ${d.priority||'normal'}`}/>) }{!unmatched.length&&<Empty text="No unassigned dispatch is waiting."/>}</Panel>
      <Panel title="Demand pressure">{demand.slice(0,8).map((d:any)=><Row key={d.id} title={`${d.origin||'Origin'} → ${d.destination||'Destination'}`} detail={`${d.passenger_count||0} requests · ${d.last_request||''}`}/>) }{!demand.length&&<Empty text="No recent demand cluster is visible."/>}</Panel>
    </div>
   </div>
   {notice&&<p className="rounded-xl border border-rose-300/15 bg-rose-400/10 p-3 text-xs text-rose-100">{notice}</p>}
 </section>;
}
function M({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:React.ReactNode}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-violet-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[7px] font-black uppercase tracking-wider text-white/30">{label}</p></div>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <div className="rounded-[1.3rem] border border-white/10 bg-slate-950/70 p-4"><p className="mb-3 text-[9px] font-black uppercase tracking-widest text-white/45">{title}</p><div className="space-y-2">{children}</div></div>}
function Row({title,detail}:{title:string;detail:string}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-black">{title}</p><p className="mt-1 text-[9px] uppercase text-white/35">{detail}</p></div>}
function Empty({text}:{text:string}){return <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/30">{text}</p>}
