import React, { useState } from 'react';
import { PackageCheck, Send } from 'lucide-react';
import { createMobilityServiceRequest } from '../../services/dispatchClient';

export function DeliveryRequestPanel({profile,onCreated}:{profile:any;onCreated?:()=>void}) {
  const [open,setOpen]=useState(false);
  const [origin,setOrigin]=useState('');
  const [destination,setDestination]=useState('');
  const [packages,setPackages]=useState(1);
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const submit=async()=>{
    if(!origin.trim()||!destination.trim()) {
      setNotice('Add both pickup and delivery destination.');
      return;
    }
    setBusy(true); setNotice('');
    const preferred=String(profile?.preferred_city||'yaounde').trim().toLowerCase().replace(/\s+/g,'-');
    const cityKey=preferred.startsWith('cm-')?preferred:`cm-${preferred}`;
    const {data,error}=await createMobilityServiceRequest({
      service_type:'delivery',
      origin:origin.trim(),
      destination:destination.trim(),
      package_count:Math.max(1,packages),
      notes:notes.trim()||undefined,
      contact_name:profile?.full_name||undefined,
      contact_phone:profile?.phone||undefined,
      metadata:{city_key:cityKey,source_surface:'passenger_delivery',automatic_truth:false},
    });
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setNotice(data?.dispatch ? 'Delivery request created and entered AFAT dispatch.' : 'Delivery request created for operations review.');
    setOrigin(''); setDestination(''); setNotes(''); setPackages(1);
    onCreated?.();
  };

  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] px-4 text-left">
    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><PackageCheck className="h-4 w-4"/></span><span><span className="block text-xs font-black">Send an item</span><span className="mt-1 block text-[10px] text-white/35">Use the same AFAT reach + dispatch network for a delivery.</span></span></span>
    <Send className="h-4 w-4 text-white/40"/>
  </button>;

  return <section className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-violet-200">AFAT Deliver</p><h3 className="mt-1 text-lg font-black">Move an item from A to B</h3><p className="mt-1 text-xs leading-5 text-white/40">AFAT creates one service request and sends it through the same fulfilment/dispatch system. No separate fake delivery network.</p></div><button onClick={()=>setOpen(false)} className="text-[9px] font-black uppercase text-white/40">Close</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[9px] font-black uppercase text-white/35">Pickup<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="Pickup place or landmark" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      <label className="text-[9px] font-black uppercase text-white/35">Deliver to<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Destination place or landmark" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
      <label className="text-[9px] font-black uppercase text-white/35">Packages<input type="number" min={1} max={20} value={packages} onChange={e=>setPackages(Math.max(1,Number(e.target.value)||1))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      <label className="text-[9px] font-black uppercase text-white/35">Instructions<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What the operator needs to know" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
    </div>
    <button onClick={submit} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-violet-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{busy?'Creating delivery…':'Request delivery'}</button>
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default DeliveryRequestPanel;
