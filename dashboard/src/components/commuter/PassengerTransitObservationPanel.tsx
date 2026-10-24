import React,{useState} from 'react';
import {BusFront,LocateFixed,Send} from 'lucide-react';
import {captureCurrentFieldGps,type SpatialFix} from '../../services/spatialPositioning';
import {submitTransitObservation} from '../../services/mobilityEvidenceClient';
import {preparePassengerTransitObservation,type PassengerTransitDraft, type PassengerTransitMode,type TransitObservationType} from '../../services/passengerTransitEvidence';

const kinds:{value:TransitObservationType;label:string}[]=[
 {value:'stop',label:'Boarding stop / place'},{value:'boarding',label:'Boarding seen'},
 {value:'transfer',label:'Transfer point'},{value:'terminus',label:'Terminus / end point'},
];
const modes:{value:PassengerTransitMode;label:string}[]=[
 {value:'minibus',label:'Minibus'},{value:'shared_taxi',label:'Shared taxi'},
 {value:'bus',label:'Bus'},{value:'moto_taxi',label:'Moto taxi'},{value:'other',label:'Other transport'},
];
export function PassengerTransitObservationPanel({cityKey}:{cityKey:string}){
 const [draft,setDraft]=useState<PassengerTransitDraft>({
   cityKey,observationType:'stop',nodeName:'',lineName:'',directionLabel:'',mode:'minibus',notes:'',
 });
 const [fix,setFix]=useState<SpatialFix|null>(null);
 const [locating,setLocating]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const edit=<K extends keyof PassengerTransitDraft>(key:K,value:PassengerTransitDraft[K])=>{
   setDraft(previous=>({...previous,[key]:value}));setNotice('');
 };
 const capture=async()=>{
  setLocating(true);setNotice('');
  try{
   const observed=await captureCurrentFieldGps();
   if(observed.accuracyM==null||observed.accuracyM>50)throw Error('GPS accuracy exceeds 50 m. Move to an open area and retry.');
   setFix(observed);
   setNotice('Fresh device position captured (±'+Math.round(observed.accuracyM)+' m). Nothing has been submitted yet.');
  }catch(e:any){setFix(null);setNotice(String(e?.message||'Could not capture current device location.'));}
  finally{setLocating(false);}
 };
 const submit=async()=>{
  const review=preparePassengerTransitObservation({...draft,cityKey},fix);
  if(!review.ok){setNotice(review.message);return;}
  setBusy(true);setNotice('');
  try{
    const result=await submitTransitObservation(review.input);
    if(result.error){setNotice(result.error.message||'Could not save this observation.');return;}
    if((result.data as any)?.queued){
      setNotice('Saved on this device for later authenticated review-queue sync. Not an approved stop or active transit service.');
    }else if((result.data as any)?.status==='pending'&&(result.data as any)?.automatic_truth===false){
      setNotice('Observation received for staff review. AFAT has NOT activated a stop, route or timetable.');
    }else{
      setNotice('No trusted review receipt was received. AFAT has not accepted this observation.');
      return;
    }
    setFix(null);setDraft(previous=>({...previous,nodeName:'',lineName:'',directionLabel:'',notes:''}));
  }catch(e:any){setNotice(String(e?.message||'Could not submit transit evidence.'));}
  finally{setBusy(false);}
 };
 return <details className="mt-4 rounded-2xl border border-indigo-300/20 bg-indigo-400/[0.05] p-4">
  <summary className="cursor-pointer text-xs font-bold text-indigo-100"><BusFront className="mr-2 inline h-4 w-4"/>Help AFAT map a real transit stop</summary>
  <p className="mt-3 text-xs leading-5 text-white/55">Only report a boarding/transfer point you are physically observing. AFAT uses your current GPS only when you request it. Contributions are held for review, never published as verified transport or available rides automatically.</p>
  <div className="mt-3 grid gap-3 sm:grid-cols-2">
   <label className="text-[10px] text-white/70">What did you observe?
     <select value={draft.observationType} onChange={e=>edit('observationType',e.target.value as TransitObservationType)} className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm">
       {kinds.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
     </select>
   </label>
   <label className="text-[10px] text-white/70">Vehicle type
     <select value={draft.mode} onChange={e=>edit('mode',e.target.value as PassengerTransitMode)} className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm">
       {modes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
     </select>
   </label>
   <label className="text-[10px] text-white/70">Locally known stop name
     <input value={draft.nodeName} maxLength={100} onChange={e=>edit('nodeName',e.target.value)} placeholder="Name people actually use" className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm"/>
   </label>
   <label className="text-[10px] text-white/70">Route or line name (optional)
     <input value={draft.lineName} maxLength={100} onChange={e=>edit('lineName',e.target.value)} placeholder="If observed" className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm"/>
   </label>
   <label className="text-[10px] text-white/70">Direction (optional)
     <input value={draft.directionLabel} maxLength={100} onChange={e=>edit('directionLabel',e.target.value)} placeholder="Observed direction" className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm"/>
   </label>
   <label className="text-[10px] text-white/70">Field note (optional)
     <input value={draft.notes} maxLength={240} onChange={e=>edit('notes',e.target.value)} placeholder="Real details, not a prediction" className="mt-1 w-full min-h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm"/>
   </label>
  </div>
  <div className="mt-4 flex flex-wrap gap-2">
    <button type="button" disabled={locating||busy} onClick={capture} className="min-h-11 rounded-xl border border-indigo-300/25 bg-indigo-300/10 px-4 text-[10px] font-bold text-indigo-100 disabled:opacity-40"><LocateFixed className="mr-2 inline h-4 w-4"/>{locating?'Checking GPS…':fix?'Refresh current GPS':'Capture actual stop GPS'}</button>
    <button type="button" disabled={busy||locating||!fix} onClick={submit} className="min-h-11 rounded-xl bg-indigo-200 px-4 text-[10px] font-bold text-slate-950 disabled:opacity-40"><Send className="mr-2 inline h-4 w-4"/>{busy?'Sending…':'Submit for review'}</button>
  </div>
  {fix&&<p className="mt-2 text-[11px] text-indigo-100/70">Device GPS ±{Math.round(fix.accuracyM||0)} m · expires for submission 2 minutes after capture. AFAT will not auto-verify.</p>}
  {notice&&<p role="status" className="mt-3 text-xs leading-5 text-indigo-100">{notice}</p>}
 </details>;
}
