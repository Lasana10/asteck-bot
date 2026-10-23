import React, { useCallback, useEffect, useState } from 'react';
import { Bus, Check, MapPin, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {loadIncidentReviewQueue,decidePendingIncident,type PendingIncident} from '../../services/incidentReviewClient';

type AccessRow={id:string;place_id:string;suggested_access_type:string;name?:string|null;instructions?:string|null;latitude:number;longitude:number;gps_accuracy_m?:number|null;created_at:string;evidence?:any};
type TransitRow={id:string;city_key:string;observation_type:string;node_name?:string|null;line_name?:string|null;direction_label?:string|null;mode?:string|null;latitude?:number|null;longitude?:number|null;wait_seconds?:number|null;travel_seconds?:number|null;fare_xaf?:number|null;gps_accuracy_m?:number|null;created_at:string;evidence?:any};

export function EvidenceReviewQueue(){
  const [access,setAccess]=useState<AccessRow[]>([]);
  const [transit,setTransit]=useState<TransitRow[]>([]);
  const [incidents,setIncidents]=useState<PendingIncident[]>([]);
  const [incidentNotes,setIncidentNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');

  const load=useCallback(async()=>{
    setBusy('load');setNotice('');
    const [a,t,i]=await Promise.all([
      supabase.from('afat_access_evidence_submissions').select('id,place_id,suggested_access_type,name,instructions,latitude,longitude,gps_accuracy_m,created_at,evidence').eq('status','pending').order('created_at',{ascending:true}).limit(50),
      supabase.from('afat_transit_observations').select('id,city_key,observation_type,node_name,line_name,direction_label,mode,latitude,longitude,wait_seconds,travel_seconds,fare_xaf,gps_accuracy_m,created_at,evidence').eq('status','pending').order('created_at',{ascending:true}).limit(50),
      loadIncidentReviewQueue(),
    ]);
    setBusy('');
    if(a.error||t.error||i.error){setNotice(a.error?.message||t.error?.message||i.error?.message||'Evidence review queue could not load.');return;}
    setAccess((a.data||[]) as AccessRow[]);setTransit((t.data||[]) as TransitRow[]);setIncidents(i.data||[]);
  },[]);
  useEffect(()=>{void load();},[load]);

  const reviewIncident=async(id:string,decision:'verify'|'dismiss')=>{
    const notes=String(incidentNotes[id]||'').trim();
    if(notes.length<12){setNotice('Explain the independent evidence or reason for dismissal (at least 12 characters).');return;}
    setBusy(id);setNotice('');
    const {data,error}=await decidePendingIncident(id,decision,notes);
    setBusy('');
    if(error){setNotice(error.message);await load();return;}
    setIncidents(rows=>rows.filter(row=>row.id!==id));
    setIncidentNotes(current=>{const next={...current};delete next[id];return next;});
    setNotice(decision==='verify'?'Staff-reviewed incident verified. Atlas promotion remains subject to the existing trusted-road and expiry rules.':'Incident dismissed with an audit record; it must not affect trusted routes.');
  };

  const reviewAccess=async(id:string,decision:'accept'|'reject')=>{
    setBusy(id);setNotice('');
    const {data,error}=await supabase.rpc('afat_review_access_evidence',{p_submission_id:id,p_decision:decision});
    setBusy('');
    if(error){setNotice(error.message);return;}
    setAccess(rows=>rows.filter(row=>row.id!==id));
    setNotice(decision==='accept'?`Entrance evidence accepted as ${data?.evidence_status||'limited'} evidence. It was not upgraded to automatic truth.`:'Entrance evidence rejected.');
  };
  const reviewTransit=async(id:string,decision:'accept'|'reject')=>{
    setBusy(id);setNotice('');
    const {data,error}=await supabase.rpc('afat_review_transit_observation',{p_observation_id:id,p_decision:decision});
    setBusy('');
    if(error){setNotice(error.message);return;}
    setTransit(rows=>rows.filter(row=>row.id!==id));
    setNotice(decision==='accept'?`Transit evidence accepted${data?.node_id?' and linked to a limited network object':''}. It remains evidence-gated.`:'Transit evidence rejected.');
  };

  return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.035] p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Evidence Review</p><h2 className="mt-1 text-lg font-black">Turn observations into controlled city knowledge</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">Community submissions remain pending until reviewed. Acceptance creates limited evidence first; it never silently upgrades a place, entrance, stop, line or fare to verified truth.</p></div><button onClick={()=>void load()} disabled={busy==='load'} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><RefreshCw className={`h-4 w-4 ${busy==='load'?'animate-spin':''}`}/></button></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-cyan-100"><MapPin className="h-4 w-4"/>Entrance / access</p><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-white/45">{access.length} pending</span></div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{access.length===0?<p className="rounded-xl border border-white/5 p-4 text-xs text-white/35">No pending entrance evidence.</p>:access.map(row=><article key={row.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-white">{row.name||row.suggested_access_type.replace(/_/g,' ')}</p><p className="mt-1 text-[9px] text-white/40">{row.suggested_access_type} · GPS {row.gps_accuracy_m==null?'unknown':`±${Math.round(Number(row.gps_accuracy_m))} m`} · {new Date(row.created_at).toLocaleString()}</p>{row.instructions&&<p className="mt-2 text-[10px] leading-5 text-white/55">{row.instructions}</p>}<p className="mt-2 font-mono text-[8px] text-white/25">{Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}</p></div><div className="flex gap-1"><button onClick={()=>void reviewAccess(row.id,'accept')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300 text-slate-950 disabled:opacity-40" title="Accept as limited evidence"><Check className="h-4 w-4"/></button><button onClick={()=>void reviewAccess(row.id,'reject')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/55 disabled:opacity-40" title="Reject"><X className="h-4 w-4"/></button></div></div></article>)}</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-violet-100"><Bus className="h-4 w-4"/>Transit observations</p><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-white/45">{transit.length} pending</span></div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{transit.length===0?<p className="rounded-xl border border-white/5 p-4 text-xs text-white/35">No pending transit observations.</p>:transit.map(row=><article key={row.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-white">{row.node_name||row.line_name||row.observation_type.replace(/_/g,' ')}</p><p className="mt-1 text-[9px] text-white/40">{row.observation_type} · {row.mode||'mode not supplied'} · {new Date(row.created_at).toLocaleString()}</p>{row.line_name&&row.node_name&&<p className="mt-1 text-[10px] text-white/55">Line: {row.line_name}</p>}<div className="mt-2 flex flex-wrap gap-1">{row.fare_xaf!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">{row.fare_xaf} XAF</span>}{row.wait_seconds!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">wait {Math.round(row.wait_seconds/60)} min</span>}{row.gps_accuracy_m!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">GPS ±{Math.round(Number(row.gps_accuracy_m))} m</span>}</div></div><div className="flex gap-1"><button onClick={()=>void reviewTransit(row.id,'accept')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300 text-slate-950 disabled:opacity-40" title="Accept reviewed evidence"><Check className="h-4 w-4"/></button><button onClick={()=>void reviewTransit(row.id,'reject')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/55 disabled:opacity-40" title="Reject"><X className="h-4 w-4"/></button></div></div></article>)}</div>
      </div>
    </div>
    <section className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-400/[0.025] p-3">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-amber-100">Pending real-world incidents</h3><p className="mt-1 text-[10px] text-white/45">Device GPS and community descriptions are evidence to review, not verified road truth. Each staff decision requires a written reason and a server audit.</p></div><span className="rounded-xl border border-white/10 px-3 py-1 text-[10px] text-white/60">{incidents.length} awaiting review</span></div>
      <div className="mt-3 grid max-h-[460px] gap-3 overflow-y-auto lg:grid-cols-2">
        {incidents.length===0&&<p className="rounded-xl border border-white/10 p-4 text-xs text-white/50">No pending incident observations.</p>}
        {incidents.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white">{item.type.replace(/_/g,' ')} · severity {item.severity}/5</p><p className="mt-1 text-[10px] text-white/50">{item.source} · {new Date(item.created_at).toLocaleString()} · GPS {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</p></div><span className="text-[9px] text-amber-100/75">UNVERIFIED</span></div>
          <p className="mt-3 text-xs leading-5 text-white/65">{item.description||'No supporting description received.'}</p>
          <p className="mt-2 text-[10px] text-white/40">{Date.parse(item.expires_at)<=Date.now()?'Expired: verification is not permitted. Dismiss or escalate.':'Within report lifetime; require independent corroboration.'}</p>
          <label className="mt-3 block text-[10px] text-white/60">Staff evidence / review reason
            <textarea value={incidentNotes[item.id]||''} onChange={e=>setIncidentNotes(n=>({...n,[item.id]:e.target.value}))} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-xs text-white" placeholder="What independently supports or contradicts this report?"/></label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={()=>void reviewIncident(item.id,'verify')} disabled={busy!==''||Date.parse(item.expires_at)<=Date.now()||(incidentNotes[item.id]||'').trim().length<12} className="min-h-10 rounded-lg bg-emerald-300 px-3 text-[10px] font-black text-slate-950 disabled:opacity-40">Verify observed incident</button>
            <button type="button" onClick={()=>void reviewIncident(item.id,'dismiss')} disabled={busy!==''||(incidentNotes[item.id]||'').trim().length<12} className="min-h-10 rounded-lg border border-rose-300/20 px-3 text-[10px] font-black text-rose-100 disabled:opacity-40">Dismiss</button>
          </div>
        </article>)}
      </div>
    </section>
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default EvidenceReviewQueue;
