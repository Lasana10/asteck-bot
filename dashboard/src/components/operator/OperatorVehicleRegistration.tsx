import React,{useState} from 'react';
import {registerOperatorVehicle} from '../../services/operatorExecutionClient';

export function OperatorVehicleRegistration({onRegistered}:{onRegistered:()=>void}){
 const [plate,setPlate]=useState('');
 const [type,setType]=useState('taxi');
 const [capacity,setCapacity]=useState('4');
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 const [registered,setRegistered]=useState(false);
 const submit=async()=>{
  const seats=Number(capacity);
  if(plate.trim().length<4||!Number.isSafeInteger(seats)||seats<1||seats>200){
   setNotice('Provide a real registration plate and passenger capacity between 1 and 200.');return;
  }
  setSaving(true);setNotice('');
  const {data,error}=await registerOperatorVehicle({
   plate_number:plate.trim(),vehicle_type:type,capacity:seats,
  });
  setSaving(false);
  if(error){setNotice(error.message);return;}
  setRegistered(true);
  setNotice(`Vehicle ${data.vehicle.plate_number} registered. Clearance: unreviewed. AFAT will not advertise it or accept bookings until independent verification.`);
  onRegistered();
 };
 return <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-5">
  <p className="text-[9px] font-black uppercase tracking-wider text-amber-100">Operator onboarding · vehicle clearance</p>
  <h2 className="mt-2 text-lg font-black">Register your real vehicle</h2>
  <p className="mt-2 text-xs leading-5 text-white/60">Approved operators cannot publish transport or go online until a vehicle is registered and independently cleared by AFAT. Registration is not approval.</p>
  {!registered&&<div className="mt-4 grid gap-3 sm:grid-cols-3">
   <label className="text-[10px] font-semibold text-white/75">Plate number
     <input value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} placeholder="Real plate number"
       className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-xs text-white"/></label>
   <label className="text-[10px] font-semibold text-white/75">Vehicle type
     <select value={type} onChange={e=>setType(e.target.value)}
      className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-xs text-white">
       <option value="taxi">Taxi</option><option value="shared_taxi">Shared taxi</option>
       <option value="moto">Moto</option><option value="moto_taxi">Moto taxi</option>
       <option value="car">Car</option><option value="minibus">Minibus</option>
       <option value="bus">Bus</option><option value="van">Van</option>
     </select></label>
   <label className="text-[10px] font-semibold text-white/75">Actual passenger seats
     <input type="number" min="1" max="200" value={capacity} onChange={e=>setCapacity(e.target.value)}
      className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-xs text-white"/></label>
   <button type="button" disabled={saving||plate.trim().length<4} onClick={()=>void submit()}
    className="min-h-12 rounded-xl bg-amber-200 px-4 text-xs font-black text-slate-950 disabled:opacity-40 sm:col-span-3">
    {saving?'Submitting for review…':'Register vehicle for independent clearance'}</button>
  </div>}
  {notice&&<p role="status" className="mt-3 rounded-lg border border-amber-300/15 p-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
