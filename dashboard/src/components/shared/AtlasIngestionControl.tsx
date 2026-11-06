import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, MapPinned, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAfatLocale } from '../../localization';

const YAOUNDE_PRESETS: Record<string,{label:string;south:number;west:number;north:number;east:number}> = {
  central:{label:'Central Yaoundé',south:3.84,west:11.495,north:3.89,east:11.545},
  west:{label:'West Yaoundé',south:3.82,west:11.445,north:3.89,east:11.495},
  east:{label:'East Yaoundé',south:3.82,west:11.545,north:3.89,east:11.595},
  north:{label:'North Yaoundé',south:3.89,west:11.47,north:3.95,east:11.56},
  south:{label:'South Yaoundé',south:3.77,west:11.47,north:3.84,east:11.56},
};

export function AtlasIngestionControl(){
 const {t}=useAfatLocale();
 const [cities,setCities]=useState<any[]>([]); const [cityKey,setCityKey]=useState('cm-yaounde'); const [scope,setScope]=useState('central');
 const [bbox,setBbox]=useState({south:'3.84',west:'11.495',north:'3.89',east:'11.545'});
 const [running,setRunning]=useState(false); const [result,setResult]=useState<any>(null);
 const [queueBusy,setQueueBusy]=useState(false);const [queueNotice,setQueueNotice]=useState('');
 const [batchRunning,setBatchRunning]=useState(false);
 const [batchProgress,setBatchProgress]=useState<{verified:number;requested:number}>({verified:0,requested:0});
 const [queueCounts,setQueueCounts]=useState<Record<string,number>>({});
 useEffect(()=>{void supabase.from('afat_city_profiles').select('id,city_key,city_name,country_code,learning_stage').eq('status','active').order('city_name').then(({data})=>setCities(data||[]));},[]);
 const city=useMemo(()=>cities.find(c=>c.city_key===cityKey),[cities,cityKey]);
 const choosePreset=(key:string)=>{setScope(key);const p=YAOUNDE_PRESETS[key];if(p)setBbox({south:String(p.south),west:String(p.west),north:String(p.north),east:String(p.east)});};

 const refreshQueue=async()=>{
   if(!city?.id){setQueueCounts({});return;}
   const {data,error}=await supabase.from('afat_city_ingestion_cells')
     .select('status').eq('city_profile_id',city.id).eq('source_key','openstreetmap').limit(1000);
   if(error){setQueueNotice('Could not load authorized ingestion queue: '+error.message);return;}
   const counts:Record<string,number>={};
   for(const cell of data||[])counts[cell.status]=(counts[cell.status]||0)+1;
   setQueueCounts(counts);
 };
 useEffect(()=>{void refreshQueue();},[city?.id]);
 const validatePersistedBatch=async(data:any)=>{
   const batchId=typeof data?.batch_id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.batch_id)?data.batch_id:null;
   if(!batchId)return {error:'No valid source import batch was returned. Verify the import manually.'};
   const {data:batch,error}=await supabase.from('afat_geo_import_batches')
     .select('id,status,input_count,inserted_count,rejected_count,source_key,import_mode,finished_at,error_summary')
     .eq('id',batchId).maybeSingle();
   if(error||!batch)return {error:'Cannot verify persisted import evidence. Do not mark the queue cell complete.',batchId};
   const countsMatch=Number(batch.input_count)===Number(data.input_way_count)&&
     Number(batch.inserted_count)===Number(data.accepted_count)&&
     Number(batch.rejected_count||0)===Number(data.rejected_count||0);
   const valid=['completed','completed_with_errors'].includes(batch.status)&&
     batch.status===data.status&&batch.source_key==='openstreetmap'&&
     batch.import_mode==='candidate_only'&&Boolean(batch.finished_at)&&countsMatch;
   if(!valid)return {error:'Persisted source totals or batch status do not match. Manual review required.',batchId};
   return {batchId,batch};
 };
 const runQueuedCell=async():Promise<'verified'|'empty'|'blocked'>=>{
   if(running||queueBusy||!cityKey)return 'blocked';
   setQueueBusy(true);setQueueNotice('');
   let claimed:any=null;
   try{
     const {data:claim,error:claimError}=await supabase.rpc('afat_claim_next_ingestion_cell',
       {p_city_key:cityKey,p_source_key:'openstreetmap'});
     if(claimError)throw new Error('Cannot claim next authorized cell: '+claimError.message);
     if(claim?.status==='empty'){setQueueNotice('No pending or failed OSM cells remain in this city.');return 'empty';}
     if(claim?.status!=='claimed'||!claim.cell?.id)throw new Error('Queue claim was not confirmed.');
     claimed=claim.cell;
     const {south,west,north,east}=claimed;
     if(![south,west,north,east].every((v:unknown)=>typeof v==='number'&&Number.isFinite(v))||
       south>=north||west>=east||south< -90||north>90||west< -180||east>180||
       north-south>0.18||east-west>0.18||(north-south)*(east-west)>0.018)
       throw new Error('Queued cell has invalid or oversized coordinates.');
     const {data,error}=await supabase.functions.invoke('afat-osm-city-ingest',{body:{
       city_key:cityKey,scope_label:claimed.scope_label||claimed.cell_key,
       bbox:{south,west,north,east},
     }});
     if(error||!data||data.error)throw new Error(data?.error||error?.message||'Source ingest failed.');
     const verified=await validatePersistedBatch(data);
     if(verified.error){
       // A remote call may have written data even if verification fails.
       // Retain the claimed cell for operator reconciliation; never retry it blindly.
       setQueueNotice('Cell '+claimed.cell_key+': '+verified.error+' Claim remains running; reconcile batch before retry.');
       return 'blocked';
     }
     const {data:closed,error:closeError}=await supabase.rpc('afat_complete_ingestion_cell',{
       p_cell_id:claimed.id,p_status:verified.batch.status,p_import_batch_id:verified.batchId,
       p_result:{candidate_only:true,accepted:verified.batch.inserted_count,
         rejected:verified.batch.rejected_count||0,import_batch_id:verified.batchId},
       p_error:verified.batch.error_summary||null,
     });
     if(closeError||closed?.import_batch_id!==verified.batchId||closed?.status!==verified.batch.status){
       setQueueNotice('Import evidence confirmed for '+verified.batchId+
         ', but queue completion is unverified. Reconcile the claimed cell before retry.');
       return 'blocked';
     }
     setQueueNotice('Queue cell completed: '+claimed.cell_key+
       '. Candidate roads accepted: '+Number(verified.batch.inserted_count||0)+
       '. Batch '+verified.batchId+'. Review is required before map promotion.');
     return 'verified';
   }catch(error:any){
     if(claimed){
       // An ambiguous network/remote failure must not reset a claimed cell
       // to retryable: source writes could already have happened.
       setQueueNotice('Claimed cell '+claimed.cell_key+' could not be verified: '+
         (error?.message||String(error))+'. Reconcile the running cell before retrying.');
     }else setQueueNotice(error?.message||'Queue claim failed.');
     return 'blocked';
   }finally{setQueueBusy(false);await refreshQueue();}
 };
 // Operator-triggered bounded source ingestion. Every cell must have a persisted,
 // matching import receipt before the next cell may be claimed. Stop on errors,
 // empty queue or ambiguous remote writes: never automatically retry uncertainty.
 const processVerifiedBatch=async()=>{
   if(running||queueBusy||batchRunning||!city?.id)return;
   const requested=Math.min(5,Math.max(1,queueCounts.pending||0));
   setBatchProgress({verified:0,requested});
   setBatchRunning(true);
   let verified=0;
   try{
     for(let i=0;i<requested;i++){
       const outcome=await runQueuedCell();
       if(outcome!=='verified')break;
       verified++;
       setBatchProgress({verified,requested});
       // Small pause avoids hammering the shared Overpass source.
       if(i+1<requested)await new Promise<void>(resolve=>setTimeout(resolve,1200));
     }
   }finally{
     setBatchRunning(false);
     await refreshQueue();
   }
 };
 const run=async()=>{
   if(running)return;
   setRunning(true);setResult(null);
   try{
     const coordinates=Object.fromEntries((['south','west','north','east'] as const).map(k=>[k,Number(bbox[k])]));
     const {south,west,north,east}=coordinates;
     if(![south,west,north,east].every(Number.isFinite)||south>=north||west>=east||
       south< -90||north>90||west< -180||east>180||
       north-south>0.18||east-west>0.18||(north-south)*(east-west)>0.018){
       setResult({error:'Invalid or oversized road cell. Choose smaller geographic bounds.'});return;
     }
     const payload={city_key:cityKey,scope_label:scope||'custom-cell',bbox:coordinates};
     const {data,error}=await supabase.functions.invoke('afat-osm-city-ingest',{body:payload});
     if(error||!data||typeof data!=='object'||data.error){
       setResult({error:data?.error||error?.message||'Ingestion request failed. No completed import was verified.'});return;
     }
     const batchId=typeof data.batch_id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.batch_id)?data.batch_id:null;
     if(!batchId){setResult({error:'Ingestion did not return a valid import batch. Completion is unverified.'});return;}
     // Compare with persisted, staff-authorized import evidence, not just the Edge Function reply.
     const {data:batch,error:batchError}=await supabase.from('afat_geo_import_batches')
       .select('id,status,input_count,inserted_count,rejected_count,source_key,import_mode,scope_label,finished_at,error_summary')
       .eq('id',batchId).maybeSingle();
     if(batchError||!batch){
       setResult({error:'Import response received, but saved evidence could not be read or authorized. Do not treat it as verified.',batch_id:batchId});return;
     }
     const countsMatch=Number(batch.input_count)===Number(data.input_way_count)&&
       Number(batch.inserted_count)===Number(data.accepted_count)&&
       Number(batch.rejected_count||0)===Number(data.rejected_count||0);
     const completed=['completed','completed_with_errors'].includes(batch.status);
     const evidenceValid=completed&&batch.status===data.status&&batch.source_key==='openstreetmap'&&
       batch.import_mode==='candidate_only'&&Boolean(batch.finished_at)&&countsMatch;
     if(!evidenceValid){
       setResult({error:'Import returned, but persisted source totals or final status do not agree. Manual review required.',batch_id:batchId});return;
     }
     setResult({...data,persisted_verified:true,confirmed_status:batch.status,confirmed_accepted:Number(batch.inserted_count),
       confirmed_rejected:Number(batch.rejected_count||0),error_summary:batch.error_summary});
   }catch(error:any){
     setResult({error:error?.message||'Could not verify the ingestion result.'});
   }finally{setRunning(false);}
 };
 return <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-500/[0.04] p-5">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div><div className="flex items-center gap-2 text-emerald-200"><DatabaseZap className="h-4 w-4"/><p className="text-[9px] font-black uppercase tracking-[0.22em]">{t('atlas.sourceIngestion')}</p></div><h2 className="mt-2 text-lg font-black">{t('atlas.sourceIngestionTitle')}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Imports a controlled road cell for any registered AFAT city. OSM remains attributed source evidence; topology stays candidate-only until AFAT review and corroboration.</p></div>
    <div className="flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-black/20 px-3 py-2 text-[9px] font-bold text-emerald-100/70"><ShieldCheck className="h-3.5 w-3.5"/>JWT + planner/admin gate</div>
   </div>
   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label className="text-[9px] font-black uppercase text-white/35">City<select value={cityKey} onChange={e=>setCityKey(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-white">{cities.map(c=><option key={c.city_key} value={c.city_key}>{c.city_name} · {c.country_code}</option>)}</select></label>
    <label className="text-[9px] font-black uppercase text-white/35">Scope label<input value={scope} onChange={e=>setScope(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm normal-case text-white" placeholder="central-1"/></label>
    {cityKey==='cm-yaounde'&&<label className="text-[9px] font-black uppercase text-white/35">Yaoundé preset<select value={scope} onChange={e=>choosePreset(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-white">{Object.entries(YAOUNDE_PRESETS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>}
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[9px] text-white/45"><p className="font-black uppercase">Target</p><p className="mt-2 text-sm font-black text-white">{city?.city_name||cityKey}</p><p className="mt-1 capitalize">{city?.learning_stage||'seed'} stage</p></div>
   </div>
   <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
    {(['south','west','north','east'] as const).map(k=><label key={k} className="text-[8px] font-black uppercase text-white/30">{k}<input value={bbox[k]} onChange={e=>setBbox(x=>({...x,[k]:e.target.value}))} inputMode="decimal" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm normal-case text-white"/></label>)}
   </div>
   <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
     <p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">Controlled queued OpenStreetMap ingestion</p>
     <p className="mt-1 text-xs text-white/50">Each import is independently claimed and checked against the persisted source batch. You can process one cell or up to five sequentially; any unverified response stops the sequence without automatic retry.</p>
     <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
       <span>Pending: {queueCounts.pending||0}</span><span>Running / review: {queueCounts.running||0}</span>
       <span>Completed: {queueCounts.completed||0}</span><span>Partial: {queueCounts.completed_with_errors||0}</span>
       <span>Failed: {queueCounts.failed||0}</span>
     </div>
     <button type="button" onClick={()=>void runQueuedCell()} disabled={queueBusy||batchRunning||running||!city?.id}
       className="mt-3 min-h-11 rounded-lg border border-cyan-300/30 bg-cyan-300/15 px-4 text-xs font-bold text-cyan-100 disabled:opacity-40">
       {queueBusy?'Processing claimed cell…':'Process next queued road cell'}
     </button>
     <button type="button" onClick={()=>void processVerifiedBatch()}
       disabled={queueBusy||batchRunning||running||!city?.id||!(queueCounts.pending>0)}
       className="mt-3 ml-2 min-h-11 rounded-lg border border-emerald-300/30 bg-emerald-300/15 px-4 text-xs font-bold text-emerald-100 disabled:opacity-40">
       {batchRunning?'Processing verified batch…':'Process up to 5 queued cells'}
     </button>
     {(batchRunning||batchProgress.requested>0)&&
       <p role="status" className="mt-2 text-xs text-emerald-100">
         Batch: {batchProgress.verified} of {batchProgress.requested} cells independently verified.
         {batchRunning?' Processing remains sequential.':''}
       </p>}
     {queueNotice&&<p role="status" className="mt-3 break-words text-xs text-cyan-100">{queueNotice}</p>}
   </div>
   <button onClick={run} disabled={running||!cityKey} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35">{running?<RefreshCw className="h-4 w-4 animate-spin"/>:<MapPinned className="h-4 w-4"/>}{running?'Ingesting controlled cell…':'Ingest city road cell'}</button>
   {result&&<div role="status" className={`mt-4 rounded-xl border p-4 ${result.error?'border-rose-300/20 bg-rose-400/10':'border-emerald-300/15 bg-black/20'}`}>{result.error?<><p className="text-xs font-bold text-rose-100">{result.error}</p>{result.batch_id&&<p className="mt-2 break-all text-[9px] text-white/55">Import batch: {result.batch_id}</p>}</>:<><p className="mb-3 text-xs font-bold text-emerald-200">Persisted import evidence confirmed · candidate geography only</p><div className="grid gap-3 sm:grid-cols-5"><K l="Status" v={result.confirmed_status}/><K l="Processed" v={result.processed_way_count||0}/><K l="Accepted source" v={result.confirmed_accepted}/><K l="Rejected" v={result.confirmed_rejected}/><K l="Topology staged" v={result.topology?.segments_prepared||0} icon/></div><p className="mt-3 break-all text-[9px] text-white/55">Import batch: {result.batch_id}</p><p className="mt-2 text-[9px] leading-5 text-white/35">{result.note}</p>{result.error_summary&&<p className="mt-2 text-[9px] text-amber-200">Partial import: {result.error_summary}</p>}</>}</div>}
 </section>;
}
function K({l,v,icon}:{l:string;v:React.ReactNode;icon?:boolean}){return <div><p className="text-[8px] font-black uppercase text-white/30">{l}</p><p className="mt-1 flex items-center gap-1 text-xs font-black">{icon&&<Route className="h-3.5 w-3.5 text-cyan-300"/>}{v}</p></div>}
export default AtlasIngestionControl;
