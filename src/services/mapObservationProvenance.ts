/** Server-side contracts for human-reported AFAT geographic observations.
 * A client-provided position is *device-reported*, never verified ground truth.
 * Unknown or stale provenance is not promoted to a verified live event.
 */
export type ObservationReview = {
  ok: boolean; status: number; code:string|null;
  observedAt:string|null; uncertaintyM:number|null; ageMs:number|null;
  reviewState:'pending'|'unavailable';
};
export function isHumanAppObservation(input:{signalType:unknown;incidentType:unknown;source:unknown;actorType:unknown}):boolean{
 const app=String(input.source||'app').toLowerCase()==='app';
 const incident=String(input.signalType||'')==='incident'||Boolean(input.incidentType);
 const field=String(input.signalType||'')==='field_observation';
 // Client-controlled actor types are display context, never a way to bypass trust gates.
 return app&&(incident||field);
}
export function assessReportedObservation(input:{
 observedAt:unknown;accuracy:unknown;latitude:unknown;longitude:unknown;
 networkType?:unknown;
}, nowMs=Date.now()):ObservationReview{
 const invalid=(status:number,code:string):ObservationReview=>
   ({ok:false,status,code,observedAt:null,uncertaintyM:null,ageMs:null,reviewState:'unavailable'});
 const latitude=Number(input.latitude),longitude=Number(input.longitude);
 if(input.latitude===null||input.latitude===undefined||
    input.longitude===null||input.longitude===undefined||
    !Number.isFinite(latitude)||Math.abs(latitude)>90||
    !Number.isFinite(longitude)||Math.abs(longitude)>180)
    return invalid(400,'OBSERVATION_COORDINATES_INVALID');
 if(typeof input.accuracy!=='number'||!Number.isFinite(input.accuracy)||
    input.accuracy<0||input.accuracy>120)
    return invalid(422,'OBSERVATION_MEASURED_ACCURACY_REQUIRED');
 if(typeof input.observedAt!=='string'||!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(input.observedAt))
    return invalid(422,'OBSERVATION_TIME_REQUIRED');
 const observed=Date.parse(input.observedAt);
 if(!Number.isFinite(observed))
    return invalid(422,'OBSERVATION_TIME_INVALID');
 const age=nowMs-observed;
 // Offline observations may arrive delayed. Hold for review but never label live.
 const offline=String(input.networkType||'').toLowerCase()==='offline';
 if(age < -5000 || age > (offline?48*60*60_000:2*60_000))
    return invalid(422,'OBSERVATION_TIME_OUTSIDE_ACCEPTANCE_WINDOW');
 return {
   ok:true,status:200,code:null,observedAt:new Date(observed).toISOString(),
   uncertaintyM:input.accuracy,ageMs:age,reviewState:'pending',
 };
}
export function reviewedMapEffects(input:{
 isHumanObservation:boolean;isIncident:boolean;trustedIncident:boolean;
 signalType:string;
}){
 const reviewed=!input.isHumanObservation||input.trustedIncident;
 return {
   contributes_to_live_feed: reviewed,
   contributes_to_safety_score: input.isIncident&&reviewed,
   contributes_to_demand_radar:input.signalType==='movement'&&!input.isHumanObservation,
 };
}
