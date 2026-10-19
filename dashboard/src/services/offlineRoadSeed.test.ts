import { describe, expect, it } from 'vitest';
import { validateOfflineRoadSeed } from './offlineRoadSeed';

describe('AFAT offline road map evidence', () => {
  it('renders valid geometry as explicitly unverified seed, not navigation truth', () => {
    const roads = validateOfflineRoadSeed({
      type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { name: 'Boulevard' },
          geometry: { type: 'LineString', coordinates: [[11.5, 3.86], [11.51, 3.87]] } },
      ],
    });
    expect(roads?.features).toHaveLength(1);
    expect(roads?.features[0].properties.evidence_status).toBe('seed_unverified');
    expect(roads?.features[0].geometry.coordinates[0]).toEqual([11.5, 3.86]);
  });
  it('rejects invalid, empty, and dangerous coordinates', () => {
    expect(validateOfflineRoadSeed({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(validateOfflineRoadSeed({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[900, 2], [11.5, 3.86]] } },
    ] })).toBeNull();
    expect(validateOfflineRoadSeed({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[11.5, 3.86], [Number.NaN, 3.87]] } },
    ] })).toBeNull();
  });
  it('does not carry opaque source metadata into the public map', () => {
    const roads = validateOfflineRoadSeed({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'Route', secret: 'do not forward', congestion: 'critical' },
        geometry: { type: 'LineString', coordinates: [[11.5, 3.86], [11.51, 3.87]] } },
    ] });
    expect(Object.keys(roads!.features[0].properties)).toEqual(['name','evidence_status']);
  });
});
