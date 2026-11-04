import React,{useEffect,useState} from 'react';
import {fetchCashHandoverBookings,attestCashHandover,type CashHandoverBooking} from '../../services/cashHandoverClient';

/** Cash is held physically by the operator. These are two independent
 * authenticated confirmations, not a provider settlement or platform wallet.
 */
export function CashHandoverPanel({role,departureId,onConfirmed}:{
 role:'passenger'|'operator';departureId?:string;onConfirmed?:()=>void;
}){
 const [items,setItems]=useState<CashHandoverBooking[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState('');
 const [healthy,setHealthy]=useState(true);
 const [refreshKey,setRefreshKey]=useState(0);
 const [consentFor,setConsentFor]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;setNotice('');setHealthy(true);
  void fetchCashHandoverBookings(role,departureId).then(({data,error})=>{
   if(!alive)return;
   if(error){setHealthy(false);setItems([]);setNotice(error.message);return;}
   setItems(data);
  });
  return()=>{alive=false;};
 },[role,departureId,refreshKey]);
 const attest=async(item:CashHandoverBooking)=>{
  if(busy||consentFor!==item.id||item.payment_status!=='cash_due')return;
  if(!navigator.onLine){
   setNotice('Offline: cash cannot be confirmed by AFAT. Keep the transaction pending until the server replies.');
   return;
  }
  setBusy(item.id);setNotice('');
  const {data,error}=await attestCashHandover(item.id);
  setBusy(null);setConsentFor(null);
  if(error||!data){setNotice(error?.message||'No cash acknowledgment was recorded.');return;}
  setNotice(data.status==='confirmed'
   ?'Both parties confirmed the physical handover. AFAT recorded operator-held cash, not platform settlement or wallet credit. A signed ticket can now be requested.'
   :'Your confirmation was recorded. AFAT is waiting for the other party; cash remains due in the booking until both agree.');
  setRefreshKey(x=>x+1);
  if(data.status==='confirmed')onConfirmed?.();
 };
 return <section className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.035] p-4" aria-label="Physical cash handover">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h4 className="text-xs font-black text-amber-100">Cash at pickup · two-party confirmation</h4>
    <p className="mt-1 text-[10px] leading-5 text-white/55">
     {role==='passenger'?'Only confirm AFTER you physically handed the amount to the verified operator.':
      'Only confirm AFTER you physically received the passenger’s cash.'}
     {' '}Both participants must acknowledge the same booking before AFAT permits signed-ticket boarding. No provider settlement or platform wallet credit is asserted.
    </p></div>
   <button type="button" disabled={Boolean(busy)} onClick={()=>setRefreshKey(x=>x+1)}
    className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] text-white/70 disabled:opacity-40">Refresh cash state</button>
  </div>
  {!healthy&&<p role="alert" className="mt-3 text-xs text-amber-100">Server cash evidence unavailable. No payment confirmation can be assumed.</p>}
  {healthy&&items.length===0&&<p className="mt-3 text-[10px] text-white/50">No open cash-due bookings found for this account and departure.</p>}
  <div className="mt-3 space-y-2">
   {items.map(item=>{
    const myConfirmation=role==='passenger'?item.handover?.passenger_confirmed_at:item.handover?.operator_confirmed_at;
    const otherConfirmation=role==='passenger'?item.handover?.operator_confirmed_at:item.handover?.passenger_confirmed_at;
    const confirmed=item.payment_status==='paid_cash'&&Boolean(item.handover?.confirmed_at);
    return <article key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
     <p className="text-xs font-bold text-white">Seat {item.seat_label} · {Number(item.price_paid).toLocaleString()} XAF</p>
     {item.routes&&<p className="mt-1 text-[10px] text-white/50">{item.routes.origin} → {item.routes.destination}</p>}
     <p className="mt-2 text-[10px] text-white/65">
      {confirmed?'Handover confirmed by both parties':myConfirmation?'Your receipt is recorded; waiting for the other participant':otherConfirmation?'Other participant confirmed; your acknowledgment is still required':'Cash is due; no handover has been confirmed'}
     </p>
     {!confirmed&&!myConfirmation&&item.payment_status==='cash_due'&&
       (consentFor===item.id?
        <div className="mt-3 space-y-2">
         <p className="text-[10px] text-amber-100">Confirm only a REAL physical cash exchange, not a planned or promised payment. This action creates audit evidence.</p>
         <div className="flex flex-wrap gap-2">
          <button type="button" disabled={Boolean(busy)} onClick={()=>void attest(item)}
            className="min-h-10 rounded-lg bg-amber-300 px-3 text-[10px] font-black text-slate-950 disabled:opacity-40">
            {busy===item.id?'Verifying…':role==='passenger'?'I physically handed over this cash':'I physically received this cash'}
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={()=>setConsentFor(null)}
            className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] text-white/65">Not yet</button>
         </div>
        </div>:
        <button type="button" disabled={Boolean(busy)} onClick={()=>setConsentFor(item.id)}
          className="mt-3 min-h-10 rounded-lg border border-amber-300/20 px-3 text-[10px] font-bold text-amber-100">
          {role==='passenger'?'Confirm cash handed to operator':'Confirm cash received from passenger'}
        </button>)}
    </article>;
   })}
  </div>
  {notice&&<p role="status" className="mt-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
