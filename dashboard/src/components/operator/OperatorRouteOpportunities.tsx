import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
type Opportunity={corridor:string;reported_requests:number;last_reported_at:string;
  available_operator_inventory:false;actual_vehicle_available:false;booking_confirmed:false};
type Snapshot={status:'ok'|'city_not_configured';city_key?:string;corridors:Opportunity[];
  minimum_report_count_to_display:3;scheduled_departures_verified:false;
  represents_unique_passengers:false;automatic_truth:false;generated_at?:string};
export function OperatorRouteOpportunities({onPlanRoute}:{onPlanRoute?:(origin:string,destination:string)=>void}){
 const [state,setState]=useState<Snapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  setBusy(true);setNotice('');
  try{
   const {data,error}=await supabase.rpc('afat_operator_route_opportunities');
   if(error)throw new Error(error.message);
   if(!data || !['ok','city_not_configured'].includes(data.status) ||
     data.automatic_truth!==false || data.scheduled_departures_verified!==false ||
     data.represents_unique_passengers!==false || data.minimum_report_count_to_display!==3 ||
     !Array.isArray(data.corridors) ||
     !data.corridors.every((item:any)=>typeof item.corridor==='string'&&
       Number.isSafeInteger(item.reported_requests)&&item.reported_requests>=3&&
       item.available_operator_inventory===false&&item.actual_vehicle_available===false&&
       item.booking_confirmed===false))
    throw new Error('AFAT cannot validate the operator demand evidence.');
   setState(data as Snapshot);
  }catch(error:any){setState(null);setNotice(error?.message||'Aggregate demand is unavailable.');}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 return <section className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-400/[0.035] p-4" aria-label="Operator verified-demand opportunities">
  <div className="flex items-start justify-between gap-2">
   <div><p className="text-[10px] font-black uppercase tracking-wider text-violet-200">Demand-driven service planning</p>
    <h3 className="mt-1 text-sm font-black text-white">Routes passengers could not find</h3>
    <p className="mt-1 text-xs leading-5 text-white/55">Only self-reported route interest meeting AFAT's minimum privacy threshold. These are not purchased tickets, verified passengers, operating vehicles or permission to bypass operator clearance.</p>
   </div>
   <button type="button" onClick={()=>void refresh()} disabled={busy}
     className="min-h-10 rounded-lg border border-white/15 px-3 text-[10px] text-white/70 disabled:opacity-40">Refresh</button>
  </div>
  {state?.status==='city_not_configured'&&<p className="mt-3 text-xs text-amber-100">
    Your operator city is not linked to an active AFAT city profile. Confirm the city in your verified operator profile before seeing regional planning signals.
   </p>}
  {state?.status==='ok'&&(state.corridors.length===0?
    <p className="mt-3 text-xs text-white/45">No route has reached three voluntary search events during the last 30 days. This does not mean demand is absent.</p>:
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {state.corridors.map(item=><article key={item.corridor} className="rounded-xl border border-white/10 bg-black/20 p-3">
       <p className="text-xs font-black text-white">{item.corridor}</p>
       <p className="mt-1 text-[10px] text-violet-100/65">{item.reported_requests} recorded interest event(s), not distinct passengers</p>
       <p className="mt-2 text-[10px] text-white/45">To serve this corridor, publish a real future departure using your verified vehicle, approved capacity and authentic fare. AFAT does not auto-publish demand as supply.</p>
       {onPlanRoute&&item.corridor.split(' → ').length===2&&<button type="button"
         onClick={()=>{
           const parts=item.corridor.split(' → ');
           if(parts.length===2&&parts[0].trim()&&parts[1].trim())onPlanRoute(parts[0].trim(),parts[1].trim());
         }}
         className="mt-3 min-h-10 rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 text-[10px] font-bold text-violet-100">
         Plan a real departure for this corridor
       </button>}
      </article>)}
    </div>)}
  {notice&&<p role="status" className="mt-3 text-xs text-amber-100">{notice}</p>}
 </section>;
}
