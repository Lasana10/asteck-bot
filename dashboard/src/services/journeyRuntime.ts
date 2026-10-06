import { supabase } from '../supabaseClient';

export type AfatJourneyRuntimeState =
  | 'idle'
  | 'destination_selected'
  | 'origin_ready'
  | 'route_ready'
  | 'navigating'
  | 'arriving'
  | 'arrived'
  | 'cancelled';

export type AfatRuntimePosition = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  recordedAt: string;
};

export type AfatJourneyRuntimeSnapshot = {
  version: 1;
  profileId?: string | null;
  cityKey?: string | null;
  state: AfatJourneyRuntimeState;
  placeId?: string | null;
  placeName?: string | null;
  accessPointId?: string | null;
  meetingPointId?: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  mode?: string | null;
  intentType?: string | null;
  routeDistanceM?: number | null;
  startedAt?: string | null;
  updatedAt: string;
  arrivedAt?: string | null;
  lastPosition?: AfatRuntimePosition | null;
  sampleCount: number;
  serverSessionId?: string | null;
  serverSyncState?: 'idle' | 'starting' | 'active' | 'offline' | 'finished' | 'failed';
  lastServerSyncAt?: string | null;
  pendingSampleCount?: number;
};

type QueuedNavigationSample = {
  key: string;
  position: AfatRuntimePosition;
  queuedAt: string;
  attempts: number;
};

type NavigationQueue = {
  version: 1;
  journeyStartedAt: string | null;
  samples: QueuedNavigationSample[];
};

const STORAGE_KEY = 'afat_journey_runtime_v1';
const QUEUE_KEY = 'afat_navigation_sample_queue_v1';
const EVENT_NAME = 'afat:journey-runtime';
const MAX_QUEUE_SAMPLES = 360;
const FLUSH_BATCH_SIZE = 48;
let syncInFlight = false;
let syncQueued = false;

function validNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validPosition(position?: AfatRuntimePosition | null) {
  if (!position) return false;
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return false;
  if (position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) return false;
  if (position.accuracy != null && (!Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > 150)) return false;
  if (position.speedKph != null && (!Number.isFinite(position.speedKph) || position.speedKph < 0 || position.speedKph > 190)) return false;
  return Number.isFinite(Date.parse(position.recordedAt));
}

function readQueue(): NavigationQueue {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '') as NavigationQueue;
    if (parsed?.version === 1 && Array.isArray(parsed.samples)) return parsed;
  } catch {
    // Corrupt local evidence must never block navigation.
  }
  return { version: 1, journeyStartedAt: null, samples: [] };
}

function writeQueue(queue: NavigationQueue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* storage pressure should not crash navigation */ }
  return queue;
}

function clearQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
}

function sampleKey(position: AfatRuntimePosition) {
  return `nav:${position.recordedAt}:${position.latitude.toFixed(6)}:${position.longitude.toFixed(6)}`;
}

function shouldQueuePosition(position: AfatRuntimePosition, previous?: AfatRuntimePosition | null) {
  if (!validPosition(position)) return false;
  if (!previous) return true;
  if (sampleKey(position) === sampleKey(previous)) return false;
  const elapsedMs = Date.parse(position.recordedAt) - Date.parse(previous.recordedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
  const movedM = distanceMeters(previous, position);
  const speed = Math.max(0, Number(position.speedKph || 0));
  const accuracy = Math.max(0, Number(position.accuracy || 0));
  const minimumIntervalMs = accuracy > 80 ? 10_000 : speed >= 25 ? 3_500 : speed >= 5 ? 5_000 : 9_000;
  const minimumMovementM = accuracy > 80 ? 20 : speed >= 25 ? 12 : speed >= 5 ? 7 : 4;
  if (elapsedMs >= 25_000) return true;
  return elapsedMs >= minimumIntervalMs && movedM >= minimumMovementM;
}

function enqueuePosition(snapshot: AfatJourneyRuntimeSnapshot) {
  const position = snapshot.lastPosition;
  if (snapshot.state !== 'navigating' || !snapshot.startedAt || !position || !validPosition(position)) return readQueue();
  let queue = readQueue();
  if (queue.journeyStartedAt !== snapshot.startedAt) queue = { version: 1, journeyStartedAt: snapshot.startedAt, samples: [] };
  const previous = queue.samples.at(-1)?.position || null;
  if (!shouldQueuePosition(position, previous)) return queue;
  const key = sampleKey(position);
  if (queue.samples.some((sample) => sample.key === key)) return queue;
  queue.samples.push({ key, position, queuedAt: new Date().toISOString(), attempts: 0 });
  if (queue.samples.length > MAX_QUEUE_SAMPLES) queue.samples = queue.samples.slice(-MAX_QUEUE_SAMPLES);
  return writeQueue(queue);
}

function persist(snapshot: AfatJourneyRuntimeSnapshot) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
  return snapshot;
}

export function loadJourneyRuntime(): AfatJourneyRuntimeSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AfatJourneyRuntimeSnapshot;
    if (parsed?.version !== 1 || !parsed?.state) return null;
    return { ...parsed, pendingSampleCount: readQueue().samples.length };
  } catch {
    return null;
  }
}

async function ensureServerSession(current: AfatJourneyRuntimeSnapshot) {
  if (current.serverSessionId || current.state !== 'navigating') return current;
  const destinationLatitude = validNumber(current.destinationLatitude);
  const destinationLongitude = validNumber(current.destinationLongitude);
  if (destinationLatitude == null || destinationLongitude == null || !current.placeId) return current;
  persist({ ...current, serverSyncState: 'starting', pendingSampleCount: readQueue().samples.length, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.rpc('afat_start_navigation_session', {
    p_city_key: current.cityKey || 'cm-yaounde',
    p_place_id: current.placeId,
    p_access_point_id: current.accessPointId || null,
    p_meeting_point_id: current.meetingPointId || null,
    p_intent_type: current.intentType || 'go',
    p_movement_mode: current.mode || 'car',
    p_destination_latitude: destinationLatitude,
    p_destination_longitude: destinationLongitude,
    p_route_distance_m: current.routeDistanceM ?? null,
  });
  if (error || !data?.id) throw new Error(error?.message || 'Navigation evidence session could not start');
  return persist({
    ...(loadJourneyRuntime() || current),
    serverSessionId: String(data.id),
    serverSyncState: 'active',
    lastServerSyncAt: new Date().toISOString(),
    pendingSampleCount: readQueue().samples.length,
    updatedAt: new Date().toISOString(),
  });
}

async function flushQueuedSamples(current: AfatJourneyRuntimeSnapshot) {
  if (!current.serverSessionId) return { current, remaining: readQueue().samples.length };
  let queue = readQueue();
  if (current.startedAt && queue.journeyStartedAt && queue.journeyStartedAt !== current.startedAt) {
    clearQueue();
    return { current, remaining: 0 };
  }
  let processed = 0;
  while (queue.samples.length && processed < FLUSH_BATCH_SIZE) {
    const item = queue.samples[0];
    const { data, error } = await supabase.rpc('afat_ingest_navigation_sample_v2', {
      p_session_id: current.serverSessionId,
      p_latitude: item.position.latitude,
      p_longitude: item.position.longitude,
      p_accuracy_m: item.position.accuracy ?? null,
      p_speed_kph: item.position.speedKph ?? null,
      p_heading: item.position.heading ?? null,
      p_recorded_at: item.position.recordedAt,
      p_idempotency_key: item.key,
    });
    if (error) {
      queue.samples[0] = { ...item, attempts: item.attempts + 1 };
      writeQueue(queue);
      throw new Error(error.message || 'Navigation sample could not sync');
    }
    // Quality/outlier rejections are terminal for this sample; retrying cannot improve the observation.
    queue.samples.shift();
    writeQueue(queue);
    processed += 1;
    if (data?.accepted === false && !data?.reason) break;
  }
  const remaining = queue.samples.length;
  current = persist({
    ...(loadJourneyRuntime() || current),
    serverSyncState: 'active',
    lastServerSyncAt: new Date().toISOString(),
    pendingSampleCount: remaining,
    updatedAt: new Date().toISOString(),
  });
  return { current, remaining };
}

async function syncJourneyRuntime(snapshot: AfatJourneyRuntimeSnapshot) {
  if (!snapshot.profileId) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  if (!navigator.onLine) {
    persist({ ...snapshot, serverSyncState: 'offline', pendingSampleCount: readQueue().samples.length, updatedAt: new Date().toISOString() });
    return;
  }
  syncInFlight = true;
  try {
    let current = loadJourneyRuntime() || snapshot;
    current = await ensureServerSession(current);

    if (current.serverSessionId) {
      const flushed = await flushQueuedSamples(current);
      current = flushed.current;
      if (flushed.remaining > 0) syncQueued = true;
    }

    current = loadJourneyRuntime() || current;
    if ((current.state === 'arrived' || current.state === 'cancelled') && current.serverSessionId && current.serverSyncState !== 'finished') {
      const pending = readQueue().samples.length;
      if (pending > 0) {
        syncQueued = true;
        return;
      }
      const position = current.lastPosition;
      const { error } = await supabase.rpc('afat_finish_navigation_session', {
        p_session_id: current.serverSessionId,
        p_outcome: current.state === 'arrived' ? 'arrived' : 'cancelled',
        p_latitude: position?.latitude ?? null,
        p_longitude: position?.longitude ?? null,
        p_accuracy_m: position?.accuracy ?? null,
      });
      if (error) throw new Error(error.message || 'Navigation completion could not sync');
      clearQueue();
      persist({ ...(loadJourneyRuntime() || current), serverSyncState: 'finished', pendingSampleCount: 0, lastServerSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  } catch {
    const current = loadJourneyRuntime();
    if (current) persist({ ...current, serverSyncState: navigator.onLine ? 'failed' : 'offline', pendingSampleCount: readQueue().samples.length, updatedAt: new Date().toISOString() });
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      const latest = loadJourneyRuntime();
      if (latest) queueMicrotask(() => void syncJourneyRuntime(latest));
    }
  }
}

export function saveJourneyRuntime(
  patch: Partial<AfatJourneyRuntimeSnapshot>,
  fallbackState: AfatJourneyRuntimeState = 'idle',
): AfatJourneyRuntimeSnapshot {
  const current = loadJourneyRuntime();
  const startingNewJourney = Boolean(patch.startedAt && patch.startedAt !== current?.startedAt);
  const next: AfatJourneyRuntimeSnapshot = {
    version: 1,
    state: patch.state || current?.state || fallbackState,
    profileId: patch.profileId ?? current?.profileId ?? null,
    cityKey: patch.cityKey ?? current?.cityKey ?? 'cm-yaounde',
    placeId: patch.placeId ?? current?.placeId ?? null,
    placeName: patch.placeName ?? current?.placeName ?? null,
    accessPointId: patch.accessPointId ?? current?.accessPointId ?? null,
    meetingPointId: patch.meetingPointId ?? current?.meetingPointId ?? null,
    destinationLatitude: validNumber(patch.destinationLatitude ?? current?.destinationLatitude),
    destinationLongitude: validNumber(patch.destinationLongitude ?? current?.destinationLongitude),
    mode: patch.mode ?? current?.mode ?? null,
    intentType: patch.intentType ?? current?.intentType ?? null,
    routeDistanceM: validNumber(patch.routeDistanceM ?? current?.routeDistanceM),
    startedAt: patch.startedAt ?? current?.startedAt ?? null,
    arrivedAt: patch.arrivedAt ?? current?.arrivedAt ?? null,
    lastPosition: patch.lastPosition ?? current?.lastPosition ?? null,
    sampleCount: Number.isFinite(Number(patch.sampleCount)) ? Number(patch.sampleCount) : Number(current?.sampleCount || 0),
    serverSessionId: startingNewJourney ? null : (patch.serverSessionId ?? current?.serverSessionId ?? null),
    serverSyncState: startingNewJourney ? 'idle' : (patch.serverSyncState ?? current?.serverSyncState ?? 'idle'),
    lastServerSyncAt: startingNewJourney ? null : (patch.lastServerSyncAt ?? current?.lastServerSyncAt ?? null),
    updatedAt: new Date().toISOString(),
  };
  if (startingNewJourney) clearQueue();
  const queue = enqueuePosition(next);
  next.pendingSampleCount = queue.samples.length;
  persist(next);
  void syncJourneyRuntime(next);
  return next;
}

export function clearJourneyRuntime(state: 'idle' | 'cancelled' = 'idle') {
  const previous = loadJourneyRuntime();
  if (state === 'cancelled' && previous?.serverSessionId) {
    const cancelled = persist({ ...previous, state: 'cancelled', pendingSampleCount: readQueue().samples.length, updatedAt: new Date().toISOString() });
    void syncJourneyRuntime(cancelled);
    return cancelled;
  }
  clearQueue();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  const next: AfatJourneyRuntimeSnapshot = {
    version: 1,
    profileId: previous?.profileId ?? null,
    cityKey: previous?.cityKey ?? 'cm-yaounde',
    state,
    updatedAt: new Date().toISOString(),
    sampleCount: previous?.sampleCount || 0,
    serverSessionId: null,
    serverSyncState: 'idle',
    lastServerSyncAt: previous?.lastServerSyncAt ?? null,
    pendingSampleCount: 0,
  };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

export function subscribeJourneyRuntime(listener: (snapshot: AfatJourneyRuntimeSnapshot) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AfatJourneyRuntimeSnapshot>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusM = 6371000;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const deltaLat = toRad(to.latitude - from.latitude);
  const deltaLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const latest = loadJourneyRuntime();
    if (latest) void syncJourneyRuntime(latest);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const latest = loadJourneyRuntime();
    if (latest && navigator.onLine) void syncJourneyRuntime(latest);
  });
}
