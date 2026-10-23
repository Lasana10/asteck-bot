import React,{useState} from 'react';
import {DepartureBoard} from './DepartureBoard';
import {SeatSelector} from './SeatSelector';
import {PaymentSheet} from './PaymentSheet';
import {TicketView} from './TicketView';
import {createBookingFromHold,createSeatHold,releaseSeatHold} from '../../supabaseClient';

type Departure=React.ComponentProps<typeof SeatSelector>['departure'] & {operator_id:string};
type Stage='departures'|'seats'|'fare'|'payment'|'ticket'|'cash_due';
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
  onChanged();
  if(!Number.isSafeInteger(fare)||fare<=0){
   setNotice('Booking was recorded but its server price cannot be verified. No payment will be started.');
   return;
  }
  setServerFare(fare);setStage('payment');
 };
 const paymentComplete=(method:string,transactionId:string)=>{
  if(!departure||!seat||!bookingId||serverFare===null)return;
  if(method==='cash'){setStage('cash_due');onChanged();return;}
  setTicket({id:bookingId,routeName:departure.route_name,origin:departure.origin,
   destination:departure.destination,seatLabel:seat,price:serverFare,
   operatorName:departure.operator_name,plateNumber:departure.plate_number,
   departureTime:departure.departure_time,transactionId,paymentMethod:method});
  setStage('ticket');onChanged();
 };
 if(stage==='departures')return <section className="overflow-hidden rounded-2xl border border-white/10">
  <div className="flex items-center justify-between bg-slate-950 p-3"><strong className="text-sm">Published future departures</strong>
   <button type="button" onClick={()=>void exit()} className="rounded-xl border border-white/15 px-4 py-2 text-xs">Close</button></div>
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
