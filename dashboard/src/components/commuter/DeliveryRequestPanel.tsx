import React, { useState } from 'react';
import { LocateFixed, PackageCheck, Send } from 'lucide-react';
import { createServiceRequest } from '../../services/serviceRequestClient';

type PickupFix = { latitude:number; longitude:number; accuracy:number };

export function DeliveryRequestPanel({profile,onCreated}:{profile:any;onCreated?:()=>void}) {
  const [open,setOpen]=useState(false);
  const [origin,setOrigin]=useState('');
  const [destination,setDestination]=useState('');
  const [packages,setPackages]=useState(1);
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [locating,setLocating]=useState(false);
  const [pickupFix,setPickupFix]=useState<PickupFix|null>(null);
  const [notice,setNotice]=useState('');

  const locatePickup=()=>{
    if(!navigator.geolocation){setNotice('Device location is unavailable. You can still enter a pickup landmark.');return;}
    setLocating(true); setNotice('Locating pickup…');
    navigator.geolocation.getCurrentPosition((position)=>{
      setLocating(false);
      const fix={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};
      setPickupFix(fix);
      if(!origin.trim()) setOrigin('My current location');
      setNotice(`Pickup GPS ready · ±${Math.round(fix.accuracy)} m. AFAT keeps this as request evidence, not map truth.`);
    },(error)=>{
      setLocating(false);
      setNotice(error.code===1?'Location permission was denied. Enter a pickup landmark instead.':'AFAT could not get a reliable pickup position. Enter a landmark instead.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:5000});
  };

  const submit=async()=>{
    if(!origin.trim()||!destination.trim()) {
      setNotice('Add both pickup and delivery destination.');
      return;
    }
    setBusy(true); setNotice('Creating the governed delivery request…');
    const preferred=String(profile?.preferred_city||'yaounde').trim().toLowerCase().replace(/\s+/g,'-');
    const cityKey=preferred.startsWith('cm-')?preferred:`cm-${preferred}`;
    const {data,error}=await createServiceRequest({
      serviceType:'delivery',
      origin:origin.trim(),
      destination:destination.trim(),
      pickupLatitude:pickupFix?.latitude??null,
      pickupLongitude:pickupFix?.longitude??null,
      passengerCount:0,
      packageCount:Math.max(1,packages),
      notes:notes.trim()||null,
      contactName:profile?.full_name||null,
      contactPhone:profile?.phone||null,
      metadata:{
        city_key:cityKey,
        source_surface:'passenger_delivery',
        pickup_accuracy_m:pickupFix?.accuracy??null,
        pickup_source:pickupFix?'gps':'text_landmark',
        automatic_truth:false,
      },
    });
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setNotice(`Delivery request ${data?.id?String(data.id).slice(0,8):''} created and queued. AFAT will show an operator only after a real verified assignment exists.`);
    setOrigin(''); setDestination(''); setNotes(''); setPackages(1); setPickupFix(null);
    onCreated?.();
  };

  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] px-4 text-left">
    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><PackageCheck className="h-4 w-4"/></span><span><span className="block text-xs font-black">Send an item</span><span className="mt-1 block text-[10px] text-white/35">Create one traceable AFAT delivery request from pickup to recipient.</span></span></span>
    <Send className="h-4 w-4 text-white/40"/>
  </button>;

  return <section className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-violet-200">AFAT Deliver</p><h3 className="mt-1 text-lg font-black">Move an item from A to B</h3><p className="mt-1 text-xs leading-5 text-white/40">Pickup, assignment, collection, delivery proof and recipient confirmation remain one auditable request. Creating it does not pretend an operator is already assigned.</p></div><button onClick={()=>setOpen(false)} className="text-[9px] font-black uppercase text-white/40">Close</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[9px] font-black uppercase text-white/35">Pickup
        <div className="mt-2 flex gap-2"><input value={origin} onChange={e=>{setOrigin(e.target.value);if(e.target.value!=='My current location')setPickupFix(null);}} placeholder="Pickup place or landmark" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/><button type="button" onClick={locatePickup} disabled={locating} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-violet-100 disabled:opacity-40" aria-label="Use current pickup location"><LocateFixed className={`h-4 w-4 ${locating?'animate-pulse':''}`}/></button></div>
      </label>
      <label className="text-[9px] font-black uppercase text-white/35">Deliver to<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Recipient place or landmark" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
      <label className="text-[9px] font-black uppercase text-white/35">Packages<input type="number" min={1} max={20} value={packages} onChange={e=>setPackages(Math.max(1,Number(e.target.value)||1))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      <label className="text-[9px] font-black uppercase text-white/35">Instructions<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Recipient, entrance or handling instructions" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
    </div>
    <button onClick={submit} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-violet-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{busy?'Creating delivery…':'Request delivery'}</button>
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default DeliveryRequestPanel;
