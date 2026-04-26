import axios from 'axios';
import { updateVehicleLocationByTraccar } from '../infra/supabase';

/**
 * TRACCAR SERVICE
 * Manages communication with the self-hosted Traccar GPS server.
 */
export class TraccarService {
  private baseUrl: string;
  private auth: string;

  constructor() {
    this.baseUrl = process.env.TRACCAR_URL || 'http://localhost:8082';
    const user = process.env.TRACCAR_USER || 'admin';
    const pass = process.env.TRACCAR_PASS || 'admin';
    this.auth = Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /**
   * Fetch all devices from Traccar
   */
  async getDevices() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/devices`, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      });
      return response.data;
    } catch (err) {
      console.error('[Traccar] Failed to fetch devices:', err);
      return [];
    }
  }

  /**
   * Handle incoming position data (Webhook callback)
   * This is typically called by an Express route.
   */
  async handlePositionUpdate(data: any) {
    // Traccar positions usually come as an array or single object
    const positions = Array.isArray(data) ? data : [data];

    for (const pos of positions) {
      const { deviceId, latitude, longitude, speed, course } = pos;
      
      console.log(`📡 [GPS] Device ${deviceId}: ${latitude}, ${longitude}`);
      
      // Update Supabase
      await updateVehicleLocationByTraccar(
        deviceId.toString(),
        latitude,
        longitude,
        speed,
        course
      );
    }
  }

  /**
   * Create a new device in Traccar (e.g., when a new operator signs up)
   */
  async createDevice(name: string, uniqueId: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/devices`, {
        name,
        uniqueId,
      }, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      });
      return response.data;
    } catch (err) {
      console.error('[Traccar] Failed to create device:', err);
      return null;
    }
  }
}

export const traccarService = new TraccarService();
