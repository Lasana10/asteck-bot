import axios from 'axios';
import dotenv from 'dotenv';
import { Coordinates } from '../types';
import { valhallaMicromobilityDirections } from './valhallaRouting';

dotenv.config();

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OSRM_URL = (process.env.AFAT_OSRM_BASE_URL || '').replace(/\/+$/, '');
const FOOT_OSRM_URL = (process.env.AFAT_OSRM_FOOT_BASE_URL || '').replace(/\/+$/, '');
const ALLOW_DEMO = process.env.NODE_ENV !== 'production' || process.env.AFAT_ALLOW_PUBLIC_OSRM === 'true';
const GOOGLE_OPT_IN = process.env.AFAT_GOOGLE_DIRECTIONS_FALLBACK === 'true';
// Only enable after private car and foot backends are independently live.
const PRIVATE_OSRM_ONLY = process.env.AFAT_REQUIRE_PRIVATE_OSRM === 'true';
function validCoordinates(c: Coordinates): boolean {
  return Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
/**
 * Render private services use single-label HTTP DNS names inside the same
 * workspace/region. Never allow arbitrary plaintext Internet routing targets.
 * Configuration is service-controlled, never a public API query parameter.
 */
export function validatedOsrmEndpoint(raw: string, privateHttp = false, privateOnly = false): string | null {
  if (!raw.trim()) return null;
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    const renderPrivate = privateHttp && /^[a-z][a-z0-9-]*-[a-z0-9]+$/.test(u.hostname);
    const internalName = /^[a-z][a-z0-9-]*-[a-z0-9]+$/.test(u.hostname) && !u.hostname.includes('.');
    // Opt-in private cutover must not exfiltrate route points to arbitrary
    // public HTTPS domains just because TLS is present.
    if (privateOnly && !local && !internalName) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (local || renderPrivate))) return null;
    return u.origin;
  } catch { return null; }
}
function routingEndpoint(mode: 'driving' | 'foot'): string | null {
  // Walking requires a real foot-built graph. Never silently reuse car or public
  // demo routing for pedestrian safety or accessibility estimates.
  const raw = mode === 'foot' ? FOOT_OSRM_URL : OSRM_URL;
  if (!raw) return !PRIVATE_OSRM_ONLY && mode === 'driving' && ALLOW_DEMO ? 'https://router.project-osrm.org' : null;
  return validatedOsrmEndpoint(raw, process.env.AFAT_ALLOW_PRIVATE_OSRM_HTTP === 'true', PRIVATE_OSRM_ONLY);
}

export interface RoadManeuver { latitude:number; longitude:number; instruction:string; distanceMeters:number; kind:string; }
export interface RouteResult { maneuvers?:RoadManeuver[];
  summary: string;
  distance: string;
  distanceMeters?: number;
  originSnapMeters?: number;
  destinationSnapMeters?: number;
  duration: string;
  durationValue: number; // seconds
  startAddress: string;
  endAddress: string;
  steps: string[];
  warnings: string[];
  geometry?: { type: 'LineString'; coordinates: number[][] };
}

export interface DirectionsResult {
  source: 'osrm' | 'google' | 'valhalla';
  primary: RouteResult;
  alternatives: RouteResult[];
}

export class DirectionsService {
  /**
   * Get directions between two points using Google Maps Directions API.
   * Falls back to OpenStreetMap/OSRM if no Google Maps key.
   */
  static async getDirections(
    origin: Coordinates,
    destination: Coordinates,
    options: { allowMeteredFallback?: boolean; travelMode?: 'driving' | 'foot' | 'bicycle' | 'motorcycle' } = {}
  ): Promise<DirectionsResult | null> {
    if (!validCoordinates(origin) || !validCoordinates(destination)) return null;
    const travelMode=options.travelMode || 'driving';
    // Preserve existing OSRM for car and foot. Only complementary modes use
    // optional self-controlled Valhalla; never silently reroute car/foot.
    if (travelMode === 'bicycle' || travelMode === 'motorcycle')
      return valhallaMicromobilityDirections(origin,destination,travelMode);
    const local = await this.osrmDirections(origin, destination, travelMode);
    if (local) return local;
    if (travelMode === 'foot') return null;
    // Preserve the legacy configured Google route path until AFAT operates OSRM.
    // Once OSRM is configured, metered failover remains explicit opt-in.
    return !PRIVATE_OSRM_ONLY && options.allowMeteredFallback !== false && GOOGLE_MAPS_KEY && (!OSRM_URL || GOOGLE_OPT_IN)
      ? this.googleDirections(origin, destination) : null;
  }

  /**
   * Get ETA string for quick display
   */
  static async getETA(origin: Coordinates, destination: Coordinates): Promise<string | null> {
    const result = await this.getDirections(origin, destination);
    if (!result) return null;
    return `${result.primary.duration} (${result.primary.distance})`;
  }

  /**
   * Get traffic condition at a specific coordinate
   */
  static async getTrafficCondition(coord: Coordinates): Promise<'congested' | 'slow' | 'normal' | 'unknown'> {
    // Note: Real-time traffic layer requires a different API integration. 
    // Returning 'unknown' as a safe default for the VerifierAgent.
    return 'unknown';
  }

  // ========== GOOGLE MAPS ==========
  private static async googleDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<DirectionsResult | null> {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/directions/json',
        {
          params: {
            origin: `${origin.latitude},${origin.longitude}`,
            destination: `${destination.latitude},${destination.longitude}`,
            mode: 'driving',
            alternatives: true,
            language: 'fr',
            key: GOOGLE_MAPS_KEY,
          },
        }
      );

      const data = response.data;
      if (data.status !== 'OK' || !data.routes?.length) return null;

      const routes = data.routes.map((route: any) => this.parseGoogleRoute(route));

      return {
        source: 'google',
        primary: routes[0],
        alternatives: routes.slice(1),
      };
    } catch (error) {
      console.error('[Directions] Google Maps error:', error);
      return null;
    }
  }

  // Google Directions uses encoded polylines. Decode locally so authorized
  // Google fallback can supply the same map geometry contract as OSRM.
  private static decodeGooglePolyline(encoded: string): number[][] {
    if (!encoded || encoded.length > 200000) return [];
    const points: number[][] = [];
    let latitude = 0;
    let longitude = 0;
    let cursor = 0;
    try {
      while (cursor < encoded.length && points.length < 50000) {
        const delta: number[] = [];
        for (let axis = 0; axis < 2; axis += 1) {
          let result = 0;
          let shift = 0;
          let byte: number;
          do {
            if (cursor >= encoded.length || shift > 30) return [];
            byte = encoded.charCodeAt(cursor++) - 63;
            if (byte < 0 || byte > 63) return [];
            result |= (byte & 31) << shift;
            shift += 5;
          } while (byte >= 32);
          delta.push((result & 1) ? ~(result >> 1) : (result >> 1));
        }
        latitude += delta[0];
        longitude += delta[1];
        const lat = latitude / 1e5;
        const lon = longitude / 1e5;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
        points.push([lon, lat]);
      }
    } catch { return []; }
    return points;
  }

  private static parseGoogleRoute(route: any): RouteResult {
    const leg = route.legs[0];
    const polyline = this.decodeGooglePolyline(String(route.overview_polyline?.points || ''));
    return {
      geometry: polyline.length >= 2 ? { type: 'LineString', coordinates: polyline } : undefined,
      summary: route.summary || 'Route',
      distance: leg.distance?.text || '—',
      distanceMeters: leg.distance?.value,
      duration: leg.duration?.text || '—',
      durationValue: leg.duration?.value || 0,
      startAddress: leg.start_address || '',
      endAddress: leg.end_address || '',
      maneuvers:(leg.steps||[]).slice(0,200).flatMap((step:any)=>{
       const latitude=Number(step.start_location?.lat),longitude=Number(step.start_location?.lng);
       if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
       return [{latitude,longitude,kind:String(step.maneuver||'continue').slice(0,48),
        instruction:String(step.html_instructions||'Continue').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180),
        distanceMeters:Math.max(0,Number(step.distance?.value)||0)}];
      }),
      steps: (leg.steps || [])
        .slice(0, 8)
        .map((s: any) => s.html_instructions?.replace(/<[^>]*>/g, '') || ''),
      warnings: route.warnings || [],
    };
  }

  // ========== OSRM (FREE FALLBACK) ==========
  private static async osrmDirections(
    origin: Coordinates,
    destination: Coordinates,
    travelMode: 'driving' | 'foot' = 'driving',
  ): Promise<DirectionsResult | null> {
    try {
      const base = routingEndpoint(travelMode);
      if (!base) return null;
      const url = `${base}/route/v1/${travelMode}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&alternatives=true&steps=true`;

      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) return null;
      // Never convert provider errors or malformed geometry into AFAT route truth.
      const valid = (route: any) =>
        Number.isFinite(route?.distance) && route.distance > 0 &&
        Number.isFinite(route?.duration) && route.duration > 0 &&
        route?.geometry?.type === 'LineString' &&
        Array.isArray(route.geometry.coordinates) &&
        route.geometry.coordinates.length >= 2 && route.geometry.coordinates.length <= 50000 &&
        route.geometry.coordinates.every((point: unknown) =>
          Array.isArray(point) && point.length >= 2 &&
          Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
          Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90);
      if (!data.routes.every(valid)) return null;

      const routes = data.routes.map((route: any) => this.parseOSRMRoute(route, data.waypoints));

      return {
        source: 'osrm',
        primary: routes[0],
        alternatives: routes.slice(1),
      };
    } catch (error) {
      console.error('[Directions] OSRM error:', error);
      return null;
    }
  }

  private static parseOSRMRoute(route: any, waypoints: any[] | undefined): RouteResult {
    const distKm = (route.distance / 1000).toFixed(1);
    const durMin = Math.round(route.duration / 60);

    const steps = (route.legs?.[0]?.steps || [])
      .filter((s: any) => s.name)
      .slice(0, 8)
      .map((s: any) => {
        const turnType = s.maneuver?.type || '';
        const modifier = s.maneuver?.modifier || '';
        const name = s.name || 'unnamed road';
        const dist = (s.distance / 1000).toFixed(1);
        return `${this.getDirectionEmoji(turnType, modifier)} ${name} (${dist}km)`;
      });

    return {
      summary: route.legs?.[0]?.steps?.[0]?.name || 'Route',
      distance: `${distKm} km`,
      distanceMeters: route.distance,
      // Actual OSRM network snapping distance; a matched road vertex is not
      // proof of building entrance or last-metre accessibility.
      originSnapMeters: Number.isFinite(waypoints?.[0]?.distance) && waypoints![0].distance>=0 ? waypoints![0].distance : undefined,
      destinationSnapMeters: Number.isFinite(waypoints?.[1]?.distance) && waypoints![1].distance>=0 ? waypoints![1].distance : undefined,
      geometry: route.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates) ? route.geometry : undefined,
      duration: `${durMin} min`,
      durationValue: route.duration,
      startAddress: '',
      endAddress: '',
      steps,
      maneuvers:(route.legs||[]).flatMap((leg:any)=>(leg.steps||[]).slice(0,200)).slice(0,300).flatMap((step:any)=>{
       const loc=step.maneuver?.location;
       if(!Array.isArray(loc)||loc.length<2)return [];
       const [longitude,latitude]=loc.map(Number);
       if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
       const kind=String(step.maneuver?.type||'continue').slice(0,48);
       const modifier=String(step.maneuver?.modifier||'').slice(0,32);
       const road=String(step.name||'unnamed road').slice(0,100);
       const instruction=kind==='arrive'?'Arrive at destination':kind==='depart'?'Depart':
        kind==='turn'?'Turn '+(modifier||'as indicated')+' on '+road:
        kind==='roundabout'?'Enter roundabout toward '+road:'Continue on '+road;
       return [{latitude,longitude,kind,instruction,distanceMeters:Math.max(0,Number(step.distance)||0)}];
      }),
      warnings: [],
    };
  }

  private static getDirectionEmoji(type: string, modifier: string): string {
    if (type === 'turn' && modifier === 'left') return '⬅️';
    if (type === 'turn' && modifier === 'right') return '➡️';
    if (type === 'roundabout') return '🔄';
    if (type === 'depart') return '🚗';
    if (type === 'arrive') return '🏁';
    return '⬆️';
  }
}
