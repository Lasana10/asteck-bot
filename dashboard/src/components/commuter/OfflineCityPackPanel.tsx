import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { cityPackAge, downloadOfflineCityPack, estimatePackBytes, readOfflineCityPack, removeOfflineCityPack, type AfatOfflineCityPack } from '../../services/offlineCityPack';

function cityKeyFromProfile(profile:any){
  const preferred=String(profile?.preferred_city||'yaounde').trim().toLowerCase();
  if(preferred.startsWith('cm-')) return preferred;
  if(preferred.includes('douala')) return 'cm-douala';
  return 'cm-yaounde';
}
function sizeLabel(bytes:number){
  if(bytes<1024) return `${bytes} B`;
  if(bytes<1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export function OfflineCityPackPanel({profile}:{profile:any}){
  const cityKey=cityKeyFromProfile(profile);
  const [pack,setPack]=useState<AfatOfflineCityPack|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{let active=true;void readOfflineCityPack(cityKey).then(value=>{if(active)setPack(value)}).catch(()=>{});return()=>{active=false};},[cityKey]);
  const age=useMemo(()=>cityPackAge(pack),[pack]);
  const bytes=useMemo(()=>estimatePackBytes(pack),[pack]);

  const download=async()=>{
    setBusy(true);setNotice('Preparing stable city knowledge for offline use…');
    try{
      const saved=await downloadOfflineCityPack(cityKey);
      setPack(saved);
      setNotice(`Offline pack saved · ${saved.places?.length||0} places · ${saved.access_points?.length||0} entrances · ${saved.transit_lines?.length||0} transit lines. Live conditions are not stored.`);
    }catch(error:any){setNotice(error?.message||'Offline pack could not be saved.');}
    setBusy(false);
  };
  const remove=async()=>{
    setBusy(true);
    try{await removeOfflineCityPack(cityKey);setPack(null);setNotice('Offline city pack removed from this device.');}
    catch(error:any){setNotice(error?.message||'Offline pack could not be removed.');}
    setBusy(false);
  };

  return <section className="rounded-2xl border border-sky-300/15 bg-sky-400/[0.04] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-300/10 text-sky-100"><WifiOff className="h-4 w-4"/></span><div><p className="text-[9px] font-black uppercase tracking-widest text-sky-200/70">Offline city pack</p><h3 className="mt-1 text-sm font-black text-white">Keep essential city knowledge on this phone</h3><p className="mt-1 max-w-2xl text-[11px] leading-5 text-white/40">Places, reviewed entrances and transit structure can be saved. Live supply, incidents, closures and traffic always require a network connection.</p></div></div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={download} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-3 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">{pack?<RefreshCw className={`h-3.5 w-3.5 ${busy?'animate-spin':''}`}/>:<Download className="h-3.5 w-3.5"/>}{pack?'Update':'Save pack'}</button>
        {pack&&<button type="button" onClick={remove} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/45 disabled:opacity-40" aria-label="Remove offline city pack"><Trash2 className="h-3.5 w-3.5"/></button>}
      </div>
    </div>
    {pack&&<div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold text-white/45"><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{pack.city_name}</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{pack.places?.length||0} places</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{pack.access_points?.length||0} entrances</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{pack.transit_lines?.length||0} lines</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{sizeLabel(bytes)}</span><span className={`rounded-full border px-3 py-1.5 ${age.stale?'border-amber-300/15 bg-amber-300/10 text-amber-100':'border-emerald-300/15 bg-emerald-300/10 text-emerald-100'}`}>{age.ageHours==null?'age unknown':age.ageHours<1?'saved recently':`${Math.round(age.ageHours)}h old`}{age.stale?' · update recommended':''}</span></div>}
    {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-white/55">{notice}</p>}
  </section>;
}
export default OfflineCityPackPanel;
