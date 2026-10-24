import React,{useEffect,useState} from 'react';
import type {AfatCanonicalRoute} from '../../services/canonicalRouteClient';
import {inspectReviewedEnvironmentRoute,type ReviewedEnvironmentAdvisory} from '../../services/reviewedEnvironmentRoute';

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
 const expired=advisory.earliest_expiry?Date.parse(advisory.earliest_expiry)<=Date.now():false;
 const exposed=online&&advisory.status==='reviewed_proximity'&&!expired;
 return <section role="status" aria-live="polite" className={exposed
  ?'mt-3 rounded-xl border border-amber-300/35 bg-amber-500/10 p-3'
  :'mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
  <p className="text-[10px] font-black uppercase tracking-wider text-amber-100">Reviewed environmental context · selected route</p>
  {exposed?<p className="mt-2 text-xs leading-5 text-amber-100">Independently reviewed {advisory.overlay_types.includes('flood_risk')?'water/flood':'rain'} risk evidence is near {advisory.matched_reviewed_edges} mapped road edge(s) along this route. This is a proximity warning, not confirmation the road is flooded or closed.</p>
   :<p className="mt-2 text-xs leading-5 text-white/60">{!online?'Offline: environmental evidence cannot be refreshed. Do not rely on cached routing for current hazards.':!hasAccount?'Sign in to check route-specific reviewed environment evidence.':checking?'Checking currently approved, unexpired route evidence…':advisory.status==='no_matching_reviewed_evidence'?'No matching independently reviewed environmental overlays were found along this route at check time. This does not establish that roads are safe.':'Environmental corridor verification is unavailable or has expired. No hazard clearance is implied.'}</p>}
  {exposed&&advisory.earliest_expiry&&<p className="mt-1 text-[10px] text-white/55">Earliest evidence overlay expiry: {new Date(advisory.earliest_expiry).toLocaleString()}</p>}
  <p className="mt-2 text-[10px] text-white/45">OSRM/Google directions are not automatically rerouted by this advisory. Verify conditions locally before travelling; passability, access and live traffic remain unconfirmed.</p>
 </section>;
}
