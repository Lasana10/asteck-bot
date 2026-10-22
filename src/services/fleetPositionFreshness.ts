/** A historical replay or duplicate movement must never replace the live fleet position.
 * A device observation is not a vehicle-duty or road-safety certification. */
export function mayRefreshFleetPosition(input:{
  replayed:boolean;source:string;signalType:string;
  accuracy:unknown;speed:unknown;heading:unknown;
}):{allowed:boolean;reason:string}{
 if(input.replayed)return {allowed:false,reason:'idempotent_replay'};
 if(input.source==='offline_sync')return {allowed:false,reason:'historical_offline_replay'};
 if(input.signalType!=='movement')return {allowed:false,reason:'not_live_movement'};
 const accuracy=input.accuracy;
 if(typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<0||accuracy>120)
  return {allowed:false,reason:'uncertain_device_position'};
 const speed=input.speed;
 if(speed!=null&&(typeof speed!=='number'||!Number.isFinite(speed)||speed<0||speed>300))
  return {allowed:false,reason:'invalid_movement_speed'};
 const heading=input.heading;
 if(heading!=null&&(typeof heading!=='number'||!Number.isFinite(heading)||heading<0||heading>360))
  return {allowed:false,reason:'invalid_device_heading'};
 return {allowed:true,reason:'live_observation_only'};
}
