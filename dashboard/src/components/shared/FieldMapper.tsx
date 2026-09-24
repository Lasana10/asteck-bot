import React, { useEffect, useState } from 'react';
import { Camera, Crosshair, MapPinPlus, Navigation } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAfatLocale } from '../../localization';
import { flushFieldObservations, pendingFieldObservations, queueFieldObservation } from '../../services/fieldMappingQueue';

const TYPES=[
 ['entrance','Entrance'],['landmark','Landmark'],['informal_stop','Informal stop'],['pickup_point','Pickup point'],
 ['local_name','Local name'],['mode_access','Mode access'],['road_surface','Road surface'],['road_condition','Road condition'],
 ['missing_path','Missing path'],['missing_road','Missing road'],['restriction','Restriction'],
] as const;

export function FieldMapper({cityKey='cm-yaounde',defaultMode='walk'}:{cityKey?:string;defaultMode?:string}){
 const {t}=useAfatLocale();
 const [type,setType]=useState<string>('entrance'); const [label,setLabel]=useState(''); const [description,setDescription]=useState('');
 const [mode,setMode]=useState(defaultMode); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const [photo,setPhoto]=useState<File|null>(null); const [userId,setUserId]=useState<string|null>(null); const [pending,setPending]=useState(0);
 useEffect(()=>{const onOnline=()=>{if(userId)void flushFieldObservations(userId).then(x=>setPending(x.pending));};window.addEventListener('online',onOnline);return()=>window.removeEventListener('online',onOnline);},[userId]);
 const submit=()=>{
  if(!navigator.geolocation){setNotice('Location is not available on this device.');return;}
  setBusy(true);setNotice('');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const user=(await supabase.auth.getUser()).data.user;
    if(!user){setBusy(false);setNotice('Sign in before adding field evidence.');return;}
    setUserId(user.id);
    const item={
      id:crypto.randomUUID(),userId:user.id,cityKey,type,latitude:pos.coords.latitude,longitude:pos.coords.longitude,
      accuracyM:pos.coords.accuracy,movementMode:mode||null,label:label||null,description:description||null,
      observedAt:new Date(pos.timestamp).toISOString(),photo,
    };
    try{
      await queueFieldObservation(item);
      if(navigator.onLine){
        const result=await flushFieldObservations(user.id);setPending(result.pending);
        setNotice(result.pending===0?'Field evidence synchronized safely.':'Evidence saved offline; some items are waiting to synchronize.');
      }else{
        const items=await pendingFieldObservations(user.id);setPending(items.length);
        setNotice('Field evidence and its photo are saved on this device and will synchronize after reconnection.');
      }
      setLabel('');setDescription('');setPhoto(null);
    }catch(error:any){setNotice(error?.message||'Could not save field evidence.');}
    setBusy(false);
  },err=>{setBusy(false);setNotice(err.message);},{enableHighAccuracy:true,timeout:20000,maximumAge:3000});
 };
 return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5">
   <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-300/10 p-2"><MapPinPlus className="h-5 w-5 text-emerald-200"/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">{t('atlas.fieldMapper')}</p><h2 className="mt-1 text-lg font-black">Add what the map is missing</h2><p className="mt-1 text-xs leading-5 text-white/45">Use this only when you deliberately notice something useful: an entrance, local name, pickup point, missing path, road condition or access rule. AFAT records it as evidence first.</p></div></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Observation<select value={type} onChange={e=>setType(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white">{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Mode<select value={mode} onChange={e=>setMode(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="walk">Walking</option><option value="moto">Moto</option><option value="taxi">Taxi</option><option value="car">Car</option><option value="minibus">Minibus</option><option value="bus">Bus</option><option value="bike">Bicycle</option></select></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Name / local label<input value={label} onChange={e=>setLabel(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white" placeholder="e.g. Carrefour Mvog-Mbi"/></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">What did you observe?<input value={description} onChange={e=>setDescription(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white" placeholder="Short field note"/></label>
   </div>
   <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-[9px] font-black uppercase text-white/55"><Camera className="h-4 w-4"/>{photo?photo.name:t('atlas.fieldPhoto')} · {pending} queued<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" className="hidden" onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
   <button onClick={submit} disabled={busy} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35"><Crosshair className="h-4 w-4"/>{busy?'Reading location…':t('atlas.recordPlace')}</button>
   {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55"><Navigation className="mr-2 inline h-4 w-4 text-emerald-200"/>{notice}</p>}
 </section>;
}
