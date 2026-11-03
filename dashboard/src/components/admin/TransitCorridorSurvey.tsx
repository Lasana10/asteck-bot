import React, { useEffect, useState } from 'react';
import { Bus, LocateFixed, Send, ShieldCheck } from 'lucide-react';
import { submitTransitObservation,flushMobilityEvidenceQueue,pendingMobilityEvidenceCount } from '../../services/mobilityEvidenceClient';
import { captureCurrentFieldGps, evaluateSpatialFix, type SpatialFix } from '../../services/spatialPositioning';
import {readCorridorSurveyDraft,writeCorridorSurveyDraft,clearCorridorSurveyDraft} from '../../services/transitCorridorSurveyDraft';

type TransitMode='bus'|'minibus'|'shared_taxi'|'moto_taxi'|'ferry'|'rail'|'other';

/** Record real successive stops as pending field evidence. Nothing promotes itself. */
export function TransitCorridorSurvey({cityKey}: {cityKey:string}) {
  const [lineName,setLineName]=useState('');
  const [direction,setDirection]=useState('');
  const [mode,setMode]=useState<TransitMode>('minibus');
  const [nodeName,setNodeName]=useState('');
  const [position,setPosition]=useState('0');
  const [fix,setFix]=useState<SpatialFix|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [submitted,setSubmitted]=useState(0);
  const [queued,setQueued]=useState(()=>pendingMobilityEvidenceCount());
  const [syncing,setSyncing]=useState(false);
  useEffect(()=>{
    const update=()=>setQueued(pendingMobilityEvidenceCount());
    window.addEventListener('afat:evidence-queue',update);
    return ()=>window.removeEventListener('afat:evidence-queue',update);
  },[]);
  const syncEvidence=async()=>{
    if(syncing)return;
    setSyncing(true);
    setNotice('');
    try {
      const result=await flushMobilityEvidenceQueue();
      setQueued(result.pending);
      setNotice(result.synced>0
        ?`${result.synced} observation(s) acknowledged by AFAT's independent review queue; ${result.pending} still pending on this device. None is automatically accepted.`
        :result.pending>0
          ?'Evidence is still queued. Reconnect and check your signed-in account to retry; no field observation is claimed reviewed.'
          :'No unsent field evidence remains under the signed-in account. Previously submitted observations still require independent review.');
    } catch(error:any){
      setNotice(error?.message||'Evidence replay could not be confirmed. Local unsent entries are preserved.');
    } finally {setSyncing(false);}
  };
  const [restoredCity,setRestoredCity]=useState<string|null>(null);
  useEffect(()=>{
    setRestoredCity(null);
    const storage=typeof window==='undefined'?null:window.sessionStorage;
    const draft=readCorridorSurveyDraft(cityKey,storage);
    setLineName(draft?.lineName||'');
    setDirection(draft?.direction||'');
    setMode(draft?.mode||'minibus');
    setPosition(draft?.position||'0');
    setNodeName('');setFix(null);setSubmitted(0);
    setRestoredCity(cityKey);
  },[cityKey]);
  useEffect(()=>{
    if(restoredCity!==cityKey)return;
    const storage=typeof window==='undefined'?null:window.sessionStorage;
    if(!lineName.trim()&&!direction.trim()&&position==='0'){
      clearCorridorSurveyDraft(cityKey,storage);return;
    }
    writeCorridorSurveyDraft({cityKey,lineName,direction,mode,position},storage);
  },[restoredCity,cityKey,lineName,direction,mode,position]);

  const capture=async()=>{
    setBusy(true);setNotice('');setFix(null);
    try {
      const reading=await captureCurrentFieldGps();
      if(reading.accuracyM==null||reading.accuracyM>60) {
        setNotice('This route survey requires GPS accuracy within 60 metres. Find a clearer outdoor position.');
        return;
      }
      setFix(reading);
      setNotice(`Real GPS fix ready (±${Math.round(reading.accuracyM)} m). Submit promptly at this actual stop.`);
    }catch(error:any){setNotice(error?.message||'Could not capture your current GPS position.');}
    finally{setBusy(false);}
  };

  const save=async()=>{
    const sequence=Number(position);
    if(!lineName.trim()||!direction.trim()||!nodeName.trim()) {
      setNotice('Line, travel direction and observed stop name are required.');return;
    }
    if(!Number.isSafeInteger(sequence)||sequence<0||sequence>10000||!/^\d+$/.test(position.trim())){
      setNotice('Stop order must be a whole number between 0 and 10000.');return;
    }
    if(!fix){setNotice('Capture a fresh GPS fix at this actual stop first.');return;}
    const decision=evaluateSpatialFix(fix,null,Date.now());
    if(!decision.accepted||Date.now()-fix.timestampMs>30000||fix.accuracyM==null||fix.accuracyM>60){
      setFix(null);setNotice('GPS expired or became unreliable. Capture again at the current stop.');return;
    }
    setBusy(true);setNotice('');
    try {
      const result=await submitTransitObservation({
        cityKey,observationType:'stop',
        nodeName:nodeName.trim(),lineName:lineName.trim(),
        directionLabel:direction.trim(),mode,
        latitude:fix.latitude,longitude:fix.longitude,
        gpsAccuracyM:fix.accuracyM,
        observedAt:new Date(fix.timestampMs).toISOString(),
        evidence:{stop_sequence:sequence,source_surface:'city_transit_corridor_survey',
          human_observed:true,independent_review_required:true},
      });
      if(result.error){setNotice(result.error.message||'Transit stop evidence could not be saved.');return;}
      const offline=Boolean((result.data as {queued?:boolean}|null)?.queued);
      setSubmitted(n=>n+1);
      setQueued(pendingMobilityEvidenceCount());
      setPosition(String(sequence+1));setNodeName('');setFix(null);
      setNotice(offline
        ?'Stop saved locally for later authenticated submission. It is not approved map data.'
        :'Stop submitted to the independent review queue. It is not approved map data.');
    }catch(error:any){setNotice(error?.message||'Could not save stop evidence.');}
    finally{setBusy(false);}
  };

  return <section className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-400/[0.04] p-4" aria-label="City transit corridor survey">
    <div className="flex items-start gap-3">
      <Bus className="mt-1 h-5 w-5 text-violet-200"/>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-violet-200">City route field mission</p>
        <h3 className="mt-1 text-sm font-black">Record actual stops in travel order</h3>
        <p className="mt-1 text-xs leading-5 text-white/55">Survey one real line and direction at a time. AFAT will keep route context between stops, but each location needs a fresh GPS fix. Another authorized reviewer must approve each observation before it influences navigation.</p>
      </div>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input aria-label="Observed route or line" value={lineName} onChange={e=>setLineName(e.target.value)} maxLength={120} placeholder="Line / route name" className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"/>
      <input aria-label="Observed route direction" value={direction} onChange={e=>setDirection(e.target.value)} maxLength={120} placeholder="Travel direction / terminus" className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"/>
      <select aria-label="Transport mode" value={mode} onChange={e=>setMode(e.target.value as TransitMode)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs">
        <option value="minibus">Minibus</option><option value="bus">Bus</option><option value="shared_taxi">Shared taxi</option><option value="moto_taxi">Motorcycle taxi</option>
        <option value="rail">Rail</option><option value="ferry">Ferry</option><option value="other">Other</option>
      </select>
      <input aria-label="Observed stop name" value={nodeName} onChange={e=>setNodeName(e.target.value)} maxLength={120} placeholder="Actual stop name" className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"/>
      <input aria-label="Stop number along line" value={position} onChange={e=>setPosition(e.target.value)} inputMode="numeric" placeholder="Order (0, 1, 2…)" className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"/>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={()=>void capture()} disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/10 px-4 text-xs font-bold text-violet-100 disabled:opacity-40">
        <LocateFixed className="h-4 w-4"/>{fix?`GPS ±${Math.round(fix.accuracyM||0)} m`:'Capture stop GPS'}
      </button>
      <button type="button" onClick={()=>void save()} disabled={busy||!fix}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">
        <Send className="h-4 w-4"/>Save pending stop
      </button>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] text-white/40">Line, direction, mode and next stop order are kept in this tab for reload recovery. GPS, stop name and personal data are never saved in the draft.</p>
      <button type="button" onClick={()=>{
        clearCorridorSurveyDraft(cityKey,typeof window==='undefined'?null:window.sessionStorage);
        setLineName('');setDirection('');setMode('minibus');setPosition('0');setNodeName('');setFix(null);
        setNotice('Survey draft cleared. Previously submitted evidence remains in its review queue.');
      }} disabled={busy} className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] font-bold text-white/60 disabled:opacity-40">
        Start another line
      </button>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] p-3">
      <p className="text-[10px] text-white/55">Unsent field evidence on this device, for the current authenticated account: <strong>{queued}</strong>. Server acknowledgment means pending human review, not map acceptance.</p>
      <button type="button" disabled={syncing||busy} onClick={()=>void syncEvidence()} className="min-h-10 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 text-[10px] font-black text-cyan-100 disabled:opacity-40">
        {syncing?'Checking server receipts…':'Sync pending evidence'}
      </button>
    </div>
    {notice&&<p role="status" className="mt-2 text-[11px] leading-5 text-white/65">{notice}</p>}
    <div className="mt-3 flex items-center gap-2 text-[10px] text-white/45">
      <ShieldCheck className="h-4 w-4"/>Submitted this session: {submitted} · independently reviewed: not inferred
    </div>
  </section>;
}
