import React, { useState } from 'react';
import { Globe2, Plus } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export function CityGenesisPanel({onCreated}:{onCreated?:()=>void}){
  const [form,setForm]=useState({key:'',name:'',countryCode:'',countryName:'',timezone:'Africa/Douala',currency:'XAF',language:'en'});
  const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); setBusy(true); setNotice('');
    const {data,error}=await supabase.rpc('afat_register_city_profile',{
      p_city_key:form.key,p_city_name:form.name,p_country_code:form.countryCode,p_country_name:form.countryName,
      p_timezone:form.timezone,p_currency_code:form.currency,p_default_language:form.language,
      p_supported_languages:[form.language],p_transport_modes:['walk','moto','taxi','car','minibus','bus'],p_local_terms:{},
    });
    if(!error){
      const seeded=await supabase.rpc('afat_seed_city_source_plan',{p_city_key:data?.city_key||form.key});
      setNotice(seeded.error?`${data?.city_key||form.key} registered, but source-plan bootstrap needs attention: ${seeded.error.message}`:`${data?.city_key||form.key} registered with its global source strategy.`);
      onCreated?.();
    }else setNotice(error.message);
    setBusy(false);
  };
  return <section className="rounded-[1.5rem] border border-blue-300/15 bg-blue-400/[0.04] p-5">
    <div className="flex items-start gap-3"><Globe2 className="h-5 w-5 text-blue-200"/><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-200">City Genesis</p><h2 className="mt-1 text-lg font-black">Start AFAT in another city</h2><p className="mt-1 text-xs leading-5 text-white/45">Create the local learning profile first. Source ingestion, observation, verification and operations then grow against this city context rather than copying Yaoundé facts.</p></div></div>
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
  </section>;
}
function Input({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){
 return <label className="text-[9px] font-black uppercase tracking-wider text-white/35">{label}<input required value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none"/></label>;
}
