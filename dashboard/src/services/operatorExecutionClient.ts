import { supabase,authenticatedApiHeaders,getApiBaseUrl } from '../supabaseClient';
import { elapsedMs, performanceNow, recordAfatMetric } from './performanceMetrics';

export type OperatorExecutionSnapshot = {
  operator_id: string;
  vehicle?: { id:string;plate_number?:string|null;type?:string|null;capacity?:number|null;is_available?:boolean;current_heading?:number|null;current_speed?:number|null;last_ping_at?:string|null;rating?:number|null;total_rides?:number|null;clearance_status?:string|null;updated_at?:string|null } | null;
  wallet?: { balance_xaf?:number;reserved_xaf?:number;available_xaf?:number };
  payouts?: Array<{id:string;amount_xaf:number;provider:string;destination_ref:string;status:string;requested_at?:string;updated_at?:string;completed_at?:string|null;external_id?:string|null;failure_reason?:string|null}>;
  ledger?: any[];generated_at?:string;
};

export async function fetchOperatorExecutionSnapshot(){const{data,error}=await supabase.rpc('afat_operator_execution_snapshot');return{data:(data||null) as OperatorExecutionSnapshot|null,error};}
export async function updateOperatorPresence(input:{vehicleId:string;available:boolean;latitude?:number|null;longitude?:number|null;accuracyM?:number|null;heading?:number|null;speedKph?:number|null}){
 const{data,error}=await supabase.rpc('afat_update_operator_presence',{p_vehicle_id:input.vehicleId,p_available:input.available,p_latitude:input.latitude??null,p_longitude:input.longitude??null,p_accuracy_m:input.accuracyM??null,p_heading:input.heading==null?null:Math.round(input.heading),p_speed_kph:input.speedKph==null?null:Math.round(input.speedKph)});return{data,error};
}
export async function requestOperatorPayout(input:{amountXaf:number;provider:string;destinationRef:string}){const{data,error}=await supabase.rpc('afat_request_operator_payout',{p_amount_xaf:Math.round(input.amountXaf),p_provider:input.provider,p_destination_ref:input.destinationRef});return{data,error};}

export async function fetchNearbySupply(input:{latitude:number;longitude:number;radiusM?:number;vehicleType?:string|null;limit?:number}){
 const start=performanceNow();
 try{
  const{data,error}=await supabase.rpc('afat_nearby_supply',{p_latitude:input.latitude,p_longitude:input.longitude,p_radius_m:input.radiusM??5000,p_vehicle_type:input.vehicleType??null,p_limit:input.limit??20});
  if(error){recordAfatMetric({operation:'nearby_supply',durationMs:elapsedMs(start),outcome:'error',mode:input.vehicleType??null,errorClass:error.code||'supply_rpc_error',cacheState:'network',surface:'passenger_preflight'});return{data,error};}
  const count=Array.isArray(data?.vehicles)?data.vehicles.length:0;
  recordAfatMetric({operation:'nearby_supply',durationMs:elapsedMs(start),outcome:'success',mode:input.vehicleType??null,cacheState:'network',resultCount:count,surface:'passenger_preflight'});
  return{data,error};
 }catch(error:any){recordAfatMetric({operation:'nearby_supply',durationMs:elapsedMs(start),outcome:typeof navigator!=='undefined'&&!navigator.onLine?'offline':'error',mode:input.vehicleType??null,errorClass:error?.name||'supply_error',cacheState:'network',surface:'passenger_preflight'});throw error;}
}

export async function registerOperatorVehicle(input:{plate_number:string;vehicle_type:string;capacity:number}){
 try{
  const headers=await authenticatedApiHeaders();
  const res=await fetch(`${getApiBaseUrl()}/api/onboard/vehicle/register`,{
   method:'POST',headers:{'content-type':'application/json',...headers},
   body:JSON.stringify(input),signal:AbortSignal.timeout(25000),
  });
  const body=await res.json().catch(()=>null);
  if(!res.ok||!body?.vehicle?.id)return {data:null,error:{message:body?.error||'Vehicle registration is unavailable.'}};
  if(body.vehicle.clearance_status==='verified'||body.vehicle.is_available===true)
   return {data:null,error:{message:'Unexpected vehicle clearance state; contact AFAT operations.'}};
  return {data:body,error:null};
 }catch(error:any){
  return {data:null,error:{message:error?.message||'Vehicle registration service unavailable.'}};
 }
}
