import React, { useEffect, useRef, useState } from 'react';
import { CircleStop, CloudOff, MapPinned, Navigation, Radio, ShieldCheck } from 'lucide-react';
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

const MODES:Array<{value:AtlasContributionMode;label:string}>=[
  {value:'walk',label:'Walking'},{value:'moto',label:'Moto'},{value:'taxi',label:'Taxi'},
  {value:'car',label:'Car'},{value:'minibus',label:'Minibus'},{value:'bus',label:'Bus'},
  {value:'bike',label:'Bicycle'},{value:'delivery',label:'Delivery'},
];

export function AtlasContributionPanel({defaultMode='walk'}:{defaultMode?:AtlasContributionMode}){
  const {t}=useAfatLocale();
  const [mode,setMode]=useState<AtlasContributionMode>(defaultMode);
  const [privacy,setPrivacy]=useState<AtlasPrivacyMode>('private_aggregate');
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [userId,setUserId]=useState<string|null>(null);
  const [samples,setSamples]=useState(0);
  const [matched,setMatched]=useState(0);
  const [queued,setQueued]=useState(0);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const watchId=useRef<number|null>(null);
  const lastSentAt=useRef(0);

  const stopWatcher=()=>{ if(watchId.current!=null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId.current);watchId.current=null;} };

  useEffect(()=>{
    const handler=()=>{ if(userId){ void flushAtlasSamples(userId).then(()=>setQueued(pendingAtlasSamples(userId,sessionId||undefined))); } };
    window.addEventListener('online',handler);
    return ()=>{stopWatcher();window.removeEventListener('online',handler);};
  },[userId,sessionId]);

  const begin=async()=>{
    if(!navigator.geolocation){setNotice('Location is not available on this device.');return;}
    const auth=await supabase.auth.getUser();
    const uid=auth.data.user?.id;
    if(!uid){setNotice('Sign in before contributing movement.');return;}
    setUserId(uid); setBusy(true); setNotice('');
    const {data,error}=await startCityAtlasContributionSession({
      cityKey:'cm-yaounde',movementMode:mode,purpose:'community_movement',privacyMode:privacy,
      metadata:{source_surface:'living_atlas_workspace',offline_capable:true},
    });
    setBusy(false);
    if(error||!data?.id){setNotice(error?.message||'Could not start contribution.');return;}
    const id=String(data.id); setSessionId(id); setSamples(0); setMatched(0); setQueued(pendingAtlasSamples(uid,id));
    setNotice('Contribution started. AFAT treats these points as evidence, never automatic map truth.');

    watchId.current=navigator.geolocation.watchPosition(async position=>{
      const now=Date.now(); if(now-lastSentAt.current<5000)return; lastSentAt.current=now;
      const payload={
        sessionId:id,userId:uid,latitude:position.coords.latitude,longitude:position.coords.longitude,
        accuracyM:position.coords.accuracy,
        speedKph:Number.isFinite(position.coords.speed)?Number(position.coords.speed)*3.6:null,
        heading:Number.isFinite(position.coords.heading)?position.coords.heading:null,
        recordedAt:new Date(position.timestamp).toISOString(),
        idempotencyKey:`${id}:${Math.round(position.timestamp)}`,
      };
      if(!navigator.onLine){
        enqueueAtlasSample(payload); setQueued(pendingAtlasSamples(uid,id)); setSamples(c=>c+1); return;
      }
      const {data:sample,error:sampleError}=await ingestAtlasContributionSample(payload);
      if(sampleError){
        enqueueAtlasSample(payload); setQueued(pendingAtlasSamples(uid,id));
        setNotice('Connection weakened. AFAT is keeping movement evidence on this device for replay.');
        return;
      }
      setSamples(c=>c+1); if(sample?.match_state==='matched')setMatched(c=>c+1);
    },error=>setNotice(error.message||'Location permission is required.'),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  };

  const finish=async()=>{
    if(!sessionId||!userId)return;
    stopWatcher(); setBusy(true);
    if(!navigator.onLine){setBusy(false);setNotice('Movement is saved on this device. Reconnect before finishing so AFAT can safely close the session.');return;}
    await flushAtlasSamples(userId); setQueued(pendingAtlasSamples(userId,sessionId));
    const {data,error}=await completeAtlasContributionSession(sessionId); setBusy(false);
    if(error){setNotice(error.message||'Could not finish contribution.');return;}
    setNotice(`Contribution saved: ${data?.sample_count??samples} points, ${data?.matched_sample_count??matched} matched to known Atlas roads.${data?.candidate_feature_id?' A possible unmapped segment is now waiting for corroboration.':''}`);
    setSessionId(null);
  };

  return <section className="rounded-[1.5rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.08] to-slate-950/70 p-5 shadow-xl backdrop-blur-xl">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">{t('atlas.title')}</p><h2 className="mt-2 text-xl font-black">{t('atlas.contribute')}</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">Works outside AFAT bookings. Good movement strengthens known roads; uncertain movement becomes reviewable evidence. Weak connectivity is queued locally and replayed after reconnection.</p></div><MapPinned className="h-6 w-6 shrink-0 text-cyan-200"/></div>
    {!sessionId&&<div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-[10px] font-black uppercase tracking-wider text-white/45">How are you moving?<select value={mode} onChange={e=>setMode(e.target.value as AtlasContributionMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">{MODES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="text-[10px] font-black uppercase tracking-wider text-white/45">Privacy<select value={privacy} onChange={e=>setPrivacy(e.target.value as AtlasPrivacyMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="private_aggregate">{t('atlas.private')}</option><option value="trusted_review">{t('atlas.review')}</option><option value="public_mapping">{t('atlas.public')}</option></select></label>
    </div>}
    {sessionId&&<div className="mt-5 grid grid-cols-4 gap-3">
      <Stat icon={Navigation} label="Points" value={samples}/><Stat icon={Radio} label="Known road" value={matched}/><Stat icon={ShieldCheck} label="Needs review" value={Math.max(0,samples-matched)}/><Stat icon={CloudOff} label="Offline queue" value={queued}/>
    </div>}
    <button onClick={sessionId?finish:begin} disabled={busy} className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-xs font-black disabled:opacity-40 ${sessionId?'bg-rose-400 text-slate-950':'bg-cyan-300 text-slate-950'}`}>{sessionId?<CircleStop className="h-4 w-4"/>:<Navigation className="h-4 w-4"/>}{sessionId?'Finish contribution':'Start contributing movement'}</button>
    {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">{notice}</p>}
  </section>;
}
function Stat({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-cyan-200"/><p className="mt-2 text-lg font-black">{value}</p><p className="text-[7px] uppercase tracking-wider text-white/35">{label}</p></div>}
