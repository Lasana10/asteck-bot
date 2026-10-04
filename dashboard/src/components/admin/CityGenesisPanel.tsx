import React, { useCallback, useEffect, useState } from 'react';
import { Globe2, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { CityExpansionRunner } from './CityExpansionRunner';

type CityProfile = { city_key:string; city_name:string; country_code:string; country_name?:string|null; status:string; timezone?:string|null; currency_code?:string|null };

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
    const {data,error}=await supabase
      .from('afat_city_profiles')
      .select('city_key,city_name,country_code,country_name,status,timezone,currency_code')
      .eq('status','active')
      .order('country_code',{ascending:true})
      .order('city_name',{ascending:true});
    setLoadingCities(false);
    if(error){setNotice(error.message);return;}
    const next=(data||[]) as CityProfile[];
    setCities(next);
    const requested=preferredKey||selectedCityKey;
    if(next.some(city=>city.city_key===requested)) setSelectedCityKey(requested);
    else if(next[0]?.city_key) setSelectedCityKey(next[0].city_key);
  },[selectedCityKey]);

  useEffect(()=>{void loadCities();},[]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); setBusy(true); setNotice('');
    const cityKey=form.key.trim().toLowerCase();
    const {data,error}=await supabase.rpc('afat_register_city_profile',{
      p_city_key:cityKey,p_city_name:form.name.trim(),p_country_code:form.countryCode.trim().toUpperCase(),p_country_name:form.countryName.trim(),
      p_timezone:form.timezone.trim(),p_currency_code:form.currency.trim().toUpperCase(),p_default_language:form.language.trim().toLowerCase(),
      p_supported_languages:[form.language.trim().toLowerCase()],p_transport_modes:['walk','moto','taxi','car','minibus','bus'],p_local_terms:{},
    });
    if(!error){
      const registeredKey=data?.city_key||cityKey;
      const seeded=await supabase.rpc('afat_seed_city_source_plan',{p_city_key:registeredKey});
      if(seeded.error){
        setNotice(`${registeredKey} registered, but source-plan bootstrap needs attention: ${seeded.error.message}`);
      }else{
        const operating=await supabase.rpc('afat_seed_city_operating_pack',{p_city_key:registeredKey});
        setNotice(operating.error
          ? `${registeredKey} registered with source strategy, but operating-pack bootstrap needs attention: ${operating.error.message}`
          : `${registeredKey} registered. Select it below, attach a reviewed working envelope, then seed and run its own ingestion cells.`);
      }
      await loadCities(registeredKey);
      onCreated?.();
    }else setNotice(error.message);
    setBusy(false);
  };

  const selectedCity=cities.find(city=>city.city_key===selectedCityKey)||null;

  return <div className="space-y-4">
    <section className="rounded-[1.5rem] border border-blue-300/15 bg-blue-400/[0.04] p-5">
      <div className="flex items-start gap-3"><Globe2 className="h-5 w-5 text-blue-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-200">City Genesis</p><h2 className="mt-1 text-lg font-black">Start AFAT in another city</h2><p className="mt-1 text-xs leading-5 text-white/45">Register the local city profile first. AFAT seeds country/city operating rules and source strategy, but it does not guess a municipal boundary. Select the city afterwards and attach only a reviewed working envelope before ingestion.</p></div></div>
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

    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Active city workspace</p>
          <h3 className="mt-1 text-lg font-black">Choose which city AFAT is expanding</h3>
          <p className="mt-1 text-xs leading-5 text-white/40">The queue, source ingest and progress below are scoped to this city. Switching cities never copies Yaoundé evidence into another city.</p>
        </div>
        <button type="button" onClick={()=>void loadCities()} disabled={loadingCities} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${loadingCities?'animate-spin':''}`}/></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <select value={selectedCityKey} onChange={e=>setSelectedCityKey(e.target.value)} disabled={!cities.length} className="min-h-12 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-40">
          {!cities.length&&<option value="">No active city profile</option>}
          {cities.map(city=><option key={city.city_key} value={city.city_key}>{city.city_name} · {city.country_code} · {city.city_key}</option>)}
        </select>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right"><p className="text-[8px] font-black uppercase text-white/30">Selected</p><p className="mt-1 text-xs font-black text-cyan-100">{selectedCity?.city_name||'—'}</p></div>
      </div>
    </section>

    {selectedCityKey&&<CityExpansionRunner key={selectedCityKey} cityKey={selectedCityKey} />}
  </div>;
}

function Input({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){
 return <label className="text-[9px] font-black uppercase tracking-wider text-white/35">{label}<input required value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none"/></label>;
}
