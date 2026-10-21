import { authenticatedApiHeaders, getApiBaseUrl, supabase } from '../supabaseClient';

/**
 * AFAT offline mutation queue.
 *
 * Security rule: queued mutations replay only through authenticated backend
 * contracts. The browser must never bypass AFAT authorization by writing
 * protected operational tables directly with the Supabase client.
 */
// Legacy unscoped items cannot safely be attributed to an account. Never replay them.
const LEGACY_STORAGE_KEY = 'afat_offline_sync_queue';
const STORAGE_PREFIX = 'afat_offline_sync_queue_v2:';
const MAX_ITEMS = 120;
const MAX_AGE_MS = 7*24*60*60*1000;
const MAX_ITEM_BYTES = 32_000;
let flushing = false;
async function accountQueueKey():Promise<string>{
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user?.id)throw new Error('Sign in before collecting or replaying offline evidence.');
 return STORAGE_PREFIX+encodeURIComponent(data.user.id);
}
function readQueue(storageKey:string):OfflineMutation[]{
 try{
  const parsed=JSON.parse(localStorage.getItem(storageKey)||'[]');
  if(!Array.isArray(parsed))return [];
  return parsed.filter((item:any)=>item&&typeof item.id==='string'&&
   ['INSERT_INCIDENT','VOICE_REPORT_UPLOAD','UPDATE_BOOKING','INSERT_TELEMETRY'].includes(item.type)&&
   Number.isFinite(item.timestamp)&&item.timestamp<=Date.now()&&
   Date.now()-item.timestamp<=MAX_AGE_MS&&JSON.stringify(item).length<=MAX_ITEM_BYTES
  ).slice(0,MAX_ITEMS);
 }catch{return [];}
}
function writeQueue(storageKey:string,queue:OfflineMutation[]){
 localStorage.setItem(storageKey,JSON.stringify(queue.slice(0,MAX_ITEMS)));
}

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
    const storageKey=await accountQueueKey();
    const queue=readQueue(storageKey);
    if(queue.length>=MAX_ITEMS)throw new Error('Offline queue is full. Synchronize before collecting more evidence.');
    const mutation={id:queueId(),type,payload,timestamp:Date.now()};
    if(JSON.stringify(mutation).length>MAX_ITEM_BYTES)throw new Error('Offline evidence exceeds safe device storage limit.');
    writeQueue(storageKey,[...queue,mutation]);
  },

  async enqueueBatch(type: OfflineMutation['type'], payloadArray: any[]) {
    if(!payloadArray.length)return;
    // Individual mutations provide bounded, resumable replay and avoid one
    // oversized batch making every observation impossible to synchronize.
    for(const payload of payloadArray)await this.enqueue(type,payload);
  },

  async flush() {
    if (!navigator.onLine) {
      console.log('[OfflineSync] Offline. Flush aborted.');
      return;
    }

    if(flushing)return;
    let storageKey:string;
    try{storageKey=await accountQueueKey();}catch{return;}
    // Old global queues are quarantined, never silently attributed to a new
    // signed-in person after a shared-device account switch.
    if(localStorage.getItem(LEGACY_STORAGE_KEY))localStorage.removeItem(LEGACY_STORAGE_KEY);
    const queue=readQueue(storageKey);
    if(!queue.length)return;
    flushing=true;
    const remainingQueue:OfflineMutation[]=[];
    try {

    for (const mutation of queue) {
      try {
        // Stop on account switch during replay, retaining the rest for
        // the original owner rather than sending it under another token.
        if(await accountQueueKey()!==storageKey)throw new Error('Account changed during offline replay.');
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

    writeQueue(storageKey,remainingQueue);
    } finally { flushing=false; }
    console.log(remainingQueue.length === 0
      ? '[OfflineSync] All replayable items synced.'
      : `[OfflineSync] ${remainingQueue.length} item(s) remain queued.`);
  },

  init() {
    window.addEventListener('online', () => this.flush());
    if (navigator.onLine) this.flush();
  }
};
