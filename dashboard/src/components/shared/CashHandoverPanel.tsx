import React,{useCallback,useEffect,useState} from 'react';
import {attestPhysicalCashHandover,getCashHandover,type AfatCashHandover} from '../../services/cashHandoverClient';
/** Both sides must independently declare actual physical cash handover.
 * This is NOT provider-confirmed settlement or operator-wallet money.
 */
export function CashHandoverPanel({bookingId,side,onDualAttested}:{
 bookingId:string;side:'passenger'|'operator';onDualAttested?:()=>void;
}){
 const [data,setData]=useState<AfatCashHandover|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [consented,setConsented]=useState(false);
 const refresh=useCallback(async()=>{
  setBusy(true);setNotice('');
  const result=await getCashHandover(bookingId);
  setBusy(false);
  if(result.error){setData(null);setNotice(result.error.message);return;}
  setData(result.data);
  if(result.data?.dual_attested)onDualAttested?.();
 },[bookingId]);
 useEffect(()=>{void refresh();},[refresh]);
 const ownAttested=side==='operator'?data?.operator_attested:data?.passenger_attested;
 const confirm=async()=>{
  if(busy||ownAttested||!consented)return;
  setBusy(true);setNotice('');
  const result=await attestPhysicalCashHandover(bookingId);
  setBusy(false);setConsented(false);
  if(result.error){setNotice(result.error.message);return;}
  setData(result.data);
  if(result.data?.dual_attested){
   setNotice('Both participants recorded cash handover. AFAT has not verified bank or provider settlement and has not credited an operator wallet.');
   onDualAttested?.();
  }else setNotice('Your statement was recorded. Awaiting the other party’s independent confirmation. This is not a paid ticket yet.');
 };
 return <section className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4" aria-label="Two-party cash handover">
  <h4 className="text-sm font-black text-amber-100">Physical cash handover · two-party confirmation</h4>
  <p className="mt-2 text-xs leading-5 text-white/65">Cash due means it has not been collected. Do not attest until money actually changes hands. AFAT records each party’s statement; this is not independently confirmed provider or bank settlement.</p>
  {data&&<>
   <p className="mt-3 text-lg font-black text-white">{data.amount_xaf.toLocaleString()} XAF · server-confirmed amount</p>
   <p className="mt-2 text-xs text-white/60">
    Passenger: {data.passenger_attested?'Declared handed over':'Awaiting statement'} · Operator: {data.operator_attested?'Declared received':'Awaiting statement'}
   </p>
   {data.dual_attested&&<p role="status" className="mt-2 text-xs text-emerald-200">
    Two-party cash handover attested. Operator wallet and bank/provider settlement are not confirmed.
   </p>}
   {!ownAttested&&!data.dual_attested&&<>
    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-100">
      <input type="checkbox" checked={consented} onChange={event=>setConsented(event.target.checked)} className="mt-1"/>
      {side==='operator'?'I personally received the exact cash amount from this passenger.':'I personally handed the exact cash amount to this operator.'}
    </label>
    <button type="button" disabled={busy||!consented} onClick={()=>void confirm()}
      className="mt-3 min-h-11 rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">
      {busy?'Checking server…':'Record my actual cash handover statement'}
    </button>
   </>}
  </>}
  <button type="button" disabled={busy} onClick={()=>void refresh()}
   className="mt-3 min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white/70 disabled:opacity-40">
    Check other party’s confirmation
  </button>
  {notice&&<p role="status" className="mt-2 text-xs leading-5 text-white/70">{notice}</p>}
 </section>;
}
