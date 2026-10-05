import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';
import { elapsedMs, performanceNow, recordAfatMetric } from './performanceMetrics';

export type AtlasNode = {
  id: string;
  node_type?: string;
  canonical_name?: string | null;
  name?: string | null;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  evidence_status?: string;
  source_key?: string | null;
  metadata?: Record<string, unknown>;
};

export type AtlasEdge = {
  id: string;
  from_node_id?: string;
  to_node_id?: string;
  edge_type?: string;
  name?: string | null;
  distance_m?: number | null;
  modes?: string[];
  access_modes?: string[];
  geometry_geojson?: { type: string; coordinates: any } | null;
  surface?: string | null;
  passability?: string | null;
  confidence?: number;
  evidence_status?: string;
  source_key?: string | null;
  metadata?: Record<string, unknown>;
};

export type AtlasNearbyResponse = {
  atlas_version: string;
  origin: { latitude: number; longitude: number };
  radius_m: number;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
};

type NearbyArgs = { latitude: number; longitude: number; radiusM?: number; limit?: number };
type NearbyCacheEntry = { expiresAt: number; value: AtlasNearbyResponse };
const NEARBY_CACHE_TTL_MS = 15_000;
const NEARBY_CACHE_MAX = 48;
const nearbyCache = new Map<string, NearbyCacheEntry>();
const nearbyInFlight = new Map<string, Promise<AtlasNearbyResponse>>();

function rounded(value: number, precision = 3) { const factor = 10 ** precision; return Math.round(Number(value) * factor) / factor; }
function nearbyKey(args: NearbyArgs) { return [rounded(args.latitude),rounded(args.longitude),Math.round(args.radiusM ?? 2500),Math.round(args.limit ?? 120)].join(':'); }
function pruneNearbyCache(now = Date.now()) {
  for (const [key, value] of nearbyCache) if (value.expiresAt <= now) nearbyCache.delete(key);
  while (nearbyCache.size > NEARBY_CACHE_MAX) { const first = nearbyCache.keys().next().value; if (!first) break; nearbyCache.delete(first); }
}
async function readApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  return { error: await response.text().catch(() => '') };
}

export async function fetchAtlasNearby(args: NearbyArgs): Promise<AtlasNearbyResponse> {
  const key = nearbyKey(args);
  const now = Date.now();
  const cached = nearbyCache.get(key);
  if (cached && cached.expiresAt > now) {
    recordAfatMetric({ operation:'atlas_nearby',durationMs:0,outcome:'success',cacheState:'hit',resultCount:(cached.value.nodes?.length||0)+(cached.value.edges?.length||0),surface:'living_map' });
    return cached.value;
  }

  const existing = nearbyInFlight.get(key);
  if (existing) {
    const start=performanceNow();
    try {
      const value=await existing;
      recordAfatMetric({ operation:'atlas_nearby',durationMs:elapsedMs(start),outcome:'success',cacheState:'coalesced',resultCount:(value.nodes?.length||0)+(value.edges?.length||0),surface:'living_map' });
      return value;
    } catch(error:any) {
      recordAfatMetric({ operation:'atlas_nearby',durationMs:elapsedMs(start),outcome:'error',cacheState:'coalesced',errorClass:error?.name||'atlas_error',surface:'living_map' });
      throw error;
    }
  }

  pruneNearbyCache(now);
  const request = (async () => {
    const start=performanceNow();
    try {
      const params = new URLSearchParams({ lat:String(args.latitude),lon:String(args.longitude),radius_m:String(args.radiusM ?? 2500),limit:String(args.limit ?? 120) });
      const response = await fetch(`${getApiBaseUrl()}/api/atlas/nearby?${params.toString()}`);
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'AFAT Atlas graph unavailable.');
      const value = {
        atlas_version: data.atlas_version || 'v1',
        origin: data.origin || { latitude: args.latitude, longitude: args.longitude },
        radius_m: Number(data.radius_m || args.radiusM || 2500),
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
      } as AtlasNearbyResponse;
      nearbyCache.set(key, { expiresAt: Date.now() + NEARBY_CACHE_TTL_MS, value });
      pruneNearbyCache();
      recordAfatMetric({ operation:'atlas_nearby',durationMs:elapsedMs(start),outcome:'success',cacheState:'network',resultCount:value.nodes.length+value.edges.length,surface:'living_map' });
      return value;
    } catch(error:any) {
      recordAfatMetric({ operation:'atlas_nearby',durationMs:elapsedMs(start),outcome:typeof navigator!=='undefined'&&!navigator.onLine?'offline':'error',cacheState:'network',errorClass:error?.name||'atlas_error',surface:'living_map' });
      throw error;
    }
  })();

  nearbyInFlight.set(key, request);
  try { return await request; } finally { nearbyInFlight.delete(key); }
}

export function clearAtlasNearbyCache() { nearbyCache.clear(); nearbyInFlight.clear(); }

export async function submitAtlasObservation(args: {
  atlasNodeId?: string;
  atlasEdgeId?: string;
  observationType: string;
  observationValue: Record<string, unknown>;
  confidence?: number;
  evidence?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const headers = await authenticatedApiHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/atlas/observations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json','Idempotency-Key': args.idempotencyKey,...headers },
    body: JSON.stringify({ atlas_node_id:args.atlasNodeId || null,atlas_edge_id:args.atlasEdgeId || null,observation_type:args.observationType,observation_value:args.observationValue,confidence:args.confidence,evidence:args.evidence || {} }),
  });
  const data = await readApiResponse(response);
  if (!response.ok) throw new Error(data.error || 'Atlas observation could not be recorded.');
  return data;
}
