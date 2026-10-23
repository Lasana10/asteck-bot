import React,{useEffect,useState} from 'react';
import {authenticatedApiHeaders,getApiBaseUrl} from '../../supabaseClient';
type ReviewCase={id:string;operator_id:string;plate_number:string;type:string;capacity:number;clearance_status:string;operator?:{full_name?:string;verification_status?:string;operator_application_status?:string}|null;documents:{document_type:string;status:string;due_at?:string|null;verified_at?:string|null;has_document:boolean}[]};
async function staffApi(path:string,options:RequestInit={}){
 const auth=await authenticatedApiHeaders();
 const response=await fetch(`${getApiBaseUrl()}${path}`,{
   ...options,headers:{'content-type':'application/json',...auth,...options.headers},
   signal:AbortSignal.timeout(20000),
 });
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(body?.error||'Vehicle review service is unavailable');
 return body;
}
export function VehicleClearanceReview(){
 const [cases,setCases]=useState<ReviewCase[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [reasons,setReasons]=useState<Record<string,string>>({});
 const refresh=async()=>{
  setBusy(true);
  try{const result=await staffApi('/api/mobility/vehicle-clearance/queue');setCases(result.cases||[]);setNotice('');}
  catch(error:any){setNotice(error?.message||'Review queue unavailable');}
  finally{setBusy(false);}
 };
 useEffect(()=>{void refresh();},[]);
 const decide=async(id:string,decision:string)=>{
  const reason=String(reasons[id]||'').trim();
  if(reason.length<15){setNotice('Document the evidence examined and the decision reason (15 characters minimum).');return;}
  const subject=cases.find(item=>item.id===id);
  if(decision==='verified'&&subject&&!reason.toUpperCase().includes(subject.plate_number.toUpperCase())){
   setNotice('Include the physically inspected plate number in the written clearance evidence.');return;
  }
  if(decision==='verified'&&!window.confirm('Confirm you personally inspected the vehicle and corresponding verified documents? This will permit real departure publication.'))return;
  setBusy(true);
  try{
   await staffApi(`/api/mobility/vehicle-clearance/${encodeURIComponent(id)}/review`,{
    method:'POST',body:JSON.stringify({decision,reason}),
   });
   setNotice(`Staff vehicle review recorded: ${decision}. Registration evidence and decisions remain auditable.`);
   setReasons(old=>({...old,[id]:''}));
   const result=await staffApi('/api/mobility/vehicle-clearance/queue');
   setCases(result.cases||[]);
  }catch(error:any){setNotice(error?.message||'Vehicle review failed');}
  finally{setBusy(false);}
 };
 return <section className="rounded-3xl border border-white/10 bg-slate-950/85 p-4 text-white">
  <div className="flex items-start justify-between gap-3"><div>
   <h3 className="text-sm font-black">Vehicle clearance · human review</h3>
   <p className="mt-1 text-xs text-white/50">Registration is not clearance. Verified vehicle registration and insurance documents, approved operator and human inspection are required for approval.</p>
  </div><button type="button" disabled={busy} onClick={()=>void refresh()} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40">Refresh</button></div>
  {notice&&<p role="status" className="mt-3 rounded-lg border border-amber-200/20 p-3 text-xs text-amber-100">{notice}</p>}
  <div className="mt-4 max-h-96 space-y-3 overflow-auto">
   {cases.map(item=>{
    const documents=[item.type==='moto'?'bike_registration':'vehicle_registration','insurance',...(item.type==='moto'?['helmet_compliance']:[])].map(type=>({
      type,matched:item.documents.filter(d=>d.document_type===type),
    }));
    const eligible=item.operator?.verification_status==='verified'&&item.operator?.operator_application_status==='APPROVED'&&
      documents.every(d=>d.matched.some(x=>x.status==='verified'&&Boolean(x.verified_at)&&x.has_document&&(!x.due_at||Date.parse(x.due_at)>Date.now())));
    return <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
     <p className="text-sm font-black">{item.plate_number} · {item.type} · {item.capacity} seats</p>
     <p className="mt-1 text-xs text-white/55">{item.operator?.full_name||'Operator'} · {item.clearance_status}</p>
     <p className="mt-2 text-xs text-white/60">{documents.map(d=>`${d.type}: ${d.matched.some(x=>x.status==='verified'&&Boolean(x.verified_at)&&x.has_document&&(!x.due_at||Date.parse(x.due_at)>Date.now()))?'verified, current document':'not ready for clearance'}`).join(' · ')}</p>
     <p className="mt-1 text-[11px] text-white/40">Human physical inspection and matching vehicle identity must also be established outside automated record checks.</p>
     <textarea value={reasons[item.id]||''} onChange={e=>setReasons(old=>({...old,[item.id]:e.target.value}))}
      placeholder={`Inspected plate ${item.plate_number}, verified vehicle registration, insurance, physical match and factual reason`}
      className="mt-3 min-h-20 w-full rounded-xl border border-white/15 bg-slate-900 p-3 text-xs"/>
     <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={busy||!eligible||item.clearance_status==='verified'}
       onClick={()=>void decide(item.id,'verified')} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-30">Approve after inspection</button>
      <button type="button" disabled={busy||item.clearance_status==='under_review'} onClick={()=>void decide(item.id,'under_review')} className="rounded-lg border border-amber-200/25 px-3 py-2 text-xs disabled:opacity-30">Need evidence</button>
      <button type="button" disabled={busy||item.clearance_status==='restricted'} onClick={()=>void decide(item.id,'restricted')} className="rounded-lg border border-rose-200/25 px-3 py-2 text-xs disabled:opacity-30">Reject</button>
     </div>
    </article>;
   })}
   {!cases.length&&!busy&&<p className="text-xs text-white/50">No registered vehicles to review. Operators can register from their existing workspace.</p>}
  </div>
 </section>;
}
