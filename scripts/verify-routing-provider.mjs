import assert from 'node:assert/strict';
import axios from 'axios';

process.env.NODE_ENV = 'test';
process.env.AFAT_OSRM_BASE_URL = 'https://routing.example.test';
process.env.AFAT_GOOGLE_DIRECTIONS_FALLBACK = 'false';
process.env.GOOGLE_MAPS_API_KEY = 'test-not-used';

const { DirectionsService } = await import('../src/services/directions.ts');
const originalAdapter = axios.defaults.adapter;
const urls = [];
axios.defaults.adapter = async (config) => {
  urls.push(config.url);
  if (!config.url.startsWith('https://routing.example.test/route/v1/driving/')) {
    throw new Error('Unexpected routing provider');
  }
  return { data: { code: 'Ok', routes: [{
    distance: 1200, duration: 180,
    geometry: { type: 'LineString', coordinates: [[11.516,3.866],[11.526,3.875]] },
    legs: [{ steps: [{ name: 'Main Street', distance: 1200, maneuver: { type: 'depart' } }] }],
  }] }, status: 200, statusText: 'OK', headers: {}, config };
};
try {
  const a = { latitude: 3.866, longitude: 11.516 };
  const b = { latitude: 3.875, longitude: 11.526 };
  const result = await DirectionsService.getDirections(a, b);
  assert.equal(result.primary.durationValue, 180);
  assert.equal(result.primary.distance, '1.2 km');
  assert.equal(result.source, 'osrm');
  assert.deepEqual(result.primary.geometry.coordinates, [[11.516,3.866],[11.526,3.875]]);
  assert.equal(result.primary.distanceMeters, 1200);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /11\.516,3\.866;11\.526,3\.875/);
  assert.equal(await DirectionsService.getDirections({ latitude: 999, longitude: 0 }, b), null);
  assert.equal(urls.length, 1, 'Invalid coordinates must not reach providers');
  axios.defaults.adapter = async () => { throw new Error('simulated outage'); };
  assert.equal(await DirectionsService.getDirections(a, b), null, 'Outage must not trigger paid API without opt-in');
  console.log('AFAT routing provider checks passed');
} finally {
  axios.defaults.adapter = originalAdapter;
}
