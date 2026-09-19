import React, { useState } from 'react';
import { Camera, Crosshair, MapPinPlus, Navigation } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const TYPES=[
 ['entrance','Entrance'],['landmark','Landmark'],['informal_stop','Informal stop'],['pickup_point','Pickup point'],
 ['local_name','Local name'],['mode_access','Mode access'],['road_surface','Road surface'],['road_condition','Road condition'],
 ['missing_path','Missing path'],['missing_road','Missing road'],['restriction','Restriction'],
] as const;

export function FieldMapper({cityKey='cm-yaounde',defaultMode='walk'}:{cityKey?:string;defaultMode?:string}){
 const [type,setType]=useState<string>('entrance'); const [label,setLabel]=useState(''); const [description,setDescription]=useState('');
 const [mode,setMode]=useState(defaultMode); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const [photo,setPhoto]=useState<File|null>(null);
 const submit=()=>{
  if(!navigator.geolocation){setNotice('Location is not available on this device.');return;}
  setBusy(true); setNotice('');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const user=(await supabase.auth.getUser()).data.user;
    const mediaPaths:string[]=[];
    if(photo&&user){
      const safeName=photo.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${user.id}/${Date.now()}-${safeName}`;
      const upload=await supabase.storage.from('afat-field-evidence').upload(path,photo,{upsert:false,contentType:photo.type});
      if(upload.error){setBusy(false);setNotice(upload.error.message||'Photo upload failed.');return;}
      mediaPaths.push(path);
    }
    const {data,error}=await supabase.rpc('afat_submit_mapping_observation',{
      p_city_key:cityKey,p_observation_type:type,p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,
      p_accuracy_m:pos.coords.accuracy,p_movement_mode:mode||null,p_label:label||null,p_description:description||null,
      p_attributes:{device_heading:Number.isFinite(pos.coords.heading)?pos.coords.heading:null,has_photo:mediaPaths.length>0},p_media_paths:mediaPaths,p_observed_at:new Date(pos.timestamp).toISOString(),
    });
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setNotice(data?.matched_edge_id?'Saved and attached to the nearest Atlas road as reviewable evidence.':'Saved as field evidence. AFAT did not force it onto an existing road.');
    setLabel('');setDescription('');setPhoto(null);
  },err=>{setBusy(false);setNotice(err.message);},{enableHighAccuracy:true,timeout:20000,maximumAge:3000});
 };
 return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5">
   <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-300/10 p-2"><MapPinPlus className="h-5 w-5 text-emerald-200"/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Field Mapper</p><h2 className="mt-1 text-lg font-black">Record what the base map misses</h2><p className="mt-1 text-xs leading-5 text-white/45">Entrances, informal stops, pickup points, local names, missing paths, road surface and mode access are recorded as evidence first.</p></div></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Observation<select value={type} onChange={e=>setType(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white">{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Mode<select value={mode} onChange={e=>setMode(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="walk">Walking</option><option value="moto">Moto</option><option value="taxi">Taxi</option><option value="car">Car</option><option value="minibus">Minibus</option><option value="bus">Bus</option><option value="bike">Bicycle</option></select></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">Name / local label<input value={label} onChange={e=>setLabel(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white" placeholder="e.g. Carrefour Mvog-Mbi"/></label>
    <label className="text-[9px] font-black uppercase tracking-wider text-white/35">What did you observe?<input value={description} onChange={e=>setDescription(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white" placeholder="Short field note"/></label>
   </div>
   <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-[9px] font-black uppercase text-white/55"><Camera className="h-4 w-4"/>{photo?photo.name:'Add optional field photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" className="hidden" onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
   <button onClick={submit} disabled={busy} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35"><Crosshair className="h-4 w-4"/>{busy?'Reading location…':'Record this place'}</button>
   {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55"><Navigation className="mr-2 inline h-4 w-4 text-emerald-200"/>{notice}</p>}
 </section>;
}
