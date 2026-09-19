import React, { useEffect, useMemo, useState } from 'react';
import { Award, BrainCircuit, MapPinned, RefreshCw, Route, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { AtlasContributionPanel } from './AtlasContributionPanel';
import { AtlasLearningControl } from '../planner/AtlasLearningControl';
import { RoadConditionReporter } from './RoadConditionReporter';
import { CityGenesisPanel } from '../admin/CityGenesisPanel';
import { useAfatLocale } from '../../localization';
import { LivingAtlasMap } from './LivingAtlasMap';
import { FieldMapper } from './FieldMapper';
import { MappingEvidenceReview } from './MappingEvidenceReview';

export function AtlasWorkspace({role,profile}:{role:'commuter'|'operator'|'planner'|'admin'|'government';profile:any}){
  const {t}=useAfatLocale();
  const [missions,setMissions]=useState<any[]>([]);
  const [reputation,setReputation]=useState<any>(null);
  const [city,setCity]=useState<any>(null);
  const [predictions,setPredictions]=useState<any[]>([]);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  const canPlan=role==='planner'||role==='admin';
  const canContribute=role==='commuter'||role==='operator';
  const canClaimMission=role==='commuter'||role==='operator';
  const defaultMode=role==='operator'?'taxi':'walk';

  const load=async()=>{
    setBusy(true);
    const [m,r,c,p]=await Promise.all([
      supabase.from('afat_micro_missions').select('*').in('status',['open','claimed']).order('priority',{ascending:false}).limit(12),
      profile?.id?supabase.rpc('afat_refresh_contributor_reputation',{p_profile_id:profile.id}):Promise.resolve({data:null,error:null} as any),
      supabase.from('afat_city_profiles').select('*').eq('status','active').order('created_at',{ascending:true}).limit(1).maybeSingle(),
      supabase.from('afat_mobility_predictions').select('*').gt('valid_until',new Date().toISOString()).order('confidence',{ascending:false}).limit(8),
    ]);
    setMissions(m.data||[]); setReputation(r.data||null); setCity(c.data||null); setPredictions(p.data||[]);
    setBusy(false);
  };

  useEffect(()=>{ void load(); },[profile?.id]);

  const myMission=useMemo(()=>missions.find(m=>m.claimed_by===profile?.id&&m.status==='claimed'),[missions,profile?.id]);

  const claim=async(id:string)=>{
    setBusy(true); setNotice('');
    const {error}=await supabase.rpc('afat_claim_micro_mission',{p_mission_id:id});
    setBusy(false);
    setNotice(error?error.message:'Mission claimed. AFAT will ask for real location evidence when you submit it.');
    await load();
  };

  const submit=async()=>{
    if(!myMission) return;
    if(!navigator.geolocation){ setNotice('Location is not available on this device.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {error}=await supabase.rpc('afat_submit_micro_mission',{
        p_mission_id:myMission.id,
        p_answer:{condition:'open',answer:'confirmed_on_site'},
        p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_accuracy_m:pos.coords.accuracy,
      });
      setBusy(false); setNotice(error?error.message:'Verification submitted. AFAT kept it as evidence, not unquestioned truth.'); await load();
    },err=>{setBusy(false);setNotice(err.message);},{enableHighAccuracy:true,timeout:20000});
  };

  const refreshCity=async()=>{
    setBusy(true);
    const {data,error}=await supabase.rpc('afat_refresh_city_learning',{p_city_key:city?.city_key||'cm-yaounde'});
    if(!error) {
      await Promise.all([
        supabase.rpc('afat_generate_evidence_predictions',{p_city:city?.city_name||'Yaoundé',p_limit:20}),
        supabase.rpc('afat_generate_micro_missions',{p_limit:12}),
        supabase.rpc('afat_refresh_edge_mode_learning',{p_city:city?.city_name||'Yaoundé'}),
        supabase.rpc('afat_reconcile_candidate_clusters',{p_city_key:city?.city_key||'cm-yaounde'}),
      ]);
    }
    setBusy(false); setNotice(error?error.message:`City learning refreshed: ${data?.learning_stage||'updated'} · ${data?.operational_confidence||0}% confidence.`); await load();
  };

  return <div className="space-y-5">
    <section className="rounded-[1.6rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.10] via-slate-950/80 to-violet-500/[0.08] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">{t('atlas.title')}</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">{t('atlas.subtitle')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Movement, reports, map sources, failed pickups and field checks become one evidence network. AFAT keeps uncertainty visible until enough independent evidence exists.</p>
        </div>
        <button onClick={load} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric icon={Award} label={t('atlas.reputation')} value={reputation?`${reputation.trust_level} · ${reputation.score}`:'New'} />
        <Metric icon={BrainCircuit} label={t('atlas.city')} value={city?`${city.learning_stage} · ${Math.round(Number(city.operational_confidence||0))}%`:'Seed'} />
        <Metric icon={Route} label={t('atlas.missions')} value={missions.length} />
      </div>
    </section>

    <LivingAtlasMap cityKey={city?.city_key||'cm-yaounde'} />

    {canContribute&&<AtlasContributionPanel defaultMode={defaultMode as any} />}
    {canContribute&&<FieldMapper cityKey={city?.city_key||'cm-yaounde'} defaultMode={defaultMode} />}
    {canContribute&&<RoadConditionReporter mode={role==='operator'?'taxi':'walk'} />}

    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">{t('atlas.missions')}</p><h2 className="mt-2 text-xl font-black">Small checks that reduce uncertainty</h2></div>{canPlan&&<button onClick={refreshCity} disabled={busy} className="min-h-10 rounded-xl bg-violet-500 px-3 text-[9px] font-black uppercase">Refresh city learning</button>}</div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {missions.slice(0,8).map(m=><article key={m.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{m.title}</p><p className="mt-2 text-xs leading-5 text-white/50">{m.question}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-white/45">{m.status}</span></div>
          <div className="mt-3 flex gap-2">
            {canClaimMission&&m.status==='open'&&<button onClick={()=>claim(m.id)} disabled={busy} className="min-h-9 rounded-lg bg-emerald-400 px-3 text-[9px] font-black uppercase text-slate-950">Take mission</button>}
            {m.id===myMission?.id&&<button onClick={submit} disabled={busy} className="min-h-9 rounded-lg bg-cyan-300 px-3 text-[9px] font-black uppercase text-slate-950">Verify here</button>}
          </div>
        </article>)}
        {!missions.length&&<p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No nearby verification mission is open right now.</p>}
      </div>
    </section>

    {canPlan&&<AtlasLearningControl />}
    {canPlan&&<MappingEvidenceReview />}

    {role==='admin'&&<CityGenesisPanel onCreated={load} />}

    {canPlan&&<section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-200"/><p className="text-[10px] font-black uppercase tracking-widest text-violet-300">{t('atlas.predictions')}</p></div>
      <div className="mt-4 space-y-2">{predictions.map(p=><div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex justify-between gap-3"><p className="text-sm font-black capitalize">{String(p.prediction_type).replace(/_/g,' ')}</p><span className="text-[9px] font-black text-violet-200">{Math.round(Number(p.confidence||0)*100)}% confidence</span></div><p className="mt-2 text-xs leading-5 text-white/50">{p.explanation}</p></div>)}</div>
    </section>}

    {notice&&<p className="rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-xs text-cyan-50">{notice}</p>}
  </div>;
}

function Metric({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:React.ReactNode}){
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200"/><p className="mt-3 text-lg font-black capitalize">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div>;
}
