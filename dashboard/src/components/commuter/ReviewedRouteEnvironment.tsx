import React,{useEffect,useState} from 'react';
import type {AfatCanonicalRoute} from '../../services/canonicalRouteClient';
import {inspectReviewedEnvironmentRoute,type ReviewedEnvironmentAdvisory} from '../../services/reviewedEnvironmentRoute';
import {buildGroundedJourneyBrief} from '../../services/groundedJourneyBrief';

type Props={cityKey:string;route:AfatCanonicalRoute|null;online:boolean;hasAccount:boolean};
const empty:ReviewedEnvironmentAdvisory={checked:false,status:'unavailable',matched_reviewed_edges:0,max_risk_score:null,
 overlay_types:[],earliest_expiry:null,checked_at:null,road_passability_verified:false,provider_rerouted:false};

export function ReviewedRouteEnvironment({cityKey,route,online,hasAccount}:Props){
 const [advisory,setAdvisory]=useState<ReviewedEnvironmentAdvisory>(empty);
 const [checking,setChecking]=useState(false);
 useEffect(()=>{
  let live=true;
  setAdvisory(empty);
  if(!online||!hasAccount||route?.status!=='ok')return()=>{live=false;};
  const check=async()=>{
   setChecking(true);
   const result=await inspectReviewedEnvironmentRoute(cityKey,route);
   if(live){setAdvisory(result);setChecking(false);}
  };
  void check();
  const interval=window.setInterval(()=>void check(),90_000);
  return()=>{live=false;window.clearInterval(interval);};
 },[cityKey,route,online,hasAccount]);
 if(route?.status!=='ok')return null;
 const brief=buildGroundedJourneyBrief(route,advisory,{online});
 const exposed=brief.status==='reviewed_context';
 return <section role="status" aria-live="polite" data-evidence-status={brief.status} className={exposed
  ?'mt-3 rounded-xl border border-amber-300/35 bg-amber-500/10 p-3'
  :'mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
  <p className="text-[10px] font-black uppercase tracking-wider text-amber-100">CityBrain route brief · grounded evidence only</p>
  <p className={`mt-2 text-xs font-bold leading-5 ${exposed?'text-amber-100':'text-white/70'}`}>{!hasAccount?'Sign in to check route-specific reviewed evidence.':checking?'Refreshing independently reviewed route evidence…':brief.headline}</p>
  {hasAccount&&!checking&&<>
    <ul className="mt-2 space-y-1 text-[11px] leading-5 text-white/65">{brief.facts.map((fact,index)=><li key={`fact-${index}`}>• {fact}</li>)}</ul>
    <details className="mt-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-black text-white/55">What remains unknown</summary>
      <ul className="mt-2 space-y-1 text-[10px] leading-4 text-white/50">{brief.unknowns.map((item,index)=><li key={`unknown-${index}`}>• {item}</li>)}</ul>
    </details>
  </>}
  {brief.expiresAt&&<p className="mt-2 text-[10px] text-white/55">Earliest reviewed overlay expiry: {new Date(brief.expiresAt).toLocaleString()}</p>}
  <p className="mt-2 text-[10px] text-white/45">Advisory only. CityBrain did not change the provider route or predict safe passage from missing evidence.</p>
 </section>;
}
