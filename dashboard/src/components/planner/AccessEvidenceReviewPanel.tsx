import React, {useEffect,useState} from 'react';
import {DoorOpen, MapPin, RefreshCw, ShieldCheck, XCircle} from 'lucide-react';
import {accessAccuracyLabel,decideAccessEvidence,listPendingAccessEvidence,decideTransitEvidence,listPendingTransitEvidence,type PendingAccessEvidence,type PendingTransitEvidence} from '../../services/accessEvidenceReviewClient';

export function AccessEvidenceReviewPanel() {
  const [items,setItems]=useState<PendingAccessEvidence[]>([]);
  const [busy,setBusy]=useState(false);
  const [acting,setActing]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const refresh=async()=>{
    setBusy(true);
    try {setItems(await listPendingAccessEvidence());setMessage('');}
    catch(err:any){setItems([]);setMessage(err?.message||'Evidence review could not load.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const review=async(item:PendingAccessEvidence,decision:'accept'|'reject')=>{
    setActing(item.id);
    try {
      const result=await decideAccessEvidence(item.id,decision);
      setItems(previous=>previous.filter(entry=>entry.id!==item.id));
      setMessage(result.status==='accepted'
        ? 'Access evidence reviewed and published at limited confidence. Connectivity and safe entrance use are not verified.'
        : 'Unreliable access evidence rejected; no entrance was published.');
    }catch(err:any){setMessage(err?.message||'The review action failed.');}
    finally{setActing(null);}
  };
  return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-slate-950/75 p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-emerald-200"><DoorOpen className="h-4 w-4"/><p className="text-[10px] font-black uppercase tracking-widest">Evidence to entrance</p></div>
        <h3 className="mt-2 text-lg font-black">Access-point review queue</h3>
        <p className="mt-2 text-xs leading-5 text-white/45">Review GPS location, submitted access modes, names and instructions before a proposed entrance becomes limited-confidence place access. No automatic road routing or passability confirmation.</p>
      </div>
      <button type="button" onClick={refresh} disabled={busy||Boolean(acting)} aria-label="Refresh entrance evidence" className="rounded-xl border border-white/10 p-3 text-white/60 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button>
    </div>
    <div className="mt-4 space-y-3">
      {items.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-sm font-bold">{item.name||'Unnamed proposed entrance'}</p>
            <p className="mt-1 text-[10px] text-white/45">{item.suggested_access_type} · {accessAccuracyLabel(item.gps_accuracy_m)} · {new Date(item.created_at).toLocaleString()}</p></div>
          <span className="rounded-full border border-amber-300/20 px-2 py-1 text-[9px] font-bold text-amber-200">Pending review</span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] text-white/65"><MapPin className="mt-0.5 h-3 w-3 shrink-0"/>{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)} · Place reference {item.place_id.slice(0,8)}</p>
        {item.instructions&&<p className="mt-2 text-xs leading-5 text-white/55">Field instructions: {item.instructions}</p>}
        {!!item.access_modes?.length&&<p className="mt-2 text-[10px] text-white/45">Reported modes: {item.access_modes.join(', ')}</p>}
        {item.photo_url&&<p className="mt-2 text-[10px] text-white/45">Photo reference submitted; review supporting media under existing access controls before accepting.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={()=>void review(item,'accept')} disabled={Boolean(acting)||busy} className="flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-[10px] font-black text-slate-950 disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5"/>Accept limited evidence</button>
          <button type="button" onClick={()=>void review(item,'reject')} disabled={Boolean(acting)||busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-300/20 px-4 text-[10px] font-black text-rose-200 disabled:opacity-40"><XCircle className="h-3.5 w-3.5"/>Reject</button>
        </div>
      </article>)}
      {!busy&&!items.length&&<p className="rounded-xl border border-dashed border-white/15 p-4 text-xs text-white/40">No pending entrance evidence is visible to your account.</p>}
    </div>
    {message&&<p role="status" className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/5 p-3 text-xs text-amber-100">{message}</p>}
  </section>;
}

export function TransitEvidenceReviewPanel(){
  const [items,setItems]=useState<PendingTransitEvidence[]>([]);
  const [busy,setBusy]=useState(false);
  const [acting,setActing]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const load=async()=>{
    setBusy(true);
    try{setItems(await listPendingTransitEvidence());setMessage('');}
    catch(err:any){setMessage(err?.message||'Unable to load transit observations.');setItems([]);}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[]);
  const review=async(item:PendingTransitEvidence,decision:'accept'|'reject')=>{
    setActing(item.id);
    try {
      const result=await decideTransitEvidence(item.id,decision);
      setItems(previous=>previous.filter(entry=>entry.id!==item.id));
      setMessage(result.status==='accepted'
        ? 'Transit evidence accepted at limited confidence. A stop or line is not a confirmed operating service or connected journey.'
        : 'Transit evidence rejected. No network feature was published.');
    }catch(err:any){setMessage(err?.message||'Transit review failed.');}
    finally{setActing(null);}
  };
  return <section className="mt-5 rounded-[1.5rem] border border-violet-300/15 bg-slate-950/75 p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Informal transit learning</p>
      <h3 className="mt-2 text-lg font-black">Stop, line and fare review</h3>
      <p className="mt-2 text-xs leading-5 text-white/45">Inspect observations before adding limited-evidence transit nodes or lines. No service, fare, schedule or connection is assumed verified.</p></div>
      <button type="button" onClick={load} disabled={busy||Boolean(acting)} aria-label="Refresh transit evidence" className="rounded-xl border border-white/10 p-3 text-white/60 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button>
    </div>
    <div className="mt-4 space-y-3">
      {items.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-sm font-bold">{item.node_name||item.line_name||'Unnamed transit observation'}</p>
          <p className="mt-1 text-[10px] text-white/50">{item.observation_type} · {item.mode||'mode unspecified'} · {item.city_key} · {new Date(item.created_at).toLocaleString()}</p></div>
          <span className="rounded-full border border-amber-300/20 px-2 py-1 text-[9px] text-amber-200">Pending review</span>
        </div>
        {item.line_name&&<p className="mt-2 text-[10px] text-white/55">Line: {item.line_name}{item.direction_label?' · '+item.direction_label:''}</p>}
        {item.latitude!=null&&item.longitude!=null&&<p className="mt-2 text-[10px] text-white/55">GPS: {Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)} · {accessAccuracyLabel(item.gps_accuracy_m)}</p>}
        {item.fare_xaf!=null&&<p className="mt-2 text-[10px] text-white/55">Observed fare: {item.fare_xaf} XAF (unconfirmed)</p>}
        {item.wait_seconds!=null&&<p className="mt-2 text-[10px] text-white/55">Observed wait: {Math.round(item.wait_seconds/60)} min (not timetable)</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={()=>void review(item,'accept')} disabled={Boolean(acting)||busy} className="min-h-10 rounded-xl bg-violet-300 px-4 text-[10px] font-black text-slate-950 disabled:opacity-40">Accept limited evidence</button>
          <button type="button" onClick={()=>void review(item,'reject')} disabled={Boolean(acting)||busy} className="min-h-10 rounded-xl border border-rose-300/20 px-4 text-[10px] font-black text-rose-200 disabled:opacity-40">Reject</button>
        </div>
      </article>)}
      {!busy&&!items.length&&<p className="rounded-xl border border-dashed border-white/15 p-4 text-xs text-white/40">No pending transit observations are visible to your account.</p>}
    </div>
    {message&&<p role="status" className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/5 p-3 text-xs text-amber-100">{message}</p>}
  </section>;
}
