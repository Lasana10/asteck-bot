// Stable, locally cached road geometry only. Never convert this map seed into
// a verified, routable network or live traffic evidence.
export type OfflineRoadSeed = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { name: string; evidence_status: 'seed_unverified' };
    geometry: { type: 'LineString'; coordinates: number[][] };
  }>;
};

export function validateOfflineRoadSeed(value: unknown): OfflineRoadSeed | null {
  if (!value || typeof value !== 'object') return null;
  const collection = value as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) ||
      collection.features.length > 20000) return null;
  const features: OfflineRoadSeed['features'] = [];
  for (const candidate of collection.features) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as { type?: unknown; properties?: any; geometry?: any };
    const coordinates = item.geometry?.coordinates;
    if (item.type !== 'Feature' || item.geometry?.type !== 'LineString' ||
        !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 50000) continue;
    if (!coordinates.every((p: unknown) => Array.isArray(p) && p.length === 2 &&
      typeof p[0] === 'number' && typeof p[1] === 'number' &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) continue;
    features.push({
      type: 'Feature',
      properties: {
        name: String(item.properties?.name || 'Road seed').slice(0, 120),
        evidence_status: 'seed_unverified',
      },
      geometry: { type: 'LineString', coordinates },
    });
  }
  return features.length ? { type: 'FeatureCollection', features } : null;
}
