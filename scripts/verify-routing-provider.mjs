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
  if (responseMode === 'invalid_geometry') {
    res.writeHead(200).end(JSON.stringify({ code: 'Ok', routes: [{ distance: 1800, duration: 300, geometry: { type: 'LineString', coordinates: [[500, 3], [11, 4]] } }] }));
    return;
  }
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
  process.env.AFAT_OSRM_FOOT_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.AFAT_GOOGLE_DIRECTIONS_FALLBACK = 'true';
  process.env.GOOGLE_MAPS_API_KEY = 'test-not-used';

  const { DirectionsService, validatedOsrmEndpoint } = await import('../src/services/directions.ts');
  assert.equal(validatedOsrmEndpoint('http://afat-osrm-abc123:5000'), null, 'Private HTTP requires explicit opt-in');
  assert.equal(validatedOsrmEndpoint('http://afat-osrm-abc123:5000', true), 'http://afat-osrm-abc123:5000');
  assert.equal(validatedOsrmEndpoint('http://169.254.169.254:80', true), null, 'Never permit metadata/IP SSRF');
  assert.equal(validatedOsrmEndpoint('http://routing.example.org', true), null, 'Never permit plaintext public Internet');
  assert.equal(validatedOsrmEndpoint('http://afat-osrm-abc123:5000/route', true), null, 'OSRM backend origin must be exact');
  assert.equal(validatedOsrmEndpoint('https://routing.example.org'), 'https://routing.example.org');
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

  const walk=await DirectionsService.getDirections(a,b,{travelMode:'foot',allowMeteredFallback:false});
  assert.equal(walk?.source,'osrm','Walking must have separate real source provenance');
  assert.match(paths.at(-1),/\/route\/v1\/foot\//,'Walking must request foot graph');
  assert.equal(paths.length,2,'The car and walking service must each be requested');
  assert.equal(await DirectionsService.getDirections({ latitude: 999, longitude: 0 }, b), null);
  assert.equal(paths.length, 2, 'Invalid coordinates must not reach providers');

  responseMode = 'invalid_geometry';
  assert.equal(await DirectionsService.getDirections(a, b, { allowMeteredFallback: false }), null,
    'Malformed provider routes must not be presented as valid');
  responseMode = 'failure';
  const previous = console.error;
  try {
    console.error = () => {};
    assert.equal(await DirectionsService.getDirections(a, b, { allowMeteredFallback: false }), null,
      'Public route must not trigger a billable API without explicit authorization');
  } finally {
    console.error = previous;
  }
  assert.equal(paths.length, 4);
  const footFailed = await DirectionsService.getDirections(a, b, {travelMode:'foot', allowMeteredFallback:true});
  assert.equal(footFailed, null, 'Failed walking graph must never substitute a driving or paid Google route');
  assert.match(paths.at(-1), /\/route\/v1\/foot\//, 'Unavailable walking must still use only dedicated foot engine');
  assert.equal(paths.length, 5, 'Walking failure must not trigger another provider request');
  console.log('AFAT routing provider checks passed');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
