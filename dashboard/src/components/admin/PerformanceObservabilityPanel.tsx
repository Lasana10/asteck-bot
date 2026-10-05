import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type OperationMetric={operation:string;samples:number;success_rate_pct:number|null;p50_ms:number|null;p95_ms:number|null;max_ms:number|null;cache_hit_rate_pct:number|null;errors:number};
type Snapshot={city_key?:string|null;window_hours:number;operations:OperationMetric[];privacy:string;generated_at:string};
function label(operation:string){return operation.replace(/_/g,' ')}
export function PerformanceObservabilityPanel({cityKey}:{cityKey:string}){
 const[data,setData]=useState<Snapshot|null>(null);const[busy,setBusy]=useState(false);const[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setBusy(true);setNotice('');const{data,error}=await supabase.rpc('afat_performance_snapshot',{p_city_key:cityKey,p_hours:24});setBusy(false);if(error){setNotice(error.message);return}setData(data as Snapshot)},[cityKey]);
 useEffect(()=>{void load()},[load]);
 return <section className="rounded-[1.5rem] border border-violet-300/15 bg-violet-400/[0.035] p-5">
  <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-violet-200"/><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Performance observability</p></div><h2 className="mt-2 text-lg font-black">Measure what users actually feel</h2><p className="mt-1 text-xs leading-5 text-white/45">24-hour p50/p95 latency, outcomes and cache effectiveness. No raw GPS coordinates, search text or destination names are stored.</p></div><button type="button" onClick={()=>void load()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>
  {!data?.operations?.length?<p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/45">No production samples yet. Metrics appear after real route/Atlas operations use the instrumented client.</p>:<div className="mt-4 grid gap-2 lg:grid-cols-2">{data.operations.map(row=><article key={row.operation} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black capitalize text-white">{label(row.operation)}</p><span className="text-[8px] font-black uppercase text-white/30">{row.samples} samples</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><p className="text-base font-black">{row.p50_ms??'—'}</p><p className="text-[7px] uppercase text-white/25">p50 ms</p></div><div><p className="text-base font-black">{row.p95_ms??'—'}</p><p className="text-[7px] uppercase text-white/25">p95 ms</p></div><div><p className="text-base font-black">{row.success_rate_pct==null?'—':`${row.success_rate_pct}%`}</p><p className="text-[7px] uppercase text-white/25">success</p></div><div><p className="text-base font-black">{row.cache_hit_rate_pct==null?'—':`${row.cache_hit_rate_pct}%`}</p><p className="text-[7px] uppercase text-white/25">cache hit</p></div></div>{row.errors>0&&<p className="mt-3 text-[9px] font-bold text-rose-200">{row.errors} error{row.errors===1?'':'s'} in this window</p>}</article>)}</div>}
  {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
 </section>
}
export default PerformanceObservabilityPanel;
