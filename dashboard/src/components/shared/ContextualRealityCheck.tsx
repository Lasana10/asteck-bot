import React,{useEffect,useState} from 'react';
import {CheckCircle2,HelpCircle,MapPinCheck,RefreshCw} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Prompt={
 id:string;
 prompt_type:string;
 question:string;
 answer_options?:Array<string|{value?:string;label?:string}>;
 information_value?:number;
 expires_at?:string;
};

const FALLBACK=[
 {value:'yes',label:'Yes'},
 {value:'no',label:'No'},
 {value:'not_sure',label:'Not sure'},
 {value:'better_point',label:'Better point nearby'},
];

export function ContextualRealityCheck({dispatchId}:{dispatchId?:string|null}){
 const [prompt,setPrompt]=useState<Prompt|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');

 const load=async()=>{
  if(!dispatchId){setPrompt(null);return;}
  setBusy(true);
  const {data,error}=await supabase.rpc('afat_contextual_confirmation_for_dispatch',{p_dispatch_id:dispatchId});
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setPrompt(data||null);
 };
 useEffect(()=>{void load();},[dispatchId]);

 const answer=async(value:string)=>{
  if(!prompt?.id)return;
  setBusy(true);setNotice('');
  const {data,error}=await supabase.rpc('afat_answer_contextual_confirmation',{p_confirmation_id:prompt.id,p_answer:value});
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setNotice(data?.map_truth_changed===false
    ? 'Thanks. Your answer is evidence only; AFAT will wait for independent confirmation before changing map truth.'
    : 'Thanks. Your observation was recorded.');
  setPrompt(null);
 };

 if(!prompt&&!notice)return null;
 const options=(Array.isArray(prompt?.answer_options)&&prompt!.answer_options.length?prompt!.answer_options:FALLBACK)
   .map((item:any)=>typeof item==='string'?{value:item,label:item.replace(/_/g,' ')}:{value:item.value||'',label:item.label||String(item.value||'').replace(/_/g,' ')})
   .filter((item:any)=>['yes','no','not_sure','better_point'].includes(item.value));

 return <section className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.055] p-4">
  {prompt&&<>
   <div className="flex items-start justify-between gap-3">
    <div><div className="flex items-center gap-2"><MapPinCheck className="h-4 w-4 text-cyan-200"/><p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Quick reality check</p></div>
    <h3 className="mt-2 text-sm font-black">{prompt.question}</h3>
    <p className="mt-1 text-[10px] leading-5 text-white/40">One tap only. This observation never changes AFAT truth by itself.</p></div>
    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[8px] font-black text-white/40">VALUE {Math.round(Number(prompt.information_value||0))}</span>
   </div>
   <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{options.map((option:any)=><button key={option.value} type="button" disabled={busy} onClick={()=>answer(option.value)} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[10px] font-black capitalize text-white/70 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 disabled:opacity-40">{option.label}</button>)}</div>
  </>}
  {notice&&<div className="flex items-start gap-2 text-xs leading-5 text-white/55">{prompt?<HelpCircle className="mt-0.5 h-4 w-4 shrink-0"/>:<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200"/>}<span>{notice}</span>{!prompt&&dispatchId&&<button onClick={load} disabled={busy} className="ml-auto shrink-0"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button>}</div>}
 </section>;
}
