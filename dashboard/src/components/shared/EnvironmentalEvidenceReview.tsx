import React,{useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
type Evidence={id:string;source_key:string;signal_type:string;observed_at:string;severity:number;confidence:number;latitude:number;longitude:number;payload:any;provenance:any};
export function EnvironmentalEvidenceReview({cityKey}:{cityKey:string}){
 const [rows,setRows]=useState<Evidence[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{
  if(!cityKey)return;
  const {data,error}=await supabase.rpc('afat_environment_review_queue',{p_city_key:cityKey,p_limit:30});
  if(error){setNotice(error.message);return;}
  setRows(Array.isArray(data?.pending)?data.pending:[]);
 };
 useEffect(()=>{void refresh();},[cityKey]);
 const act=async(id:string,decision:'approve'|'reject')=>{
  const reason=String(notes[id]||'').trim();
  if(reason.length<25){setNotice('Independent review requires a factual evidence rationale (25 characters minimum).');return;}
  setBusy(true);setNotice('');
  const {data,error}=await supabase.rpc('afat_review_environment_signal',{
   p_signal_id:id,p_decision:decision,p_notes:reason,
  });
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setNotice(data?.route_impact?'Reviewed environmental evidence was accepted for bounded temporary route-cost overlays. No road closure was certified.':'Observation rejected; no routing influence authorized.');
  setNotes(old=>({...old,[id]:''}));await refresh();
 };
 return <section className="mt-5 rounded-xl border border-amber-300/15 p-4">
  <h4 className="text-sm font-black">Environmental hypotheses awaiting independent assessment</h4>
  <p className="mt-1 text-xs leading-5 text-white/50">Only independently reviewed observations may change temporary road-cost overlays. Satellite scene metadata alone must never be submitted as a flood or traffic event.</p>
  <button type="button" disabled={busy} onClick={()=>void refresh()} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs">Refresh pending environmental evidence</button>
  <div className="mt-3 space-y-3">{rows.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
    <p className="text-xs font-bold">{item.signal_type.replace(/_/g,' ')} · {item.source_key}</p>
    <p className="mt-1 text-[10px] text-white/55">Observed {new Date(item.observed_at).toLocaleString()} · Coordinates {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</p>
    <p className="mt-1 text-[10px] text-white/55">Source confidence {item.confidence}/100 · declared severity {item.severity}/100 · both unreviewed</p>
    <p className="mt-1 break-all text-[10px] text-white/40">Provenance: {JSON.stringify(item.provenance||{}).slice(0,600)}</p>
    <label className="mt-3 block text-xs text-white/60">What independent data did you actually inspect?
      <textarea rows={2} maxLength={2000} value={notes[item.id]||''} onChange={e=>setNotes(old=>({...old,[item.id]:e.target.value}))}
       placeholder="Describe observed time, source item/version, geographic consistency, uncertainty and corroboration."
       className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 p-2 text-xs"/>
    </label>
    <div className="mt-2 flex gap-2">
      <button type="button" disabled={busy||(notes[item.id]||'').trim().length<25} onClick={()=>void act(item.id,'approve')} className="min-h-10 rounded-lg border border-emerald-300/25 px-3 text-xs disabled:opacity-30">Approve reviewed evidence</button>
      <button type="button" disabled={busy||(notes[item.id]||'').trim().length<25} onClick={()=>void act(item.id,'reject')} className="min-h-10 rounded-lg border border-rose-300/25 px-3 text-xs disabled:opacity-30">Reject evidence</button>
    </div>
  </article>)}
  {!rows.length&&<p className="p-3 text-xs text-white/45">No submitted environmental hypotheses await review in this city.</p>}</div>
  {notice&&<p role="status" className="mt-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
