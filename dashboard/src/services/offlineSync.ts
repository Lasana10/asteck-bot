import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';

/**
 * AFAT offline mutation queue.
 *
 * Security rule: queued mutations replay only through authenticated backend
 * contracts. The browser must never bypass AFAT authorization by writing
 * protected operational tables directly with the Supabase client.
 */
const STORAGE_KEY = 'afat_offline_sync_queue';

export interface OfflineMutation {
  id: string;
  type: 'INSERT_INCIDENT' | 'VOICE_REPORT_UPLOAD' | 'UPDATE_BOOKING' | 'INSERT_TELEMETRY';
  payload: any;
  timestamp: number;
}

function queueId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return {
    error: await response.text().then((text) => text.replace(/\s+/g, ' ').slice(0, 160)).catch(() => ''),
  };
}

export const offlineSync = {
  async enqueue(type: OfflineMutation['type'], payload: any) {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    queue.push({ id: queueId(), type, payload, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Enqueued ${type}. Queue size: ${queue.length}`);
  },

  async enqueueBatch(type: OfflineMutation['type'], payloadArray: any[]) {
    if (payloadArray.length === 0) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    queue.push({ id: queueId(), type, payload: payloadArray, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Enqueued batch of ${type} (${payloadArray.length} items).`);
  },

  async flush() {
    if (!navigator.onLine) {
      console.log('[OfflineSync] Offline. Flush aborted.');
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return;

    const remainingQueue: OfflineMutation[] = [];

    for (const mutation of queue) {
      try {
        const authHeaders = await authenticatedApiHeaders();

        if (mutation.type === 'INSERT_INCIDENT') {
          const incident = mutation.payload || {};
          const response = await fetch(`${getApiBaseUrl()}/api/ops/map-signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              signal_type: 'incident',
              incident_type: incident.type || incident.incident_type || 'road_hazard',
              latitude: incident.latitude,
              longitude: incident.longitude,
              address: incident.address,
              description: incident.description,
              severity: incident.severity,
              source: 'offline_sync',
              actor_type: 'verified_offline_report',
              verification_hint: 'queued_replay',
              metadata: {
                offline_mutation_id: mutation.id,
                queued_at: mutation.timestamp,
              },
            }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) throw new Error(data.error || 'Offline incident replay failed');
        } else if (mutation.type === 'UPDATE_BOOKING') {
          const booking = mutation.payload || {};
          const bookingId = String(booking.id || booking.booking_id || '').trim();
          const action = String(booking.action || booking.operation || '').trim().toLowerCase();
          if (!bookingId) throw new Error('Offline booking replay is missing a booking id.');

          // Only replay operations for which AFAT has an authenticated backend
          // contract. Arbitrary browser-side booking updates are deliberately
          // rejected rather than written directly to Supabase.
          if (action !== 'complete') {
            throw new Error('This queued booking action has no safe AFAT replay contract yet.');
          }

          const response = await fetch(`${getApiBaseUrl()}/api/booking/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              booking_id: bookingId,
              rating: booking.rating,
              feedback: booking.feedback,
              offline_mutation_id: mutation.id,
              queued_at: mutation.timestamp,
            }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) throw new Error(data.error || 'Offline booking completion replay failed');
        } else if (mutation.type === 'VOICE_REPORT_UPLOAD') {
          // Keep the item queued until AFAT exposes an authenticated binary
          // upload/replay contract. Logging success here previously dropped the
          // report while pretending it had synchronized.
          throw new Error('Offline voice upload is waiting for a real authenticated replay contract.');
        } else if (mutation.type === 'INSERT_TELEMETRY') {
          const payload = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
          for (const signal of payload) {
            const response = await fetch(`${getApiBaseUrl()}/api/ops/map-signal`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({
                signal_type: 'movement',
                latitude: signal.latitude,
                longitude: signal.longitude,
                speed_kph: signal.speed_kph ?? signal.speed,
                heading: signal.heading,
                accuracy: signal.accuracy,
                device_os: signal.device_os,
                network_type: signal.network_type,
                source: 'offline_sync',
                metadata: {
                  offline_mutation_id: mutation.id,
                  queued_at: mutation.timestamp,
                },
              }),
            });
            const data = await readJsonResponse(response);
            if (!response.ok) throw new Error(data.error || 'Map signal sync failed');
          }
        }

        console.log(`[OfflineSync] Synced ${mutation.type} successfully.`);
      } catch (err) {
        console.error(`[OfflineSync] Failed to sync ${mutation.type}.`, err);
        remainingQueue.push(mutation);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingQueue));
    console.log(remainingQueue.length === 0
      ? '[OfflineSync] All replayable items synced.'
      : `[OfflineSync] ${remainingQueue.length} item(s) remain queued.`);
  },

  init() {
    window.addEventListener('online', () => this.flush());
    if (navigator.onLine) this.flush();
  }
};
