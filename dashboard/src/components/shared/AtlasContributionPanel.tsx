import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleStop, CloudOff, Crosshair, MapPinned, Navigation, Radio, ShieldCheck, Signal, Trash2, WifiOff } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  cancelAtlasContributionSession,
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
        await cancelAtlasContributionSession(id,'first_sample_not_saved').catch(()=>null);
        setSessionId(null);setPhase('error');setNotice('AFAT received GPS but could not save the first point. The empty session was discarded; recording did not start.');
        return;
      }
      setNotice('Recording live. The first GPS point is saved and the map can now follow new saved movement.');
      startWatcher(id,uid);
    },error=>{setBusy(false);setPhase('error');setNotice(error.message||'AFAT could not obtain a GPS fix. Nothing was recorded.');},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  };

  const finish=async()=>{
    if(!sessionId||!userId)return;
    stopWatcher();setBusy(true);
    if(!navigator.onLine){setBusy(false);setPhase('offline');setNotice('Offline evidence is still on this device. Reconnect before finishing so AFAT can close the session safely.');return;}
    await flushAtlasSamples(userId);const remaining=pendingAtlasSamples(userId,sessionId);setQueued(remaining);
    if(remaining>0){setBusy(false);setPhase('offline');setNotice('Some captured points are still unsynchronized. AFAT will not mark this complete yet.');return;}
    if(saved<=0){
      await cancelAtlasContributionSession(sessionId,'finish_requested_without_saved_samples').catch(()=>null);
      setBusy(false);setSessionId(null);setPhase('error');setNotice('No server evidence was saved, so AFAT discarded the session instead of calling it complete.');return;
    }
    const {data,error}=await completeAtlasContributionSession(sessionId);setBusy(false);
    if(error){setPhase('error');setNotice(error.message||'Could not finish contribution.');return;}
    setNotice(`Saved contribution: ${data?.sample_count??saved} server points · ${data?.matched_sample_count??matched} matched to known roads.`);
    window.dispatchEvent(new CustomEvent('afat:contribution-finished',{detail:{sessionId}}));
    setSessionId(null);setPhase('idle');
  };

  const cancel=async()=>{
    if(!sessionId)return;
    stopWatcher();setBusy(true);
    const id=sessionId;
    const {data,error}=await cancelAtlasContributionSession(id,'user_cancelled');
    setBusy(false);
    if(error){setPhase('error');setNotice(error.message||'AFAT could not discard this contribution yet.');return;}
    setSessionId(null);setPhase('idle');
    setNotice(`Contribution discarded${Number(data?.sample_count||saved)>0?' with saved points preserved as discarded evidence context':''}. AFAT did not mark the session complete.`);
    window.dispatchEvent(new CustomEvent('afat:contribution-cancelled',{detail:{sessionId:id,sampleCount:data?.sample_count??saved}}));
  };

  const phaseLabel={idle:'Ready',waiting_gps:'Waiting for GPS',saving_first:'Saving first point',recording:'Recording live',offline:'Captured locally',error:'Not recording'}[phase];
  const live=sessionId||phase==='waiting_gps'||phase==='saving_first';
  const savedRatio=useMemo(()=>captured>0?Math.min(100,Math.round((saved/captured)*100)):0,[captured,saved]);
  const matchedRatio=useMemo(()=>saved>0?Math.min(100,Math.round((matched/saved)*100)):0,[matched,saved]);

  return <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#050b12] shadow-[0_24px_70px_rgba(0,0,0,.32)]">
    <div className="relative p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/65">{t('atlas.title')}</p>
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider ${phase==='recording'?'border-emerald-300/25 bg-emerald-400/10 text-emerald-100':phase==='offline'?'border-amber-300/25 bg-amber-400/10 text-amber-100':phase==='error'?'border-rose-300/25 bg-rose-400/10 text-rose-100':'border-white/10 bg-white/5 text-white/50'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${phase==='recording'?'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.85)]':phase==='offline'?'bg-amber-300':phase==='error'?'bg-rose-300':'bg-white/35'}`}/>{phaseLabel}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">Teach AFAT by moving normally</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/48">A contribution only becomes evidence after AFAT has a real GPS fix and successfully saves the point. Captured, saved and road-matched are kept separate.</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10"><MapPinned className="h-5 w-5 text-cyan-200"/></div>
      </div>

      {!live&&<div className="relative mt-5 grid gap-3 sm:grid-cols-3">
        <Field label="Movement"><select value={mode} onChange={e=>setMode(e.target.value as AtlasContributionMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none">{MODES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
        <Field label="Privacy"><select value={privacy} onChange={e=>setPrivacy(e.target.value as AtlasPrivacyMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none"><option value="private_aggregate">{t('atlas.private')}</option><option value="trusted_review">{t('atlas.review')}</option><option value="public_mapping">{t('atlas.public')}</option></select></Field>
        <Field label="Sensing"><select value={sensingProfile} onChange={e=>setSensingProfile(e.target.value as SensingProfile)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none"><option value="saver">Saver</option><option value="balanced">Balanced</option><option value="survey">Survey</option></select></Field>
      </div>}

      {live&&<div className="relative mt-5 rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {phase==='offline'?<WifiOff className="h-4 w-4 text-amber-300"/>:<Signal className={`h-4 w-4 ${phase==='recording'?'text-emerald-300':'text-cyan-300'}`}/>} 
            <p className="text-sm font-black text-white">{phase==='recording'?'AFAT is receiving real movement':phase==='offline'?'Capturing locally until connection returns':'Establishing evidence stream'}</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] font-bold text-white/55">GPS {accuracy==null?'waiting':`±${Math.round(accuracy)} m`}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric icon={Crosshair} label="Captured" value={captured} detail="device fixes"/>
          <Metric icon={Navigation} label="Saved" value={saved} detail={`${savedRatio}% of captures`}/>
          <Metric icon={Radio} label="Road matched" value={matched} detail={`${matchedRatio}% of saved`}/>
          <Metric icon={CloudOff} label="Waiting sync" value={queued} detail={queued?'kept on device':'nothing pending'}/>
        </div>

        <div className="mt-4 space-y-2">
          <Progress label="Saved evidence" value={savedRatio}/>
          <Progress label="Known-road match" value={matchedRatio}/>
        </div>
        <p className="mt-3 text-[9px] leading-4 text-white/35">Adaptive sensing · {sensingProfile} · {sensingReason}</p>
      </div>}

      <div className={`relative mt-5 grid gap-2 ${sessionId?'sm:grid-cols-[1fr_auto]':''}`}>
        <button onClick={sessionId?finish:begin} disabled={busy} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black transition disabled:opacity-40 ${sessionId?'border border-emerald-300/20 bg-emerald-400/12 text-emerald-100':'bg-cyan-300 text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,.18)]'}`}>
          {sessionId?<CircleStop className="h-4 w-4"/>:<Navigation className="h-4 w-4"/>}{sessionId?'Finish and verify saved evidence':phase==='waiting_gps'?'Waiting for GPS…':phase==='saving_first'?'Saving first point…':'Start real recording'}
        </button>
        {sessionId&&<button onClick={cancel} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 text-xs font-black text-rose-100 disabled:opacity-40"><Trash2 className="h-4 w-4"/>Discard</button>}
      </div>

      {notice&&<div className="relative mt-3 flex items-start gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/58"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200"/><p>{notice}</p></div>}
      {sessionId&&<p className="relative mt-2 text-[9px] text-white/32">Unsaved captures are never counted as server evidence. Discarding never marks a contribution complete.</p>}
    </div>
  </section>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-[9px] font-black uppercase tracking-wider text-white/38">{label}{children}</label>}
function Metric({icon:Icon,label,value,detail}:{icon:React.ElementType;label:string;value:number;detail:string}){return <div><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-cyan-200"/><p className="text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div><p className="mt-1 text-2xl font-black text-white">{value}</p><p className="text-[9px] text-white/30">{detail}</p></div>}
function Progress({label,value}:{label:string;value:number}){return <div><div className="mb-1 flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-white/35"><span>{label}</span><span>{value}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></div>}
