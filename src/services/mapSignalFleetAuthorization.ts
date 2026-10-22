/** Vehicle location is operational evidence, never authorization to accept passengers. */
export function mayPublishVehicleLocation(input:{
  vehicleId:string;operatorId:string;clearanceStatus:string|null;
  actorId:string;role:string;
}):{allowed:boolean;reason:string|null}{
 const privileged=input.role==='planner'||input.role==='admin';
 if(!input.vehicleId||!input.operatorId)return {allowed:false,reason:'VEHICLE_NOT_FOUND'};
 if(!privileged&&(input.role!=='operator'||input.actorId!==input.operatorId))
  return {allowed:false,reason:'VEHICLE_UPDATE_DENIED'};
 if(input.clearanceStatus!=='verified')
  return {allowed:false,reason:'VERIFIED_VEHICLE_CLEARANCE_REQUIRED'};
 return {allowed:true,reason:null};
}
