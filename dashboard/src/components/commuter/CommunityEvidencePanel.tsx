import React, { useState } from 'react';
import { Bus, LocateFixed, MapPin, Plus, X } from 'lucide-react';
import { discoverAfatPlaces } from '../../supabaseClient';
import type { AfatPlaceCandidate } from '../../supabaseClient';
import { submitAccessEvidence, submitTransitObservation } from '../../services/mobilityEvidenceClient';

type Mode = 'closed'|'entrance'|'transit';
type GpsFix = { latitude:number; longitude:number; accuracy:number };

function cityKey(profile:any) {
  const city=String(profile?.preferred_city||'yaounde').trim().toLowerCase().replace(/\s+/g,'-');
  return city.startsWith('cm-')?city:`cm-${city}`;
}

export function CommunityEvidencePanel({profile}:{profile:any}) {
  const [mode,setMode]=useState<Mode>('closed');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [fix,setFix]=useState<GpsFix|null>(null);
  const [query,setQuery]=useState('');
  const [places,setPlaces]=useState<AfatPlaceCandidate[]>([]);
  const [place,setPlace]=useState<AfatPlaceCandidate|null>(null);
  const [accessType,setAccessType]=useState<'pedestrian'|'vehicle'|'moto'|'delivery'|'transit'|'unknown'>('vehicle');
  const [instructions,setInstructions]=useState('');
  const [observationType,setObservationType]=useState<'stop'|'line'|'fare'|'wait'|'boarding'|'transfer'|'terminus'>('stop');
  const [nodeName,setNodeName]=useState('');
  const [lineName,setLineName]=useState('');
  const [transitMode,setTransitMode]=useState<'bus'|'minibus'|'shared_taxi'|'moto_taxi'|'other'>('minibus');
  const [fare,setFare]=useState('');
  const [waitMinutes,setWaitMinutes]=useState('');

  const locate=()=>{
    if(!navigator.geolocation){setNotice('Device GPS is unavailable. Entrance evidence requires a real position; transit notes can still be submitted without coordinates.');return;}
    setBusy(true);setNotice('Getting a current GPS fix…');
    navigator.geolocation.getCurrentPosition((position)=>{
      setBusy(false);
      const next={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};
      setFix(next);
      setNotice(`GPS ready · ±${Math.round(next.accuracy)} m. This remains submitted evidence until review.`);
    },(error)=>{
      setBusy(false);
      setNotice(error.code===1?'Location permission was denied.':'AFAT could not get a reliable current GPS fix.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:3000});
  };

  const searchPlaces=async()=>{
    if(query.trim().length<2)return;
    setBusy(true);setNotice('Finding the place…');
    const {data,error}=await discoverAfatPlaces({query:query.trim(),city:profile?.preferred_city||'yaounde',latitude:fix?.latitude,longitude:fix?.longitude,limit:8});
    setBusy(false);
    if(error){setNotice(error.message);return;}
    const results=(data?.results||[]) as AfatPlaceCandidate[];
    setPlaces(results);
    setNotice(results.length?'Choose the exact place whose entrance you are standing at.':'AFAT could not confirm that place. Search another name rather than attaching evidence to a guessed place.');
  };

  const submitEntrance=async()=>{
    if(!place){setNotice('Choose the exact AFAT place first.');return;}
    if(!fix){setNotice('Capture a current GPS fix at the entrance first.');return;}
    setBusy(true);
    const {data,error}=await submitAccessEvidence({
      placeId:place.id,
      accessType,
      latitude:fix.latitude,
      longitude:fix.longitude,
      name:`Observed ${accessType} access`,
      instructions:instructions.trim()||null,
      accessModes:accessType==='pedestrian'?['walk']:accessType==='moto'?['moto']:accessType==='delivery'?['moto','car','delivery']:accessType==='transit'?['walk','minibus']:accessType==='vehicle'?['car','moto','minibus']:[],
      gpsAccuracyM:fix.accuracy,
    });
    setBusy(false);
    if(error&&!data?.queued){setNotice(error.message);return;}
    setNotice(data?.queued?'Saved on this phone and queued for sync. It is not map truth yet.':'Entrance evidence submitted for review. It is not map truth yet.');
    setInstructions('');setFix(null);
  };

  const submitTransit=async()=>{
    const wait=waitMinutes.trim()?Math.round(Number(waitMinutes)*60):null;
    const fareXaf=fare.trim()?Math.round(Number(fare)):null;
    if(observationType==='fare'&&(!Number.isFinite(fareXaf)||Number(fareXaf)<0)){setNotice('Enter the observed fare in XAF.');return;}
    if(observationType==='wait'&&(!Number.isFinite(wait)||Number(wait)<0)){setNotice('Enter the observed wait in minutes.');return;}
    if(['stop','boarding','terminus','transfer'].includes(observationType)&&!nodeName.trim()){setNotice('Add the stop or boarding-point name/description.');return;}
    setBusy(true);
    const {data,error}=await submitTransitObservation({
      cityKey:cityKey(profile),observationType,nodeName:nodeName.trim()||null,lineName:lineName.trim()||null,mode:transitMode,
      latitude:fix?.latitude??null,longitude:fix?.longitude??null,gpsAccuracyM:fix?.accuracy??null,
      waitSeconds:Number.isFinite(wait)?wait:null,fareXaf:Number.isFinite(fareXaf)?fareXaf:null,
      evidence:{source_surface:'community_evidence_panel'},
    });
    setBusy(false);
    if(error&&!data?.queued){setNotice(error.message);return;}
    setNotice(data?.queued?'Transit observation saved offline and queued for sync.':'Transit observation submitted for review. It will not become a route or fare automatically.');
    setNodeName('');setLineName('');setFare('');setWaitMinutes('');
  };

  if(mode==='closed') return <section className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.045] p-4">
    <div className="flex items-center justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Improve this city</p><h3 className="mt-1 text-sm font-black text-white">Know an entrance or informal transport detail?</h3><p className="mt-1 text-[10px] leading-5 text-white/40">Add local evidence. AFAT reviews it before it can affect routing or map truth.</p></div><Plus className="h-5 w-5 text-emerald-200"/></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>{setMode('entrance');setNotice('');}} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black"><MapPin className="mr-2 inline h-4 w-4"/>Add entrance</button><button onClick={()=>{setMode('transit');setNotice('');}} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black"><Bus className="mr-2 inline h-4 w-4"/>Report transit</button></div>
  </section>;

  return <section className="rounded-2xl border border-emerald-300/15 bg-slate-950/80 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Community evidence</p><h3 className="mt-1 text-base font-black">{mode==='entrance'?'Add a real entrance':'Observe informal transport'}</h3><p className="mt-1 text-[10px] leading-5 text-white/40">Pending evidence only. AFAT does not promote your submission automatically.</p></div><button onClick={()=>{setMode('closed');setNotice('');}} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10"><X className="h-4 w-4"/></button></div>

    {mode==='entrance'?<div className="mt-4 space-y-3">
      <div className="flex gap-2"><input value={query} onChange={e=>{setQuery(e.target.value);setPlace(null);setPlaces([]);}} placeholder="Search the school, shop, market, building…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none"/><button onClick={searchPlaces} disabled={busy||query.trim().length<2} className="rounded-xl bg-emerald-300 px-4 text-[9px] font-black text-slate-950 disabled:opacity-40">Find</button></div>
      {!!places.length&&!place&&<div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">{places.map(item=><button key={item.id} onClick={()=>{setPlace(item);setQuery(item.name);setPlaces([]);}} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/5"><span className="font-bold">{item.name}</span><span className="ml-2 text-[9px] text-white/35">{item.city}</span></button>)}</div>}
      {place&&<p className="rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] p-3 text-xs text-cyan-50">Evidence will attach to <strong>{place.name}</strong>.</p>}
      <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={accessType} onChange={e=>setAccessType(e.target.value as any)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"><option value="vehicle">Vehicle gate</option><option value="pedestrian">Pedestrian entrance</option><option value="moto">Moto access</option><option value="delivery">Delivery entrance</option><option value="transit">Transit access</option><option value="unknown">Other access</option></select><input value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="e.g. blue gate after pharmacy, use right side" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/><button onClick={locate} disabled={busy} className="min-h-11 rounded-xl border border-white/10 px-3 text-[9px] font-black"><LocateFixed className="mr-2 inline h-4 w-4"/>{fix?`±${Math.round(fix.accuracy)}m`:'GPS'}</button></div>
      <button onClick={submitEntrance} disabled={busy||!place||!fix} className="min-h-12 w-full rounded-xl bg-emerald-300 text-xs font-black text-slate-950 disabled:opacity-35">Submit entrance for review</button>
    </div>:<div className="mt-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-3"><select value={observationType} onChange={e=>setObservationType(e.target.value as any)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"><option value="stop">Stop / pickup point</option><option value="line">Line / route</option><option value="fare">Fare</option><option value="wait">Wait time</option><option value="boarding">Boarding point</option><option value="transfer">Transfer</option><option value="terminus">Terminus</option></select><select value={transitMode} onChange={e=>setTransitMode(e.target.value as any)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs"><option value="minibus">Minibus</option><option value="shared_taxi">Shared taxi</option><option value="bus">Bus</option><option value="moto_taxi">Moto taxi</option><option value="other">Other</option></select><button onClick={locate} disabled={busy} className="min-h-11 rounded-xl border border-white/10 px-3 text-[9px] font-black"><LocateFixed className="mr-2 inline h-4 w-4"/>{fix?`±${Math.round(fix.accuracy)}m`:'Add GPS'}</button></div>
      <div className="grid gap-2 sm:grid-cols-2"><input value={nodeName} onChange={e=>setNodeName(e.target.value)} placeholder="Stop / landmark name" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/><input value={lineName} onChange={e=>setLineName(e.target.value)} placeholder="Line / direction people call it" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/></div>
      <div className="grid gap-2 sm:grid-cols-2"><input value={fare} onChange={e=>setFare(e.target.value)} inputMode="numeric" placeholder="Observed fare XAF (optional)" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/><input value={waitMinutes} onChange={e=>setWaitMinutes(e.target.value)} inputMode="decimal" placeholder="Observed wait minutes (optional)" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"/></div>
      <button onClick={submitTransit} disabled={busy} className="min-h-12 w-full rounded-xl bg-emerald-300 text-xs font-black text-slate-950 disabled:opacity-35">Submit transit observation</button>
    </div>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">{notice}</p>}
  </section>;
}
export default CommunityEvidencePanel;
