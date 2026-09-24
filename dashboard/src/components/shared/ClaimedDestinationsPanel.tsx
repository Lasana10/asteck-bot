import React,{useEffect,useState} from 'react';
import {Building2,RefreshCw,Save} from 'lucide-react';
import {fetchMyDestinationClaims,updateClaimedDestinationProfile} from '../../supabaseClient';

export function ClaimedDestinationsPanel(){
 const [items,setItems]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [drafts,setDrafts]=useState<Record<string,{official_name:string;description:string;local_directions:string;delivery_notes:string}>>({});

 const load=async()=>{
  setBusy(true);
  const {data,error}=await fetchMyDestinationClaims();
  setBusy(false);
  if(error){setNotice(error.message);return;}
  const claims=data?.claims||[];
  setItems(claims);
  const next:Record<string,any>={};
  claims.forEach((item:any)=>{
    const p=item.afat_places||{};
    const owner=p.metadata?.owner_profile||{};
    next[item.id]={
      official_name:owner.official_name||p.canonical_name||'',
      description:p.description||'',
      local_directions:p.local_directions||'',
      delivery_notes:owner.delivery_notes||'',
    };
  });
  setDrafts(next);setNotice('');
 };
 useEffect(()=>{void load();},[]);

 const save=async(item:any)=>{
  if(item.status!=='approved')return;
  const draft=drafts[item.id];
  if(!draft)return;
  setBusy(true);
  const {error}=await updateClaimedDestinationProfile(item.place_id,draft);
  setBusy(false);
  setNotice(error?error.message:'Destination profile updated. Coordinates and evidence status were left unchanged.');
  if(!error)await load();
 };

 if(!items.length&&!notice)return null;
 return <section className="rounded-[1.5rem] border border-cyan-300/10 bg-slate-950/70 p-5">
  <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-cyan-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">My destinations</p></div><h2 className="mt-1 text-xl font-black">Places you claim or manage</h2><p className="mt-1 text-xs leading-5 text-white/40">Approved managers can update public operating details. AFAT keeps coordinates and map evidence independently governed.</p></div><button onClick={load} disabled={busy} className="rounded-xl border border-white/10 p-3"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></div>
  <div className="mt-4 space-y-3">
   {items.map(item=>{
    const p=item.afat_places||{};const draft=drafts[item.id]||{official_name:'',description:'',local_directions:'',delivery_notes:''};const approved=item.status==='approved';
    return <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black">{p.canonical_name||'AFAT destination'}</p><p className="mt-1 text-[9px] uppercase text-white/35">{p.place_ref||''} · {item.claim_type}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${approved?'bg-emerald-300/10 text-emerald-200':item.status==='rejected'?'bg-rose-300/10 text-rose-200':'bg-amber-300/10 text-amber-100'}`}>{item.status}</span></div>
     {approved&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[8px] font-black uppercase tracking-wider text-white/35">Public name<input value={draft.official_name} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,official_name:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs normal-case text-white"/></label>
      <label className="text-[8px] font-black uppercase tracking-wider text-white/35">Description<input value={draft.description} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,description:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs normal-case text-white"/></label>
      <label className="text-[8px] font-black uppercase tracking-wider text-white/35">How people reach you<textarea value={draft.local_directions} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,local_directions:e.target.value}}))} className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs normal-case text-white"/></label>
      <label className="text-[8px] font-black uppercase tracking-wider text-white/35">Delivery notes<textarea value={draft.delivery_notes} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,delivery_notes:e.target.value}}))} className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs normal-case text-white"/></label>
      <button onClick={()=>save(item)} disabled={busy} className="sm:col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Save className="h-4 w-4"/>Save public operating details</button>
     </div>}
     {!approved&&<p className="mt-3 text-xs leading-5 text-white/40">AFAT review must approve this claim before management controls open.</p>}
    </article>;
   })}
  </div>
  {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
 </section>;
}
