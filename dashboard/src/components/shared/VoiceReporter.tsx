import React,{useEffect,useRef,useState} from 'react';
import {Mic,Square,CheckCircle2,AlertTriangle,X,MapPin} from 'lucide-react';
import {publishMapSignal} from '../../supabaseClient';
import {captureCurrentFieldGps} from '../../services/spatialPositioning';
import {TurnstileGate} from './TurnstileGate';

/**
 * Accessible voice-assisted field report. Browser speech recognition is only
 * transcription assistance, NOT a vetted AI classification or verified event.
 * A typed report works where SpeechRecognition is unavailable.
 * Audio is not uploaded or retained. The reviewed text and measured device
 * location go through the existing protected incident pipeline.
 */
export function VoiceReporter({profile,onClose}:{profile:any;onClose?:()=>void}){
 const recognition=useRef<any>(null);
 const [listening,setListening]=useState(false);
 const [transcript,setTranscript]=useState('');
 const [incidentType,setIncidentType]=useState('hazard');
 const [severity,setSeverity]=useState(3);
 const [turnstileToken,setTurnstileToken]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [serverReceipt,setServerReceipt]=useState<string|null>(null);
 const [speechAvailable,setSpeechAvailable]=useState(true);
 useEffect(()=>()=>{
   try{recognition.current?.stop?.();}catch{}
   recognition.current=null;
 },[]);
 const stop=()=>{
  try{recognition.current?.stop?.();}catch{}
  recognition.current=null;setListening(false);
 };
 const start=()=>{
  if(listening||busy)return;
  const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!Speech){
   setSpeechAvailable(false);
   setNotice('Voice transcription is unavailable in this browser. Type what you observed instead.');
   return;
  }
  try{
   const recognizer=new Speech();
   recognizer.continuous=true;
   recognizer.interimResults=false;
   recognizer.lang=navigator.language||'fr-CM';
   recognizer.onresult=(event:any)=>{
    const words=Array.from(event.results).slice(event.resultIndex)
      .filter((result:any)=>result.isFinal)
      .map((result:any)=>String(result?.[0]?.transcript||'').trim())
      .filter(Boolean).join(' ');
    if(words)setTranscript(prev=>[prev.trim(),words].filter(Boolean).join(' ').slice(0,1400));
   };
   recognizer.onerror=(event:any)=>{
    setListening(false);
    setNotice(event?.error==='not-allowed'?'Microphone access denied. You can type your report.':'Speech recognition stopped. Review or type your report.');
   };
   recognizer.onend=()=>{setListening(false);recognition.current=null;};
   recognition.current=recognizer;
   recognizer.start();
   setListening(true);
   setNotice('Listening locally. Review the transcript before sending; voice text is not independently verified.');
  }catch{
   setListening(false);
   setNotice('Speech recognition could not start. Type your report instead.');
  }
 };
 const send=async()=>{
  if(busy)return;
  const text=transcript.trim();
  if(!profile?.id){setNotice('Sign in before reporting an observed incident.');return;}
  if(text.length<12||text.length>1400){setNotice('Describe the observed incident in 12–1400 characters.');return;}
  if(!turnstileToken){setNotice('Complete the security challenge before sending.');return;}
  stop();setBusy(true);setNotice('Checking your live device location before submission…');
  try{
   const fix=await captureCurrentFieldGps();
   const {data,error}=await publishMapSignal({
    profile_id:profile.id,
    signal_type:'incident',incident_type:incidentType,
    description:text,severity,
    latitude:fix.latitude,longitude:fix.longitude,
    accuracy:fix.accuracyM,
    observation_time:new Date(fix.timestampMs).toISOString(),
    source:'app',actor_type:'voice_transcript_report',
    verification_hint:'pending',turnstileToken,
    device_os:'web',network_type:navigator.onLine?'online':'offline',
   });
   setTurnstileToken('');
   if(error)throw new Error(error.message||'The secured report was not accepted.');
   const reference=String(data?.incident?.id||'');
   if(!reference)throw new Error('No confirmed incident receipt returned. Do not claim it was saved.');
   setServerReceipt(reference);
   setNotice('Report stored as pending evidence for review. AFAT has not independently confirmed the incident or automatically broadcast an emergency.');
  }catch(error:any){
   setTurnstileToken('');
   setNotice(error?.message||'AFAT did not confirm that this report was saved.');
  }finally{setBusy(false);}
 };
 return <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/95 p-3 sm:p-6">
  <section role="dialog" aria-modal="true" aria-labelledby="afat-voice-report-title"
   className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-7">
   <header className="flex items-start justify-between gap-3">
    <div><p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Field safety · voice-assisted</p>
     <h2 id="afat-voice-report-title" className="mt-2 text-xl font-black">Report what you actually observed</h2>
     <p className="mt-2 text-xs leading-5 text-white/55">Speak or type in your language. Confirm the words yourself. No AI-generated accident or guessed location; microphone audio is not uploaded.</p></div>
    <button type="button" aria-label="Close voice report" onClick={()=>{stop();onClose?.();}} className="rounded-xl border border-white/10 p-2 text-white/70"><X className="h-5 w-5"/></button>
   </header>
   {serverReceipt?<div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4">
     <CheckCircle2 className="h-7 w-7 text-emerald-200"/><p className="mt-2 font-bold text-emerald-50">Received for human review</p>
     <p className="mt-2 text-xs text-white/70">{notice}</p><p className="mt-2 break-all text-[10px] text-white/40">Server incident reference: {serverReceipt}</p>
     <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-xl bg-emerald-300 px-5 text-xs font-black text-slate-950">Done</button>
   </div>:<div className="mt-6 space-y-4">
     <div className="flex items-center gap-3">
      <button type="button" onClick={()=>listening?stop():start()} disabled={busy}
       className={`flex min-h-12 items-center gap-2 rounded-xl border px-4 text-xs font-black disabled:opacity-40 ${listening?'border-red-400/35 bg-red-400/10 text-red-100':'border-cyan-300/25 bg-cyan-400/10 text-cyan-100'}`}>
       {listening?<><Square className="h-4 w-4"/>Stop listening</>:<><Mic className="h-4 w-4"/>Start speaking</>}</button>
      <span className="text-[10px] text-white/45">{listening?'Speech recognition active':speechAvailable?'Voice or keyboard':'Keyboard available'}</span>
     </div>
     <label className="block text-xs font-semibold text-white/75">Observed incident and your transcript
      <textarea rows={5} maxLength={1400} value={transcript} disabled={busy}
       onChange={e=>setTranscript(e.target.value)}
       placeholder="What happened? Where were you? Include useful context, without inventing details."
       className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white placeholder:text-white/30"/></label>
     <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-white/70">Incident type
       <select value={incidentType} disabled={busy} onChange={e=>setIncidentType(e.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-xs">
        <option value="hazard">Road hazard</option><option value="accident">Accident</option>
        <option value="traffic_jam">Traffic jam</option><option value="flooding">Flooding</option>
        <option value="road_works">Road works</option><option value="road_damage">Road damage</option>
       </select></label>
      <label className="block text-xs font-semibold text-white/70">Observed severity · {severity}/5
       <input type="range" min={1} max={5} value={severity} disabled={busy}
        onChange={e=>setSeverity(Number(e.target.value))}
        className="mt-4 w-full accent-amber-300"/></label>
     </div>
     <div className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0"/>AFAT requests a fresh, measured device GPS position only when you submit. This does not independently prove the incident location.</div>
     <TurnstileGate action="incident_report" onToken={setTurnstileToken}
      onExpire={()=>setTurnstileToken('')} className="rounded-xl border border-white/10 bg-black/20 p-3"/>
     {notice&&<div role="status" className="flex gap-2 rounded-xl border border-white/10 p-3 text-xs text-white/65"><AlertTriangle className="h-4 w-4 shrink-0"/>{notice}</div>}
     <button type="button" disabled={busy||listening||transcript.trim().length<12||!turnstileToken}
      onClick={()=>void send()} className="min-h-12 w-full rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-35">
       {busy?'Verifying GPS and submitting…':'Submit observed incident for review'}
     </button>
   </div>}
  </section>
 </div>;
}
