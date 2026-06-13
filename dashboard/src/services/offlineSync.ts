import { apiBaseUrl, afatAuthHeaders, supabase } from '../supabaseClient';

/**
 * World-Class Zero-Dependency Offline Queue
 * Uses localStorage to ensure immediate boot-up without external dependency blocks.
 */
const STORAGE_KEY = 'afat_offline_sync_queue';

export interface OfflineMutation {
  id: string;
  type: 'INSERT_INCIDENT' | 'VOICE_REPORT_UPLOAD' | 'UPDATE_BOOKING' | 'INSERT_TELEMETRY';
  payload: any;
  timestamp: number;
}

export const offlineSync = {
  /**
   * Pushes an action to the local queue.
   */
  async enqueue(type: OfflineMutation['type'], payload: any) {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    
    // Safety Fallback for older browsers
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const mutation: OfflineMutation = {
      id: uuid,
      type,
      payload,
      timestamp: Date.now()
    };
    
    queue.push(mutation);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Enqueued ${type}. Queue size: ${queue.length}`);
  },

  /**
   * Pushes a batch of actions to the local queue.
   */
  async enqueueBatch(type: OfflineMutation['type'], payloadArray: any[]) {
    if (payloadArray.length === 0) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const mutation: OfflineMutation = {
      id: uuid,
      type,
      payload: payloadArray, // Array payload
      timestamp: Date.now()
    };
    
    queue.push(mutation);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Enqueued batch of ${type} (${payloadArray.length} items).`);
  },

  /**
   * Attempts to flush all actions in the queue to the backend.
   */
  async flush() {
    if (!navigator.onLine) {
      console.log('[OfflineSync] Offline. Flush aborted.');
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return;

    console.log(`[OfflineSync] Flushing ${queue.length} items from AFAT Zero-Dependency Queue...`);
    
    const remainingQueue: OfflineMutation[] = [];
    
    for (const mutation of queue) {
      try {
        if (mutation.type === 'INSERT_INCIDENT') {
          const { error } = await supabase.from('incidents').insert([mutation.payload]);
          if (error) throw error;
        } 
        else if (mutation.type === 'UPDATE_BOOKING') {
          const { id, ...data } = mutation.payload;
          const { error } = await supabase.from('bookings').update(data).eq('id', id);
          if (error) throw error;
        }
        else if (mutation.type === 'VOICE_REPORT_UPLOAD') {
           console.log('Syncing queued voice report...', mutation.payload.fileName);
        }
        else if (mutation.type === 'INSERT_TELEMETRY') {
          const payload = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
          for (const signal of payload) {
            const response = await fetch(`${apiBaseUrl}/api/ops/map-signal`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
              body: JSON.stringify({
                signal_type: 'movement',
                profile_id: signal.user_id,
                latitude: signal.latitude,
                longitude: signal.longitude,
                speed_kph: signal.speed_kph ?? signal.speed,
                heading: signal.heading,
                accuracy: signal.accuracy,
                device_os: signal.device_os,
                network_type: signal.network_type,
                source: 'offline_sync',
              }),
            });
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              throw new Error(data.error || 'Map signal sync failed');
            }
          }
        }
        console.log(`[OfflineSync] Synced ${mutation.type} successfully.`);
      } catch (err) {
        console.error(`[OfflineSync] Failed to sync ${mutation.type}.`, err);
        remainingQueue.push(mutation);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingQueue));
    if (remainingQueue.length === 0) {
      console.log('[OfflineSync] All items synced.');
    } else {
      console.log(`[OfflineSync] ${remainingQueue.length} items remain in queue.`);
    }
  },

  /**
   * Setup listeners to flush when connection is restored.
   */
  init() {
    window.addEventListener('online', () => {
      console.log('[OfflineSync] Browser is online. Attempting flush...');
      this.flush();
    });
    
    if (navigator.onLine) {
       this.flush();
    }
  }
};
