import React,{useEffect,useMemo,useState} from 'react';
import {Activity,BusFront,Database,Globe2,Landmark,Play,RefreshCw,ShieldCheck} from 'lucide-react';
import {supabase} from '../../supabaseClient';

type Adapter={
  adapter_key:string; type:'source'|'authority'|'transit'|'payment'; name:string; protocol:string;
  standards?:string[]; binding_state:string; priority:number; last_success_at?:string|null; connection_claimed?:boolean;
};

export function CityOperatingKernelPanel({cityKey='cm-yaounde'}:{cityKey?:string}){
  const [snapshot,setSnapshot]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const load=async()=>{
    setBusy(true); setNotice('');
    const {data,error}=await supabase.rpc('afat_city_operating_snapshot',{p_city_key:cityKey});
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setSnapshot(data||null);
  };

  useEffect(()=>{void load();},[cityKey]);

  const runCycle=async()=>{
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('afat_run_city_operating_cycle',{p_city_key:cityKey,p_mission_limit:24});
    setBusy(false);
    if(error){setNotice(error.message);return;}
    setNotice(`Operating cycle complete · ${data?.stage||'updated'} · evidence remains review-gated.`);
    await load();
  };

  const adapters:Adapter[]=Array.isArray(snapshot?.adapters)?snapshot.adapters:[];
  const grouped=useMemo(()=>({
    source:adapters.filter(x=>x.type==='source'),
    transit:adapters.filter(x=>x.type==='transit'),
    authority:adapters.filter(x=>x.type==='authority'),
    payment:adapters.filter(x=>x.type==='payment'),
  }),[adapters]);

  const loop=snapshot?.loop||{};
  const pack=snapshot?.pack||{};
  const city=snapshot?.city||{};

  return <section className="rounded-[1.6rem] border border-sky-300/15 bg-gradient-to-br from-sky-400/[0.07] via-slate-950/90 to-indigo-400/[0.04] p-4 sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-sky-200"/><p className="text-[9px] font-black uppercase tracking-[0.22em] text-sky-200">Global city operating kernel</p></div>
        <h2 className="mt-2 text-xl font-black">{city.city_name||cityKey} · {String(pack.bootstrap_stage||'registered').replace(/_/g,' ')}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">AFAT is city-portable: sources, standards, authority connections and transit feeds are explicit adapters. Unconfigured or partner-only integrations are never presented as live connections.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-white/60"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button>
        <button onClick={runCycle} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Play className="h-4 w-4"/>Run city cycle</button>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat icon={Database} label="Places" value={Number(loop.places||0)}/>
      <Stat icon={ShieldCheck} label="Reachable" value={Number(loop.reachable_places||0)}/>
      <Stat icon={BusFront} label="Transit nodes" value={Number(loop.transit_nodes||0)}/>
      <Stat icon={Activity} label="Transit lines" value={Number(loop.transit_lines||0)}/>
      <Stat icon={Activity} label="Open missions" value={Number(loop.open_missions||0)}/>
      <Stat icon={Landmark} label="Authority links" value={Number(loop.authority_connections_ready||0)}/>
    </div>

    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap gap-2">{(pack.standards||[]).map((s:string)=><span key={s} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[8px] font-black uppercase text-white/50">{s}</span>)}</div>
      <p className="mt-3 text-[10px] leading-5 text-white/35">Standards compatibility does not mean a feed exists. GTFS, GTFS-Realtime and GBFS remain unconfigured until a real operator/authority publishes or authorizes a feed.</p>
    </div>

    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      <AdapterGroup title="Source federation" items={grouped.source}/>
      <AdapterGroup title="Transit + mobility standards" items={grouped.transit}/>
      <AdapterGroup title="Authority interoperability" items={grouped.authority}/>
      <AdapterGroup title="Payment interoperability" items={grouped.payment}/>
    </div>

    {notice&&<p className="mt-3 rounded-xl border border-sky-300/15 bg-sky-300/10 p-3 text-xs text-sky-50">{notice}</p>}
  </section>;
}

function AdapterGroup({title,items}:{title:string;items:Adapter[]}){
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{title}</p>
    <div className="mt-3 space-y-2">{items.slice(0,12).map(item=><div key={item.adapter_key} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="min-w-0"><p className="truncate text-xs font-black">{item.name}</p><p className="mt-1 truncate text-[8px] uppercase text-white/30">{item.protocol} · {item.adapter_key}</p></div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black uppercase ${item.binding_state==='ready'?'bg-emerald-300/10 text-emerald-200':item.binding_state==='partner_required'?'bg-amber-300/10 text-amber-100':item.binding_state==='reference_only'?'bg-violet-300/10 text-violet-100':'bg-white/5 text-white/35'}`}>{String(item.binding_state).replace(/_/g,' ')}</span>
    </div>)}{!items.length&&<p className="text-xs text-white/30">No adapter bindings yet.</p>}</div>
  </div>;
}

function Stat({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><Icon className="h-4 w-4 text-sky-200"/><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}
