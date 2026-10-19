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
function routingEndpoint(): string | null {
  if (!OSRM_URL) return ALLOW_DEMO ? 'https://router.project-osrm.org' : null;
  try {
    const u = new URL(OSRM_URL);
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
    return u.toString().replace(/\/+$/, '');
  } catch { return null; }
}

export interface RouteResult {
  summary: string;
  distance: string;
  duration: string;
  durationValue: number; // seconds
  startAddress: string;
  endAddress: string;
  steps: string[];
  warnings: string[];
}

export interface DirectionsResult {
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
    destination: Coordinates
  ): Promise<DirectionsResult | null> {
    if (!validCoordinates(origin) || !validCoordinates(destination)) return null;
    const local = await this.osrmDirections(origin, destination);
    if (local) return local;
    return GOOGLE_OPT_IN && GOOGLE_MAPS_KEY ? this.googleDirections(origin, destination) : null;
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

  private static parseGoogleRoute(route: any): RouteResult {
    const leg = route.legs[0];
    return {
      summary: route.summary || 'Route',
      distance: leg.distance?.text || '—',
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
      const url = `${base}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&alternatives=true&steps=true`;

      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      if (data.code !== 'Ok' || !data.routes?.length) return null;

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
