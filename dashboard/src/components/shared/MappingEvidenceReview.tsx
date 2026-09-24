import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAfatLocale } from '../../localization';

export function MappingEvidenceReview(){
 const {t}=useAfatLocale();
 const [items,setItems]=useState<any[]>([]); const [places,setPlaces]=useState<any[]>([]); const [targetPlace,setTargetPlace]=useState<Record<string,string>>({}); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const load=async()=>{setBusy(true);const [observations,destinations]=await Promise.all([supabase.from('afat_mapping_observations').select('*').in('status',['candidate','corroborated','trusted']).order('observed_at',{ascending:false}).limit(60),supabase.from('afat_places').select('id,place_ref,canonical_name,city,zone_label').neq('status','retired').order('canonical_name').limit(200)]);setBusy(false);if(observations.error)setNotice(observations.error.message);else{setItems(observations.data||[]);setPlaces(destinations.data||[]);setNotice(destinations.error?destinations.error.message:'');}};
 useEffect(()=>{void load();},[]);
 const act=async(id:string,decision:'corroborate'|'trust'|'reject')=>{setBusy(true);const {error}=await supabase.rpc('afat_review_mapping_observation',{p_observation_id:id,p_decision:decision,p_notes:null});setBusy(false);setNotice(error?error.message:`Observation marked ${decision}.`);if(!error)await load();};
 const promote=async(item:any)=>{const placeId=targetPlace[item.id];if(!placeId){setNotice('Choose the destination this evidence belongs to.');return;}setBusy(true);const {data,error}=await supabase.rpc('afat_promote_mapping_observation_to_reachability',{p_observation_id:item.id,p_place_id:placeId});setBusy(false);setNotice(error?error.message:`Evidence promoted to ${String(data?.kind||'reachability').replace(/_/g,' ')}. It keeps its reviewed evidence state.`);if(!error)await load();};
 return <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">{t('atlas.evidenceReview')}</p><h2 className="mt-1 text-xl font-black">{t('atlas.evidenceReviewTitle')}</h2></div><button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>
  <div className="mt-4 grid gap-3 lg:grid-cols-2">{items.slice(0,12).map(x=><article key={x.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black capitalize">{String(x.observation_type||'field evidence').replace(/_/g,' ')}</p><p className="mt-1 text-xs text-white/45">{x.label||x.description||'No label'} · {Math.round(Number(x.confidence||0))}%</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-white/45">{x.status}</span></div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      <button onClick={()=>act(x.id,'corroborate')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-[8px] font-black uppercase text-cyan-100"><CheckCircle2 className="h-3 w-3"/>Corroborate</button>
      <button onClick={()=>act(x.id,'trust')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-[8px] font-black uppercase text-emerald-100"><ShieldCheck className="h-3 w-3"/>Trust</button>
      <button onClick={()=>act(x.id,'reject')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-400/10 text-[8px] font-black uppercase text-rose-100"><XCircle className="h-3 w-3"/>Reject</button>
    </div>
    {['entrance','pickup_point','informal_stop'].includes(String(x.observation_type))&&['corroborated','trusted'].includes(String(x.status))&&<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <select value={targetPlace[x.id]||''} onChange={e=>setTargetPlace(v=>({...v,[x.id]:e.target.value}))} className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="">Attach to destination…</option>{places.map(p=><option key={p.id} value={p.id}>{p.canonical_name} · {p.zone_label||p.city}</option>)}</select>
      <button onClick={()=>promote(x)} disabled={busy||!targetPlace[x.id]} className="min-h-10 rounded-xl bg-violet-400 px-3 text-[8px] font-black uppercase text-slate-950 disabled:opacity-35">Promote to reachability</button>
    </div>}
  </article>)}{!items.length&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-xs text-white/35">No field mapping evidence is waiting for review.</p>}</div>
  {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
 </section>;
}
