import { fetchParticipantDispatches, publishMapSignal } from '../supabaseClient';
import { offlineSync } from './offlineSync';
import { enqueueJourneySample, flushJourneySamples } from './journeyTelemetryQueue';

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
  private continuityRestore: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) TelemetryService.instance = new TelemetryService();
    return TelemetryService.instance;
  }

  public start(userId: string, dispatchAssignmentId?: string | null) {
    if (this.currentUser !== userId) this.stop();
    this.currentUser = userId;
    if (dispatchAssignmentId !== undefined) this.setActiveDispatchAssignment(dispatchAssignmentId);
    else void this.restoreActiveDispatchAssignment(userId);
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

  private continuityKey(userId: string) {
    return `afat_active_dispatch_v1:${userId}`;
  }

  private async restoreActiveDispatchAssignment(userId: string) {
    if (this.continuityRestore) return this.continuityRestore;
    this.continuityRestore = (async () => {
      const remembered = localStorage.getItem(this.continuityKey(userId));
      const { data, error } = await fetchParticipantDispatches({ limit: 20 });
      if (error || !data) {
        if (remembered) this.activeDispatchAssignmentId = remembered;
        return;
      }

      const dispatches = Array.isArray(data.dispatches) ? data.dispatches : [];
      const activeJourney = dispatches.find((item: any) => ['in_journey', 'emergency'].includes(String(item.status || '').toLowerCase()));
      if (activeJourney?.id) {
        this.setActiveDispatchAssignment(activeJourney.id);
        void flushJourneySamples(userId).catch(console.error);
      } else {
        this.clearActiveDispatchAssignment();
      }
    })().finally(() => { this.continuityRestore = null; });
    return this.continuityRestore;
  }

  public setActiveDispatchAssignment(assignmentId?: string | null) {
    const normalized = String(assignmentId || '').trim();
    this.activeDispatchAssignmentId = normalized || null;
    if (this.currentUser) {
      if (this.activeDispatchAssignmentId) localStorage.setItem(this.continuityKey(this.currentUser), this.activeDispatchAssignmentId);
      else localStorage.removeItem(this.continuityKey(this.currentUser));
    }
  }

  public clearActiveDispatchAssignment() {
    this.activeDispatchAssignmentId = null;
    if (this.currentUser) localStorage.removeItem(this.continuityKey(this.currentUser));
  }

  public stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.activeDispatchAssignmentId = null;
    this.continuityRestore = null;
    this.currentUser = null;
    this.lastUploadTime = 0;
  }

  private async handlePosition(pos: GeolocationPosition) {
    if (!this.currentUser) return;
    const userId = this.currentUser;
    const assignmentId = this.activeDispatchAssignmentId;
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

    if (assignmentId) {
      try {
        enqueueJourneySample(userId, assignmentId, { latitude, longitude, accuracy_m: accuracy, speed_kph: speedKph, heading, recorded_at: timestamp });
        void flushJourneySamples(userId).catch(console.error);
      } catch (error) { console.error('Journey sample could not be queued', error); }
    }
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
    } else {
      await offlineSync.enqueue('INSERT_TELEMETRY', payload);
    }
  }
}

export const telemetry = TelemetryService.getInstance();
