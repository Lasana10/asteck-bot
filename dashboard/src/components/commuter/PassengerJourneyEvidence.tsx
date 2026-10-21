import React,{useEffect,useState} from 'react';
import {Camera,RefreshCw,ShieldCheck,WifiOff} from 'lucide-react';
import {FieldEvidenceCapture} from './FieldEvidenceCapture';
import {flushFieldObservations,pendingFieldObservations} from '../../services/fieldMappingQueue';
const VisualFieldMapper=React.lazy(()=>import('../shared/FieldMapper').then(module=>({default:module.FieldMapper})));
import {flushMobilityEvidenceQueue,installMobilityEvidenceSync,pendingMobilityEvidenceCount} from '../../services/mobilityEvidenceClient';
import {loadJourneyRuntime,reconcileJourneyRuntime,subscribeJourneyRuntime,type AfatJourneyRuntimeSnapshot} from '../../services/journeyRuntime';

/** One passenger handoff from physical journey → local receipts → server sync → reviewed Atlas.
 * A local receipt is NOT a server-confirmed arrival or verified entrance.
 */
export function PassengerJourneyEvidence({profileId,placeId,placeName,cityKey}:{
 profileId:string;placeId:string;placeName:string;cityKey:string;
}){
 const [runtime,setRuntime]=useState<AfatJourneyRuntimeSnapshot|null>(()=>loadJourneyRuntime());
 const [pending,setPending]=useState(()=>pendingMobilityEvidenceCount());
 const [photoPending,setPhotoPending]=useState(0);
 const [showVisualMapping,setShowVisualMapping]=useState(false);
 const [online,setOnline]=useState(()=>navigator.onLine);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
   const stopEvidence=installMobilityEvidenceSync();
   const stopRuntime=subscribeJourneyRuntime(snapshot=>setRuntime(snapshot));
   let mounted=true;
   const refreshVisual=()=>{void pendingFieldObservations(profileId).then(items=>{if(mounted)setPhotoPending(items.length);}).catch(()=>{});};
   const update=()=>{setOnline(navigator.onLine);setPending(pendingMobilityEvidenceCount());setRuntime(loadJourneyRuntime());refreshVisual();};
   const onQueue=()=>setPending(pendingMobilityEvidenceCount());
   const onVisual=()=>refreshVisual();
   window.addEventListener('online',update);
   window.addEventListener('offline',update);
   window.addEventListener('afat:evidence-queue',onQueue);
   window.addEventListener('afat:field-mapping-queue',onVisual);
   update();
   return()=>{mounted=false;stopEvidence();stopRuntime();window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('afat:evidence-queue',onQueue);window.removeEventListener('afat:field-mapping-queue',onVisual);};
 },[profileId]);
 const isOwner=!!profileId&&runtime?.profileId===profileId&&runtime?.placeId===placeId;
 const sync=async()=>{
  setBusy(true);setNotice('');
  try{
   if(!navigator.onLine){setNotice('Evidence remains on this device. Reconnect to send it safely.');return;}
   const result=await reconcileJourneyRuntime();
   const evidence=await flushMobilityEvidenceQueue();
   const visual=await flushFieldObservations(profileId);
   setPhotoPending(visual.pending);
   setPending(pendingMobilityEvidenceCount());
   setRuntime(result);
   const trip=(!isOwner||!result)?'No matching journey to reconcile':result.serverSyncState==='finished'?'Trip completion receipt confirmed':result.serverSyncState==='active'?'Navigation session and GPS replay checked':'Trip confirmation still pending';
   setNotice(`${trip} · ${evidence.synced} field submission(s) sent · ${evidence.pending} awaiting sync · ${visual.flushed} photo/landmark records sent · ${visual.pending} still on device. Submissions remain unverified until human review.`);
  }catch(e:any){setNotice(e?.message||'Server synchronization could not be verified. Local evidence is retained.');}
  finally{setBusy(false);}
 };
 return <div className="mt-4 space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Move → Learn · field handoff</p>
    <p className="mt-1 text-sm font-black text-white">Trip, entrance and informal transit evidence</p>
    <p className="mt-1 text-xs leading-5 text-white/55">Capture observations on-site, keep them locally without connectivity, and submit them for controlled review. GPS arrival is not automatic place verification.</p>
   </div>
   <span className="flex items-center gap-1.5 text-[10px] text-white/60">{online?<ShieldCheck className="h-3.5 w-3.5 text-emerald-300"/>:<WifiOff className="h-3.5 w-3.5 text-amber-200"/>}{online?'Connected':'Offline'}</span>
  </div>
  <div className="grid gap-2 sm:grid-cols-4">
   <p className="rounded-xl border border-white/10 p-3 text-[10px] text-white/70">Trip receipt: <strong className="block mt-1 text-white">{!isOwner?'No trip for this place':runtime?.serverSyncState==='finished'?'Server confirmed':runtime?.serverSyncState==='offline'?'Stored offline':runtime?.serverSyncState==='active'?'Server session active':'Pending confirmation'}</strong></p>
   <p className="rounded-xl border border-white/10 p-3 text-[10px] text-white/70">GPS samples awaiting sync: <strong className="block mt-1 text-white">{isOwner?runtime?.pendingSampleCount||0:0}</strong></p>
   <p className="rounded-xl border border-white/10 p-3 text-[10px] text-white/70">Field evidence awaiting sync: <strong className="block mt-1 text-white">{pending}</strong></p>
   <p className="rounded-xl border border-white/10 p-3 text-[10px] text-white/70">Geotagged photos / map observations: <strong className="block mt-1 text-white">{photoPending}</strong></p>
  </div>
  {online&&<button type="button" disabled={busy} onClick={()=>void sync()} className="flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 text-[10px] font-black text-cyan-100 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Check server receipts and send pending observations</button>}
  {notice&&<p role="status" className="text-[10px] leading-5 text-cyan-100/75">{notice}</p>}
  <FieldEvidenceCapture placeId={placeId} placeName={placeName} cityKey={cityKey}/>
  <button type="button" onClick={()=>setShowVisualMapping(v=>!v)} aria-expanded={showVisualMapping}
   className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 text-left text-[10px] font-black text-emerald-100">
   <span className="flex items-center gap-2"><Camera className="h-4 w-4"/>Capture a landmark, entrance or road-condition photo with GPS</span>
   <span>{showVisualMapping?'−':'+'}</span>
  </button>
  {showVisualMapping&&<React.Suspense fallback={<p className="text-xs text-white/50">Loading offline field mapper…</p>}>
   <VisualFieldMapper cityKey={cityKey} placeId={placeId} placeName={placeName}/>
  </React.Suspense>}
 </div>;
}
