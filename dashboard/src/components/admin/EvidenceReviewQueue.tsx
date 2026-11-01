import React, { useCallback, useEffect, useState } from 'react';
import { Bus, Check, MapPin, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type AccessRow={id:string;profile_id:string;place_id:string;suggested_access_type:string;name?:string|null;instructions?:string|null;latitude:number;longitude:number;gps_accuracy_m?:number|null;created_at:string;evidence?:any;place?:{canonical_name:string;latitude:number;longitude:number;status:string}|null};
type TransitRow={id:string;city_key:string;observation_type:string;node_name?:string|null;line_name?:string|null;direction_label?:string|null;mode?:string|null;latitude?:number|null;longitude?:number|null;wait_seconds?:number|null;travel_seconds?:number|null;fare_xaf?:number|null;gps_accuracy_m?:number|null;created_at:string;evidence?:any};

export function EvidenceReviewQueue(){
  const [access,setAccess]=useState<AccessRow[]>([]);
  const [transit,setTransit]=useState<TransitRow[]>([]);
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [reviewerId,setReviewerId]=useState<string|null>(null);

  const accessReviewIssue=(row:AccessRow)=>{
    if(!reviewerId)return 'Reviewer identity unavailable';
    if(row.profile_id===reviewerId)return 'Independent reviewer required';
    if(!row.place||['disputed','retired'].includes(row.place.status))return 'Destination unavailable';
    if(row.gps_accuracy_m==null||Number(row.gps_accuracy_m)>60||Number(row.gps_accuracy_m)<0)return 'GPS accuracy must be 60 m or better';
    const observed=Date.parse(String(row.evidence?.observed_at||''));
    if(row.evidence?.observation_time_source!=='device_reported_gnss'||row.evidence?.observation_time_verified!==false||
       !Number.isFinite(observed)||observed>Date.now()+300000||observed<Date.now()-30*86400000)return 'Recent device capture time required';
    const lat1=Number(row.latitude)*Math.PI/180,lat2=Number(row.place.latitude)*Math.PI/180;
    const dLat=lat2-lat1,dLng=(Number(row.place.longitude)-Number(row.longitude))*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    if(!Number.isFinite(a)||2*6371000*Math.asin(Math.sqrt(a))>1000)return 'Observed point over 1 km from selected place';
    return null;
  };

  const load=useCallback(async()=>{
    setBusy('load');setNotice('');
    const [a,t,auth]=await Promise.all([
      supabase.from('afat_access_evidence_submissions').select('id,profile_id,place_id,suggested_access_type,name,instructions,latitude,longitude,gps_accuracy_m,created_at,evidence,place:afat_places(canonical_name,latitude,longitude,status)').eq('status','pending').order('created_at',{ascending:true}).limit(50),
      supabase.from('afat_transit_observations').select('id,city_key,observation_type,node_name,line_name,direction_label,mode,latitude,longitude,wait_seconds,travel_seconds,fare_xaf,gps_accuracy_m,created_at,evidence').eq('status','pending').order('created_at',{ascending:true}).limit(50),
      supabase.auth.getUser(),
    ]);
    setBusy('');
    if(a.error||t.error||auth.error||!auth.data.user){setNotice(a.error?.message||t.error?.message||auth.error?.message||'Reviewer identity unavailable.');return;}
    setReviewerId(auth.data.user.id);
    setAccess((a.data||[]) as AccessRow[]);setTransit((t.data||[]) as TransitRow[]);
  },[]);
  useEffect(()=>{void load();},[load]);

  const reviewAccess=async(id:string,decision:'accept'|'reject')=>{
    const row=access.find(item=>item.id===id);
    if(!row||!reviewerId||row.profile_id===reviewerId||decision==='accept'&&accessReviewIssue(row)){
      setNotice(row?accessReviewIssue(row)||'Independent reviewer required':'Access observation is no longer in this queue.');return;
    }
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
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{access.length===0?<p className="rounded-xl border border-white/5 p-4 text-xs text-white/35">No pending entrance evidence.</p>:access.map(row=><article key={row.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-white">{row.name||row.suggested_access_type.replace(/_/g,' ')}</p><p className="mt-1 text-[9px] text-white/40">{row.place?.canonical_name||'Unknown place'} · {row.suggested_access_type} · GPS {row.gps_accuracy_m==null?'unknown':`±${Math.round(Number(row.gps_accuracy_m))} m`} · submitted {new Date(row.created_at).toLocaleString()}</p>{row.instructions&&<p className="mt-2 text-[10px] leading-5 text-white/55">{row.instructions}</p>}<p className="mt-2 text-[10px] text-amber-200">{accessReviewIssue(row)||`Device-reported capture ${new Date(String(row.evidence?.observed_at)).toLocaleString()} · verify the entrance before accepting as limited evidence`}</p><p className="mt-2 font-mono text-[8px] text-white/25">{Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}</p></div><div className="flex gap-1"><button onClick={()=>void reviewAccess(row.id,'accept')} disabled={busy===row.id||Boolean(accessReviewIssue(row))} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300 text-slate-950 disabled:opacity-40" title="Accept as limited evidence"><Check className="h-4 w-4"/></button><button onClick={()=>void reviewAccess(row.id,'reject')} disabled={busy===row.id||!reviewerId||row.profile_id===reviewerId} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/55 disabled:opacity-40" title="Reject"><X className="h-4 w-4"/></button></div></div></article>)}</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-violet-100"><Bus className="h-4 w-4"/>Transit observations</p><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-white/45">{transit.length} pending</span></div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{transit.length===0?<p className="rounded-xl border border-white/5 p-4 text-xs text-white/35">No pending transit observations.</p>:transit.map(row=><article key={row.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-white">{row.node_name||row.line_name||row.observation_type.replace(/_/g,' ')}</p><p className="mt-1 text-[9px] text-white/40">{row.observation_type} · {row.mode||'mode not supplied'} · {new Date(row.created_at).toLocaleString()}</p>{row.line_name&&row.node_name&&<p className="mt-1 text-[10px] text-white/55">Line: {row.line_name}</p>}<div className="mt-2 flex flex-wrap gap-1">{row.fare_xaf!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">{row.fare_xaf} XAF</span>}{row.wait_seconds!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">wait {Math.round(row.wait_seconds/60)} min</span>}{row.gps_accuracy_m!=null&&<span className="rounded-full bg-white/5 px-2 py-1 text-[8px] text-white/50">GPS ±{Math.round(Number(row.gps_accuracy_m))} m</span>}</div></div><div className="flex gap-1"><button onClick={()=>void reviewTransit(row.id,'accept')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300 text-slate-950 disabled:opacity-40" title="Accept reviewed evidence"><Check className="h-4 w-4"/></button><button onClick={()=>void reviewTransit(row.id,'reject')} disabled={busy===row.id} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/55 disabled:opacity-40" title="Reject"><X className="h-4 w-4"/></button></div></div></article>)}</div>
      </div>
    </div>
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default EvidenceReviewQueue;
