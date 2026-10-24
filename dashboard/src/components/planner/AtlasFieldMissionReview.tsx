import React,{useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
type Submitted={id:string;title:string;city:string;claimed_by:string|null;submitted_at:string|null;answer:any;evidence:any;};
export function AtlasFieldMissionReview(){
 const [items,setItems]=useState<Submitted[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const load=async()=>{
  const {data,error}=await supabase.from('afat_micro_missions')
    .select('id,title,city,claimed_by,submitted_at,answer,evidence')
    .eq('status','submitted').eq('mission_type','verify_corridor')
    .order('submitted_at',{ascending:true}).limit(30);
  if(error){setNotice(error.message);return;}
  setItems(((data||[]) as Submitted[]).filter(item=>item.evidence?.source==='licensed_cross_source_spatial_comparison'));
 };
 useEffect(()=>{void load();},[]);
 const decide=async(id:string,decision:'accept'|'reject')=>{
  const rationale=String(notes[id]||'').trim();
  if(rationale.length<25){setNotice('Record at least 25 characters describing evidence actually checked.');return;}
  setBusy(true);
  const {data,error}=await supabase.rpc('afat_review_cross_source_field_check',{
   p_mission_id:id,p_decision:decision,p_notes:rationale,
  });
  setBusy(false);
  if(error){setNotice(error.message||'Review not accepted.');return;}
  setNotice(data?.route_truth_updated===false?'Field evidence reviewed and recorded; routing truth remains unchanged.':'Review recorded.');
  setNotes(old=>({...old,[id]:''}));
  await load();
 };
 return <section className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
  <h4 className="text-sm font-black">Submitted cross-source field missions · independent review</h4>
  <p className="mt-1 text-xs leading-5 text-white/55">Check real device evidence and the underlying map disagreement before accepting or rejecting. A submission is not a road safety certificate and grants no automatic points.</p>
  <button type="button" onClick={()=>void load()} disabled={busy} className="mt-3 min-h-10 rounded-lg border border-white/15 px-3 text-xs">Refresh submissions</button>
  <div className="mt-3 space-y-3">{items.map(item=><article key={item.id} className="rounded-xl border border-white/10 p-3">
    <p className="text-xs font-bold">{item.title}</p>
    <p className="mt-1 text-[10px] text-white/50">{item.city} · {item.submitted_at?new Date(item.submitted_at).toLocaleString():'No recorded time'}</p>
    <p className="mt-2 text-xs text-white/70">Observed condition: {String(item.answer?.condition||'Not stated')}</p>
    <p className="mt-1 text-xs text-white/55">Reported accuracy: {item.evidence?.accuracy_m??'unknown'} m · Distance to target: {item.evidence?.target_distance_m??'unknown'} m</p>
    <p className="mt-1 text-[10px] text-white/40">Source record: {String(item.evidence?.primary_source_record_id||'unknown')} · Contributor: {String(item.claimed_by||'unknown')}</p>
    <label className="mt-3 block text-xs text-white/55">Your independent assessment
     <textarea rows={2} maxLength={2000} value={notes[item.id]||''} onChange={e=>setNotes(old=>({...old,[item.id]:e.target.value}))} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2 text-xs" placeholder="State which location, source records and field evidence you actually examined."/>
    </label>
    <div className="mt-2 flex gap-2">
     <button type="button" disabled={busy||(notes[item.id]||'').trim().length<25} onClick={()=>void decide(item.id,'accept')} className="min-h-10 rounded-lg border border-emerald-400/20 px-3 text-xs disabled:opacity-30">Accept reviewed submission</button>
     <button type="button" disabled={busy||(notes[item.id]||'').trim().length<25} onClick={()=>void decide(item.id,'reject')} className="min-h-10 rounded-lg border border-rose-400/20 px-3 text-xs disabled:opacity-30">Reject submission</button>
    </div>
   </article>)}
   {!items.length&&<p className="text-xs text-white/40">No submitted source-comparison missions are awaiting review.</p>}
  </div>
  {notice&&<p role="status" className="mt-3 text-xs text-amber-200">{notice}</p>}
 </section>;
}
