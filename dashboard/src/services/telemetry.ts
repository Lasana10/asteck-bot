import { offlineSync } from './offlineSync';
import { mapOfflineService } from './MapOfflineService';

/**
 * Adaptive Telemetry Engine
 * Collects GPS positions dynamically based on movement to save battery.
 * Batches telemetry data locally before pushing to Supabase.
 */

class TelemetryService {
  private watchId: number | null = null;
  private userId: string | null = null;
  private buffer: any[] = [];
  private lastSentTime: number = Date.now();
  private batchInterval: number = 60000; // 60 seconds batch push

  start(userId: string) {
    if (this.watchId) return;
    this.userId = userId;
    this.buffer = [];
    this.lastSentTime = Date.now();

    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        this.handlePosition.bind(this),
        this.handleError.bind(this),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      console.log(`[Telemetry] Started adaptive tracking for ${userId}`);
    } else {
      console.warn('[Telemetry] Geolocation not supported by this browser.');
    }
    
    // Fallback simulated tracking for testing (if real GPS isn't changing much)
    this.setupSimulatedMovement();
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.userId = null;
      console.log('[Telemetry] Stopped tracking.');
    }
  }

  private handlePosition(position: GeolocationPosition) {
    if (!this.userId) return;

    const { latitude, longitude, speed, heading, accuracy } = position.coords;
    
    // Adaptive logic: If accuracy is terrible, drop it
    if (accuracy > 100) return;

    // Convert speed (m/s) to km/h
    const speedKph = speed ? speed * 3.6 : 0;

    this.buffer.push({
      user_id: this.userId,
      location: `POINT(${longitude} ${latitude})`,
      speed_kph: speedKph,
      heading: heading || 0,
      accuracy: accuracy
    });
    
    // Silent trigger for Smart Local Map regional download capability
    mapOfflineService.checkPosition(latitude, longitude, (msg) => console.log('[Telemetry Map Helper]', msg));

    this.flushBufferIfNeeded();
  }

  private handleError(error: GeolocationPositionError) {
    console.error('[Telemetry] Geolocation error:', error.message);
  }

  private flushBufferIfNeeded() {
    const now = Date.now();
    // Flush if interval has passed and buffer has items
    if (now - this.lastSentTime >= this.batchInterval && this.buffer.length > 0) {
      // Send clone of buffer to offlineSync queue
      offlineSync.enqueueBatch('INSERT_TELEMETRY', [...this.buffer]);
      this.buffer = [];
      this.lastSentTime = now;
    }
  }

  // Purely for development/demonstration since local browser GPS stays fixed
  private simInterval: any = null;
  private startLat = 3.848;
  private startLng = 11.502;
  
  private setupSimulatedMovement() {
    if (this.simInterval) clearInterval(this.simInterval);
    
    this.simInterval = setInterval(() => {
      if (!this.userId) return;
      this.startLat += (Math.random() - 0.5) * 0.001;
      this.startLng += (Math.random() - 0.5) * 0.001;
      
      this.buffer.push({
        user_id: this.userId,
        location: `POINT(${this.startLng} ${this.startLat})`,
        speed_kph: 20 + Math.random() * 20,
        heading: Math.random() * 360,
        accuracy: 10
      });
      
      this.flushBufferIfNeeded();
    }, 15000); // Generate a point every 15s
  }
}

export const telemetry = new TelemetryService();
