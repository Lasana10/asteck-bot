import React,{useEffect,useState} from 'react';
import {ArrowLeft,Clock3,RefreshCw,ShieldCheck,Ticket} from 'lucide-react';
import {fetchRecoverablePassengerPayments,type RecoverablePaymentBooking} from '../../services/paymentRecovery';

type Props={
  profileId:string|null;
  onBack:()=>void;
  onResume:(booking:RecoverablePaymentBooking)=>void;
};

function paymentLabel(state:string){
  if(state==='collection_pending')return 'Provider confirmation pending';
  if(state==='cash_due')return 'Cash due · not collected';
  if(state==='failed')return 'Previous collection failed';
  return 'Payment not started';
}

export function PassengerBookingRecovery({profileId,onBack,onResume}:Props){
  const [records,setRecords]=useState<RecoverablePaymentBooking[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{
    let active=true;
    setRecords([]);setError('');
    if(!profileId){setError('Sign in to your passenger account to retrieve existing bookings.');return;}
    setBusy(true);
    void fetchRecoverablePassengerPayments(profileId).then(({data,error:fetchError})=>{
      if(!active)return;
      setRecords(fetchError?[]:data);
      setError(fetchError?.message||'');
    }).catch(()=>{
      if(active){setRecords([]);setError('Could not verify your bookings. Retry while signed in.');}
    }).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[profileId,refreshKey]);
  return <section className="min-h-screen bg-slate-950 p-5 pt-14 text-white">
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm">Back</button>
        <button type="button" onClick={()=>setRefreshKey(x=>x+1)} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300/20 px-4 text-xs text-cyan-100 disabled:opacity-40"><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>
      <div className="mt-5 flex items-start gap-3"><Ticket className="mt-1 h-7 w-7 text-cyan-200"/><div>
        <h1 className="text-2xl font-black">Your existing bookings</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">Recover your server-recorded booking without buying the same seat twice. Payments remain subject to the provider or operator's verified confirmation.</p>
      </div></div>
      {busy&&<p role="status" className="mt-6 text-sm text-cyan-100">Retrieving your bookings securely…</p>}
      {error&&<p role="alert" className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">{error}</p>}
      {!busy&&!error&&!records.length&&<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="font-bold">No outstanding payment bookings found</p>
        <p className="mt-2 text-sm text-white/55">This list includes only your unpaid, pending-collection and cash-due bookings. It does not indicate that no paid tickets exist.</p>
      </div>}
      <div className="mt-6 space-y-3">{records.map(record=><article key={record.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div>
          <p className="text-sm font-black">{record.origin} → {record.destination}</p>
          <p className="mt-1 text-xs text-white/50">{record.routeName} · Seat {record.seatLabel}</p>
        </div><span className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-100">{paymentLabel(record.paymentStatus)}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/65">
          <div><p className="text-white/35">Server-recorded fare</p><p className="mt-1 font-black text-white">{record.amountXaf.toLocaleString('fr-CM')} FCFA</p></div>
          <div><p className="text-white/35">Operator</p><p className="mt-1 font-bold">{record.operatorName}</p></div>
          <div className="col-span-2 flex items-center gap-2"><Clock3 className="h-4 w-4 text-white/50"/>{Number.isFinite(Date.parse(record.departureTime))?new Date(record.departureTime).toLocaleString('fr-CM'):'Departure time unverified'}</div>
        </div>
        <button type="button" onClick={()=>onResume(record)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950">
          <ShieldCheck className="h-4 w-4"/>{record.paymentStatus==='cash_due'?'View cash-due ticket':'Resume existing booking'}
        </button>
        <p className="mt-2 break-all text-[10px] text-white/35">Booking {record.id}</p>
      </article>)}</div>
    </div>
  </section>;
}
