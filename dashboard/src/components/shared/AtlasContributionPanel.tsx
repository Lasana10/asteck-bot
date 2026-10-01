import React, { useEffect, useRef, useState } from 'react';
import { CircleStop, CloudOff, MapPinned, Navigation, Radio, ShieldCheck, Crosshair } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  completeAtlasContributionSession,
  ingestAtlasContributionSample,
  startCityAtlasContributionSession,
  type AtlasContributionMode,
  type AtlasPrivacyMode,
} from '../../services/livingAtlasClient';
import { enqueueAtlasSample, flushAtlasSamples, pendingAtlasSamples } from '../../services/atlasContributionQueue';
import { useAfatLocale } from '../../localization';
import { decideSensing, readDeviceSensingContext, type SensingProfile } from '../../services/adaptiveSensing';

const MODES:Array<{value:AtlasContributionMode;label:string}>=[
  {value:'walk',label:'Walking'},{value:'moto',label:'Moto'},{value:'taxi',label:'Taxi'},
  {value:'car',label:'Car'},{value:'minibus',label:'Minibus'},{value:'bus',label:'Bus'},
  {value:'bike',label:'Bicycle'},{value:'delivery',label:'Delivery'},
];
type RecordingPhase='idle'|'waiting_gps'|'saving_first'|'recording'|'offline'|'error';

export function AtlasContributionPanel({defaultMode='walk'}:{defaultMode?:AtlasContributionMode}){
  const {t}=useAfatLocale();
  const [mode,setMode]=useState<AtlasContributionMode>(defaultMode);
  const [privacy,setPrivacy]=useState<AtlasPrivacyMode>('private_aggregate');
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [userId,setUserId]=useState<string|null>(null);
  const [captured,setCaptured]=useState(0);
  const [saved,setSaved]=useState(0);
  const [matched,setMatched]=useState(0);
  const [queued,setQueued]=useState(0);
  const [accuracy,setAccuracy]=useState<number|null>(null);
  const [phase,setPhase]=useState<RecordingPhase>('idle');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [sensingProfile,setSensingProfile]=useState<SensingProfile>('balanced');
  const [sensingReason,setSensingReason]=useState('balanced');
  const watchId=useRef<number|null>(null);
  const lastSentAt=useRef(0);
  const lastMatched=useRef<boolean|null>(null);
  const sessionStartedAt=useRef(0);
  const deviceContext=useRef<{batteryLevel:number|null;charging:boolean|null;connection:'slow'|'normal'|'fast'|'offline'}>({batteryLevel:null,charging:null,connection:'normal'});

  const stopWatcher=()=>{if(watchId.current!=null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId.current);watchId.current=null;}};

  useEffect(()=>{
    const handler=async()=>{
      if(!userId)return;
      const before=pendingAtlasSamples(userId,sessionId||undefined);
      await flushAtlasSamples(userId);
      const after=pendingAtlasSamples(userId,sessionId||undefined);
      setQueued(after);
      if(sessionId&&before>after){setSaved(v=>v+(before-after));setPhase('recording');setNotice('Connection restored. Queued movement evidence synchronized.');}
    };
    window.addEventListener('online',handler);
    return()=>{stopWatcher();window.removeEventListener('online',handler);};
  },[userId,sessionId]);

  const persistPosition=async(id:string,uid:string,position:GeolocationPosition,allowQueue=true)=>{
    const now=Date.now();
    const speedKph=Number.isFinite(position.coords.speed)?Number(position.coords.speed)*3.6:null;
    const decision=decideSensing({profile:sensingProfile,speedKph,accuracyM:position.coords.accuracy,matched:lastMatched.current,hidden:document.hidden,batteryLevel:deviceContext.current.batteryLevel,charging:deviceContext.current.charging,connection:navigator.onLine?deviceContext.current.connection:'offline',sessionMinutes:(now-sessionStartedAt.current)/60000});
    setSensingReason(decision.reason.join(' · ')||'balanced');
    if(lastSentAt.current&&now-lastSentAt.current<decision.minimumIntervalMs)return true;
    lastSentAt.current=now;
    setCaptured(v=>v+1);
    setAccuracy(position.coords.accuracy);
    const payload={sessionId:id,userId:uid,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyM:position.coords.accuracy,speedKph,heading:Number.isFinite(position.coords.heading)?position.coords.heading:null,recordedAt:new Date(position.timestamp||Date.now()).toISOString(),idempotencyKey:`${id}:${Math.round(position.timestamp||Date.now())}`};

    if(!navigator.onLine){
      if(!allowQueue)return false;
      enqueueAtlasSample(payload);setQueued(pendingAtlasSamples(uid,id));setPhase('offline');
      setNotice('GPS is working, but this point is only on this device until the connection returns.');
      window.dispatchEvent(new CustomEvent('afat:contribution-sample',{detail:{...payload,storage:'queued'}}));
      return false;
    }
    const {data:sample,error}=await ingestAtlasContributionSample(payload);
    if(error){
      if(allowQueue){enqueueAtlasSample(payload);setQueued(pendingAtlasSamples(uid,id));setPhase('offline');setNotice('GPS point captured but server save failed. AFAT queued it locally instead of pretending it was saved.');}
      return false;
    }
    setSaved(v=>v+1);
    lastMatched.current=sample?.match_state==='matched';
    if(lastMatched.current)setMatched(v=>v+1);
    setPhase('recording');
    window.dispatchEvent(new CustomEvent('afat:contribution-sample',{detail:{...payload,storage:'saved',matchState:sample?.match_state}}));
    return true;
  };

  const startWatcher=(id:string,uid:string)=>{
    stopWatcher();
    watchId.current=navigator.geolocation.watchPosition(
      position=>{void persistPosition(id,uid,position,true);},
      error=>{setPhase('error');setNotice(error.message||'GPS stopped. AFAT is not recording movement.');},
      {enableHighAccuracy:true,maximumAge:3000,timeout:20000},
    );
  };

  const begin=async()=>{
    if(!navigator.geolocation){setPhase('error');setNotice('Location is not available on this device.');return;}
    const auth=await supabase.auth.getUser();const uid=auth.data.user?.id;
    if(!uid){setNotice('Sign in before contributing movement.');return;}
    setUserId(uid);setBusy(true);setPhase('waiting_gps');setNotice('Waiting for a real GPS fix. Recording has not started yet.');
    deviceContext.current=await readDeviceSensingContext();

    navigator.geolocation.getCurrentPosition(async position=>{
      setAccuracy(position.coords.accuracy);setPhase('saving_first');setNotice(`GPS received (±${Math.round(position.coords.accuracy)} m). Saving the first point before AFAT calls this recording.`);
      const {data,error}=await startCityAtlasContributionSession({cityKey:'cm-yaounde',movementMode:mode,purpose:'community_movement',privacyMode:privacy,metadata:{source_surface:'living_atlas_workspace',offline_capable:true,adaptive_sensing:true,sensing_profile:sensingProfile}});
      if(error||!data?.id){setBusy(false);setPhase('error');setNotice(error?.message||'Could not create a contribution session. Nothing is being recorded.');return;}
      const id=String(data.id);setSessionId(id);setCaptured(0);setSaved(0);setMatched(0);setQueued(pendingAtlasSamples(uid,id));sessionStartedAt.current=Date.now();lastMatched.current=null;lastSentAt.current=0;
      const firstSaved=await persistPosition(id,uid,position,false);
      setBusy(false);
      if(!firstSaved){
        await completeAtlasContributionSession(id).catch(()=>null);
        setSessionId(null);setPhase('error');setNotice('AFAT received GPS but could not save the first point. Recording did not start.');
        return;
      }
      setNotice('Recording live. The first GPS point is saved in AFAT and the map will follow new saved movement.');
      startWatcher(id,uid);
    },error=>{setBusy(false);setPhase('error');setNotice(error.message||'AFAT could not obtain a GPS fix. Nothing was recorded.');},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  };

  const finish=async()=>{
    if(!sessionId||!userId)return;
    stopWatcher();setBusy(true);
    if(!navigator.onLine){setBusy(false);setPhase('offline');setNotice('Offline evidence is still on this device. Reconnect before finishing so AFAT can close the session safely.');return;}
    await flushAtlasSamples(userId);const remaining=pendingAtlasSamples(userId,sessionId);setQueued(remaining);
    if(remaining>0){setBusy(false);setPhase('offline');setNotice('Some captured points are still unsynchronized. AFAT will not mark this complete yet.');return;}
    const {data,error}=await completeAtlasContributionSession(sessionId);setBusy(false);
    if(error){setPhase('error');setNotice(error.message||'Could not finish contribution.');return;}
    setNotice(`Saved contribution: ${data?.sample_count??saved} server points · ${data?.matched_sample_count??matched} matched to known roads.`);
    window.dispatchEvent(new CustomEvent('afat:contribution-finished',{detail:{sessionId}}));
    setSessionId(null);setPhase('idle');
  };

  const phaseLabel={idle:'Ready',waiting_gps:'Waiting for GPS',saving_first:'Saving first point',recording:'Recording live',offline:'Captured locally',error:'Not recording'}[phase];

  return <section className="rounded-[1.5rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.08] to-slate-950/70 p-5 shadow-xl backdrop-blur-xl">
    <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">{t('atlas.title')}</p><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${phase==='recording'?'border-emerald-300/30 bg-emerald-400/10 text-emerald-100':phase==='error'?'border-rose-300/30 bg-rose-400/10 text-rose-100':'border-white/10 bg-white/5 text-white/50'}`}>{phaseLabel}</span></div><h2 className="mt-2 text-xl font-black">Improve AFAT while you move</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">AFAT only calls this recording after a GPS fix has been saved. Normal journeys can teach the map with your permission.</p></div><MapPinned className="h-6 w-6 shrink-0 text-cyan-200"/></div>
    {!sessionId&&phase!=='waiting_gps'&&phase!=='saving_first'&&<div className="mt-5 grid gap-3 sm:grid-cols-3">
      <label className="text-[10px] font-black uppercase tracking-wider text-white/45">How are you moving?<select value={mode} onChange={e=>setMode(e.target.value as AtlasContributionMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">{MODES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="text-[10px] font-black uppercase tracking-wider text-white/45">Privacy<select value={privacy} onChange={e=>setPrivacy(e.target.value as AtlasPrivacyMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="private_aggregate">{t('atlas.private')}</option><option value="trusted_review">{t('atlas.review')}</option><option value="public_mapping">{t('atlas.public')}</option></select></label>
      <label className="text-[10px] font-black uppercase tracking-wider text-white/45">Sensing<select value={sensingProfile} onChange={e=>setSensingProfile(e.target.value as SensingProfile)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="saver">Saver</option><option value="balanced">Balanced</option><option value="survey">Survey</option></select></label>
    </div>}
    {(sessionId||phase==='waiting_gps'||phase==='saving_first')&&<div className="mt-5 grid grid-cols-4 gap-3">
      <Stat icon={Crosshair} label="Captured" value={captured}/><Stat icon={Navigation} label="Saved" value={saved}/><Stat icon={Radio} label="Known road" value={matched}/><Stat icon={CloudOff} label="Offline" value={queued}/>
      <p className="col-span-4 text-[8px] font-black uppercase tracking-wider text-cyan-100/45">GPS {accuracy==null?'waiting':`±${Math.round(accuracy)} m`} · adaptive sensing · {sensingProfile} · {sensingReason}</p>
    </div>}
    <button onClick={sessionId?finish:begin} disabled={busy} className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-xs font-black disabled:opacity-40 ${sessionId?'bg-rose-400 text-slate-950':'bg-cyan-300 text-slate-950'}`}>{sessionId?<CircleStop className="h-4 w-4"/>:<Navigation className="h-4 w-4"/>}{sessionId?'Finish contribution':phase==='waiting_gps'?'Waiting for GPS…':phase==='saving_first'?'Saving first point…':'Start real recording'}</button>
    {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">{notice}</p>}
    {sessionId&&<p className="mt-2 text-[9px] text-white/35"><ShieldCheck className="mr-1 inline h-3 w-3"/>Unsaved captures are never counted as server evidence.</p>}
  </section>;
}
function Stat({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-cyan-200"/><p className="mt-2 text-lg font-black">{value}</p><p className="text-[7px] uppercase tracking-wider text-white/35">{label}</p></div>}
