import type {SpatialFix} from './spatialPositioning';
import {spatialDistanceMeters} from './spatialPositioning';

/** Arrival proximity is local device evidence, never proof of a verified entrance. */
export type ArrivalCandidate={position:SpatialFix;distanceM:number;targetLatitude:number;targetLongitude:number;observations:number;firstSeenMs:number};
export function assessArrivalCandidate(input:{
 fix:SpatialFix; target:{latitude:number;longitude:number}|null;
 previous:ArrivalCandidate|null; routeReady:boolean; nowMs?:number;
}):ArrivalCandidate|null{
 const {fix,target,previous,routeReady}=input,now=input.nowMs??Date.now();
 if(!routeReady||!target||!Number.isFinite(target.latitude)||!Number.isFinite(target.longitude)||
  Math.abs(target.latitude)>90||Math.abs(target.longitude)>180||
  fix.source!=='device_gnss'||!Number.isFinite(fix.timestampMs)||
  now-fix.timestampMs>15000||fix.timestampMs>now+1000||
  fix.accuracyM==null||!Number.isFinite(fix.accuracyM)||fix.accuracyM>25||
  fix.accuracyM<0)return null;
 const distanceM=spatialDistanceMeters(fix,{...fix,latitude:target.latitude,longitude:target.longitude});
 // Do not allow a wide uncertainty circle or a 100 m default "arrival".
 if(distanceM>Math.max(18,Math.min(30,30-fix.accuracyM/2)))return null;
 const same=previous&&previous.targetLatitude===target.latitude&&previous.targetLongitude===target.longitude&&
   fix.timestampMs>previous.position.timestampMs&&fix.timestampMs-previous.position.timestampMs<=30000&&
   fix.timestampMs-previous.firstSeenMs<=120000;
 return {position:fix,distanceM,targetLatitude:target.latitude,targetLongitude:target.longitude,
   observations:same?previous.observations+1:1,firstSeenMs:same?previous.firstSeenMs:fix.timestampMs};
}
export function readyForPassengerArrivalConfirmation(value:ArrivalCandidate|null):boolean{
 return Boolean(value&&value.observations>=2&&
   value.position.timestampMs-value.firstSeenMs>=2500&&value.position.timestampMs-value.firstSeenMs<=120000);
}
