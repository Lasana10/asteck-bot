import type {AfatCanonicalRoute,AfatRoadManeuver} from './canonicalRouteClient';
import {calculateRouteProgress,type RoutePosition} from './routeGuidance';

export type NextRoadInstruction={instruction:string;kind:string;distanceM:number;source:'provider_turn';};
export function nextRoadInstruction(route:AfatCanonicalRoute|null,position:RoutePosition):NextRoadInstruction|null{
 if(route?.status!=='ok'||!['osrm','google','valhalla'].includes(String(route.route_source))||!route.maneuvers?.length)return null;
 if(!Number.isFinite(position.latitude)||!Number.isFinite(position.longitude)||position.accuracy==null||position.accuracy>90)return null;
 const current=calculateRouteProgress(route,position);
 if(!current||current.offRoute||current.confidence==='low')return null;
 const options:({maneuver:AfatRoadManeuver;distanceM:number})[]=[];
 for(const maneuver of route.maneuvers){
  const step=calculateRouteProgress(route,{latitude:maneuver.latitude,longitude:maneuver.longitude,accuracy:10});
  if(!step||step.nearestDistanceM>80)continue;
  const remaining=step.travelledDistanceM-current.travelledDistanceM;
  if(remaining>=-15)options.push({maneuver,distanceM:Math.max(0,remaining)});
 }
 options.sort((a,b)=>a.distanceM-b.distanceM);
 const next=options[0];
 return next?{instruction:next.maneuver.instruction,kind:next.maneuver.kind,distanceM:next.distanceM,source:'provider_turn'}:null;
}
