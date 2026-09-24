import React,{useEffect,useMemo,useState} from 'react';
import {BusFront,MapPin,RefreshCw,Route,ShieldCheck} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type NodeRow={id:string;name:string;local_name?:string|null;node_type:string;confidence:number;evidence_status:string;latitude:number;longitude:number;access_modes?:string[]};
type LineRow={id:string;line_ref:string;name:string;mode:string;direction_label?:string|null;confidence:number;evidence_status:string;nodes?:Array<{node_id:string;stop_sequence:number;direction:string;observed_travel_seconds?:number|null;dwell_seconds?:number|null}>};

export function TransitGraphPanel({cityKey='cm-yaounde'}:{cityKey?:string}){
 const [nodes,setNodes]=useState<NodeRow[]>([]);
 const [lines,setLines]=useState<LineRow[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');

 const load=async()=>{
  setBusy(true);setNotice('');
  const {data,error}=await supabase.rpc('afat_transit_graph_snapshot',{p_city_key:cityKey});
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setNodes(Array.isArray(data?.nodes)?data.nodes:[]);
  setLines(Array.isArray(data?.lines)?data.lines:[]);
 };
 useEffect(()=>{void load();},[cityKey]);

 const counts=useMemo(()=>({
  corroborated:lines.filter(x=>x.evidence_status==='corroborated'||x.evidence_status==='field_verified').length,
  limited:lines.filter(x=>x.evidence_status==='limited').length,
  nodes:nodes.length,
 }),[lines,nodes]);

 return <section className="rounded-[1.6rem] border border-indigo-300/15 bg-gradient-to-br from-indigo-400/[0.07] via-slate-950/85 to-cyan-400/[0.03] p-4 sm:p-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
   <div><div className="flex items-center gap-2"><BusFront className="h-4 w-4 text-indigo-200"/><p className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-200">Informal + formal transit graph</p></div><h2 className="mt-2 text-xl font-black">Observed boarding and transfer reality</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Stops and lines appear only after evidence exists. Planner-created lines begin limited and require review; AFAT never invents a route to make the map look full.</p></div>
   <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-white/60"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button>
  </div>
  <div className="mt-4 grid grid-cols-3 gap-2">
   <Stat icon={MapPin} label="Transit nodes" value={counts.nodes}/>
   <Stat icon={Route} label="Lines" value={lines.length}/>
   <Stat icon={ShieldCheck} label="Corroborated" value={counts.corroborated}/>
  </div>
  <div className="mt-4 grid gap-3 lg:grid-cols-2">
   {lines.slice(0,8).map(line=><article key={line.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{line.name}</p><p className="mt-1 text-[9px] uppercase tracking-wide text-white/30">{line.line_ref} · {String(line.mode).replace(/_/g,' ')}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${line.evidence_status==='corroborated'||line.evidence_status==='field_verified'?'bg-emerald-300/10 text-emerald-200':'bg-amber-300/10 text-amber-100'}`}>{line.evidence_status.replace(/_/g,' ')}</span></div>
    <p className="mt-3 text-[10px] text-white/45">{line.nodes?.length||0} observed nodes{line.direction_label?` · ${line.direction_label}`:''} · confidence {Math.round(Number(line.confidence||0))}%</p>
   </article>)}
   {!lines.length&&<div className="lg:col-span-2 rounded-xl border border-dashed border-white/15 p-6 text-center"><BusFront className="mx-auto h-5 w-5 text-white/25"/><p className="mt-3 text-sm font-black text-white/55">No transit line has enough evidence yet.</p><p className="mt-1 text-xs leading-5 text-white/35">Real boarding points can be promoted from reviewed meeting evidence, then planners can assemble and review a line.</p></div>}
  </div>
  {notice&&<p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}

function Stat({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){
 return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-indigo-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}
