import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';

export type AtlasNode = {
  id: string;
  node_type?: string;
  canonical_name?: string | null;
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

async function readApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  return { error: await response.text().catch(() => '') };
}

export async function fetchAtlasNearby(args: {
  latitude: number;
  longitude: number;
  radiusM?: number;
  limit?: number;
}): Promise<AtlasNearbyResponse> {
  const params = new URLSearchParams({
    lat: String(args.latitude),
    lon: String(args.longitude),
    radius_m: String(args.radiusM ?? 2500),
    limit: String(args.limit ?? 120),
  });
  const response = await fetch(`${getApiBaseUrl()}/api/atlas/nearby?${params.toString()}`);
  const data = await readApiResponse(response);
  if (!response.ok) throw new Error(data.error || 'AFAT Atlas graph unavailable.');
  return {
    atlas_version: data.atlas_version || 'v1',
    origin: data.origin || { latitude: args.latitude, longitude: args.longitude },
    radius_m: Number(data.radius_m || args.radiusM || 2500),
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
  };
}

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
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
      ...headers,
    },
    body: JSON.stringify({
      atlas_node_id: args.atlasNodeId || null,
      atlas_edge_id: args.atlasEdgeId || null,
      observation_type: args.observationType,
      observation_value: args.observationValue,
      confidence: args.confidence,
      evidence: args.evidence || {},
    }),
  });
  const data = await readApiResponse(response);
  if (!response.ok) throw new Error(data.error || 'Atlas observation could not be recorded.');
  return data;
}
