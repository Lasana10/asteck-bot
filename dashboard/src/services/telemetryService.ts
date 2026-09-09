import { getApiBaseUrl, publishMapSignal, supabase } from '../supabaseClient';
import { offlineSync } from './offlineSync';

/**
 * Real-device telemetry only. Browser geolocation is published to the live map
 * and, when an authenticated AFAT journey is active, to that journey's evidence
 * stream. This service never synthesizes positions, speeds or headings.
 */
export class TelemetryService {
  private static instance: TelemetryService;
  private watchId: number | null = null;
  private lastUploadTime = 0;
  private minInterval = 30000;
  private fastInterval = 5000;
  private currentUser: string | null = null;
  private activeDispatchAssignmentId: string | null = null;

  private constructor() {}

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) TelemetryService.instance = new TelemetryService();
    return TelemetryService.instance;
  }

  public start(userId: string, dispatchAssignmentId?: string | null) {
    this.currentUser = userId;
    if (dispatchAssignmentId !== undefined) this.setActiveDispatchAssignment(dispatchAssignmentId);
    if (this.watchId !== null) return;

    if (!navigator.geolocation) {
      console.warn('Telemetry: Geolocation not supported');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => void this.handlePosition(pos),
      (err) => console.error('Telemetry Error:', err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  public setActiveDispatchAssignment(assignmentId?: string | null) {
    const normalized = String(assignmentId || '').trim();
    this.activeDispatchAssignmentId = normalized || null;
  }

  public clearActiveDispatchAssignment() {
    this.activeDispatchAssignmentId = null;
  }

  public stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.activeDispatchAssignmentId = null;
  }

  private async publishJourneySample(payload: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: string;
  }) {
    const assignmentId = this.activeDispatchAssignmentId;
    if (!assignmentId || !navigator.onLine) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;

    const response = await fetch(`${getApiBaseUrl()}/api/dispatch/${encodeURIComponent(assignmentId)}/journey/sample`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy_m: payload.accuracy,
        speed_kph: payload.speed,
        heading: payload.heading,
        recorded_at: payload.timestamp,
      }),
    }).catch(() => null);

    if (!response) return;
    if (response.status === 409 || response.status === 403 || response.status === 404) {
      // The server is authoritative about whether this user still belongs to an
      // active journey. Stop journey-specific publication, but keep ordinary map
      // telemetry running.
      this.activeDispatchAssignmentId = null;
      return;
    }
    if (!response.ok) console.warn('Journey telemetry sample was not accepted.', response.status);
  }

  private async handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, altitude, speed, heading, accuracy } = pos.coords;
    const now = Date.now();
    const currentInterval = speed != null && speed > 5.5 ? this.fastInterval : this.minInterval;
    if (now - this.lastUploadTime < currentInterval) return;

    const speedKph = speed == null ? null : speed * 3.6;
    const timestamp = new Date(pos.timestamp).toISOString();
    const payload = {
      user_id: this.currentUser,
      latitude,
      longitude,
      altitude,
      speed: speedKph,
      heading,
      accuracy,
      timestamp,
      device_os: navigator.platform || 'web',
      network_type: (navigator as any).connection?.effectiveType || 'unknown',
    };

    this.lastUploadTime = now;

    if (navigator.onLine) {
      const { error } = await publishMapSignal({
        signal_type: 'movement',
        profile_id: payload.user_id,
        latitude,
        longitude,
        speed_kph: payload.speed ?? undefined,
        heading: heading ?? undefined,
        accuracy,
        device_os: payload.device_os,
        network_type: payload.network_type,
        source: 'telemetry_service',
      });
      if (error) {
        console.error('Telemetry Upload Error:', error.message);
        await offlineSync.enqueue('INSERT_TELEMETRY', payload);
      }
      await this.publishJourneySample({ latitude, longitude, accuracy, speed: speedKph, heading, timestamp });
    } else {
      await offlineSync.enqueue('INSERT_TELEMETRY', payload);
    }
  }
}

export const telemetry = TelemetryService.getInstance();
