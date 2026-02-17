import axios from 'axios';
import { Coordinates } from '../types';

export class GeoService {
  private static NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

  /**
   * Reverse Geocoding using OpenStreetMap Nominatim
   * Note: Respects the Usage Policy (User-Agent header required).
   */
  static async reverseGeocode(coords: Coordinates): Promise<string | null> {
    try {
      const response = await axios.get(this.NOMINATIM_URL, {
        params: {
          format: 'json',
          lat: coords.latitude,
          lon: coords.longitude,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          'User-Agent': 'AsTeckTraffic/1.0 (TrafficIntelligenceBot)'
        }
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
