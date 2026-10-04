import React, { useState } from 'react';
import { CheckCircle, LocateFixed, PackageCheck, Search, Send } from 'lucide-react';
import { discoverAfatPlaces } from '../../supabaseClient';
import type { AfatPlaceCandidate } from '../../supabaseClient';
import { createServiceRequest, submitOwnServiceRequestForDispatch } from '../../services/serviceRequestClient';

type PickupFix = { latitude:number; longitude:number; accuracy:number };

export function DeliveryRequestPanel({profile,onCreated}:{profile:any;onCreated?:()=>void}) {
  const [open,setOpen]=useState(false);
  const [origin,setOrigin]=useState('');
  const [destination,setDestination]=useState('');
  const [dropoff,setDropoff]=useState<AfatPlaceCandidate|null>(null);
  const [suggestions,setSuggestions]=useState<AfatPlaceCandidate[]>([]);
  const [packages,setPackages]=useState(1);
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [locating,setLocating]=useState(false);
  const [resolving,setResolving]=useState(false);
  const [pickupFix,setPickupFix]=useState<PickupFix|null>(null);
  const [notice,setNotice]=useState('');

  const city=String(profile?.preferred_city||'yaounde');
  const cityKey=(()=>{const preferred=city.trim().toLowerCase().replace(/\s+/g,'-');return preferred.startsWith('cm-')?preferred:`cm-${preferred}`;})();

  const locatePickup=()=>{
    if(!navigator.geolocation){setNotice('Device location is unavailable. You can still enter a pickup landmark, but dispatch will wait for location resolution.');return;}
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

  const resolveDropoff=async()=>{
    const query=destination.trim();
    if(query.length<2){setNotice('Enter at least two characters for the delivery destination.');return;}
    setResolving(true);setNotice('Finding the real destination…');setDropoff(null);
    const {data,error}=await discoverAfatPlaces({query,city,latitude:pickupFix?.latitude,longitude:pickupFix?.longitude,limit:8});
    setResolving(false);
    if(error){setSuggestions([]);setNotice('AFAT could not resolve that destination right now. The request can still be saved for review.');return;}
    const results=(data?.results||[]) as AfatPlaceCandidate[];
    setSuggestions(results);
    if(results.length===1){setDropoff(results[0]);setDestination(results[0].name);setNotice(`Destination selected: ${results[0].name}.`);}
    else setNotice(results.length?'Choose the exact destination below so AFAT does not dispatch to a guessed place.':'No safe AFAT match yet. The request can be created, but dispatch will wait for location review.');
  };

  const chooseDropoff=(place:AfatPlaceCandidate)=>{
    setDropoff(place);setDestination(place.name);setSuggestions([]);
    setNotice(`Destination selected: ${place.name}. AFAT will use its current source-backed coordinates for this request.`);
  };

  const submit=async()=>{
    if(!origin.trim()||!destination.trim()) {setNotice('Add both pickup and delivery destination.');return;}
    setBusy(true); setNotice('Creating the governed delivery request…');
    const {data,error}=await createServiceRequest({
      serviceType:'delivery',origin:origin.trim(),destination:destination.trim(),
      pickupLatitude:pickupFix?.latitude??null,pickupLongitude:pickupFix?.longitude??null,
      dropoffLatitude:dropoff?.latitude??null,dropoffLongitude:dropoff?.longitude??null,
      passengerCount:0,packageCount:Math.max(1,packages),notes:notes.trim()||null,
      contactName:profile?.full_name||null,contactPhone:profile?.phone||null,
      metadata:{
        city_key:cityKey,source_surface:'passenger_delivery',pickup_accuracy_m:pickupFix?.accuracy??null,
        pickup_source:pickupFix?'gps':'text_landmark',dropoff_place_id:dropoff?.id||null,
        dropoff_place_ref:dropoff?.place_ref||null,dropoff_confidence:dropoff?.confidence??null,automatic_truth:false,
      },
    });
    if(error){setBusy(false);setNotice(error.message);return;}

    let dispatch:any=null;
    if(data?.id&&pickupFix&&dropoff?.latitude!=null&&dropoff?.longitude!=null){
      const queued=await submitOwnServiceRequestForDispatch(String(data.id));
      if(!queued.error) dispatch=queued.data;
    }
    setBusy(false);
    if(dispatch?.dispatch_created||dispatch?.assignment_id){
      setNotice('Delivery request created and submitted to AFAT dispatch. An operator will appear only after a real verified assignment exists.');
    }else{
      setNotice('Delivery request created. Pickup or destination still needs location resolution before AFAT can put it into dispatch.');
    }
    setOrigin('');setDestination('');setNotes('');setPackages(1);setPickupFix(null);setDropoff(null);setSuggestions([]);
    onCreated?.();
  };

  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] px-4 text-left">
    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><PackageCheck className="h-4 w-4"/></span><span><span className="block text-xs font-black">Send an item</span><span className="mt-1 block text-[10px] text-white/35">Create one traceable AFAT delivery request from pickup to recipient.</span></span></span><Send className="h-4 w-4 text-white/40"/>
  </button>;

  return <section className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-violet-200">AFAT Deliver</p><h3 className="mt-1 text-lg font-black">Move an item from A to B</h3><p className="mt-1 text-xs leading-5 text-white/40">Pickup, assignment, collection, delivery proof and recipient confirmation remain one auditable request. Creating it does not pretend an operator is already assigned.</p></div><button onClick={()=>setOpen(false)} className="text-[9px] font-black uppercase text-white/40">Close</button></div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[9px] font-black uppercase text-white/35">Pickup
        <div className="mt-2 flex gap-2"><input value={origin} onChange={e=>{setOrigin(e.target.value);if(e.target.value!=='My current location')setPickupFix(null);}} placeholder="Pickup place or landmark" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/><button type="button" onClick={locatePickup} disabled={locating} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-violet-100 disabled:opacity-40" aria-label="Use current pickup location"><LocateFixed className={`h-4 w-4 ${locating?'animate-pulse':''}`}/></button></div>
        <span className="mt-1 block text-[8px] normal-case text-white/25">{pickupFix?`GPS ±${Math.round(pickupFix.accuracy)} m`:'Text-only pickup will need location resolution before dispatch.'}</span>
      </label>

      <label className="text-[9px] font-black uppercase text-white/35">Deliver to
        <div className="mt-2 flex gap-2"><input value={destination} onChange={e=>{setDestination(e.target.value);setDropoff(null);setSuggestions([]);}} placeholder="Destination place or landmark" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/><button type="button" onClick={resolveDropoff} disabled={resolving} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-violet-100 disabled:opacity-40" aria-label="Resolve delivery destination"><Search className={`h-4 w-4 ${resolving?'animate-pulse':''}`}/></button></div>
        <span className="mt-1 flex items-center gap-1 text-[8px] normal-case text-white/25">{dropoff?<><CheckCircle className="h-3 w-3 text-emerald-300"/>AFAT destination selected</>:'Choose a result before dispatch if possible.'}</span>
      </label>
    </div>

    {!!suggestions.length&&<div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
      {suggestions.map(place=><button key={place.id} type="button" onClick={()=>chooseDropoff(place)} className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 text-left"><span className="block text-xs font-black text-white">{place.name}</span><span className="mt-1 block text-[9px] text-white/35">{place.zone_label||place.city||'AFAT place'} · {Math.round(Number(place.confidence||0))}% match</span></button>)}
    </div>}

    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
      <label className="text-[9px] font-black uppercase text-white/35">Packages<input type="number" min={1} max={20} value={packages} onChange={e=>setPackages(Math.max(1,Number(e.target.value)||1))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      <label className="text-[9px] font-black uppercase text-white/35">Instructions<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Recipient, entrance or handling instructions" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
    </div>
    <button onClick={submit} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-violet-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{busy?'Creating delivery…':'Request delivery'}</button>
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default DeliveryRequestPanel;
