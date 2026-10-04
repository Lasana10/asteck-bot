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
};

const STORAGE_KEY = 'afat_journey_runtime_v1';
const EVENT_NAME = 'afat:journey-runtime';
let syncInFlight = false;
let syncQueued = false;
let lastSampleKey = '';

function validNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function persist(snapshot: AfatJourneyRuntimeSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
  return snapshot;
}

export function loadJourneyRuntime(): AfatJourneyRuntimeSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AfatJourneyRuntimeSnapshot;
    if (parsed?.version !== 1 || !parsed?.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncJourneyRuntime(snapshot: AfatJourneyRuntimeSnapshot) {
  if (!snapshot.profileId) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  if (!navigator.onLine) {
    persist({ ...snapshot, serverSyncState: 'offline', updatedAt: new Date().toISOString() });
    return;
  }
  syncInFlight = true;
  try {
    let current = loadJourneyRuntime() || snapshot;
    if (current.state === 'navigating' && !current.serverSessionId) {
      const destinationLatitude = validNumber(current.destinationLatitude);
      const destinationLongitude = validNumber(current.destinationLongitude);
      if (destinationLatitude == null || destinationLongitude == null || !current.placeId) return;
      persist({ ...current, serverSyncState: 'starting', updatedAt: new Date().toISOString() });
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
      current = persist({
        ...(loadJourneyRuntime() || current),
        serverSessionId: String(data.id),
        serverSyncState: 'active',
        lastServerSyncAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    current = loadJourneyRuntime() || current;
    if (current.state === 'navigating' && current.serverSessionId && current.lastPosition) {
      const sampleKey = `${current.serverSessionId}:${current.lastPosition.recordedAt}:${current.lastPosition.latitude.toFixed(6)}:${current.lastPosition.longitude.toFixed(6)}`;
      if (sampleKey !== lastSampleKey) {
        const { error } = await supabase.rpc('afat_ingest_navigation_sample', {
          p_session_id: current.serverSessionId,
          p_latitude: current.lastPosition.latitude,
          p_longitude: current.lastPosition.longitude,
          p_accuracy_m: current.lastPosition.accuracy ?? null,
          p_speed_kph: current.lastPosition.speedKph ?? null,
          p_heading: current.lastPosition.heading ?? null,
          p_recorded_at: current.lastPosition.recordedAt,
        });
        if (error) throw new Error(error.message || 'Navigation sample could not sync');
        lastSampleKey = sampleKey;
        persist({ ...(loadJourneyRuntime() || current), serverSyncState: 'active', lastServerSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }

    current = loadJourneyRuntime() || current;
    if ((current.state === 'arrived' || current.state === 'cancelled') && current.serverSessionId && current.serverSyncState !== 'finished') {
      const position = current.lastPosition;
      const { error } = await supabase.rpc('afat_finish_navigation_session', {
        p_session_id: current.serverSessionId,
        p_outcome: current.state === 'arrived' ? 'arrived' : 'cancelled',
        p_latitude: position?.latitude ?? null,
        p_longitude: position?.longitude ?? null,
        p_accuracy_m: position?.accuracy ?? null,
      });
      if (error) throw new Error(error.message || 'Navigation completion could not sync');
      persist({ ...(loadJourneyRuntime() || current), serverSyncState: 'finished', lastServerSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  } catch {
    const current = loadJourneyRuntime();
    if (current) persist({ ...current, serverSyncState: navigator.onLine ? 'failed' : 'offline', updatedAt: new Date().toISOString() });
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
    serverSessionId: patch.serverSessionId ?? current?.serverSessionId ?? null,
    serverSyncState: patch.serverSyncState ?? current?.serverSyncState ?? 'idle',
    lastServerSyncAt: patch.lastServerSyncAt ?? current?.lastServerSyncAt ?? null,
    updatedAt: new Date().toISOString(),
  };
  persist(next);
  void syncJourneyRuntime(next);
  return next;
}

export function clearJourneyRuntime(state: 'idle' | 'cancelled' = 'idle') {
  const previous = loadJourneyRuntime();
  if (state === 'cancelled' && previous?.serverSessionId) {
    const cancelled = persist({ ...previous, state: 'cancelled', updatedAt: new Date().toISOString() });
    void syncJourneyRuntime(cancelled);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  const next: AfatJourneyRuntimeSnapshot = {
    version: 1,
    profileId: previous?.profileId ?? null,
    cityKey: previous?.cityKey ?? 'cm-yaounde',
    state,
    updatedAt: new Date().toISOString(),
    sampleCount: previous?.sampleCount || 0,
    serverSessionId: previous?.serverSessionId ?? null,
    serverSyncState: previous?.serverSyncState ?? 'idle',
    lastServerSyncAt: previous?.lastServerSyncAt ?? null,
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
