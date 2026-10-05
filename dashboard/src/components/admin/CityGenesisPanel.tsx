import React, { useCallback, useEffect, useState } from 'react';
import { Globe2, MapPinned, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { CityExpansionRunner } from './CityExpansionRunner';
import { EvidenceReviewQueue } from './EvidenceReviewQueue';
import { OperationalProofPanel } from './OperationalProofPanel';
import { OperationalActivationLadder } from './OperationalActivationLadder';
import { GraphHealthPanel } from './GraphHealthPanel';
import { PerformanceObservabilityPanel } from './PerformanceObservabilityPanel';
import { CityLaunchReadinessPanel } from './CityLaunchReadinessPanel';

type CityProfile={city_key:string;city_name:string;country_code:string;country_name?:string|null;status:string;timezone?:string|null;currency_code?:string|null};

const DOUALA_PRESET={key:'cm-douala',name:'Douala',countryCode:'CM',countryName:'Cameroon',timezone:'Africa/Douala',currency:'XAF',language:'fr'};

export function CityGenesisPanel({onCreated}:{onCreated?:()=>void}){
  const [form,setForm]=useState({key:'',name:'',countryCode:'',countryName:'',timezone:'Africa/Douala',currency:'XAF',language:'en'});
  const [cities,setCities]=useState<CityProfile[]>([]);
  const [selectedCityKey,setSelectedCityKey]=useState('cm-yaounde');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [loadingCities,setLoadingCities]=useState(false);
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));

  const loadCities=useCallback(async(preferredKey?:string)=>{
    setLoadingCities(true);
    const {data,error}=await supabase.from('afat_city_profiles')
      .select('city_key,city_name,country_code,country_name,status,timezone,currency_code')
      .eq('status','active').order('country_code',{ascending:true}).order('city_name',{ascending:true});
    setLoadingCities(false);
    if(error){setNotice(error.message);return;}
    const next=(data||[]) as CityProfile[];setCities(next);
    setSelectedCityKey(current=>{const requested=preferredKey||current;if(next.some(city=>city.city_key===requested))return requested;return next[0]?.city_key||'';});
  },[]);

  useEffect(()=>{void loadCities();},[loadCities]);

  const applyDoualaPreset=()=>{
    setForm(DOUALA_PRESET);
    setNotice('Douala metadata prepared. AFAT has not guessed a city boundary, created coverage or claimed any real-world evidence.');
  };

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setNotice('');const cityKey=form.key.trim().toLowerCase();
    const {data,error}=await supabase.rpc('afat_register_city_profile',{p_city_key:cityKey,p_city_name:form.name.trim(),p_country_code:form.countryCode.trim().toUpperCase(),p_country_name:form.countryName.trim(),p_timezone:form.timezone.trim(),p_currency_code:form.currency.trim().toUpperCase(),p_default_language:form.language.trim().toLowerCase(),p_supported_languages:[form.language.trim().toLowerCase()],p_transport_modes:['walk','moto','taxi','car','minibus','bus'],p_local_terms:{}});
    if(!error){
      const registeredKey=data?.city_key||cityKey;
      const seeded=await supabase.rpc('afat_seed_city_source_plan',{p_city_key:registeredKey});
      if(seeded.error)setNotice(`${registeredKey} registered, but source-plan bootstrap needs attention: ${seeded.error.message}`);
      else{
        const operating=await supabase.rpc('afat_seed_city_operating_pack',{p_city_key:registeredKey});
        setNotice(operating.error?`${registeredKey} registered with source strategy, but operating-pack bootstrap needs attention: ${operating.error.message}`:`${registeredKey} registered with its own source strategy and operating pack. Next: approve a working envelope, ingest sources, inspect graph health, then collect physical proof.`);
      }
      await loadCities(registeredKey);onCreated?.();
    }else setNotice(error.message);setBusy(false);
  };
  const selectedCity=cities.find(city=>city.city_key===selectedCityKey)||null;
  const doualaExists=cities.some(city=>city.city_key==='cm-douala');

  return <div className="space-y-4">
    <section className="overflow-hidden rounded-[1.7rem] border border-blue-300/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,.12),transparent_34%),rgba(30,64,175,.05)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3"><Globe2 className="mt-0.5 h-5 w-5 text-blue-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-200">City Genesis</p><h2 className="mt-1 text-lg font-black">Launch AFAT as a repeatable African-city operating kernel</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">A city is not “live” because its name was added. AFAT now treats identity, reviewed geography, ingestion, graph health and physical operating proof as separate launch stages.</p></div></div>
        {!doualaExists&&<button type="button" onClick={applyDoualaPreset} className="flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100"><Sparkles className="h-3.5 w-3.5"/>Prepare Douala</button>}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-5">
        {[
          ['01','Identity','Profile + operating pack'],['02','Envelope','Human-reviewed geography'],['03','Ingest','City-scoped source cells'],['04','Graph','Connected routing topology'],['05','Proof','Real movement + marketplace evidence'],
        ].map(([n,title,detail])=><div key={n} className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[8px] font-black text-blue-200/60">{n}</p><p className="mt-1 text-xs font-black text-white">{title}</p><p className="mt-1 text-[9px] leading-4 text-white/32">{detail}</p></div>)}
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input label="City key" value={form.key} onChange={v=>set('key',v)} placeholder="cm-douala"/><Input label="City" value={form.name} onChange={v=>set('name',v)} placeholder="Douala"/><Input label="Country code" value={form.countryCode} onChange={v=>set('countryCode',v)} placeholder="CM"/><Input label="Country" value={form.countryName} onChange={v=>set('countryName',v)} placeholder="Cameroon"/><Input label="Timezone" value={form.timezone} onChange={v=>set('timezone',v)} placeholder="Africa/Douala"/><Input label="Currency" value={form.currency} onChange={v=>set('currency',v)} placeholder="XAF"/><Input label="Default language" value={form.language} onChange={v=>set('language',v)} placeholder="fr"/><button disabled={busy} className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Plus className="h-4 w-4"/>{busy?'Registering…':'Register city'}</button></form>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3"><MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"/><p className="text-[10px] leading-5 text-amber-50/55">Registration never creates a municipal boundary. The working envelope below must come from a reviewed source or deliberate human approval before any ingestion cells are seeded.</p></div>
      {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
    </section>

    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-white/35">Active city workspace</p><h3 className="mt-1 text-lg font-black">Operate one city without leaking proof from another</h3><p className="mt-1 text-xs leading-5 text-white/40">Readiness, operational proof, graph health, performance and ingestion are scoped to the selected city.</p></div><button type="button" onClick={()=>void loadCities()} disabled={loadingCities} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${loadingCities?'animate-spin':''}`}/></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><select value={selectedCityKey} onChange={e=>setSelectedCityKey(e.target.value)} disabled={!cities.length} className="min-h-12 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-40">{!cities.length&&<option value="">No active city profile</option>}{cities.map(city=><option key={city.city_key} value={city.city_key}>{city.city_name} · {city.country_code} · {city.city_key}</option>)}</select><div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right"><p className="text-[8px] font-black uppercase text-white/30">Selected</p><p className="mt-1 text-xs font-black text-cyan-100">{selectedCity?.city_name||'—'}</p></div></div>
    </section>

    {selectedCityKey&&<CityLaunchReadinessPanel key={`launch-${selectedCityKey}`} cityKey={selectedCityKey} cityName={selectedCity?.city_name}/>} 
    {selectedCityKey&&<OperationalProofPanel key={`proof-${selectedCityKey}`} cityKey={selectedCityKey}/>} 
    {selectedCityKey&&<OperationalActivationLadder key={`activate-${selectedCityKey}`} cityKey={selectedCityKey}/>} 
    {selectedCityKey&&<GraphHealthPanel key={`graph-${selectedCityKey}`} cityKey={selectedCityKey}/>} 
    {selectedCityKey&&<PerformanceObservabilityPanel key={`perf-${selectedCityKey}`} cityKey={selectedCityKey}/>} 
    {selectedCityKey&&<CityExpansionRunner key={`expand-${selectedCityKey}`} cityKey={selectedCityKey}/>} 
    <EvidenceReviewQueue/>
  </div>;
}
function Input({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){return <label className="text-[9px] font-black uppercase tracking-wider text-white/35">{label}<input required value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none"/></label>}
