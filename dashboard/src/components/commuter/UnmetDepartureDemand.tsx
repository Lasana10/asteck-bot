import React,{useState} from 'react';
import {supabase} from '../../supabaseClient';
import {recordMobilityGap} from '../../services/mobilityEvidenceClient';

const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
type Props={
  origin:string;destination:string;travelDate:string;
  minimumSeats:number;maximumFareXaf:string;
};
export function UnmetDepartureDemand({origin,destination,travelDate,minimumSeats,maximumFareXaf}:Props){
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [lastSubmitted,setLastSubmitted]=useState('');
  const queryKey=[origin,destination,travelDate,minimumSeats,maximumFareXaf].join('|');
  if(!origin.trim()||!destination.trim()||normalize(origin)===normalize(destination))return null;
  const validDate=!travelDate||(/^\d{4}-\d{2}-\d{2}$/.test(travelDate)&&Number.isFinite(Date.parse(travelDate)));
  const validBudget=!maximumFareXaf||Number.isSafeInteger(Number(maximumFareXaf))&&Number(maximumFareXaf)>0;
  const canSubmit=consent&&!busy&&validDate&&validBudget&&lastSubmitted!==queryKey;
  const submit=async()=>{
    if(!canSubmit)return;
    setBusy(true);setNotice('');
    try{
      // Resolve an active AFAT city from the source of truth; do not fabricate
      // a city key from an arbitrary search or misattribute demand to Yaoundé.
      const {data:cities,error:cityError}=await supabase.from('afat_city_profiles')
        .select('city_key,city_name').eq('status','active').limit(100);
      if(cityError)throw cityError;
      const city=(cities||[]).find(c=>normalize(c.city_name)===normalize(origin));
      if(!city){
        setNotice('AFAT cannot yet associate that departure city with an active verified city profile. No request was recorded.');return;
      }
      const {data,error}=await recordMobilityGap({
        cityKey:city.city_key,signalType:'supply_gap',
        label:`${origin.trim().slice(0,70)} → ${destination.trim().slice(0,70)}`,
        mode:'scheduled_departure',
        metadata:{departure_demand:true,departure_city:city.city_key,
          desired_date:travelDate||null,seats_requested:minimumSeats,
          max_fare_xaf:maximumFareXaf?Number(maximumFareXaf):null,
          no_verified_departure_matched:true,user_opted_in:true,
          no_vehicle_or_ticket_promised:true},
      });
      if(error)throw new Error(error.message);
      setLastSubmitted(queryKey);
      const queued=Boolean((data as {queued?:boolean}|null)?.queued);
      setNotice(queued?'Request stored on your device for authenticated submission. It is not a booking.'
        :'Your unmet travel request was sent for planning review. No seat, vehicle, price or departure is confirmed.');
    }catch(error:any){
      setNotice(error?.message||'AFAT could not record this travel request.');
    }finally{setBusy(false);}
  };
  return <section className="mx-auto mt-4 max-w-md rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4 text-left">
    <h3 className="text-sm font-black text-cyan-100">Tell AFAT where transport is missing</h3>
    <p className="mt-2 text-xs leading-5 text-slate-300">
      No verified matching departure is currently shown. You may voluntarily share this route and date for aggregate service planning. This is not a reservation, ticket, payment or promise that an operator will respond.
    </p>
    <label className="mt-3 flex items-start gap-2 text-xs text-white/65">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/>
      I agree to send my requested cities, date, fare limit and seat count for AFAT transport-planning analysis. No phone number or GPS coordinates are included.
    </label>
    <button type="button" disabled={!canSubmit} onClick={()=>void submit()}
      className="mt-3 min-h-11 rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">
      {busy?'Submitting…':lastSubmitted===queryKey?'Interest recorded':'Share unmet travel demand'}
    </button>
    {!validDate||!validBudget?<p className="mt-2 text-xs text-amber-200">Check your desired date and fare limit before submitting.</p>:null}
    {notice&&<p role="status" className="mt-2 text-xs leading-5 text-white/70">{notice}</p>}
  </section>;
}
