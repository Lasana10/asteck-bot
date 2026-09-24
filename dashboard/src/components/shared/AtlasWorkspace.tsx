import React, { useEffect, useMemo, useState } from 'react';
import { Award, BrainCircuit, RefreshCw, Route, Sparkles, Target } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { AtlasContributionPanel } from './AtlasContributionPanel';
import { AtlasLearningControl } from '../planner/AtlasLearningControl';
import { RoadConditionReporter } from './RoadConditionReporter';
import { CityGenesisPanel } from '../admin/CityGenesisPanel';
import { useAfatLocale } from '../../localization';
import { LivingAtlasMap } from './LivingAtlasMap';
import { FieldMapper } from './FieldMapper';
import { MappingEvidenceReview } from './MappingEvidenceReview';
import AtlasIngestionControl from './AtlasIngestionControl';
import { AtlasPrivacyPanel } from './AtlasPrivacyPanel';
import { SourceIntelligencePanel } from './SourceIntelligencePanel';
import { CitySourcePlanPanel } from './CitySourcePlanPanel';
import { CityModelCommandCenter } from './CityModelCommandCenter';
import { DestinationClaimReview } from './DestinationClaimReview';
import { TransitGraphPanel } from './TransitGraphPanel';

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

  const cityKey=city?.city_key||'cm-yaounde';

  return <div className="space-y-4">
    <section className="rounded-[1.7rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_34%),linear-gradient(135deg,rgba(15,23,42,.96),rgba(2,6,23,.98))] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-200/70">{t('atlas.title')}</p>
          <h1 className="mt-2 text-2xl font-black sm:text-4xl">See the city AFAT is learning.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">The map is the primary surface. Evidence, missions, source disagreements and learning controls explain or improve what is visible on it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-white/55"><Award className="mr-1.5 inline h-3.5 w-3.5 text-cyan-200"/>{reputation?reputation.trust_level:'new contributor'}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-white/55"><BrainCircuit className="mr-1.5 inline h-3.5 w-3.5 text-violet-200"/>{city?Math.round(Number(city.operational_confidence||0)):0}% city confidence</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-white/55"><Route className="mr-1.5 inline h-3.5 w-3.5 text-emerald-200"/>{missions.length} missions</span>
          <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[9px] font-black uppercase text-white/60"><RefreshCw className={`h-3.5 w-3.5 ${busy?'animate-spin':''}`}/>Refresh</button>
        </div>
      </div>
    </section>

    {canPlan
      ? <div className="grid min-h-[680px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0"><LivingAtlasMap cityKey={cityKey}/></div>
          <CityModelCommandCenter cityKey={cityKey}/>
        </div>
      : <LivingAtlasMap cityKey={cityKey}/>
    }

    {canContribute&&<section className="rounded-[1.6rem] border border-emerald-300/10 bg-emerald-400/[0.025] p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-200">Improve AFAT</p><h2 className="mt-1 text-xl font-black">Help only when your observation matters.</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Normal journeys already teach AFAT. Use these tools when you deliberately want to report, map or verify something.</p></div><Target className="h-5 w-5 text-emerald-200"/></div>
      <div className="grid gap-4 xl:grid-cols-2"><AtlasContributionPanel defaultMode={defaultMode as any}/><FieldMapper cityKey={cityKey} defaultMode={defaultMode}/></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><RoadConditionReporter mode={role==='operator'?'taxi':'walk'}/><AtlasPrivacyPanel/></div>
    </section>}

    <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300">{t('atlas.missions')}</p><h2 className="mt-1 text-xl font-black">High-value checks</h2><p className="mt-1 text-xs text-white/40">Short, targeted evidence requests — not generic mapping work.</p></div>{canPlan&&<button onClick={refreshCity} disabled={busy} className="min-h-10 rounded-xl bg-violet-500 px-3 text-[9px] font-black uppercase">Refresh learning</button>}</div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {missions.slice(0,6).map(m=><article key={m.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{m.title}</p><p className="mt-2 text-xs leading-5 text-white/50">{m.question}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-white/45">{m.status}</span></div>
          <div className="mt-3 flex gap-2">{canClaimMission&&m.status==='open'&&<button onClick={()=>claim(m.id)} disabled={busy} className="min-h-9 rounded-lg bg-emerald-400 px-3 text-[9px] font-black uppercase text-slate-950">Take mission</button>}{m.id===myMission?.id&&<button onClick={submit} disabled={busy} className="min-h-9 rounded-lg bg-cyan-300 px-3 text-[9px] font-black uppercase text-slate-950">Verify here</button>}</div>
        </article>)}
        {!missions.length&&<p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No nearby verification mission is open right now.</p>}
      </div>
    </section>

    {canPlan&&<TransitGraphPanel cityKey={cityKey}/>} 

    {canPlan&&<details className="rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-4"><summary className="cursor-pointer text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Advanced source + evidence operations</summary><div className="mt-5 space-y-5"><CitySourcePlanPanel cityKey={cityKey}/><SourceIntelligencePanel cityKey={cityKey}/><DestinationClaimReview/><AtlasLearningControl/><MappingEvidenceReview/></div></details>}

    {role==='admin'&&<details className="rounded-[1.6rem] border border-rose-300/10 bg-slate-950/60 p-4"><summary className="cursor-pointer text-xs font-black uppercase tracking-[0.18em] text-rose-200">Administrative ingestion + city genesis</summary><div className="mt-5 space-y-5"><AtlasIngestionControl/><CityGenesisPanel onCreated={load}/></div></details>}

    {canPlan&&predictions.length>0&&<section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-200"/><p className="text-[9px] font-black uppercase tracking-widest text-violet-300">{t('atlas.predictions')}</p></div>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">{predictions.slice(0,6).map(p=><div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex justify-between gap-3"><p className="text-sm font-black capitalize">{String(p.prediction_type).replace(/_/g,' ')}</p><span className="text-[9px] font-black text-violet-200">{Math.round(Number(p.confidence||0)*100)}%</span></div><p className="mt-2 text-xs leading-5 text-white/50">{p.explanation}</p></div>)}</div>
    </section>}

    {notice&&<p className="rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-xs text-cyan-50">{notice}</p>}
  </div>;
}
