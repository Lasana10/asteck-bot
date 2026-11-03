import React, {useCallback,useEffect,useState} from 'react';
import {Activity, RefreshCw, Route, ShieldCheck} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Readiness={
  city_key:string;city_name:string;pending_observations:number;accepted_observations:number;
  active_nodes:number;active_lines:number;recent_reviewed_ordered_stops:number;
  recent_contiguous_line_patterns:number;potential_transfer_stop_pairs:number;
  transfer_service_verified:false;current_fares_verified:false;
  automatic_truth:false;generated_at:string;
};
function validCount(value:unknown) {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}
export function TransitNetworkReadiness({cityKey}:{cityKey:string}){
  const [data,setData]=useState<Readiness|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const {data:result,error:failure}=await supabase.rpc('afat_city_transit_readiness',{p_city_key:cityKey});
      if(failure)throw new Error(failure.message);
      if(!result||result.city_key!==cityKey||result.automatic_truth!==false||
        result.transfer_service_verified!==false||result.current_fares_verified!==false||
        !['pending_observations','accepted_observations','active_nodes','active_lines',
          'recent_reviewed_ordered_stops','recent_contiguous_line_patterns',
          'potential_transfer_stop_pairs'].every(key=>validCount(result[key])))
        throw new Error('AFAT could not validate this city network evidence snapshot.');
      setData(result as Readiness);
    }catch(err:any){setData(null);setError(err?.message||'Network evidence snapshot unavailable.');}
    finally{setBusy(false);}
  },[cityKey]);
  useEffect(()=>{void load();},[load]);
  const nextAction=!data?'Check your access to city planning evidence':
    data.pending_observations>0?'Independently review pending transit observations':
    data.active_nodes<2?'Survey real transit stops on a named corridor':
    data.recent_contiguous_line_patterns===0?'Collect and review ordered stop sequences':
    data.potential_transfer_stop_pairs===0?'Survey interchange stops connecting different lines':
    'Verify walking access, transfer safety and actual service operations';
  return <section className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.035] p-4" aria-label="City transit network readiness">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">Transit network evidence</p>
        <h3 className="mt-1 text-base font-black">What AFAT knows about this city's transport</h3>
        <p className="mt-1 text-xs leading-5 text-white/50">Aggregated, permission-checked field observations. Network topology and stop proximity are not live timetables or guarantees that a vehicle is operating.</p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={busy} aria-label="Refresh transit network evidence" className="rounded-xl border border-white/10 p-3 text-white/60 disabled:opacity-40"><RefreshCw className={'h-4 w-4 '+(busy?'animate-spin':'')}/></button>
    </div>
    {data&&<div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      {([
        ['Pending review',data.pending_observations],
        ['Accepted observations',data.accepted_observations],
        ['Active mapped stops',data.active_nodes],
        ['Active line records',data.active_lines],
        ['Recent ordered stops',data.recent_reviewed_ordered_stops],
        ['Contiguous reviewed patterns',data.recent_contiguous_line_patterns],
        ['Possible transfer stop pairs',data.potential_transfer_stop_pairs],
      ] as Array<[string,number]>).map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-xl font-black text-white">{value.toLocaleString()}</p>
        <p className="mt-1 text-[9px] text-white/50">{label}</p>
      </div>)}
    </div>}
    <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-3">
      <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-amber-100"><Activity className="h-4 w-4"/>Next evidence-driven action</p>
      <p className="mt-1 text-xs font-semibold text-white">{nextAction}</p>
    </div>
    {data&&<p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-white/40">
      <ShieldCheck className="h-4 w-4 shrink-0"/>This snapshot makes no claim that fares, boarding availability, operating hours, transfers or safe crossings are verified. Generated {new Date(data.generated_at).toLocaleString()}.
    </p>}
    {error&&<p role="status" className="mt-3 text-xs text-amber-200">{error}</p>}
    {busy&&!data&&<p className="mt-3 text-xs text-cyan-100/60"><Route className="mr-2 inline h-3.5 w-3.5"/>Loading real network evidence…</p>}
  </section>;
}
