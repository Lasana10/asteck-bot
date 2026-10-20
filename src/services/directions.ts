import axios from 'axios';
import dotenv from 'dotenv';
import { Coordinates } from '../types';

dotenv.config();

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OSRM_URL = (process.env.AFAT_OSRM_BASE_URL || '').replace(/\/+$/, '');
const ALLOW_DEMO = process.env.NODE_ENV !== 'production' || process.env.AFAT_ALLOW_PUBLIC_OSRM === 'true';
const GOOGLE_OPT_IN = process.env.AFAT_GOOGLE_DIRECTIONS_FALLBACK === 'true';
function validCoordinates(c: Coordinates): boolean {
  return Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
/**
 * Render private services use single-label HTTP DNS names inside the same
 * workspace/region. Never allow arbitrary plaintext Internet routing targets.
 * Configuration is service-controlled, never a public API query parameter.
 */
export function validatedOsrmEndpoint(raw: string, privateHttp = false): string | null {
  if (!raw.trim()) return null;
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    const renderPrivate = privateHttp && /^[a-z][a-z0-9-]*-[a-z0-9]+$/.test(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (local || renderPrivate))) return null;
    return u.toString().replace(/\\/+$/, '');
  } catch { return null; }
}
function routingEndpoint(): string | null {
  if (!OSRM_URL) return ALLOW_DEMO ? 'https://router.project-osrm.org' : null;
  return validatedOsrmEndpoint(OSRM_URL, process.env.AFAT_ALLOW_PRIVATE_OSRM_HTTP === 'true');
}

export interface RouteResult {
  summary: string;
  distance: string;
  distanceMeters?: number;
  duration: string;
  durationValue: number; // seconds
  startAddress: string;
  endAddress: string;
  steps: string[];
  warnings: string[];
  geometry?: { type: 'LineString'; coordinates: number[][] };
}

export interface DirectionsResult {
  source: 'osrm' | 'google';
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
    options: { allowMeteredFallback?: boolean } = {}
  ): Promise<DirectionsResult | null> {
    if (!validCoordinates(origin) || !validCoordinates(destination)) return null;
    const local = await this.osrmDirections(origin, destination);
    if (local) return local;
    // Preserve the legacy configured Google route path until AFAT operates OSRM.
    // Once OSRM is configured, metered failover remains explicit opt-in.
    return options.allowMeteredFallback !== false && GOOGLE_MAPS_KEY && (!OSRM_URL || GOOGLE_OPT_IN)
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
      steps: (leg.steps || [])
        .slice(0, 8)
        .map((s: any) => s.html_instructions?.replace(/<[^>]*>/g, '') || ''),
      warnings: route.warnings || [],
    };
  }

  // ========== OSRM (FREE FALLBACK) ==========
  private static async osrmDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<DirectionsResult | null> {
    try {
      const base = routingEndpoint();
      if (!base) return null;
      const url = `${base}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&alternatives=true&steps=true`;

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

      const routes = data.routes.map((route: any) => this.parseOSRMRoute(route));

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

  private static parseOSRMRoute(route: any): RouteResult {
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
      geometry: route.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates) ? route.geometry : undefined,
      duration: `${durMin} min`,
      durationValue: route.duration,
      startAddress: '',
      endAddress: '',
      steps,
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
