import React,{useEffect,useState} from 'react';
import {fetchOperatorBoardingManifest,type OperatorBoardingManifest as Manifest} from '../../services/operatorDeparturePublisher';
import {OperatorTicketScanner} from './OperatorTicketScanner';
import {CashHandoverPanel} from '../shared/CashHandoverPanel';

/** Server-viewed seat positions only. Actual boarding requires signed QR verification. */
export function OperatorBoardingManifest({departureId}:{departureId:string}){
 const [data,setData]=useState<Manifest|null>(null);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [scannerOpen,setScannerOpen]=useState(false);
 useEffect(()=>{
  let alive=true;setData(null);setLoading(true);setNotice('');
  void fetchOperatorBoardingManifest(departureId).then(({data,error})=>{
   if(!alive)return;setLoading(false);
   if(error){setData(null);setNotice(error.message);return;}
   setData(data);
  });
  return()=>{alive=false;};
 },[departureId,refreshKey]);
 return <section className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.035] p-3" aria-label="Verified operator seat manifest">
  <div className="flex items-center justify-between gap-3">
   <div><h4 className="text-xs font-black text-cyan-100">Boarding manifest · server records</h4>
    <p className="mt-1 text-[10px] text-white/50">Seat status only. Passenger identity and phone numbers are not shown. Verify each signed QR ticket before boarding.</p></div>
   <button type="button" disabled={loading} onClick={()=>setRefreshKey(x=>x+1)}
    className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] text-white/70 disabled:opacity-40">
    {loading?'Checking…':'Refresh'}
   </button>
  </div>
  <button type="button" aria-expanded={scannerOpen}
    onClick={()=>setScannerOpen(open=>!open)}
    className="mt-3 min-h-10 rounded-lg border border-emerald-300/25 px-3 text-[10px] font-bold text-emerald-100">
    {scannerOpen?'Close ticket scanner':'Scan passenger QR ticket'}
  </button>
  {scannerOpen&&<OperatorTicketScanner onVerified={()=>setRefreshKey(key=>key+1)}/>}
  <CashHandoverPanel role="operator" departureId={departureId} onConfirmed={()=>setRefreshKey(key=>key+1)}/>
  {notice&&<p role="alert" className="mt-3 text-[10px] text-amber-100">{notice}</p>}
  {data&&<div className="mt-3">
   <p className="text-xs text-white/75">{data.booked_seats} reserved · {data.boarded_seats} recorded boarded · {data.capacity} verified-capacity seats</p>
   {data.requiring_review>0&&<p role="alert" className="mt-2 text-[10px] text-amber-200">Conflicting seat records detected: stop boarding those positions and request staff review.</p>}
   {data.seats.length===0?<p className="mt-2 text-xs text-white/40">No server-confirmed booking records yet. No passenger arrival or boarding can be inferred.</p>:
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {data.seats.map(seat=><div key={seat.seat_label} className="rounded-lg border border-white/10 bg-black/20 p-2">
       <p className="text-xs font-black text-white">Seat {seat.seat_label}</p>
       <p className="mt-1 text-[10px] text-white/65">{seat.boarding_status.replace(/_/g,' ')}</p>
       <p className="mt-1 text-[10px] text-amber-100/70">{seat.payment_readiness.replace(/_/g,' ')}</p>
      </div>)}
    </div>}
   <p className="mt-3 text-[10px] text-white/40">Booked and boarded counts are database snapshots, not real-time physical headcounts. Cash due is not confirmed settlement. A signed ticket scan is mandatory.</p>
  </div>}
 </section>;
}