import { getApiBaseUrl, supabase } from '../supabaseClient';
import { elapsedMs, performanceNow, recordAfatMetric } from './performanceMetrics';

export type AfatRouteMode = 'walk' | 'bike' | 'moto' | 'car' | 'minibus';

export type AfatRoadManeuver = {
 latitude:number; longitude:number; instruction:string; distanceMeters:number; kind:string;
};
export type AfatCanonicalRouteSegment = {
  seq: number;
  edge_id: string;
  name?: string | null;
  distance_m: number;
  passability?: string | null;
  access_modes?: string[] | null;
  geometry?: { type: 'LineString'; coordinates: number[][] } | null;
};

export type AfatCanonicalRoute = {
  status: 'ok' | 'unavailable';
  route_source?: 'afat_atlas' | 'osrm' | 'google' | 'valhalla';
  traffic_aware?: boolean;
  maneuvers?: AfatRoadManeuver[];
  mode: AfatRouteMode;
  reason?: string;
  distance_m?: number;
  generalized_cost_m?: number;
  eta_seconds?: number | null;
  eta_reason?: string | null;
  eta_profile_coverage?: number | null;
  eta_profile_min_confidence?: number | null;
  eta_day_type?: string | null;
  eta_hour_bucket?: number | null;
  origin_snap_m?: number;
  destination_snap_m?: number;
  origin?: { atlas_node_id: string; name?: string | null; snap_distance_m: number; latitude: number; longitude: number };
  destination?: { atlas_node_id: string; name?: string | null; snap_distance_m: number; latitude: number; longitude: number };
  segments?: AfatCanonicalRouteSegment[];
};

type RouteInput = {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  mode: AfatRouteMode;
  snapRadiusM?: number;
};

// Route status alone is not proof of a navigable path. A purported Atlas
// success must contain bounded real coordinates, consistent mode and distance.
// This validator is shared at the passenger trust boundary, before caching.
export function isUsableCanonicalRoute(value: unknown, mode: AfatRouteMode): value is AfatCanonicalRoute {
  if(!value || typeof value!=='object') return false;
  const route=value as AfatCanonicalRoute;
  if(route.status!=='ok' || route.mode!==mode ||
     typeof route.distance_m!=='number' || !Number.isFinite(route.distance_m) || route.distance_m<=0 ||
     !Array.isArray(route.segments) || !route.segments.length || route.segments.length>200) return false;
  let points=0;
  for(const segment of route.segments){
    if(!segment || typeof segment.distance_m!=='number' ||
       !Number.isFinite(segment.distance_m) || segment.distance_m<0 ||
       segment.geometry?.type!=='LineString' || !Array.isArray(segment.geometry.coordinates) ||
       segment.geometry.coordinates.length<2) return false;
    points+=segment.geometry.coordinates.length;
    if(points>50000 || !segment.geometry.coordinates.every(point=>
      Array.isArray(point)&&point.length===2&&
      typeof point[0]==='number'&&typeof point[1]==='number'&&
      Number.isFinite(point[0])&&Number.isFinite(point[1])&&
      Math.abs(point[0])<=180&&Math.abs(point[1])<=90))return false;
  }
  if(route.eta_seconds!=null &&
     (typeof route.eta_seconds!=='number' || !Number.isFinite(route.eta_seconds) || route.eta_seconds<=0))return false;
  return true;
}

// For unreviewed road coverage, use separate real Cameroon OSRM car and foot
// profiles. Foot graph does not verify safe crossings or accessibility.
async function externalCameroonRoute(input: RouteInput): Promise<AfatCanonicalRoute | null> {
  if (!['car','walk','bike','moto'].includes(input.mode)) return null;
  const query = new URLSearchParams({
    origin_lat: String(input.originLatitude),
    origin_lon: String(input.originLongitude),
    destination_lat: String(input.destinationLatitude),
    destination_lon: String(input.destinationLongitude),
    mode: input.mode === 'walk' ? 'foot' : input.mode === 'bike' ? 'bicycle' : input.mode === 'moto' ? 'motorcycle' : 'driving',
  });
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/navigation/route?${query}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.source !== 'osrm' && data?.source !== 'google' && data?.source !== 'valhalla') return null;
    if(data?.travel_mode !== (input.mode === 'walk' ? 'foot' : input.mode === 'bike' ? 'bicycle' : input.mode === 'moto' ? 'motorcycle' : 'driving'))return null;
    if(input.mode === 'walk' && data.source !== 'osrm')return null;
    if((input.mode === 'bike'||input.mode === 'moto')&&data.source !== 'valhalla')return null;
    if(input.mode === 'car' && data.source === 'valhalla')return null;
    const primary = data?.primary;
    const geometry = primary?.geometry;
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) ||
        geometry.coordinates.length < 2 || geometry.coordinates.length > 50000) return null;
    const coordinates = geometry.coordinates;
    if (!coordinates.every((point: unknown) =>
      Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) return null;
    if (typeof primary.distanceMeters !== 'number' || !Number.isFinite(primary.distanceMeters) || primary.distanceMeters <= 0 ||
        typeof primary.durationValue !== 'number' || !Number.isFinite(primary.durationValue) || primary.durationValue <= 0) return null;
    const maneuvers:AfatRoadManeuver[] = Array.isArray(primary.maneuvers)
      ? primary.maneuvers.slice(0,300).flatMap((step:unknown)=>{
        if(!step||typeof step!=='object')return [];
        const m=step as Record<string,unknown>;
        const latitude=Number(m.latitude),longitude=Number(m.longitude),distance=Number(m.distanceMeters);
        const instruction=typeof m.instruction==='string'?m.instruction.trim():'';
        if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||
          !instruction||instruction.length>180||!Number.isFinite(distance)||distance<0)return [];
        return [{latitude,longitude,distanceMeters:distance,instruction,kind:String(m.kind||'continue').slice(0,48)}];
      }):[];
    const duration = primary.durationValue;
    const steps = coordinates.map((point: number[]) => [point[0], point[1]]);
    const distanceM = primary.distanceMeters;
    return {
      status: 'ok',
      mode: input.mode,
      route_source: data.source === 'google' ? 'google' : data.source === 'valhalla' ? 'valhalla' : 'osrm',
      traffic_aware: false,
      maneuvers,
      reason: input.mode === 'walk' ? 'unverified_osm_pedestrian_route' : input.mode === 'bike'||input.mode === 'moto' ? 'unverified_valhalla_micromobility_route' : 'unverified_external_road_route',
      distance_m: Number.isFinite(distanceM) && distanceM >= 0 ? distanceM : undefined,
      eta_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      eta_reason: 'baseline_no_live_traffic',
      origin_snap_m: typeof primary.originSnapMeters==='number'&&Number.isFinite(primary.originSnapMeters)&&primary.originSnapMeters>=0?primary.originSnapMeters:undefined,
      destination_snap_m: typeof primary.destinationSnapMeters==='number'&&Number.isFinite(primary.destinationSnapMeters)&&primary.destinationSnapMeters>=0?primary.destinationSnapMeters:undefined,
      segments: [{
        seq: 0,
        edge_id: 'external-road-route',
        name: primary.summary || 'Road route',
        distance_m: Number.isFinite(distanceM) && distanceM >= 0 ? distanceM : 0,
        passability: 'unverified',
        geometry: { type: 'LineString', coordinates: steps },
      }],
    };
  } catch {
    return null;
  }
}

type CachedRoute = { expiresAt: number; route: AfatCanonicalRoute };
const ROUTE_CACHE_TTL_MS = 20_000;
const ROUTE_CACHE_MAX = 80;
const routeCache = new Map<string, CachedRoute>();
const routeInFlight = new Map<string, Promise<AfatCanonicalRoute>>();

function rounded(value: number, precision = 4) { const factor = 10 ** precision; return Math.round(Number(value) * factor) / factor; }
function routeKey(input: RouteInput) { return [input.mode,rounded(input.originLatitude),rounded(input.originLongitude),rounded(input.destinationLatitude),rounded(input.destinationLongitude),Math.round(input.snapRadiusM ?? 1200)].join(':'); }
function pruneRouteCache(now = Date.now()) {
  for (const [key, value] of routeCache) if (value.expiresAt <= now) routeCache.delete(key);
  while (routeCache.size > ROUTE_CACHE_MAX) { const first = routeCache.keys().next().value; if (!first) break; routeCache.delete(first); }
}

export async function fetchCanonicalAfatRoute(input: RouteInput): Promise<AfatCanonicalRoute> {
  const key = routeKey(input);
  const now = Date.now();
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > now) {
    recordAfatMetric({ operation:'route',durationMs:0,outcome:cached.route.status==='ok'?'success':'unavailable',mode:input.mode,cacheState:'hit',resultCount:cached.route.segments?.length||0,routeStatus:cached.route.status,surface:'canonical_route' });
    return cached.route;
  }

  const existing = routeInFlight.get(key);
  if (existing) {
    const start=performanceNow();
    try {
      const route=await existing;
      recordAfatMetric({ operation:'route',durationMs:elapsedMs(start),outcome:route.status==='ok'?'success':'unavailable',mode:input.mode,cacheState:'coalesced',resultCount:route.segments?.length||0,routeStatus:route.status,surface:'canonical_route' });
      return route;
    } catch (error:any) {
      recordAfatMetric({ operation:'route',durationMs:elapsedMs(start),outcome:'error',mode:input.mode,cacheState:'coalesced',errorClass:error?.name||'route_error',surface:'canonical_route' });
      throw error;
    }
  }

  pruneRouteCache(now);
  const request = (async () => {
    const start=performanceNow();
    try {
      const { data, error } = await supabase.rpc('afat_route_canonical', {
        p_origin_lat: input.originLatitude,
        p_origin_lon: input.originLongitude,
        p_destination_lat: input.destinationLatitude,
        p_destination_lon: input.destinationLongitude,
        p_mode: input.mode,
        p_snap_radius_m: input.snapRadiusM ?? 1200,
      });
      if (error) throw new Error(error.message || 'AFAT could not calculate a trusted route.');
      const canonical = (data || { status: 'unavailable', mode: input.mode, reason: 'route_service_returned_no_result' }) as AfatCanonicalRoute;
      const route = isUsableCanonicalRoute(canonical,input.mode)
        ? { ...canonical, route_source: 'afat_atlas' as const }
        : (await externalCameroonRoute(input)) || {
            status:'unavailable' as const,mode:input.mode,
            reason:canonical.status==='ok'?'invalid_atlas_route_geometry':
              canonical.reason||'route_unavailable',
          };
      routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, route });
      pruneRouteCache();
      recordAfatMetric({ operation:'route',durationMs:elapsedMs(start),outcome:route.status==='ok'?'success':'unavailable',mode:input.mode,cacheState:'network',resultCount:route.segments?.length||0,routeStatus:route.status,surface:'canonical_route' });
      return route;
    } catch(error:any) {
      const fallback = await externalCameroonRoute(input);
      if (fallback) {
        routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, route: fallback });
        return fallback;
      }
      recordAfatMetric({ operation:'route',durationMs:elapsedMs(start),outcome:typeof navigator!=='undefined'&&!navigator.onLine?'offline':'error',mode:input.mode,cacheState:'network',errorClass:error?.name||'route_error',surface:'canonical_route' });
      throw error;
    }
  })();

  routeInFlight.set(key, request);
  try { return await request; } finally { routeInFlight.delete(key); }
}

export function clearCanonicalRouteCache() { routeCache.clear(); routeInFlight.clear(); }

export function routeToLatLngs(route?: AfatCanonicalRoute | null): Array<[number, number]> {
  if (!route || route.status !== 'ok' || !Array.isArray(route.segments)) return [];
  const output: Array<[number, number]> = [];
  for (const segment of route.segments) {
    const coordinates = segment.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    for (const coordinate of coordinates) {
      const longitude = Number(coordinate?.[0]); const latitude = Number(coordinate?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const previous = output[output.length - 1];
      if (previous && previous[0] === latitude && previous[1] === longitude) continue;
      output.push([latitude, longitude]);
    }
  }
  return output;
}
