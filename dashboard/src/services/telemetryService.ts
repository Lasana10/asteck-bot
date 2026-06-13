import { publishMapSignal } from '../supabaseClient';
import { offlineSync } from './offlineSync';

/**
 * TelemetryService (Category 16 - Israeli Approach)
 * Passively records movement data (GPS, Speed, Heading) and sends it to Supabase.
 * Supports offline queuing and intelligent batching to save battery.
 */
export class TelemetryService {
  private static instance: TelemetryService;
  private watchId: number | null = null;
  private lastUploadTime: number = 0;
  private minInterval: number = 30000; // 30 seconds between uploads when moving slow
  private fastInterval: number = 5000;  // 5 seconds when moving fast (> 20km/h)
  private currentUser: any = null;

  private constructor() {}

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  public start(userId: string) {
    if (this.watchId !== null) return;
    this.currentUser = userId;

    if (!navigator.geolocation) {
      console.warn('Telemetry: Geolocation not supported');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => console.error('Telemetry Error:', err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    console.log('📡 Telemetry Service Started for User:', userId);
  }

  public stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private async handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, altitude, speed, heading, accuracy } = pos.coords;
    const now = Date.now();
    const currentInterval = (speed && speed > 5.5) ? this.fastInterval : this.minInterval; // 5.5 m/s approx 20km/h

    if (now - this.lastUploadTime < currentInterval) return;

    const payload = {
      user_id: this.currentUser,
      latitude,
      longitude,
      altitude,
      speed: speed ? speed * 3.6 : 0, // Convert m/s to km/h
      heading,
      accuracy,
      timestamp: new Date(pos.timestamp).toISOString(),
      device_os: navigator.platform || 'web',
      network_type: (navigator as any).connection?.effectiveType || 'unknown'
    };

    this.lastUploadTime = now;

    if (navigator.onLine) {
      const { error } = await publishMapSignal({
        signal_type: 'movement',
        profile_id: payload.user_id,
        latitude,
        longitude,
        speed_kph: payload.speed,
        heading,
        accuracy,
        device_os: payload.device_os,
        network_type: payload.network_type,
        source: 'telemetry_service',
      });
      if (error) {
        console.error('Telemetry Upload Error:', error.message);
        await offlineSync.enqueue('INSERT_TELEMETRY', payload);
      }
    } else {
      await offlineSync.enqueue('INSERT_TELEMETRY', payload);
    }
  }
}

export const telemetry = TelemetryService.getInstance();
