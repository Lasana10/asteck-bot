import React,{useEffect,useState} from 'react';
import {fetchRecoverablePassengerPayments,type RecoverablePaymentBooking} from '../../services/paymentRecovery';
import {fetchRecoverablePaidTickets,type RecoverablePaidTicket} from '../../services/paidTicketRecovery';
import {DepartureBoard} from './DepartureBoard';
import {SeatSelector} from './SeatSelector';
import {PaymentSheet} from './PaymentSheet';
import {TicketView} from './TicketView';
import {createBookingFromHold,createSeatHold,releaseSeatHold,cancelUnpaidPassengerBooking} from '../../supabaseClient';

type Departure=React.ComponentProps<typeof SeatSelector>['departure'] & {operator_id:string};
type Stage='departures'|'seats'|'fare'|'payment'|'recover_payment'|'ticket'|'cash_due';
type Ticket=React.ComponentProps<typeof TicketView>['booking'];

/** Role-native entry into the SAME verified departure/seat-hold/booking/payment
 * workflow as the legacy commuter shell. Never invent seats, fares or tickets.
 */
export function PassengerScheduledSeatJourney({profileId,onClose,onChanged}:{
 profileId:string;onClose:()=>void;onChanged:()=>void;
}){
 const [stage,setStage]=useState<Stage>('departures');
 const [departure,setDeparture]=useState<Departure|null>(null);
 const [seat,setSeat]=useState<string|null>(null);
 const [holdId,setHoldId]=useState<string|null>(null);
 const [holdExpiry,setHoldExpiry]=useState<string|null>(null);
 const [bookingId,setBookingId]=useState<string|null>(null);
 const [serverFare,setServerFare]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [ticket,setTicket]=useState<Ticket|null>(null);
 const [recoverable,setRecoverable]=useState<RecoverablePaymentBooking[]>([]);
 const [paidTickets,setPaidTickets]=useState<RecoverablePaidTicket[]>([]);
 const [recoveryBooking,setRecoveryBooking]=useState<RecoverablePaymentBooking|null>(null);
 const [recoverLoading,setRecoverLoading]=useState(false);
 const [cancelSelection,setCancelSelection]=useState<string|null>(null);
 const [cancelBusy,setCancelBusy]=useState(false);
 const cancelBooking=async(item:RecoverablePaymentBooking)=>{
  if(cancelBusy||!item.canSelfCancel||cancelSelection!==item.id)return;
  if(!navigator.onLine){setNotice('Reconnect to confirm cancellation with AFAT. Your booking remains active.');return;}
  setCancelBusy(true);setNotice('');
  const {data,error}=await cancelUnpaidPassengerBooking(item.id);
  setCancelBusy(false);setCancelSelection(null);
  if(error||!data?.cancellation?.booking_id){
   setNotice(error?.message||'Booking cancellation could not be confirmed. Check your live booking.');
   return;
  }
  setRecoverable(previous=>previous.filter(row=>row.id!==item.id));
  setNotice('Your unpaid unstarted booking was cancelled by the server. No payment was collected or refunded; the reserved seat is no longer booked.');
  onChanged();
 };
 useEffect(()=>{
  if(stage!=='departures')return;
  let active=true;
  setRecoverLoading(true);
  void Promise.all([
    fetchRecoverablePassengerPayments(profileId),
    fetchRecoverablePaidTickets(profileId),
  ]).then(([pending,paid])=>{
    if(!active)return;
    setRecoverLoading(false);
    setRecoverable(pending.data);
    setPaidTickets(paid.data);
    if(pending.error||paid.error)setNotice(pending.error?.message||paid.error?.message||'Booking recovery unavailable.');
  }).catch(()=>{if(active){setRecoverLoading(false);setNotice('Unable to verify your server bookings.');}});
  return()=>{active=false;};
 },[profileId,stage]);

 const releaseUnconverted=async()=>{
  if(!holdId||bookingId)return;
  const id=holdId;
  setHoldId(null);setHoldExpiry(null);
  await releaseSeatHold(id);
 };
 const exit=async()=>{
  if(busy)return;
  await releaseUnconverted();
  onClose();
 };
 const chooseDeparture=(selected:Departure)=>{
  setDeparture(selected);setSeat(null);setHoldId(null);setHoldExpiry(null);
  setBookingId(null);setServerFare(null);setNotice('');setTicket(null);
  setStage('seats');
 };
 const selectSeat=async(label:string)=>{
  if(!departure||!profileId||busy)return;
  if(!navigator.onLine){setNotice('Reconnect to confirm real seat inventory.');return;}
  if(Date.parse(departure.departure_time)<=Date.now()){setNotice('This departure has already started. Select a later one.');return;}
  setBusy(true);setNotice('');
  await releaseUnconverted();
  const {data,error}=await createSeatHold({
   passenger_id:profileId,operator_id:departure.operator_id,
   route_id:departure.id,seat_label:label,
  });
  setBusy(false);
  if(error||!data?.hold?.id){setNotice(error?.message||'The server could not hold that seat. Refresh live inventory.');return;}
  setHoldId(String(data.hold.id));setHoldExpiry(data.hold.expires_at||null);
  setSeat(label);setStage('fare');
 };
 const confirmFare=async()=>{
  if(!departure||!seat||!holdId||busy)return;
  if(!holdExpiry||Date.parse(holdExpiry)<=Date.now()){
   setHoldId(null);setHoldExpiry(null);setNotice('The seat hold expired. Select a seat again.');setStage('seats');return;
  }
  if(Date.parse(departure.departure_time)<=Date.now()){
   setNotice('Departure time has passed. Choose another future departure.');setStage('seats');return;
  }
  if(!navigator.onLine){setNotice('The server must confirm this booking and final fare before payment.');return;}
  setBusy(true);setNotice('');
  const {data,error}=await createBookingFromHold({hold_id:holdId});
  setBusy(false);
  if(error||!data?.booking?.id){
   setNotice(error?.message||'Booking confirmation failed. The seat may no longer be available.');
   setStage('seats');setHoldId(null);setHoldExpiry(null);return;
  }
  const fare=Number(data.booking.price_paid??data.booking.price_xaf);
  setBookingId(String(data.booking.id));setHoldId(null);setHoldExpiry(null);
  // Do not refresh the parent into its active-dispatch screen mid-checkout.
  // Refresh only on exit; otherwise checkout can unmount before payment resolves.
  if(!Number.isSafeInteger(fare)||fare<=0){
   setNotice('Booking was recorded but its server price cannot be verified. No payment will be started.');
   return;
  }
  setServerFare(fare);setStage('payment');
 };
 const paymentComplete=(method:string,transactionId:string)=>{
  if(!departure||!seat||!bookingId||serverFare===null)return;
  if(method==='cash'){setStage('cash_due');return;}
  setTicket({id:bookingId,routeName:departure.route_name,origin:departure.origin,
   destination:departure.destination,seatLabel:seat,price:serverFare,
   operatorName:departure.operator_name,plateNumber:departure.plate_number,
   departureTime:departure.departure_time,transactionId,paymentMethod:method});
  setStage('ticket');
 };
 if(stage==='recover_payment'&&recoveryBooking)return <PaymentSheet bookingId={recoveryBooking.id}
  amount={recoveryBooking.amountXaf} routeName={recoveryBooking.routeName}
  operatorName={recoveryBooking.operatorName} seatLabel={recoveryBooking.seatLabel}
  onBack={()=>{setRecoveryBooking(null);setStage('departures');}}
  onPaymentComplete={(method,transactionId)=>{
   if(method==='cash'){setRecoveryBooking(null);setStage('cash_due');return;}
   setTicket({id:recoveryBooking.id,routeName:recoveryBooking.routeName,
    origin:recoveryBooking.origin,destination:recoveryBooking.destination,
    seatLabel:recoveryBooking.seatLabel,price:recoveryBooking.amountXaf,
    operatorName:recoveryBooking.operatorName,plateNumber:recoveryBooking.plateNumber,
    departureTime:recoveryBooking.departureTime,transactionId,paymentMethod:method});
   setStage('ticket');
  }}/>;
 if(stage==='departures')return <section className="overflow-hidden rounded-2xl border border-white/10">
  <div className="flex items-center justify-between bg-slate-950 p-3"><strong className="text-sm">Published future departures</strong>
   <button type="button" onClick={()=>void exit()} className="rounded-xl border border-white/15 px-4 py-2 text-xs">Close</button></div>
  <div className="border-b border-white/10 bg-slate-950 p-4">
   <h4 className="text-xs font-black text-emerald-200">Recover my verified paid tickets</h4>
   <p className="mt-1 text-[11px] text-white/55">Only your server-confirmed, paid, future bookings. The signed boarding QR is reissued securely by AFAT; no further payment is initiated.</p>
   {recoverLoading&&<p className="mt-2 text-xs text-white/45">Checking confirmed paid bookings…</p>}
   {paidTickets.map(item=><button key={item.id} type="button"
     onClick={()=>{setTicket(item);setNotice('');setStage('ticket');}}
     className="mt-2 block w-full rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3 text-left">
     <span className="block text-xs font-black">{item.origin} → {item.destination} · Seat {item.seatLabel}</span>
     <span className="mt-1 block text-[10px] text-white/55">
       Paid {item.price.toLocaleString()} XAF · {new Date(item.departureTime).toLocaleString()} · Reissue signed QR
     </span>
   </button>)}
  </div>
  <div className="border-b border-white/10 bg-slate-950 p-4">
   <h4 className="text-xs font-black text-cyan-200">Resume an existing unpaid booking</h4>
   <p className="mt-1 text-[11px] text-white/55">Live server records only. Unsettled mobile-money collections cannot be charged again; verify their provider status first.</p>
   {recoverLoading&&<p className="mt-2 text-xs text-white/45">Checking your booking history…</p>}
   {recoverable.slice(0,6).map(item=><article key={item.id} className="mt-2 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3">
     <p className="text-xs font-black">{item.routeName} · Seat {item.seatLabel}</p>
     <p className="mt-1 text-[10px] text-white/50">{item.amountXaf.toLocaleString()} XAF · {item.paymentStatus==='collection_pending'?'Provider confirmation pending':'Awaiting payment'} · Server booking {item.id.slice(0,8)}</p>
     <div className="mt-2 flex flex-wrap gap-2">
       <button type="button" disabled={cancelBusy} onClick={()=>{setRecoveryBooking(item);setStage('recover_payment');}}
         className="min-h-10 rounded-lg border border-cyan-300/20 px-3 text-[10px] font-bold text-cyan-100 disabled:opacity-40">
         Check booking / resume payment
       </button>
       {item.canSelfCancel&&(cancelSelection===item.id?
         <div className="flex flex-wrap items-center gap-2">
           <p className="w-full text-[10px] text-amber-100">Confirm withdrawal of this unpaid booking? AFAT must verify that no operator has accepted a dispatch or payment has started.</p>
           <button type="button" disabled={cancelBusy} onClick={()=>void cancelBooking(item)}
             className="min-h-10 rounded-lg bg-amber-300 px-3 text-[10px] font-bold text-slate-950 disabled:opacity-40">
             {cancelBusy?'Checking…':'Confirm cancellation'}
           </button>
           <button type="button" disabled={cancelBusy} onClick={()=>setCancelSelection(null)}
             className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] text-white/70">Keep booking</button>
         </div>:
         <button type="button" disabled={cancelBusy} onClick={()=>setCancelSelection(item.id)}
           className="min-h-10 rounded-lg border border-amber-300/20 px-3 text-[10px] text-amber-100 disabled:opacity-40">
           Cancel unpaid booking
         </button>)}
     </div>
   </article>)}
   {notice&&<p role="status" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">{notice}</p>}
  </div>
  <DepartureBoard onBack={()=>void exit()} onSelectDeparture={chooseDeparture}/></section>;
 if(stage==='seats'&&departure)return <section className="overflow-hidden rounded-2xl border border-white/10">
  <SeatSelector departure={departure} onBack={()=>{void releaseUnconverted();setStage('departures');}}
   onConfirmSeat={label=>void selectSeat(label)} errorText={notice||null}/>
  {busy&&<p className="p-3 text-xs text-cyan-100" role="status">Requesting an authenticated seat hold…</p>}
 </section>;
 if(stage==='fare'&&departure)return <section className="rounded-2xl border border-cyan-300/15 bg-slate-950 p-5">
  <h3 className="text-lg font-black">Confirm actual published fare</h3>
  <p className="mt-3 text-sm text-white/75">{departure.origin} → {departure.destination} · Seat {seat}</p>
  <p className="mt-3 text-2xl font-black">{Number(departure.price_xaf).toLocaleString()} XAF</p>
  <p className="mt-2 text-xs text-amber-100/70">Provisional hold until {holdExpiry?new Date(holdExpiry).toLocaleTimeString():'server expiry unknown'}. The server checks capacity and determines the payable fare again.</p>
  {notice&&<p role="alert" className="mt-3 text-xs text-amber-200">{notice}</p>}
  <button type="button" disabled={busy||!holdId} onClick={()=>void confirmFare()} className="mt-5 min-h-12 w-full rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Create booking at server-confirmed fare</button>
  <button type="button" disabled={busy} onClick={()=>{void releaseUnconverted();setStage('seats');}} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 text-xs text-white/65">Choose another seat</button>
 </section>;
 if(stage==='payment'&&departure&&seat&&bookingId&&serverFare!==null)
  return <PaymentSheet bookingId={bookingId} amount={serverFare} operatorName={departure.operator_name}
   routeName={departure.route_name} seatLabel={seat} onPaymentComplete={paymentComplete}
   onBack={()=>{setNotice('Booking exists, but payment remains unconfirmed. Resume from your journeys before attempting another payment.');onClose();}}/>;
 if(stage==='ticket'&&ticket)return <TicketView booking={ticket} onBack={()=>{onChanged();onClose();}}/>;
 if(stage==='cash_due')return <section className="rounded-2xl border border-emerald-300/20 bg-slate-950 p-6">
  <h3 className="text-lg font-black">Booking recorded · cash still due</h3>
  <p className="mt-3 text-sm text-white/70">Your booking exists, but no cash payment has been verified. AFAT will not issue a paid ticket until the proper collection workflow confirms it.</p>
  <button type="button" onClick={()=>{onChanged();onClose();}} className="mt-5 min-h-11 rounded-xl bg-emerald-300 px-4 text-xs font-black text-slate-950">View my journeys</button>
 </section>;
 return <section className="rounded-2xl border border-amber-300/20 p-5">
  <p className="text-sm text-amber-100">{notice||'Booking state needs server reconciliation.'}</p>
  <button type="button" onClick={()=>void exit()} className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-xs">Close</button>
 </section>;
}
