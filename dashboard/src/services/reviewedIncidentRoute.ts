import {supabase} from '../supabaseClient';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
import {reviewedCorridorCoordinates} from './reviewedEnvironmentRoute';

const INCIDENT_TYPES=['accident','police_control','flooding','traffic_jam','road_damage','road_works','hazard','protest','roadblock','sos','other'] as const;
export type ReviewedIncidentRouteAdvisory={
 checked:boolean;
 status:'reviewed_incident_proximity'|'no_matching_reviewed_incidents'|'unavailable';
 matched_reviewed_incidents:number;
 max_severity:number|null;
 incident_types:string[];
 earliest_expiry:string|null;
 latest_reviewed_at:string|null;
 checked_at:string|null;
 road_blocked_verified:false;
 provider_rerouted:false;
 raw_incident_details_exposed:false;
};
export const unavailableReviewedIncidentRoute=():ReviewedIncidentRouteAdvisory=>({
 checked:false,status:'unavailable',matched_reviewed_incidents:0,max_severity:null,
 incident_types:[],earliest_expiry:null,latest_reviewed_at:null,checked_at:null,
 road_blocked_verified:false,provider_rerouted:false,raw_incident_details_exposed:false,
});

export async function inspectReviewedIncidentRoute(cityKey:string,route:AfatCanonicalRoute|null|undefined){
 const coordinates=reviewedCorridorCoordinates(route);
 if(!/^cm-[a-z-]{2,40}$/.test(cityKey)||!coordinates||typeof navigator!=='undefined'&&!navigator.onLine)
  return unavailableReviewedIncidentRoute();
 try{
  const {data,error}=await supabase.rpc('afat_reviewed_incident_route_advisory',{
   p_city_key:cityKey,p_route_points:coordinates,
  });
  if(error||data?.checked!==true||data?.road_blocked_verified!==false||
    data?.provider_rerouted!==false||data?.raw_incident_details_exposed!==false||
    !['reviewed_incident_proximity','no_matching_reviewed_incidents'].includes(data?.status))
   return unavailableReviewedIncidentRoute();
  const count=Number(data.matched_reviewed_incidents);
  if(!Number.isInteger(count)||count<0||count>10000||
    (data.status==='reviewed_incident_proximity'&&count===0)||
    (data.status==='no_matching_reviewed_incidents'&&count!==0))
   return unavailableReviewedIncidentRoute();
  const expiry=typeof data.earliest_expiry==='string'?data.earliest_expiry:null;
  const reviewedAt=typeof data.latest_reviewed_at==='string'?data.latest_reviewed_at:null;
  if(data.status==='reviewed_incident_proximity'&&(!expiry||Date.parse(expiry)<=Date.now()||
    !reviewedAt||!Number.isFinite(Date.parse(reviewedAt))||Date.parse(reviewedAt)>Date.now()))
   return unavailableReviewedIncidentRoute();
  const types=Array.isArray(data.incident_types)
   ?data.incident_types.filter((value:unknown):value is string=>typeof value==='string'&&
      (INCIDENT_TYPES as readonly string[]).includes(value)):[];
  if(data.status==='reviewed_incident_proximity'&&!types.length)return unavailableReviewedIncidentRoute();
  const severity=Number(data.max_severity);
  if(data.status==='reviewed_incident_proximity'&&(!Number.isInteger(severity)||severity<1||severity>5))
   return unavailableReviewedIncidentRoute();
  return {checked:true,status:data.status,matched_reviewed_incidents:count,
   max_severity:data.status==='reviewed_incident_proximity'?severity:null,incident_types:types,
   earliest_expiry:expiry,latest_reviewed_at:reviewedAt,
   checked_at:typeof data.checked_at==='string'?data.checked_at:null,
   road_blocked_verified:false,provider_rerouted:false,raw_incident_details_exposed:false} as ReviewedIncidentRouteAdvisory;
 }catch{return unavailableReviewedIncidentRoute();}
}
