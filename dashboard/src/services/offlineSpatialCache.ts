export type AfatOfflinePlace = {
  id: string;
  place_ref?: string | null;
  name: string;
  kind?: string | null;
  place_type?: string | null;
  latitude: number;
  longitude: number;
  evidence_status?: string | null;
  reachability_state?: string | null;
  source_only?: boolean;
  source_key?: string | null;
};

export type AfatOfflineViewport = {
  cityKey: string;
  west: number;
  south: number;
  east: number;
  north: number;
  capturedAt: string;
  places: AfatOfflinePlace[];
};

type StoredCache = {
  version: 1;
  viewports: AfatOfflineViewport[];
};

const CACHE_KEY = 'afat_offline_spatial_v1';
const MAX_VIEWPORTS = 16;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCache(): StoredCache {
  if (typeof localStorage === 'undefined') return { version: 1, viewports: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '') as StoredCache;
    if (parsed?.version === 1 && Array.isArray(parsed.viewports)) return parsed;
  } catch {
    // Corrupt cache should never block AFAT.
  }
  return { version: 1, viewports: [] };
}

function writeCache(cache: StoredCache) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function overlaps(a: AfatOfflineViewport, bounds: { west: number; south: number; east: number; north: number }) {
  return !(a.east < bounds.west || a.west > bounds.east || a.north < bounds.south || a.south > bounds.north);
}

function contains(view: AfatOfflineViewport, latitude: number, longitude: number) {
  return latitude >= view.south && latitude <= view.north && longitude >= view.west && longitude <= view.east;
}

export function cacheSpatialViewport(input: {
  cityKey: string;
  west: number;
  south: number;
  east: number;
  north: number;
  places: any[];
}) {
  const now = Date.now();
  const places = (input.places || [])
    .map((place) => ({
      id: String(place.id || ''),
      place_ref: place.place_ref ?? null,
      name: String(place.name || place.canonical_name || 'AFAT place'),
      kind: place.kind ?? null,
      place_type: place.place_type ?? null,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      evidence_status: place.evidence_status ?? null,
      reachability_state: place.reachability_state ?? null,
      source_only: Boolean(place.source_only),
      source_key: place.source_key ?? null,
    }))
    .filter((place) => place.id && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

  const next: AfatOfflineViewport = {
    cityKey: input.cityKey,
    west: input.west,
    south: input.south,
    east: input.east,
    north: input.north,
    capturedAt: new Date(now).toISOString(),
    places,
  };

  const cache = readCache();
  const fresh = cache.viewports.filter((view) => now - Date.parse(view.capturedAt) <= MAX_AGE_MS);
  const withoutSameArea = fresh.filter((view) => view.cityKey !== input.cityKey || !overlaps(view, next));
  writeCache({ version: 1, viewports: [...withoutSameArea, next].slice(-MAX_VIEWPORTS) });
  return next;
}

export function readCachedPlaces(input: {
  cityKey: string;
  west: number;
  south: number;
  east: number;
  north: number;
}) {
  const now = Date.now();
  const relevant = readCache().viewports
    .filter((view) => view.cityKey === input.cityKey && overlaps(view, input))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  const seen = new Set<string>();
  const places: AfatOfflinePlace[] = [];
  let newestCapturedAt: string | null = null;
  for (const view of relevant) {
    if (!newestCapturedAt) newestCapturedAt = view.capturedAt;
    for (const place of view.places) {
      if (seen.has(place.id) || !contains({ ...view, ...input, capturedAt: view.capturedAt, places: view.places }, place.latitude, place.longitude)) continue;
      if (place.longitude < input.west || place.longitude > input.east || place.latitude < input.south || place.latitude > input.north) continue;
      seen.add(place.id);
      places.push(place);
    }
  }
  return {
    places,
    capturedAt: newestCapturedAt,
    stale: newestCapturedAt ? now - Date.parse(newestCapturedAt) > 6 * 60 * 60 * 1000 : true,
    offline: true,
  };
}

export function searchCachedPlaces(cityKey: string, query: string, limit = 12) {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const scored: Array<AfatOfflinePlace & { score: number }> = [];
  for (const view of readCache().viewports) {
    if (view.cityKey !== cityKey) continue;
    for (const place of view.places) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      const name = place.name.toLocaleLowerCase();
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      if (score) scored.push({ ...place, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

export function clearExpiredSpatialCache() {
  const now = Date.now();
  const cache = readCache();
  writeCache({ version: 1, viewports: cache.viewports.filter((view) => now - Date.parse(view.capturedAt) <= MAX_AGE_MS) });
}
