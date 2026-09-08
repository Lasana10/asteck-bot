import { supabase } from '../supabaseClient';

export type AfatRouteMode = 'walk' | 'bike' | 'moto' | 'car' | 'minibus';

export type AfatCanonicalRouteSegment = {
  seq: number;
  edge_id: string;
  name?: string | null;
  distance_m: number;
  passability?: string | null;
  access_modes?: string[] | null;
  geometry?: {
    type: 'LineString';
    coordinates: number[][];
  } | null;
};

export type AfatCanonicalRoute = {
  status: 'ok' | 'unavailable';
  mode: AfatRouteMode;
  reason?: string;
  distance_m?: number;
  generalized_cost_m?: number;
  eta_seconds?: number | null;
  eta_reason?: string | null;
  origin_snap_m?: number;
  destination_snap_m?: number;
  origin?: {
    atlas_node_id: string;
    name?: string | null;
    snap_distance_m: number;
    latitude: number;
    longitude: number;
  };
  destination?: {
    atlas_node_id: string;
    name?: string | null;
    snap_distance_m: number;
    latitude: number;
    longitude: number;
  };
  segments?: AfatCanonicalRouteSegment[];
};

export async function fetchCanonicalAfatRoute(input: {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  mode: AfatRouteMode;
  snapRadiusM?: number;
}): Promise<AfatCanonicalRoute> {
  const { data, error } = await supabase.rpc('afat_route_canonical', {
    p_origin_lat: input.originLatitude,
    p_origin_lon: input.originLongitude,
    p_destination_lat: input.destinationLatitude,
    p_destination_lon: input.destinationLongitude,
    p_mode: input.mode,
    p_snap_radius_m: input.snapRadiusM ?? 1200,
  });

  if (error) throw new Error(error.message || 'AFAT could not calculate a trusted route.');
  return (data || { status: 'unavailable', mode: input.mode, reason: 'route_service_returned_no_result' }) as AfatCanonicalRoute;
}

export function routeToLatLngs(route?: AfatCanonicalRoute | null): Array<[number, number]> {
  if (!route || route.status !== 'ok' || !Array.isArray(route.segments)) return [];
  const output: Array<[number, number]> = [];
  for (const segment of route.segments) {
    const coordinates = segment.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    for (const coordinate of coordinates) {
      const longitude = Number(coordinate?.[0]);
      const latitude = Number(coordinate?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const previous = output[output.length - 1];
      if (previous && previous[0] === latitude && previous[1] === longitude) continue;
      output.push([latitude, longitude]);
    }
  }
  return output;
}
