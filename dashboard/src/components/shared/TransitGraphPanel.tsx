import React,{useEffect,useMemo,useState} from 'react';
import {BusFront,CheckCircle2,MapPin,Plus,RefreshCw,Route,ShieldCheck,XCircle} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type NodeRow={id:string;name:string;local_name?:string|null;node_type:string;confidence:number;evidence_status:string;latitude:number;longitude:number;access_modes?:string[];meeting_point_id?:string|null};
type LineRow={id:string;line_ref:string;name:string;mode:string;direction_label?:string|null;confidence:number;evidence_status:string;nodes?:Array<{node_id:string;stop_sequence:number;direction:string;observed_travel_seconds?:number|null;dwell_seconds?:number|null}>};

export function TransitGraphPanel({cityKey='cm-yaounde'}:{cityKey?:string}){
 const [nodes,setNodes]=useState<NodeRow[]>([]);
 const [lines,setLines]=useState<LineRow[]>([]);
 const [eligibleMeetings,setEligibleMeetings]=useState<any[]>([]);
 const [selectedNodes,setSelectedNodes]=useState<string[]>([]);
 const [lineName,setLineName]=useState('');
 const [lineMode,setLineMode]=useState('minibus');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');

 const load=async()=>{
  setBusy(true);setNotice('');
  const [transitResult,reachResult]=await Promise.all([
   supabase.rpc('afat_transit_graph_snapshot',{p_city_key:cityKey}),
   supabase.rpc('afat_reachability_map',{p_city_key:cityKey}),
  ]);
  setBusy(false);
  if(transitResult.error){setNotice(transitResult.error.message);return;}
  const nextNodes=Array.isArray(transitResult.data?.nodes)?transitResult.data.nodes:[];
  const nextLines=Array.isArray(transitResult.data?.lines)?transitResult.data.lines:[];
  setNodes(nextNodes);setLines(nextLines);
  const existingMeetings=new Set(nextNodes.map((n:any)=>String(n.meeting_point_id||'')).filter(Boolean));
  const reachMeetings=Array.isArray(reachResult.data?.meeting_points)?reachResult.data.meeting_points:[];
  setEligibleMeetings(reachMeetings.filter((m:any)=>['corroborated','field_verified'].includes(String(m.evidence_status||''))&&!existingMeetings.has(String(m.id))));
 };
 useEffect(()=>{void load();},[cityKey]);

 const promoteMeeting=async(meeting:any)=>{
  setBusy(true);setNotice('');
  const type=String(meeting.point_type||'boarding')==='transfer'?'transfer':String(meeting.point_type||'')==='informal_stop'?'informal_stop':'boarding';
  const {error}=await supabase.rpc('afat_promote_meeting_to_transit_node',{p_meeting_point_id:meeting.id,p_node_type:type});
  setBusy(false);setNotice(error?error.message:'Reviewed meeting evidence promoted to a transit node. It keeps its evidence status.');
  if(!error)await load();
 };

 const toggleNode=(id:string)=>setSelectedNodes(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);

 const createLine=async()=>{
  if(lineName.trim().length<2||selectedNodes.length<2){setNotice('Name the line and choose at least two nodes in travel order.');return;}
  setBusy(true);setNotice('');
  const {data,error}=await supabase.rpc('afat_create_transit_line',{
   p_city_key:cityKey,p_name:lineName.trim(),p_mode:lineMode,p_node_ids:selectedNodes,p_direction_label:null,
  });
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setNotice(`Created ${data?.line_ref||'transit line'} as limited evidence. Review/corroboration is still required.`);
  setLineName('');setSelectedNodes([]);await load();
 };

 const review=async(id:string,decision:'corroborate'|'dispute'|'retire')=>{
  setBusy(true);setNotice('');
  const {error}=await supabase.rpc('afat_review_transit_line',{p_line_id:id,p_decision:decision,p_notes:null});
  setBusy(false);setNotice(error?error.message:`Transit line marked ${decision}.`);
  if(!error)await load();
 };

 const counts=useMemo(()=>({
  corroborated:lines.filter(x=>x.evidence_status==='corroborated'||x.evidence_status==='field_verified').length,
  limited:lines.filter(x=>x.evidence_status==='limited').length,
  nodes:nodes.length,
 }),[lines,nodes]);

 return <section className="rounded-[1.6rem] border border-indigo-300/15 bg-gradient-to-br from-indigo-400/[0.07] via-slate-950/85 to-cyan-400/[0.03] p-4 sm:p-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
   <div><div className="flex items-center gap-2"><BusFront className="h-4 w-4 text-indigo-200"/><p className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-200">Informal + formal transit graph</p></div><h2 className="mt-2 text-xl font-black">Observed boarding and transfer reality</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Reviewed meeting evidence becomes nodes; planners assemble a line from those nodes; the line starts limited and must be corroborated. AFAT never invents missing stops or routes.</p></div>
   <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-white/60"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button>
  </div>

  <div className="mt-4 grid grid-cols-3 gap-2">
   <Stat icon={MapPin} label="Transit nodes" value={counts.nodes}/>
   <Stat icon={Route} label="Lines" value={lines.length}/>
   <Stat icon={ShieldCheck} label="Corroborated" value={counts.corroborated}/>
  </div>

  {eligibleMeetings.length>0&&<div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-400/[0.035] p-4">
   <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Reviewed stops ready for promotion</p>
   <div className="mt-3 flex flex-wrap gap-2">{eligibleMeetings.slice(0,12).map((m:any)=><button key={m.id} onClick={()=>promoteMeeting(m)} disabled={busy} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-[9px] text-white/60 disabled:opacity-35"><strong className="block text-white">{m.name||m.point_type}</strong><span>{String(m.point_type||'boarding').replace(/_/g,' ')} · {Math.round(Number(m.confidence||0))}%</span></button>)}</div>
  </div>}

  {nodes.length>=2&&<div className="mt-4 rounded-2xl border border-indigo-300/10 bg-black/20 p-4">
   <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-200">Assemble a line from reviewed nodes</p></div>
   <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]">
    <input value={lineName} onChange={e=>setLineName(e.target.value)} placeholder="Line name / local corridor" className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white outline-none"/>
    <select value={lineMode} onChange={e=>setLineMode(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="minibus">Minibus</option><option value="bus">Bus</option><option value="shared_taxi">Shared taxi</option><option value="moto_taxi">Moto taxi</option><option value="other">Other</option></select>
    <button onClick={createLine} disabled={busy||selectedNodes.length<2||lineName.trim().length<2} className="min-h-11 rounded-xl bg-indigo-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35">Create limited line</button>
   </div>
   <p className="mt-3 text-[9px] leading-4 text-white/35">Tap nodes in travel order. Selection order becomes stop sequence.</p>
   <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{nodes.map(node=>{const index=selectedNodes.indexOf(node.id);return <button key={node.id} onClick={()=>toggleNode(node.id)} className={`rounded-xl border p-3 text-left ${index>=0?'border-indigo-300/35 bg-indigo-300/10':'border-white/10 bg-white/[0.025]'}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-black">{node.name}</p>{index>=0&&<span className="rounded-full bg-indigo-300 px-2 py-1 text-[8px] font-black text-slate-950">{index+1}</span>}</div><p className="mt-1 text-[8px] uppercase text-white/30">{node.node_type} · {node.evidence_status}</p></button>})}</div>
  </div>}

  <div className="mt-4 grid gap-3 lg:grid-cols-2">
   {lines.slice(0,12).map(line=><article key={line.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{line.name}</p><p className="mt-1 text-[9px] uppercase tracking-wide text-white/30">{line.line_ref} · {String(line.mode).replace(/_/g,' ')}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${line.evidence_status==='corroborated'||line.evidence_status==='field_verified'?'bg-emerald-300/10 text-emerald-200':line.evidence_status==='disputed'?'bg-rose-300/10 text-rose-200':'bg-amber-300/10 text-amber-100'}`}>{line.evidence_status.replace(/_/g,' ')}</span></div>
    <p className="mt-3 text-[10px] text-white/45">{line.nodes?.length||0} observed nodes{line.direction_label?` · ${line.direction_label}`:''} · confidence {Math.round(Number(line.confidence||0))}%</p>
    <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={()=>review(line.id,'corroborate')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-[8px] font-black uppercase text-emerald-100"><CheckCircle2 className="h-3 w-3"/>Corroborate</button><button onClick={()=>review(line.id,'dispute')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-400/10 text-[8px] font-black uppercase text-rose-100"><XCircle className="h-3 w-3"/>Dispute</button><button onClick={()=>review(line.id,'retire')} disabled={busy} className="min-h-9 rounded-lg border border-white/10 bg-white/5 text-[8px] font-black uppercase text-white/50">Retire</button></div>
   </article>)}
   {!lines.length&&<div className="lg:col-span-2 rounded-xl border border-dashed border-white/15 p-6 text-center"><BusFront className="mx-auto h-5 w-5 text-white/25"/><p className="mt-3 text-sm font-black text-white/55">No transit line has enough evidence yet.</p><p className="mt-1 text-xs leading-5 text-white/35">Real boarding points can be promoted from reviewed meeting evidence, then planners can assemble and review a line.</p></div>}
  </div>
  {notice&&<p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}

function Stat({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){
 return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-indigo-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}
