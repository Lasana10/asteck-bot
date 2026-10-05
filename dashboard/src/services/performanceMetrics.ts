import { supabase } from '../supabaseClient';

export type AfatMetricOperation='route'|'atlas_nearby'|'place_search'|'place_viewport'|'nearby_supply'|'offline_pack'|'service_request'|'navigation_sync'|'city_ingest';
export type AfatMetricOutcome='success'|'unavailable'|'error'|'offline'|'cancelled';
export type AfatMetricCache='hit'|'miss'|'coalesced'|'network';

export function performanceNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now()}
export function elapsedMs(start:number){return Math.max(0,Math.round(performanceNow()-start))}

export function recordAfatMetric(input:{
  operation:AfatMetricOperation;
  durationMs:number;
  outcome:AfatMetricOutcome;
  cityKey?:string|null;
  mode?:string|null;
  errorClass?:string|null;
  cacheState?:AfatMetricCache|null;
  resultCount?:number|null;
  surface?:string|null;
  routeStatus?:string|null;
}){
  // Metrics are intentionally fire-and-forget. They must never slow or fail the user action.
  void supabase.rpc('afat_record_operation_metric',{
    p_operation:input.operation,
    p_duration_ms:Math.max(0,Math.min(300000,Math.round(input.durationMs))),
    p_outcome:input.outcome,
    p_city_key:input.cityKey??null,
    p_mode:input.mode??null,
    p_error_class:input.errorClass??null,
    p_cache_state:input.cacheState??null,
    p_result_count:input.resultCount??null,
    p_metadata:{surface:input.surface??null,route_status:input.routeStatus??null,network:typeof navigator!=='undefined'&&!navigator.onLine?'offline':'online'},
  }).then(()=>undefined).catch(()=>undefined);
}
