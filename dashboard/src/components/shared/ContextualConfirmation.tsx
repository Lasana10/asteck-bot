import React,{useEffect,useState} from 'react';
import {CheckCircle2,MapPinCheck} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Confirmation={
  id:string;
  prompt_type:string;
  question:string;
  answer_options:string[];
  information_value:number;
};

export function ContextualConfirmation({assignment}:{assignment:any}){
  const [item,setItem]=useState<Confirmation|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const load=async()=>{
    if(!assignment?.id){setItem(null);return;}
    const {data,error}=await supabase.rpc('afat_contextual_confirmation_for_dispatch',{p_dispatch_id:assignment.id});
    if(error){setItem(null);return;}
    setItem(data||null);
  };

  useEffect(()=>{void load();},[assignment?.id,assignment?.status,assignment?.pickup_verified_at]);

  const answer=async(value:string)=>{
    if(!item?.id)return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('afat_answer_contextual_confirmation',{
      p_confirmation_id:item.id,
      p_answer:value,
    });
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setItem(null);
    setNotice(data?.requires_independent_corroboration
      ? 'Thanks. AFAT saved this as evidence and will seek independent confirmation before changing map truth.'
      : 'Thanks. Your observation was saved.');
  };

  if(!item&&!notice)return null;

  return <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-400/[0.05] p-4 sm:p-5">
    {item?<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-xl bg-cyan-300/10 p-2"><MapPinCheck className="h-5 w-5 text-cyan-200"/></div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Quick check · improve AFAT</p>
          <h3 className="mt-1 text-sm font-black">{item.question}</h3>
          <p className="mt-1 text-[10px] leading-4 text-white/40">One tap only. Your answer is evidence, not automatic map truth.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['yes','Yes'],
          ['no','No'],
          ['not_sure','Not sure'],
          ['better_point','Better point nearby'],
        ].filter(([value])=>!item.answer_options?.length||item.answer_options.includes(value)).map(([value,label])=>
          <button key={value} type="button" disabled={busy} onClick={()=>answer(value)}
            className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[9px] font-black uppercase text-white/70 disabled:opacity-35">{label}</button>
        )}
      </div>
    </div>:<div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200"/><p className="text-xs leading-5 text-white/55">{notice}</p></div>}
    {item&&notice&&<p className="mt-3 text-xs text-amber-100">{notice}</p>}
  </section>;
}
