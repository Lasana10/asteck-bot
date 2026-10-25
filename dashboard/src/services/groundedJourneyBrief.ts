import type {AfatCanonicalRoute} from './canonicalRouteClient';
import type {ReviewedEnvironmentAdvisory} from './reviewedEnvironmentRoute';

export type GroundedJourneyBrief={
  status:'reviewed_context'|'no_matching_reviewed_evidence'|'evidence_unavailable';
  headline:string;
  facts:string[];
  unknowns:string[];
  checkedAt:string|null;
  expiresAt:string|null;
  advisoryOnly:true;
  automaticRouteDecision:false;
};

const sourceName=(source:AfatCanonicalRoute['route_source'])=>{
  if(source==='afat_atlas')return 'AFAT reviewed graph';
  if(source==='valhalla')return 'Valhalla mapped-road graph';
  if(source==='google')return 'Google road graph';
  if(source==='osrm')return 'Cameroon OSRM road graph';
  return 'Mapped route provider';
};

/**
 * Passenger-facing deterministic projection of already validated route and
 * independently reviewed environmental evidence. It deliberately performs no
 * model inference: a degraded AI plane can never turn missing evidence into a
 * safety, passability, traffic or arrival prediction.
 */
export function buildGroundedJourneyBrief(
  route:AfatCanonicalRoute,
  advisory:ReviewedEnvironmentAdvisory,
  options:{online:boolean;nowMs?:number},
):GroundedJourneyBrief{
  const now=options.nowMs??Date.now();
  const facts:string[]=[];
  const unknowns:string[]=[];
  const distance=Number(route.distance_m);
  const validRoute=route.status==='ok'&&Number.isFinite(distance)&&distance>0;

  if(validRoute){
    facts.push(`${sourceName(route.route_source)} returned ${(distance/1000).toFixed(distance>=10000?0:1)} km of mapped route geometry for ${route.mode}.`);
    if(Number.isFinite(route.eta_seconds)&&Number(route.eta_seconds)>0){
      const qualifier=route.route_source==='afat_atlas'?'evidence-based estimate':'provider baseline without live traffic';
      facts.push(`Travel time is approximately ${Math.ceil(Number(route.eta_seconds)/60)} minutes (${qualifier}).`);
    }
    if(Number.isFinite(route.destination_snap_m)&&Number(route.destination_snap_m)>75)
      unknowns.push(`The routable graph ends about ${Math.round(Number(route.destination_snap_m))} m from the destination pin; last-metre access is not established.`);
  }else{
    unknowns.push('No valid connected route geometry is available for this explanation.');
  }

  const expiry=advisory.earliest_expiry&&Number.isFinite(Date.parse(advisory.earliest_expiry))
    ?Date.parse(advisory.earliest_expiry):null;
  const currentReviewed=options.online&&advisory.checked&&advisory.status==='reviewed_proximity'&&
    advisory.road_passability_verified===false&&advisory.provider_rerouted===false&&
    advisory.matched_reviewed_edges>0&&Boolean(expiry&&expiry>now)&&advisory.overlay_types.length>0;

  let status:GroundedJourneyBrief['status']='evidence_unavailable';
  let headline='Current route evidence is incomplete';
  if(currentReviewed){
    status='reviewed_context';
    const types=advisory.overlay_types.includes('flood_risk')?'water/flood':'rain';
    facts.push(`Independently reviewed ${types} risk evidence is near ${advisory.matched_reviewed_edges} mapped road edge(s) on the selected route.`);
    headline='Reviewed environmental evidence is near this route';
  }else if(options.online&&advisory.checked&&advisory.status==='no_matching_reviewed_evidence'){
    status='no_matching_reviewed_evidence';
    facts.push('The current reviewed-overlay check found no matching environmental evidence along this route.');
    headline='No matching reviewed environmental overlay was found';
  }else if(!options.online){
    unknowns.push('Offline: current reviewed environmental evidence cannot be refreshed.');
  }else{
    unknowns.push('Reviewed route-specific environmental evidence is unavailable or expired.');
  }

  unknowns.push('Road passability, closures, live traffic and safe crossings are not verified by this brief.');
  unknowns.push('Exact entrance accessibility and current transport availability require separate evidence.');

  return {status,headline,facts,unknowns,
    checkedAt:typeof advisory.checked_at==='string'?advisory.checked_at:null,
    expiresAt:currentReviewed?advisory.earliest_expiry:null,
    advisoryOnly:true,automaticRouteDecision:false};
}
