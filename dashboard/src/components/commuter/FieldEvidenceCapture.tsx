import React, { useState } from 'react';
import { Bus, DoorOpen, LocateFixed, Send, X } from 'lucide-react';
import { submitAccessEvidence, submitTransitObservation } from '../../services/mobilityEvidenceClient';

type Fix = { latitude:number; longitude:number; accuracy:number };
type Mode = 'entrance' | 'transit';

export function FieldEvidenceCapture({ placeId, placeName, cityKey='cm-yaounde' }:{ placeId:string; placeName?:string|null; cityKey?:string }) {
  const [mode,setMode]=useState<Mode|null>(null);
  const [fix,setFix]=useState<Fix|null>(null);
  const [locating,setLocating]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [accessType,setAccessType]=useState<'pedestrian'|'vehicle'|'moto'|'delivery'|'transit'|'unknown'>('pedestrian');
  const [name,setName]=useState('');
  const [instructions,setInstructions]=useState('');
  const [transitType,setTransitType]=useState<'stop'|'line'|'fare'|'wait'|'boarding'|'transfer'|'terminus'>('stop');
  const [lineName,setLineName]=useState('');
  const [nodeName,setNodeName]=useState('');
  const [fare,setFare]=useState('');
  const [waitMinutes,setWaitMinutes]=useState('');

  const locate=()=>{
    if(!navigator.geolocation){setNotice('This device cannot provide GPS. AFAT will not invent coordinates for field evidence.');return;}
    setLocating(true); setNotice('Getting a field GPS fix…');
    navigator.geolocation.getCurrentPosition((position)=>{
      const next={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};
      setFix(next); setLocating(false);
      setNotice(`GPS fix ready · ±${Math.round(next.accuracy)} m. This remains pending evidence until reviewed.`);
    },(error)=>{
      setLocating(false);
      setNotice(error.code===1?'Location permission is required for field evidence.':'AFAT could not obtain a reliable GPS fix. Try again outdoors or closer to the place.');
    },{enableHighAccuracy:true,timeout:15000,maximumAge:3000});
  };

  const submitEntrance=async()=>{
    if(!fix){setNotice('Capture a real GPS fix at the entrance or access point first.');return;}
    setBusy(true);
    const result=await submitAccessEvidence({
      placeId,
      accessType,
      latitude:fix.latitude,
      longitude:fix.longitude,
      name:name.trim()||`${placeName||'Place'} access`,
      instructions:instructions.trim()||null,
      accessModes:accessType==='pedestrian'?['walk']:accessType==='vehicle'?['car','moto']:accessType==='moto'?['moto']:accessType==='delivery'?['delivery','moto','car']:accessType==='transit'?['minibus','walk']:[],
      gpsAccuracyM:fix.accuracy,
    });
    setBusy(false);
    if(result.error && !(result.data as any)?.queued){setNotice(result.error.message||'Evidence could not be saved.');return;}
    const queued=Boolean((result.data as any)?.queued);
    setNotice(queued?'Saved offline. AFAT will sync this entrance evidence when connectivity returns.':'Entrance evidence submitted for review. It is not treated as verified map truth yet.');
    setName('');setInstructions('');setFix(null);
  };

  const submitTransit=async()=>{
    if(!fix && ['stop','boarding','transfer','terminus'].includes(transitType)){setNotice('Capture a real GPS fix for this transit location first.');return;}
    const fareValue=fare.trim()?Math.round(Number(fare)):null;
    const waitValue=waitMinutes.trim()?Math.round(Number(waitMinutes)*60):null;
    if(fareValue!=null && (!Number.isFinite(fareValue)||fareValue<0)){setNotice('Enter a valid observed fare.');return;}
    if(waitValue!=null && (!Number.isFinite(waitValue)||waitValue<0)){setNotice('Enter a valid observed wait.');return;}
    setBusy(true);
    const result=await submitTransitObservation({
      cityKey,
      observationType:transitType,
      nodeName:nodeName.trim()||placeName||null,
      lineName:lineName.trim()||null,
      mode:'minibus',
      latitude:fix?.latitude??null,
      longitude:fix?.longitude??null,
      gpsAccuracyM:fix?.accuracy??null,
      fareXaf:fareValue,
      waitSeconds:waitValue,
      evidence:{ place_id:placeId, place_name:placeName||null, source_surface:'reachability_evidence_capture' },
    });
    setBusy(false);
    if(result.error && !(result.data as any)?.queued){setNotice(result.error.message||'Transit evidence could not be saved.');return;}
    const queued=Boolean((result.data as any)?.queued);
    setNotice(queued?'Saved offline. AFAT will sync this transit observation when connectivity returns.':'Transit observation submitted for review. It will not become a stop, line or fare until reviewed.');
    setLineName('');setNodeName('');setFare('');setWaitMinutes('');setFix(null);
  };

  if(!mode) return <div className="mt-3 flex flex-wrap gap-2">
    <button type="button" onClick={()=>setMode('entrance')} className="flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] px-3 text-[9px] font-black uppercase text-emerald-100"><DoorOpen className="h-3.5 w-3.5"/>Verify an entrance</button>
    <button type="button" onClick={()=>setMode('transit')} className="flex min-h-10 items-center gap-2 rounded-xl border border-violet-300/15 bg-violet-400/[0.06] px-3 text-[9px] font-black uppercase text-violet-100"><Bus className="h-3.5 w-3.5"/>Add transit evidence</button>
  </div>;

  return <section className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[8px] font-black uppercase tracking-wider text-white/35">Help AFAT know this place</p><p className="mt-1 text-xs font-black text-white">{mode==='entrance'?'Entrance / access evidence':'Transit observation'}</p></div><button type="button" onClick={()=>{setMode(null);setNotice('');setFix(null);}} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/45"><X className="h-3.5 w-3.5"/></button></div>

    <button type="button" onClick={locate} disabled={locating} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] px-3 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-40"><LocateFixed className={`h-3.5 w-3.5 ${locating?'animate-pulse':''}`}/>{fix?`GPS ±${Math.round(fix.accuracy)} m`:'Capture current GPS'}</button>

    {mode==='entrance'?<div className="mt-3 grid gap-2 sm:grid-cols-2">
      <select value={accessType} onChange={e=>setAccessType(e.target.value as any)} className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"><option value="pedestrian">Pedestrian gate</option><option value="vehicle">Vehicle entrance</option><option value="moto">Moto access</option><option value="delivery">Delivery entrance</option><option value="transit">Transit access</option><option value="unknown">Other / unknown</option></select>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Gate / entrance name (optional)" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/>
      <input value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="How to find or enter it" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none sm:col-span-2"/>
      <button type="button" onClick={submitEntrance} disabled={busy||!fix} className="min-h-10 rounded-xl bg-emerald-300 px-3 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35 sm:col-span-2"><span className="inline-flex items-center gap-2"><Send className="h-3.5 w-3.5"/>Submit pending evidence</span></button>
    </div>:<div className="mt-3 grid gap-2 sm:grid-cols-2">
      <select value={transitType} onChange={e=>setTransitType(e.target.value as any)} className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"><option value="stop">Observed stop</option><option value="boarding">Boarding point</option><option value="terminus">Terminus</option><option value="transfer">Transfer point</option><option value="line">Line / route</option><option value="fare">Observed fare</option><option value="wait">Observed wait</option></select>
      <input value={nodeName} onChange={e=>setNodeName(e.target.value)} placeholder="Stop / place name" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/>
      <input value={lineName} onChange={e=>setLineName(e.target.value)} placeholder="Line / destination board" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/>
      <input value={fare} onChange={e=>setFare(e.target.value)} inputMode="numeric" placeholder="Observed fare XAF" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/>
      <input value={waitMinutes} onChange={e=>setWaitMinutes(e.target.value)} inputMode="decimal" placeholder="Observed wait minutes" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/>
      <button type="button" onClick={submitTransit} disabled={busy} className="min-h-10 rounded-xl bg-violet-300 px-3 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35 sm:col-span-2"><span className="inline-flex items-center gap-2"><Send className="h-3.5 w-3.5"/>Submit pending observation</span></button>
    </div>}

    {notice&&<p role="status" className="mt-3 text-[10px] leading-4 text-white/55">{notice}</p>}
    <p className="mt-2 text-[9px] leading-4 text-white/30">Submissions are evidence, not automatic map truth. AFAT keeps provenance and review state before promotion.</p>
  </section>;
}

export default FieldEvidenceCapture;
