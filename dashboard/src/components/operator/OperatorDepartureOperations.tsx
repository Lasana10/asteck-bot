import React,{useCallback,useEffect,useState} from 'react';
import {fetchMyScheduledDepartures,withdrawScheduledDeparture,type ManagedDeparture} from '../../services/operatorDeparturePublisher';

/** Existing published routes remain operator-owned until capacity/booking rules permit withdrawal.
 * Financial or committed passenger journeys are deliberately not cancelled by this control.
 */
export function OperatorDepartureOperations({reloadKey=0,onChanged}:{reloadKey?:number;onChanged:()=>void}){
 const [items,setItems]=useState<ManagedDeparture[]>([]);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState('');
 const [healthy,setHealthy]=useState(true);
 const [selected,setSelected]=useState<string|null>(null);
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);
  const {data,error}=await fetchMyScheduledDepartures();
  setLoading(false);
  if(error){setHealthy(false);setNotice(error.message);return;}
  setHealthy(true);setItems(data||[]);
 },[]);
 useEffect(()=>{void refresh();},[refresh,reloadKey]);
 const withdraw=async(item:ManagedDeparture)=>{
  if(!item.can_withdraw||busy||selected!==item.id||reason.trim().length<12)return;
  setBusy(true);setNotice('');
  const {data,error}=await withdrawScheduledDeparture(item.id,reason.trim());
  setBusy(false);
  if(error){setNotice(error.message);await refresh();return;}
  setNotice(data?.changed?'Uncommitted departure withdrawn. It is no longer advertised.':'Departure was already inactive.');
  setSelected(null);setReason('');
  await refresh();onChanged();
 };
 return <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Operate · published departures</p>
    <h2 className="mt-2 text-lg font-black">Your scheduled transport</h2>
    <p className="mt-1 text-xs leading-5 text-white/50">Only your published inventory. Existing bookings and seat holds remain protected; changing a committed departure requires staff resolution.</p></div>
   <button type="button" onClick={()=>void refresh()} disabled={busy||loading} className="min-h-10 rounded-xl border border-white/15 px-4 text-xs text-white/75 disabled:opacity-40">{loading?'Refreshing…':'Refresh'}</button>
  </div>
  {!healthy&&<p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">Schedule feed unavailable. AFAT cannot confirm the current inventory.</p>}
  {healthy&&!loading&&items.length===0&&<p className="mt-4 text-xs text-white/50">No future or recent departures found for this operator. Publish a real departure above after vehicle clearance.</p>}
  <div className="mt-4 space-y-3">
   {items.map(item=>{
    const future=Date.parse(item.departure_time)>Date.now();
    const withdrawn=!item.is_active;
    const canWithdraw=item.can_withdraw&&future&&!withdrawn;
    return <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-black text-white">{item.origin} → {item.destination}</p>
       <p className="mt-1 text-[11px] text-white/55">{new Date(item.departure_time).toLocaleString()} · {Number(item.price_per_seat).toLocaleString()} XAF per seat</p>
       <p className="mt-2 text-[10px] text-cyan-100/65">Capacity {item.capacity} · {item.has_booking_history?'Booking history exists':item.has_active_holds?'Active seat holds':'No committed booking or active seat hold observed'}</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold text-white/65">{withdrawn?'Withdrawn':future?'Published':'Departed / expired'}</span>
     </div>
     {canWithdraw?<div className="mt-3">
      {selected===item.id?<div className="space-y-2">
       <label className="block text-xs text-white/70">Withdrawal reason (minimum 12 characters)
        <textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-xs" placeholder="Explain why this uncommitted departure will not run" /></label>
       <div className="flex gap-2"><button type="button" disabled={busy||reason.trim().length<12} onClick={()=>void withdraw(item)} className="min-h-10 rounded-lg bg-amber-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Confirm withdrawal</button><button type="button" disabled={busy} onClick={()=>{setSelected(null);setReason('');}} className="min-h-10 rounded-lg border border-white/15 px-4 text-xs">Keep departure</button></div>
      </div>:<button type="button" onClick={()=>{setSelected(item.id);setReason('');}} className="min-h-10 rounded-lg border border-amber-300/20 px-4 text-xs text-amber-100">Withdraw uncommitted departure</button>}
     </div>:item.is_active&&future?<p className="mt-3 text-[10px] text-amber-100/70">Passenger commitments exist. Staff-assisted resolution is required; this action cannot erase them.</p>:null}
    </article>;
   })}
  </div>
  {notice&&<p role="status" className="mt-3 rounded-lg border border-white/10 p-3 text-xs text-white/70">{notice}</p>}
 </section>;
}
