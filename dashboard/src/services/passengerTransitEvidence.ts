import type {submitTransitObservation} from './mobilityEvidenceClient';
import type {SpatialFix} from './spatialPositioning';

export type TransitObservationType='stop'|'boarding'|'transfer'|'terminus';
export type PassengerTransitMode='minibus'|'bus'|'shared_taxi'|'moto_taxi'|'other';
export type PassengerTransitDraft={
 cityKey:string; observationType:TransitObservationType;nodeName:string;
 lineName:string;directionLabel:string;mode:PassengerTransitMode;notes:string;
};
type Input=Parameters<typeof submitTransitObservation>[0];
type Validation={ok:true;input:Input}|{ok:false;message:string};

/** Capture is an actual opted-in on-device observation, not a route or GTFS feed. */
export function preparePassengerTransitObservation(draft:PassengerTransitDraft,fix:SpatialFix|null,nowMs=Date.now()):Validation{
 if(!/^cm-[a-z-]{2,40}$/.test(draft.cityKey))return {ok:false,message:'Choose a supported city.'};
 if(!['stop','boarding','transfer','terminus'].includes(draft.observationType))
  return {ok:false,message:'Choose what you actually observed.'};
 if(!['minibus','bus','shared_taxi','moto_taxi','other'].includes(draft.mode))
  return {ok:false,message:'Choose an actual observed transport type.'};
 // Coarse city-mismatch guard for pilot cities. This is not a verified
 // administrative boundary; the reviewed server ledger owns final geography.
 const cityCenters:Record<string,{lat:number;lon:number}>={
  'cm-yaounde':{lat:3.866,lon:11.514},'cm-douala':{lat:4.051,lon:9.704},
 };
 const center=cityCenters[draft.cityKey];
 if(center&&fix&&(Math.abs(fix.latitude-center.lat)>0.9||Math.abs(fix.longitude-center.lon)>0.9))
  return {ok:false,message:'Current GPS is far from the selected city. Switch to your real city before submitting.'};
 const name=draft.nodeName.trim();
 if(name.length<2||name.length>100)return {ok:false,message:'Name the actual stop or meeting point (2–100 characters).'};
 if(draft.lineName.trim().length>100||draft.directionLabel.trim().length>100||draft.notes.trim().length>240)
  return {ok:false,message:'Keep route, direction and note descriptions concise.'};
 if(!fix||fix.source!=='field_observation'||!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||
   Math.abs(fix.latitude)>90||Math.abs(fix.longitude)>180||
   fix.accuracyM==null||!Number.isFinite(fix.accuracyM)||fix.accuracyM<0||fix.accuracyM>50||
   !Number.isFinite(fix.timestampMs)||fix.timestampMs>nowMs+1000||nowMs-fix.timestampMs>120000)
  return {ok:false,message:'Capture a fresh, accurate device GPS observation at this stop (50 m accuracy or better).'};
 return {ok:true,input:{
  cityKey:draft.cityKey,observationType:draft.observationType,nodeName:name,
  lineName:draft.lineName.trim()||null,directionLabel:draft.directionLabel.trim()||null,
  mode:draft.mode,latitude:fix.latitude,longitude:fix.longitude,gpsAccuracyM:fix.accuracyM,
  observedAt:new Date(fix.timestampMs).toISOString(),
  evidence:{source:'passenger_opt_in_field_observation',notes:draft.notes.trim()||null,
    automatic_truth:false,passenger_confirmed_observation:true,
    field_verified:false,active_service:false},
 }};
}
