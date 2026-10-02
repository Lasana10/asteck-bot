import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, Plus, RefreshCw, Route, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type IngestCell = {
  id: string;
  cell_key: string;
  scope_label: string;
  south: number;
  west: number;
  north: number;
  east: number;
  priority: number;
  status: 'pending'|'running'|'completed'|'completed_with_errors'|'failed';
  last_batch_id?: string|null;
  last_result?: any;
  last_run_at?: string|null;
};

export function CityGenesisPanel({onCreated}:{onCreated?:()=>void}){
  const [form,setForm]=useState({key:'',name:'',countryCode:'',countryName:'',timezone:'Africa/Douala',currency:'XAF',language:'en'});
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [cells,setCells]=useState<IngestCell[]>([]);
  const [expansionBusy,setExpansionBusy]=useState(false);
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));

  const loadCells=async()=>{
    const {data,error}=await supabase.from('afat_city_ingest_cells')
      .select('id,cell_key,scope_label,south,west,north,east,priority,status,last_batch_id,last_result,last_run_at')
      .order('priority',{ascending:false});
    if(error){ setNotice(error.message); return; }
    setCells((data||[]) as IngestCell[]);
  };

  useEffect(()=>{ void loadCells(); },[]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); setBusy(true); setNotice('');
    const {data,error}=await supabase.rpc('afat_register_city_profile',{
      p_city_key:form.key,p_city_name:form.name,p_country_code:form.countryCode,p_country_name:form.countryName,
      p_timezone:form.timezone,p_currency_code:form.currency,p_default_language:form.language,
      p_supported_languages:[form.language],p_transport_modes:['walk','moto','taxi','car','minibus','bus'],p_local_terms:{},
    });
    if(!error){
      const cityKey=data?.city_key||form.key;
      const seeded=await supabase.rpc('afat_seed_city_source_plan',{p_city_key:cityKey});
      if(seeded.error){
        setNotice(`${cityKey} registered, but source-plan bootstrap needs attention: ${seeded.error.message}`);
      }else{
        const operating=await supabase.rpc('afat_seed_city_operating_pack',{p_city_key:cityKey});
        setNotice(operating.error
          ? `${cityKey} registered with source strategy, but operating-pack bootstrap needs attention: ${operating.error.message}`
          : `${cityKey} registered with its source strategy, country/city operating pack and portable adapter contracts.`);
      }
      onCreated?.();
    }else setNotice(error.message);
    setBusy(false);
  };

  const nextCell=useMemo(()=>cells.find(cell=>cell.status==='pending'||cell.status==='failed')||null,[cells]);
  const completeCount=cells.filter(cell=>cell.status==='completed'||cell.status==='completed_with_errors').length;

  const runCell=async(cell:IngestCell)=>{
    setExpansionBusy(true);
    setNotice(`Running ${cell.scope_label}…`);
    await supabase.rpc('afat_mark_city_ingest_cell',{p_cell_id:cell.id,p_status:'running',p_batch_id:null,p_result:{automatic_truth:false,started_from:'city_genesis'}});
    const {data,error}=await supabase.functions.invoke('afat-osm-city-ingest',{
      body:{
        city_key:'cm-yaounde',
        scope_label:cell.scope_label,
        bbox:{south:cell.south,west:cell.west,north:cell.north,east:cell.east},
      },
    });
    const result=data||{};
    const status=error ? 'failed' : (result.status==='completed_with_errors'?'completed_with_errors':'completed');
    await supabase.rpc('afat_mark_city_ingest_cell',{
      p_cell_id:cell.id,
      p_status:status,
      p_batch_id:result.batch_id||null,
      p_result:error?{error:error.message,automatic_truth:false}:result,
    });
    setNotice(error
      ? `${cell.scope_label} failed without being hidden: ${error.message}`
      : `${cell.scope_label} ingested ${Number(result.accepted_count||0)} source roads as candidate topology. Nothing was auto-verified.`);
    await loadCells();
    setExpansionBusy(false);
  };

  const refreshMissions=async()=>{
    setExpansionBusy(true);
    const {data,error}=await supabase.rpc('afat_refresh_uncertainty_missions',{p_city:'Yaoundé',p_limit:24});
    setNotice(error ? error.message : `Mission refresh complete: ${data?.created_uncertainty_missions||0} evidence-gap missions created; ${data?.cancelled_legacy_edge_missions||0} legacy edge missions retired.`);
    setExpansionBusy(false);
  };

  return <div className="space-y-4">
    <section className="rounded-[1.5rem] border border-blue-300/15 bg-blue-400/[0.04] p-5">
      <div className="flex items-start gap-3"><Globe2 className="h-5 w-5 text-blue-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-200">City Genesis</p><h2 className="mt-1 text-lg font-black">Start AFAT in another city</h2><p className="mt-1 text-xs leading-5 text-white/45">Create the local learning profile first. AFAT then seeds a country/city operating pack, source strategy and portable adapter contracts so the city learns from its own evidence instead of copying Yaoundé facts.</p></div></div>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="City key" value={form.key} onChange={v=>set('key',v)} placeholder="cm-douala" />
        <Input label="City" value={form.name} onChange={v=>set('name',v)} placeholder="Douala" />
        <Input label="Country code" value={form.countryCode} onChange={v=>set('countryCode',v)} placeholder="CM" />
        <Input label="Country" value={form.countryName} onChange={v=>set('countryName',v)} placeholder="Cameroon" />
        <Input label="Timezone" value={form.timezone} onChange={v=>set('timezone',v)} placeholder="Africa/Douala" />
        <Input label="Currency" value={form.currency} onChange={v=>set('currency',v)} placeholder="XAF" />
        <Input label="Default language" value={form.language} onChange={v=>set('language',v)} placeholder="en" />
        <button disabled={busy} className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Plus className="h-4 w-4"/>Register city</button>
      </form>
      {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
    </section>

    {!!cells.length && <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><Route className="h-5 w-5 text-emerald-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Yaoundé expansion</p><h2 className="mt-1 text-lg font-black">Fill the real road graph cell by cell</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">Each run uses the secured OSM ingestion function, retains attribution, creates candidate topology and leaves verification to evidence. It does not turn imported roads into automatic truth.</p></div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right"><p className="text-lg font-black text-white">{completeCount}/{cells.length}</p><p className="text-[8px] font-black uppercase tracking-wider text-white/30">cells ingested</p></div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {cells.map(cell=><div key={cell.id} className="rounded-xl border border-white/10 bg-black/15 p-3"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black text-white">{cell.scope_label}</p><span className={`rounded-full px-2 py-1 text-[7px] font-black uppercase ${cell.status==='completed'?'bg-emerald-400/15 text-emerald-200':cell.status==='failed'?'bg-rose-400/15 text-rose-200':cell.status==='running'?'bg-cyan-400/15 text-cyan-200':'bg-white/5 text-white/35'}`}>{cell.status}</span></div><p className="mt-2 text-[9px] text-white/30">Priority {cell.priority}</p>{cell.status!=='completed'&&<button disabled={expansionBusy} onClick={()=>void runCell(cell)} className="mt-3 min-h-9 w-full rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 text-[8px] font-black uppercase text-emerald-100 disabled:opacity-35">Run cell</button>}</div>)}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={expansionBusy||!nextCell} onClick={()=>nextCell&&void runCell(nextCell)} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${expansionBusy?'animate-spin':''}`}/>Run next priority cell</button>
        <button disabled={expansionBusy} onClick={()=>void refreshMissions()} className="flex min-h-11 items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 text-[9px] font-black uppercase text-violet-100 disabled:opacity-35"><Sparkles className="h-4 w-4"/>Refresh evidence missions</button>
      </div>
    </section>}
  </div>;
}
function Input({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){
 return <label className="text-[9px] font-black uppercase tracking-wider text-white/35">{label}<input required value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none"/></label>;
}
