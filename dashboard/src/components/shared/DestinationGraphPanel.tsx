import React,{useEffect,useMemo,useState} from 'react';
import {GitBranch,Link2,RefreshCw,ShieldCheck,XCircle} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Place={id:string;place_ref?:string|null;canonical_name:string;destination_kind?:string;city?:string;zone_label?:string|null};

export function DestinationGraphPanel(){
 const [places,setPlaces]=useState<Place[]>([]);
 const [fromId,setFromId]=useState('');
 const [toId,setToId]=useState('');
 const [relationType,setRelationType]=useState('inside');
 const [snapshot,setSnapshot]=useState<any>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');

 const loadPlaces=async()=>{
  setBusy(true);
  const {data,error}=await supabase.from('afat_places').select('id,place_ref,canonical_name,destination_kind,city,zone_label').neq('status','retired').order('canonical_name').limit(500);
  setBusy(false);
  if(error){setNotice(error.message);return;}
  const rows=(data||[]) as Place[];setPlaces(rows);
  if(!fromId&&rows[0])setFromId(rows[0].id);
 };
 useEffect(()=>{void loadPlaces();},[]);

 const loadSnapshot=async(id=fromId)=>{
  if(!id){setSnapshot(null);return;}
  const {data,error}=await supabase.rpc('afat_destination_graph_snapshot',{p_place_id:id});
  if(error){setNotice(error.message);return;}
  setSnapshot(data||null);
 };
 useEffect(()=>{void loadSnapshot(fromId);},[fromId]);

 const createRelation=async()=>{
  if(!fromId||!toId||fromId===toId){setNotice('Choose two different destinations.');return;}
  setBusy(true);setNotice('');
  const {error}=await supabase.rpc('afat_link_destinations',{
   p_from_place_id:fromId,p_to_place_id:toId,p_relation_type:relationType,p_confidence:50,
   p_evidence:{source_surface:'destination_graph_panel',automatic_truth:false},
  });
  setBusy(false);
  setNotice(error?error.message:'Destination relationship recorded as limited evidence. Review is still required.');
  if(!error)await loadSnapshot();
 };

 const review=async(id:string,decision:'corroborate'|'verify'|'dispute'|'retire')=>{
  setBusy(true);setNotice('');
  const {error}=await supabase.rpc('afat_review_destination_relation',{p_relation_id:id,p_decision:decision,p_notes:null});
  setBusy(false);setNotice(error?error.message:`Destination relationship marked ${decision}.`);
  if(!error)await loadSnapshot();
 };

 const targetOptions=useMemo(()=>places.filter(p=>p.id!==fromId),[places,fromId]);
 const relations=[...(snapshot?.outbound||[]).map((r:any)=>({...r,direction:'outbound',other:r.target})),...(snapshot?.inbound||[]).map((r:any)=>({...r,direction:'inbound',other:r.source}))];

 return <section className="rounded-[1.6rem] border border-fuchsia-300/10 bg-fuchsia-400/[0.025] p-4 sm:p-5">
  <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-fuchsia-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-fuchsia-200">Destination graph</p></div><h2 className="mt-1 text-xl font-black">How real destinations relate</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Model compounds, buildings, alternate entrances, transfers, same-site places and nearby operational relationships without flattening everything into one pin.</p></div><button onClick={()=>{void loadPlaces();void loadSnapshot();}} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>

  <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_150px_1fr_auto]">
   <select value={fromId} onChange={e=>setFromId(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="">From destination…</option>{places.map(p=><option key={p.id} value={p.id}>{p.canonical_name} · {p.place_ref||p.destination_kind}</option>)}</select>
   <select value={relationType} onChange={e=>setRelationType(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="inside">Inside</option><option value="part_of">Part of</option><option value="near">Near</option><option value="same_site">Same site</option><option value="transfer_to">Transfer to</option><option value="served_by">Served by</option><option value="alternate_for">Alternate for</option></select>
   <select value={toId} onChange={e=>setToId(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="">To destination…</option>{targetOptions.map(p=><option key={p.id} value={p.id}>{p.canonical_name} · {p.place_ref||p.destination_kind}</option>)}</select>
   <button onClick={createRelation} disabled={busy||!fromId||!toId} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fuchsia-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Link2 className="h-4 w-4"/>Link</button>
  </div>

  {snapshot?.place&&<div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-sm font-black">{snapshot.place.name}</p><p className="mt-1 text-[8px] uppercase tracking-wide text-white/30">{snapshot.place.place_ref} · {snapshot.place.destination_kind} · {snapshot.place.reachability_state}</p></div>}

  <div className="mt-3 grid gap-3 lg:grid-cols-2">
   {relations.map((r:any)=><article key={r.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{r.direction==='outbound'?'→':'←'} {r.other?.name||'Destination'}</p><p className="mt-1 text-[8px] uppercase tracking-wide text-white/30">{String(r.relation_type).replace(/_/g,' ')} · {r.other?.place_ref||''} · {Math.round(Number(r.confidence||0))}%</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${r.evidence_status==='field_verified'?'bg-emerald-300/10 text-emerald-200':r.evidence_status==='corroborated'?'bg-cyan-300/10 text-cyan-100':r.evidence_status==='disputed'?'bg-rose-300/10 text-rose-200':'bg-amber-300/10 text-amber-100'}`}>{r.evidence_status}</span></div>
    <div className="mt-3 grid grid-cols-4 gap-2"><button onClick={()=>review(r.id,'corroborate')} disabled={busy} className="min-h-9 rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-[7px] font-black uppercase text-cyan-100">Corroborate</button><button onClick={()=>review(r.id,'verify')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-[7px] font-black uppercase text-emerald-100"><ShieldCheck className="h-3 w-3"/>Verify</button><button onClick={()=>review(r.id,'dispute')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-400/10 text-[7px] font-black uppercase text-rose-100"><XCircle className="h-3 w-3"/>Dispute</button><button onClick={()=>review(r.id,'retire')} disabled={busy} className="min-h-9 rounded-lg border border-white/10 bg-white/5 text-[7px] font-black uppercase text-white/45">Retire</button></div>
   </article>)}
   {!relations.length&&fromId&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-xs text-white/35">No reviewed destination relationship is recorded for this place yet.</p>}
  </div>
  {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
 </section>;
}
