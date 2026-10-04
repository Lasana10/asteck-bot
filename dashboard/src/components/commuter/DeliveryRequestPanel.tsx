import React, { useState } from 'react';
import { Copy, PackageCheck, Send, ShieldCheck } from 'lucide-react';
import { discoverAfatPlaces } from '../../supabaseClient';
import { createDeliveryRequest } from '../../services/deliveryExecutionClient';

type DeliveryCodes = { requestId: string; pickupCode: string; recipientCode: string } | null;

export function DeliveryRequestPanel({profile,onCreated}:{profile:any;onCreated?:()=>void}) {
  const [open,setOpen]=useState(false);
  const [origin,setOrigin]=useState('');
  const [destination,setDestination]=useState('');
  const [packages,setPackages]=useState(1);
  const [recipientName,setRecipientName]=useState('');
  const [recipientPhone,setRecipientPhone]=useState('');
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [codes,setCodes]=useState<DeliveryCodes>(null);

  const resolvePlace=async(label:string)=>{
    const {data,error}=await discoverAfatPlaces({query:label.trim(),city:profile?.preferred_city||'yaounde',limit:6});
    if(error) throw error;
    const results=(data?.results||[]).filter((item:any)=>Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude)));
    const exact=results.find((item:any)=>String(item.name||'').trim().toLowerCase()===label.trim().toLowerCase());
    return exact||results[0]||null;
  };

  const submit=async()=>{
    if(!origin.trim()||!destination.trim()) { setNotice('Add both pickup and delivery destination.'); return; }
    if(!recipientName.trim()||!recipientPhone.trim()) { setNotice('Add the recipient name and contact number.'); return; }
    setBusy(true); setNotice('Resolving both places on AFAT…'); setCodes(null);
    try {
      const [pickup,dropoff]=await Promise.all([resolvePlace(origin),resolvePlace(destination)]);
      if(!pickup){setNotice('AFAT could not resolve the pickup to a mapped place yet. Choose a known place or landmark.');setBusy(false);return;}
      if(!dropoff){setNotice('AFAT could not resolve the destination to a mapped place yet. Choose a known place or landmark.');setBusy(false);return;}
      const {data,error}=await createDeliveryRequest({
        origin:pickup.name||origin.trim(),destination:dropoff.name||destination.trim(),
        pickupLatitude:Number(pickup.latitude),pickupLongitude:Number(pickup.longitude),
        dropoffLatitude:Number(dropoff.latitude),dropoffLongitude:Number(dropoff.longitude),
        packageCount:Math.max(1,packages),recipientName:recipientName.trim(),recipientPhone:recipientPhone.trim(),notes:notes.trim()||null,
      });
      setBusy(false);
      if(error){setNotice(error.message);return;}
      setCodes({requestId:String(data.id),pickupCode:String(data.pickup_code||''),recipientCode:String(data.recipient_code||'')});
      setNotice('Delivery created. Keep the pickup code with the sender and share the recipient code only with the intended recipient.');
      onCreated?.();
    } catch(error:any) {
      setBusy(false); setNotice(error?.message||'AFAT could not create this delivery.');
    }
  };

  const copy=async(value:string,label:string)=>{
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); } catch { setNotice(`${label}: ${value}`); }
  };

  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] px-4 text-left">
    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><PackageCheck className="h-4 w-4"/></span><span><span className="block text-xs font-black">Send an item</span><span className="mt-1 block text-[10px] text-white/35">Pickup and recipient confirmation stay inside the AFAT dispatch flow.</span></span></span>
    <Send className="h-4 w-4 text-white/40"/>
  </button>;

  return <section className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-violet-200">AFAT Deliver</p><h3 className="mt-1 text-lg font-black">Send with pickup + recipient proof</h3><p className="mt-1 text-xs leading-5 text-white/40">AFAT resolves both endpoints before dispatch. Completion requires the recipient’s one-time code; a courier cannot simply mark an item delivered.</p></div><button onClick={()=>setOpen(false)} className="text-[9px] font-black uppercase text-white/40">Close</button></div>

    {codes ? <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
      <div className="flex items-center gap-2 text-emerald-200"><ShieldCheck className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-widest">Codes created once</p></div>
      <p className="mt-2 text-xs leading-5 text-white/55">Request {codes.requestId.slice(0,8)}… Store these now. AFAT keeps only their hashes.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button onClick={()=>copy(codes.pickupCode,'Pickup code')} className="rounded-xl border border-white/10 bg-black/20 p-4 text-left"><p className="text-[8px] font-black uppercase text-white/35">Sender pickup code</p><p className="mt-1 font-mono text-xl font-black tracking-[0.22em]">{codes.pickupCode}</p><span className="mt-2 flex items-center gap-1 text-[9px] text-white/40"><Copy className="h-3 w-3"/>Copy</span></button>
        <button onClick={()=>copy(codes.recipientCode,'Recipient code')} className="rounded-xl border border-white/10 bg-black/20 p-4 text-left"><p className="text-[8px] font-black uppercase text-white/35">Recipient delivery code</p><p className="mt-1 font-mono text-xl font-black tracking-[0.22em]">{codes.recipientCode}</p><span className="mt-2 flex items-center gap-1 text-[9px] text-white/40"><Copy className="h-3 w-3"/>Copy privately</span></button>
      </div>
      <button onClick={()=>{setCodes(null);setOrigin('');setDestination('');setRecipientName('');setRecipientPhone('');setNotes('');setPackages(1);}} className="mt-3 text-[9px] font-black uppercase text-emerald-200/70">Create another delivery</button>
    </div> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[9px] font-black uppercase text-white/35">Pickup<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="Known place or landmark" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
        <label className="text-[9px] font-black uppercase text-white/35">Deliver to<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Known destination or landmark" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[9px] font-black uppercase text-white/35">Recipient name<input value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Who should receive it?" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
        <label className="text-[9px] font-black uppercase text-white/35">Recipient contact<input value={recipientPhone} onChange={e=>setRecipientPhone(e.target.value)} inputMode="tel" placeholder="Phone number" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
        <label className="text-[9px] font-black uppercase text-white/35">Packages<input type="number" min={1} max={50} value={packages} onChange={e=>setPackages(Math.max(1,Number(e.target.value)||1))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
        <label className="text-[9px] font-black uppercase text-white/35">Instructions<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Package or access instructions" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case text-white outline-none"/></label>
      </div>
      <button onClick={submit} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-violet-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{busy?'Creating verified delivery…':'Request proof-backed delivery'}</button>
    </>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
  </section>;
}
export default DeliveryRequestPanel;
