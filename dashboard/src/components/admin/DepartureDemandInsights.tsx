import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
type Corridor={corridor:string;reported_requests:number;latest_report_at:string;independent_supply_verified:false};
type Snapshot={
 city_key:string;reported_requests_30d:number;repeated_corridors:Corridor[];
 minimum_report_count_to_display:3;represents_unique_passengers:false;
 scheduled_departures_verified:false;automatic_truth:false;generated_at:string;
};
export function DepartureDemandInsights({cityKey}:{cityKey:string}){
 const [data,setData]=useState<Snapshot|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  setBusy(true);setNotice('');
  const {data:result,error}=await supabase.rpc('afat_departure_demand_snapshot',{p_city_key:cityKey});
  if(error){setData(null);setNotice(error.message);setBusy(false);return;}
  const valid=result&&result.city_key===cityKey&&result.automatic_truth===false&&
   result.represents_unique_passengers===false&&result.scheduled_departures_verified===false&&
   result.minimum_report_count_to_display===3&&
   Number.isSafeInteger(result.reported_requests_30d)&&result.reported_requests_30d>=0&&
   Array.isArray(result.repeated_corridors)&&result.repeated_corridors.every((x:any)=>
      typeof x.corridor==='string'&&x.corridor.length<=180&&
      Number.isSafeInteger(x.reported_requests)&&x.reported_requests>=3&&
      x.independent_supply_verified===false);
  if(!valid){setData(null);setNotice('AFAT could not validate these aggregated demand signals.');}
  else setData(result as Snapshot);
  setBusy(false);
 },[cityKey]);
 useEffect(()=>{void refresh();},[refresh]);
 return <section className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.035] p-4" aria-label="Passenger unmet departure demand">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h3 className="text-sm font-black text-cyan-100">Where passengers could not find a departure</h3>
    <p className="mt-1 text-xs text-white/50">Voluntary search requests from the last 30 days. This is self-reported interest, not unique passengers or proof of transport supply.</p></div>
   <button type="button" disabled={busy} onClick={()=>void refresh()} className="min-h-10 rounded-xl border border-white/15 px-3 text-xs text-white/70 disabled:opacity-40">Refresh demand</button>
  </div>
  {data&&<div className="mt-3">
   <p className="text-sm font-semibold text-white">{data.reported_requests_30d.toLocaleString()} opt-in request event(s)</p>
   {data.repeated_corridors.length===0?<p className="mt-2 text-xs text-white/40">No corridor has reached the privacy threshold of three requests. Do not infer that no unmet demand exists.</p>:
    <div className="mt-3 space-y-2">{data.repeated_corridors.map(item=>
      <article key={item.corridor} className="rounded-xl border border-white/10 bg-black/20 p-3">
       <p className="text-xs font-black text-white">{item.corridor}</p>
       <p className="mt-1 text-[10px] text-white/55">{item.reported_requests} request events · not verified passenger demand or a scheduled vehicle</p>
      </article>)}</div>}
   <p className="mt-2 text-[10px] text-white/35">Only route-level aggregates with at least three requests are displayed. No reporter identifiers, exact GPS locations or contact details are exposed.</p>
  </div>}
  {notice&&<p role="status" className="mt-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
