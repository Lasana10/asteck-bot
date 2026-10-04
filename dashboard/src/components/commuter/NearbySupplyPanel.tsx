import React, { useState } from 'react';
import { Car, LocateFixed, RefreshCw } from 'lucide-react';
import { fetchNearbySupply } from '../../services/operatorExecutionClient';

type SupplyVehicle={vehicle_type?:string|null;distance_m?:number|null;capacity?:number|null;rating?:number|null;freshness_seconds?:number|null;availability?:string|null};

export function NearbySupplyPanel(){
  const [vehicles,setVehicles]=useState<SupplyVehicle[]>([]);
  const [checked,setChecked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [accuracy,setAccuracy]=useState<number|null>(null);

  const check=()=>{
    if(!navigator.geolocation){setNotice('Device location is unavailable, so AFAT cannot truthfully check nearby live supply.');return;}
    setBusy(true);setNotice('Checking verified fresh supply near your current position…');
    navigator.geolocation.getCurrentPosition(async(position)=>{
      setAccuracy(position.coords.accuracy);
      const {data,error}=await fetchNearbySupply({latitude:position.coords.latitude,longitude:position.coords.longitude,radiusM:5000,limit:20});
      setBusy(false);setChecked(true);
      if(error){setVehicles([]);setNotice(error.message);return;}
      const next=Array.isArray(data?.vehicles)?data.vehicles:[];
      setVehicles(next);
      setNotice(next.length?`${next.length} verified vehicle${next.length===1?'':'s'} observed within 5 km with a fresh availability ping.`:'No verified fresh supply is currently observed within 5 km. AFAT will not replace that with registered or stale vehicles.');
    },(error)=>{
      setBusy(false);setChecked(true);setVehicles([]);
      setNotice(error.code===1?'Location permission is required to check nearby supply.':'AFAT could not get a reliable current position for the supply check.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:5000});
  };

  return <section className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Live movement supply</p><h3 className="mt-1 text-sm font-black">What is actually available near me?</h3><p className="mt-1 text-[10px] leading-5 text-white/40">AFAT counts only approved operators with verified vehicles and a recent live-position ping. It does not expose plates, operator identities or exact vehicle coordinates here.</p></div><button onClick={check} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 disabled:opacity-40" aria-label="Check nearby supply">{busy?<RefreshCw className="h-4 w-4 animate-spin"/>:<LocateFixed className="h-4 w-4"/>}</button></div>
    {checked&&<div className="mt-3"><div className="flex flex-wrap gap-2">{vehicles.slice(0,8).map((vehicle,index)=><span key={`${vehicle.vehicle_type}-${index}`} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-bold text-white/60"><Car className="mr-1.5 inline h-3 w-3 text-emerald-200"/>{vehicle.vehicle_type||'vehicle'} · {Math.round(Number(vehicle.distance_m||0))} m{vehicle.capacity?` · ${vehicle.capacity} seats`:''}{vehicle.freshness_seconds!=null?` · ${Math.round(Number(vehicle.freshness_seconds))}s fresh`:''}</span>)}{vehicles.length===0&&<span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[9px] font-bold text-amber-100">0 verified fresh vehicles observed</span>}</div></div>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">{notice}{accuracy!=null?` · location accuracy ±${Math.round(accuracy)} m`:''}</p>}
  </section>;
}
export default NearbySupplyPanel;
