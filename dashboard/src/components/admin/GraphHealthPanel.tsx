import React, { useCallback, useEffect, useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type GraphHealth={
  city_key:string;city_name:string;state:string;active_nodes:number;routable_nodes:number;active_routable_edges:number;
  connected_components:number;largest_component_nodes:number;largest_component_share_pct:number;isolated_routable_nodes:number;
  provisional_edges:number;low_confidence_edges:number;average_edge_confidence:number;generated_at:string;
};
function Metric({label,value}:{label:string;value:React.ReactNode}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xl font-black text-white">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>}
export function GraphHealthPanel({cityKey}:{cityKey:string}){
  const [data,setData]=useState<GraphHealth|null>(null);const[busy,setBusy]=useState(false);const[notice,setNotice]=useState('');
  const load=useCallback(async()=>{setBusy(true);setNotice('');const{data,error}=await supabase.rpc('afat_graph_health_snapshot',{p_city_key:cityKey});setBusy(false);if(error){setNotice(error.message);return;}setData(data as GraphHealth)},[cityKey]);
  useEffect(()=>{void load()},[load]);
  const state=String(data?.state||'loading').replace(/_/g,' ');
  return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.035] p-5">
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Network className="h-4 w-4 text-emerald-200"/><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Routing graph health</p></div><h2 className="mt-2 text-lg font-black">Connectivity, not record count</h2><p className="mt-1 text-xs leading-5 text-white/45">An ingestion wave is useful only when it strengthens a connected routing graph. Components and isolation expose fragmentation directly.</p></div><button type="button" onClick={()=>void load()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-6"><Metric label="routable nodes" value={data?.routable_nodes??'—'}/><Metric label="routable edges" value={data?.active_routable_edges??'—'}/><Metric label="components" value={data?.connected_components??'—'}/><Metric label="largest component" value={data?`${data.largest_component_share_pct}%`:'—'}/><Metric label="isolated nodes" value={data?.isolated_routable_nodes??'—'}/><Metric label="avg confidence" value={data?`${Math.round(Number(data.average_edge_confidence||0))}%`:'—'}/></div>
    {data&&<div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold"><span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-emerald-100">{state}</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/45">{data.largest_component_nodes} nodes in largest component</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/45">{data.provisional_edges} provisional edges</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/45">{data.low_confidence_edges} low-confidence edges</span></div>}
    {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>
}
export default GraphHealthPanel;
