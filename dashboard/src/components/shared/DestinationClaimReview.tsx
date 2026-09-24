import React,{useEffect,useState} from 'react';
import {Building2,CheckCircle2,RefreshCw,ShieldCheck,XCircle} from 'lucide-react';
import {fetchDestinationClaims,reviewDestinationClaim} from '../../supabaseClient';

export function DestinationClaimReview(){
 const [items,setItems]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');

 const load=async()=>{
  setBusy(true);
  const {data,error}=await fetchDestinationClaims();
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setItems(data?.claims||[]);setNotice('');
 };
 useEffect(()=>{void load();},[]);

 const act=async(id:string,decision:'approve'|'reject'|'review')=>{
  setBusy(true);
  const {error}=await reviewDestinationClaim(id,{decision});
  setBusy(false);
  setNotice(error?error.message:`Claim marked ${decision}.`);
  if(!error)await load();
 };

 return <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
  <div className="flex items-center justify-between gap-3">
   <div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-violet-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-200">Destination claims</p></div><h2 className="mt-1 text-xl font-black">Who may manage public place details?</h2><p className="mt-1 text-xs leading-5 text-white/40">Approval grants profile-management rights only. It never verifies coordinates, entrances, roads or evidence.</p></div>
   <button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button>
  </div>
  <div className="mt-4 grid gap-3 lg:grid-cols-2">
   {items.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{item.afat_places?.canonical_name||'AFAT destination'}</p><p className="mt-1 text-[9px] uppercase text-white/35">{item.afat_places?.place_ref||''} · {item.claim_type} · {item.status}</p></div><ShieldCheck className="h-4 w-4 text-violet-200"/></div>
    <div className="mt-3 grid grid-cols-3 gap-2">
     <button onClick={()=>act(item.id,'approve')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-[8px] font-black uppercase text-emerald-100"><CheckCircle2 className="h-3 w-3"/>Approve</button>
     <button onClick={()=>act(item.id,'review')} disabled={busy} className="min-h-9 rounded-lg border border-amber-300/15 bg-amber-400/10 text-[8px] font-black uppercase text-amber-100">Review</button>
     <button onClick={()=>act(item.id,'reject')} disabled={busy} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-400/10 text-[8px] font-black uppercase text-rose-100"><XCircle className="h-3 w-3"/>Reject</button>
    </div>
   </article>)}
   {!items.length&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-xs text-white/35">No destination ownership or management claim is waiting for review.</p>}
  </div>
  {notice&&<p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
 </section>;
}
