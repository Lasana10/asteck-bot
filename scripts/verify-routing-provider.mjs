import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';

// Test real Axios HTTP transport over loopback. Avoid mocking an Axios
// instance that may differ between TSX and ESM module resolution.
const paths = [];
let responseMode = 'success';
const server = http.createServer((req, res) => {
  paths.push(req.url);
  res.setHeader('content-type', 'application/json');
  if (responseMode === 'failure') {
    res.writeHead(503).end(JSON.stringify({ code: 'Unavailable' }));
    return;
  }
  res.writeHead(200).end(JSON.stringify({
    code: 'Ok',
    routes: [{
      distance: 1200,
      duration: 180,
      geometry: { type: 'LineString', coordinates: [[11.516, 3.866], [11.526, 3.875]] },
      legs: [{ steps: [{ name: 'Main Street', distance: 1200, maneuver: { type: 'depart' } }] }],
    }],
  }));
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  process.env.NODE_ENV = 'test';
  process.env.AFAT_OSRM_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.AFAT_GOOGLE_DIRECTIONS_FALLBACK = 'true';
  process.env.GOOGLE_MAPS_API_KEY = 'test-not-used';

  const { DirectionsService } = await import('../src/services/directions.ts');
  const a = { latitude: 3.866, longitude: 11.516 };
  const b = { latitude: 3.875, longitude: 11.526 };

  const result = await DirectionsService.getDirections(a, b);
  assert.ok(result, 'Valid route should be returned');
  assert.equal(result.source, 'osrm');
  assert.equal(result.primary.durationValue, 180);
  assert.equal(result.primary.distance, '1.2 km');
  assert.equal(result.primary.distanceMeters, 1200);
  assert.deepEqual(result.primary.geometry.coordinates, [[11.516, 3.866], [11.526, 3.875]]);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /11\.516,3\.866;11\.526,3\.875/);
  assert.match(paths[0], /geometries=geojson/);

  assert.equal(await DirectionsService.getDirections({ latitude: 999, longitude: 0 }, b), null);
  assert.equal(paths.length, 1, 'Invalid coordinates must not reach providers');

  responseMode = 'failure';
  const previous = console.error;
  try {
    console.error = () => {};
    assert.equal(await DirectionsService.getDirections(a, b, { allowMeteredFallback: false }), null,
      'Public route must not trigger a billable API without explicit authorization');
  } finally {
    console.error = previous;
  }
  assert.equal(paths.length, 2);
  console.log('AFAT routing provider checks passed');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
