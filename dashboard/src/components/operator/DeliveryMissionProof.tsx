import React, { useEffect, useState } from 'react';
import { CheckCircle2, PackageCheck, ShieldCheck, TriangleAlert } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { performDeliveryAction } from '../../services/deliveryExecutionClient';

export function DeliveryMissionProof({ assignment, onChanged }: { assignment: any; onChanged?: () => void }) {
  const [request,setRequest]=useState<any|null>(null);
  const [code,setCode]=useState('');
  const [reason,setReason]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  const load=async()=>{
    if(!assignment?.id&&!assignment?.service_request_id) return;
    let query=supabase.from('service_requests').select('id,status,service_type,origin,destination,package_count,contact_name,contact_phone,notes,metadata,dispatch_assignment_id');
    query=assignment?.service_request_id?query.eq('id',assignment.service_request_id):query.eq('dispatch_assignment_id',assignment.id);
    const {data,error}=await query.eq('service_type','delivery').maybeSingle();
    if(error){setNotice(error.message);return;}
    setRequest(data||null);
  };
  useEffect(()=>{void load();},[assignment?.id,assignment?.service_request_id]);

  if(!request) return null;
  const picked=request.status==='in_progress';
  const completed=request.status==='completed';
  const terminal=['completed','failed','cancelled'].includes(String(request.status));

  const act=async(action:'pickup'|'deliver'|'fail')=>{
    if(action!=='fail'&&!code.trim()){setNotice(action==='pickup'?'Enter the sender pickup code.':'Enter the recipient delivery code.');return;}
    if(action==='fail'&&!reason.trim()){setNotice('Add the reason this delivery could not be completed.');return;}
    setBusy(true);setNotice('');
    const run=async(position?:GeolocationPosition)=>{
      const {data,error}=await performDeliveryAction({
        requestId:request.id,action,code:action==='fail'?null:code.trim(),reason:action==='fail'?reason.trim():null,
        latitude:position?.coords.latitude??null,longitude:position?.coords.longitude??null,accuracyM:position?.coords.accuracy??null,
      });
      setBusy(false);
      if(error){setNotice(error.message);return;}
      setCode('');setReason('');setNotice(action==='pickup'?'Pickup confirmed. The item is now in transit.':action==='deliver'?'Recipient confirmed delivery. Mission proof is complete.':'Delivery moved to failed with the reason recorded.');
      await load();onChanged?.();
      return data;
    };
    if(navigator.geolocation){navigator.geolocation.getCurrentPosition(position=>void run(position),()=>void run(),{enableHighAccuracy:true,timeout:10000,maximumAge:5000});}
    else await run();
  };

  return <section className="rounded-[1.5rem] border border-violet-300/15 bg-violet-400/[0.06] p-5 shadow-xl backdrop-blur-xl">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-200/75">AFAT Deliver proof</p><h2 className="mt-2 text-xl font-black">{request.origin||'Pickup'} → {request.destination||'Recipient'}</h2><p className="mt-1 text-xs text-white/45">{request.package_count||1} package{Number(request.package_count||1)===1?'':'s'} · recipient {request.contact_name||'not named'}</p></div>
      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-black uppercase text-white/55">{String(request.status).replace(/_/g,' ')}</span>
    </div>

    {!terminal&&<div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300"/><p className="text-xs font-black">{picked?'Recipient confirmation':'Sender pickup confirmation'}</p></div>
      <p className="mt-1 text-[10px] leading-5 text-white/40">{picked?'Ask the intended recipient for the private delivery code. AFAT will not complete this request without it.':'Ask the sender for the pickup code. AFAT will not move the item into transit without it.'}</p>
      <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={12} placeholder={picked?'Recipient code':'Pickup code'} className="mt-3 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 font-mono text-base font-black uppercase tracking-[0.18em] outline-none"/>
      <button onClick={()=>act(picked?'deliver':'pickup')} disabled={busy} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40"><PackageCheck className="h-4 w-4"/>{busy?'Checking proof…':picked?'Confirm recipient & complete':'Verify pickup & start delivery'}</button>
    </div>}

    {!terminal&&<details className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3"><summary className="cursor-pointer text-[9px] font-black uppercase text-amber-200/70">Cannot complete delivery</summary><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="What happened?" className="mt-3 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs outline-none"/><button onClick={()=>act('fail')} disabled={busy} className="mt-2 flex min-h-10 items-center gap-2 rounded-xl border border-amber-300/20 px-3 text-[9px] font-black uppercase text-amber-100 disabled:opacity-40"><TriangleAlert className="h-3.5 w-3.5"/>Record failure</button></details>}
    {completed&&<p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/10 p-3 text-xs font-bold text-emerald-100"><CheckCircle2 className="h-4 w-4"/>Recipient code verified. Delivery completion is evidence-backed.</p>}
    {request.notes&&<p className="mt-3 text-xs leading-5 text-white/45">Instructions: {request.notes}</p>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default DeliveryMissionProof;
