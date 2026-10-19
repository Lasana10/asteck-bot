import axios from 'axios';
import { Coordinates } from '../types';

export class GeoService {
  private static reverseEndpoint(): string | null {
    const configured = (process.env.AFAT_REVERSE_GEOCODE_URL || '').trim();
    if (!configured) {
      return process.env.NODE_ENV !== 'production' || process.env.AFAT_ALLOW_PUBLIC_NOMINATIM === 'true'
        ? 'https://nominatim.openstreetmap.org/reverse' : null;
    }
    try {
      const url = new URL(configured);
      if (url.username || url.password || url.hash || url.search) return null;
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
      return url.toString();
    } catch { return null; }
  }

  /**
   * Reverse Geocoding using OpenStreetMap Nominatim
   * Note: Respects the Usage Policy (User-Agent header required).
   */
  static async reverseGeocode(coords: Coordinates): Promise<string | null> {
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return null;
    const endpoint = this.reverseEndpoint();
    if (!endpoint) return null;
    try {
      const response = await axios.get(endpoint, {
        params: {
          format: 'json',
          lat: coords.latitude,
          lon: coords.longitude,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          'User-Agent': process.env.AFAT_GEOCODER_USER_AGENT || 'AFAT-Mobility/1.0'
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data || !data.address) return null;

      // Prioritize "Human Readable" names over raw streets
      // Structure: Landmark -> Road -> Suburb -> City
      const addr = data.address;
      const parts = [
        addr.amenity || addr.shop || addr.building, // Landmark
        addr.road || addr.pedestrian,              // Street
        addr.suburb || addr.neighbourhood,         // Area
        addr.city || addr.town                     // City
      ].filter(Boolean);

      return parts.slice(0, 2).join(', ') || parts[0] || "Unknown Location";

    } catch (error) {
      console.error('GeoService Error:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two points in km (Haversine formula)
   */
  static calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(coord2.latitude - coord1.latitude);
    const dLon = this.deg2rad(coord2.longitude - coord1.longitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(coord1.latitude)) * Math.cos(this.deg2rad(coord2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
