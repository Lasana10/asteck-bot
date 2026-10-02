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
  recordedAt: string;
};

export type AfatJourneyRuntimeSnapshot = {
  version: 1;
  profileId?: string | null;
  state: AfatJourneyRuntimeState;
  placeId?: string | null;
  placeName?: string | null;
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
};

const STORAGE_KEY = 'afat_journey_runtime_v1';
const EVENT_NAME = 'afat:journey-runtime';

function validNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

export function saveJourneyRuntime(
  patch: Partial<AfatJourneyRuntimeSnapshot>,
  fallbackState: AfatJourneyRuntimeState = 'idle',
): AfatJourneyRuntimeSnapshot {
  const current = loadJourneyRuntime();
  const next: AfatJourneyRuntimeSnapshot = {
    version: 1,
    state: patch.state || current?.state || fallbackState,
    profileId: patch.profileId ?? current?.profileId ?? null,
    placeId: patch.placeId ?? current?.placeId ?? null,
    placeName: patch.placeName ?? current?.placeName ?? null,
    destinationLatitude: validNumber(patch.destinationLatitude ?? current?.destinationLatitude),
    destinationLongitude: validNumber(patch.destinationLongitude ?? current?.destinationLongitude),
    mode: patch.mode ?? current?.mode ?? null,
    intentType: patch.intentType ?? current?.intentType ?? null,
    routeDistanceM: validNumber(patch.routeDistanceM ?? current?.routeDistanceM),
    startedAt: patch.startedAt ?? current?.startedAt ?? null,
    arrivedAt: patch.arrivedAt ?? current?.arrivedAt ?? null,
    lastPosition: patch.lastPosition ?? current?.lastPosition ?? null,
    sampleCount: Number.isFinite(Number(patch.sampleCount))
      ? Number(patch.sampleCount)
      : Number(current?.sampleCount || 0),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

export function clearJourneyRuntime(state: 'idle' | 'cancelled' = 'idle') {
  const previous = loadJourneyRuntime();
  localStorage.removeItem(STORAGE_KEY);
  const next: AfatJourneyRuntimeSnapshot = {
    version: 1,
    profileId: previous?.profileId ?? null,
    state,
    updatedAt: new Date().toISOString(),
    sampleCount: previous?.sampleCount || 0,
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
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
