import assert from 'node:assert/strict';
// Independent proof that an ACTUAL deployed Cameroon OSRM engine returns
// traversable geometry for two real coordinates (not a route fixture).
const origin = process.env.AFAT_OSRM_SMOKE_URL || 'http://127.0.0.1:5000';
const routePairs = [
  { city: 'Yaounde', a: [11.516,3.866], b: [11.526,3.875] },
  { city: 'Douala', a: [9.7679,4.0511], b: [9.77,4.058] },
];
const check = (point) => Array.isArray(point) && point.length >= 2 &&
  Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
  Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
for (const {city,a,b} of routePairs) {
  const endpoint = new URL(`/route/v1/driving/${a.join(',')};${b.join(',')}?overview=full&geometries=geojson&steps=true`,origin);
  const res = await fetch(endpoint,{ signal: AbortSignal.timeout(20000) });
  assert.equal(res.status,200,`${city}: OSRM route HTTP status must be 200`);
  const result=await res.json();
  assert.equal(result.code,'Ok',`${city}: no verified routable OSM path`);
  const route=result.routes?.[0];
  assert.ok(route && Number.isFinite(route.distance) && route.distance > 0 &&
    Number.isFinite(route.duration) && route.duration > 0 &&
    route.geometry?.type==='LineString' && route.geometry.coordinates.length>=2 &&
    route.geometry.coordinates.every(check), `${city}: invalid OSRM geometry or cost`);
  console.log(`${city}: verified OSRM geometry ${route.geometry.coordinates.length} points, distance ${Math.round(route.distance)}m, duration ${Math.round(route.duration)}s (no live traffic evidence)`);
}
console.log('Cameroon OSRM smoke successful. Field validation is still required.');
