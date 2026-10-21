import React,{useEffect,useState} from 'react';
import {getOperatorComplianceRecords,submitOperatorComplianceDocument} from '../../services/operatorComplianceDocuments';

type RecordRow={id:string;document_type:string;status:string;verified_at?:string|null;due_at?:string|null};
const wanted=['vehicle_registration','bike_registration','helmet_compliance','insurance','license','national_id'];
const titles:Record<string,string>={
 vehicle_registration:'Vehicle registration card',bike_registration:'Motorcycle registration',helmet_compliance:'Helmet and rider safety evidence',insurance:'Vehicle insurance',
 license:'Driver licence',national_id:'National ID',
};
export function OperatorComplianceEvidence({profileId,onChanged}:{profileId:string;onChanged:()=>void}){
 const [rows,setRows]=useState<RecordRow[]>([]);
 const [files,setFiles]=useState<Record<string,File|null>>({});
 const [loading,setLoading]=useState(false);
 const [active,setActive]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=async()=>{
  setLoading(true);
  try{setRows((await getOperatorComplianceRecords(profileId)).filter(r=>wanted.includes(r.document_type)));
   setNotice('');}
  catch(error:any){setNotice(error?.message||'Unable to load compliance documents');}
  finally{setLoading(false);}
 };
 useEffect(()=>{if(profileId)void refresh();},[profileId]);
 const upload=async(row:RecordRow)=>{
  const file=files[row.id];if(!file)return;
  setActive(row.id);setNotice('');
  try{
   await submitOperatorComplianceDocument(row.id,file);
   setNotice(`${titles[row.document_type]} submitted privately. Human verification is still required before departure publication.`);
   setFiles(old=>({...old,[row.id]:null}));await refresh();onChanged();
  }catch(error:any){setNotice(error?.message||'Document upload failed');}
  finally{setActive('');}
 };
 return <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-white">
  <div className="flex items-center justify-between gap-3"><div>
   <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">Operator credential evidence</p>
   <h2 className="mt-2 text-lg font-black">Submit real documents for staff review</h2>
   <p className="mt-2 text-xs leading-5 text-white/60">Documents are private, not published on AFAT maps. An uploaded file is not a verified credential or cleared vehicle.</p>
  </div><button disabled={loading||!!active} onClick={()=>void refresh()} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-50">Refresh</button></div>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
   {wanted.filter(type=>rows.some(row=>row.document_type===type)).map(type=>{
    const row=rows.find(r=>r.document_type===type);
    const file=row?files[row.id]:null;
    return <div key={type} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
     <p className="text-sm font-semibold">{titles[type]}</p>
     <p className="mt-1 text-xs text-white/50">{row?.status||'Record not yet created'}</p>
     {row?.status==='verified'&&<p className="mt-2 text-[10px] text-emerald-200">Staff verified · replacing the file will reset it to pending review</p>}
     {row&&<>
      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
       aria-label={`Upload ${titles[type]}`} disabled={Boolean(active)}
       onChange={e=>setFiles(old=>({...old,[row.id]:e.target.files?.[0]||null}))}
       className="mt-3 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-200 file:px-3 file:py-2 file:text-slate-900"/>
      <button type="button" disabled={!file||Boolean(active)||loading}
       onClick={()=>void upload(row)}
       className="mt-3 rounded-lg bg-cyan-200 px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-40">
       {active===row.id?'Uploading privately…':'Submit for human review'}
      </button>
     </>}
    </div>;
   })}
  </div>
  {notice&&<p role="status" className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-white/80">{notice}</p>}
 </section>;
}
