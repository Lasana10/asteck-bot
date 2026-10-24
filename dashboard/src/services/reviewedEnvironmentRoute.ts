import { supabase } from '../supabaseClient';
import type { AfatCanonicalRoute } from './canonicalRouteClient';

export type ReviewedEnvironmentAdvisory = {
  checked: boolean;
  status: 'reviewed_proximity' | 'no_matching_reviewed_evidence' | 'unavailable';
  matched_reviewed_edges: number;
  max_risk_score: number | null;
  overlay_types: string[];
  earliest_expiry: string | null;
  checked_at: string | null;
  road_passability_verified: false;
  provider_rerouted: false;
};

const unavailable = (): ReviewedEnvironmentAdvisory => ({
  checked:false,status:'unavailable',matched_reviewed_edges:0,max_risk_score:null,
  overlay_types:[],earliest_expiry:null,checked_at:null,
  road_passability_verified:false,provider_rerouted:false,
});

export function reviewedCorridorCoordinates(route:AfatCanonicalRoute | null | undefined):number[][] | null {
  if (route?.status!=='ok'||!Array.isArray(route.segments)||!route.segments.length) return null;
  const coords:number[][]=[];
  for (const segment of route.segments) {
    const points=segment.geometry?.coordinates;
    if (!Array.isArray(points)||points.length<2) return null;
    for(const point of points) {
      if(!Array.isArray(point)||point.length!==2||
         !Number.isFinite(point[0])||!Number.isFinite(point[1])||
         Math.abs(point[0])>180||Math.abs(point[1])>90)return null;
      if(!coords.length||coords.at(-1)![0]!==point[0]||coords.at(-1)![1]!==point[1])
        coords.push([point[0],point[1]]);
      // Never skip geometry to make a request fit: a shortcut could invent or hide exposure.
      if(coords.length>500)return null;
    }
  }
  return coords.length>=2?coords:null;
}

export async function inspectReviewedEnvironmentRoute(
 cityKey:string,route:AfatCanonicalRoute | null | undefined,
):Promise<ReviewedEnvironmentAdvisory>{
  const coordinates=reviewedCorridorCoordinates(route);
  if(!/^cm-[a-z-]{2,40}$/.test(cityKey)||!coordinates||typeof navigator!=='undefined'&&!navigator.onLine)
    return unavailable();
  try{
    const {data,error}=await supabase.rpc('afat_reviewed_environment_route_advisory',{
      p_city_key:cityKey,p_route_points:coordinates,
    });
    if(error||data?.checked!==true||data?.road_passability_verified!==false||
       data?.provider_rerouted!==false||
       !['reviewed_proximity','no_matching_reviewed_evidence'].includes(data?.status))
      return unavailable();
    const matches=Number(data.matched_reviewed_edges);
    if(!Number.isInteger(matches)||matches<0||matches>10000||
       (data.status==='reviewed_proximity'&&matches===0)||
       (data.status==='no_matching_reviewed_evidence'&&matches!==0))
      return unavailable();
    const expiry=typeof data.earliest_expiry==='string'?data.earliest_expiry:null;
    if(data.status==='reviewed_proximity'&&(!expiry||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()))
      return unavailable();
    const types=Array.isArray(data.overlay_types)
      ?data.overlay_types.filter((t:unknown)=>t==='flood_risk'||t==='rain_risk'):[];
    if(data.status==='reviewed_proximity'&&!types.length)return unavailable();
    return {
      checked:true,status:data.status,matched_reviewed_edges:matches,
      max_risk_score:typeof data.max_risk_score==='number'&&Number.isFinite(data.max_risk_score)?data.max_risk_score:null,
      overlay_types:types,
      earliest_expiry:expiry,
      checked_at:typeof data.checked_at==='string'?data.checked_at:null,
      road_passability_verified:false,provider_rerouted:false,
    };
  }catch{return unavailable();}
}
