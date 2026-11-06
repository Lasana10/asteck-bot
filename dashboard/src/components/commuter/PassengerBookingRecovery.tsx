import React,{useEffect,useState} from 'react';
import {Clock3,RefreshCw,ShieldCheck,Ticket} from 'lucide-react';
import {fetchPassengerBookingHistory,type PassengerBookingEntry} from '../../services/paymentRecovery';

type Props={
  profileId:string|null;
  onBack:()=>void;
  onResume:(booking:PassengerBookingEntry)=>void;
  onViewTicket:(booking:PassengerBookingEntry)=>void;
};

function paymentLabel(state:string){
  if(['paid','paid_momo','paid_cash'].includes(state))return 'Payment verified by server';
  if(state==='collection_pending')return 'Provider confirmation pending';
  if(state==='cash_due')return 'Cash due · not collected';
  if(state==='failed')return 'Previous collection failed';
  return 'Payment not started';
}

export function PassengerBookingRecovery({profileId,onBack,onResume,onViewTicket}:Props){
  const [records,setRecords]=useState<PassengerBookingEntry[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{
    let active=true;
    setRecords([]);setError('');
    if(!profileId){setError('Sign in to your passenger account to retrieve existing bookings.');return;}
    setBusy(true);
    void fetchPassengerBookingHistory(profileId).then(({data,error:fetchError})=>{
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
        <p className="mt-2 text-sm leading-6 text-white/55">Retrieve your signed paid ticket or recover an existing outstanding booking without reserving the same seat twice. Payments remain subject to verified server status.</p>
      </div></div>
      {busy&&<p role="status" className="mt-6 text-sm text-cyan-100">Retrieving your bookings securely…</p>}
      {error&&<p role="alert" className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">{error}</p>}
      {!busy&&!error&&!records.length&&<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="font-bold">No eligible bookings found</p>
        <p className="mt-2 text-sm text-white/55">Only bookings with verifiable fare and an eligible payment state are shown. Cancelled, refunded or disputed bookings are excluded from self-service ticket recovery.</p>
      </div>}
      <div className="mt-6 space-y-3">{records.map(record=><article key={record.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div>
          <p className="text-sm font-black">{record.origin} → {record.destination}</p>
          <p className="mt-1 text-xs text-white/50">{record.routeName} · Seat {record.seatLabel}</p>
        </div><span className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${record.paymentPhase==='paid'?'border-emerald-300/25 bg-emerald-400/10 text-emerald-100':'border-amber-300/20 bg-amber-400/10 text-amber-100'}`}>{paymentLabel(record.paymentStatus)}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/65">
          <div><p className="text-white/35">Server-recorded fare</p><p className="mt-1 font-black text-white">{record.amountXaf.toLocaleString('fr-CM')} FCFA</p></div>
          <div><p className="text-white/35">Operator</p><p className="mt-1 font-bold">{record.operatorName}</p></div>
          <div className="col-span-2 flex items-center gap-2"><Clock3 className="h-4 w-4 text-white/50"/>{Number.isFinite(Date.parse(record.departureTime))?new Date(record.departureTime).toLocaleString('fr-CM'):'Departure time unverified'}</div>
        </div>
        {record.paymentPhase==='paid'&&!record.ticketEligible&&<p role="status" className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">
          {record.bookingStatus==='boarded'||record.bookingStatus==='in_progress'||record.bookingStatus==='completed'?
            'This trip has already reached boarding or a later stage. A new boarding QR cannot be issued from this booking.':
            record.bookingStatus!=='confirmed'?
            'Payment is recorded, but the operator has not confirmed this booking for boarding. Refresh this status later.':
            'The departure is outside the supported boarding window. Contact AFAT operations if this is incorrect.'}
        </p>}
        <button type="button" disabled={record.paymentPhase==='paid'&&!record.ticketEligible}
          onClick={()=>record.paymentPhase==='paid'?record.ticketEligible&&onViewTicket(record):onResume(record)}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
          <ShieldCheck className="h-4 w-4"/>{record.paymentPhase==='paid'?record.ticketEligible?'Retrieve signed ticket':'Boarding not yet available':
            record.paymentPhase==='cash_due'?'Review cash-due handover':'Resume existing booking'}
        </button>
        <p className="mt-2 break-all text-[10px] text-white/35">Booking {record.id}</p>
      </article>)}</div>
    </div>
  </section>;
}
