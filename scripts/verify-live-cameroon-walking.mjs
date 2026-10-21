#!/usr/bin/env node
// Read-only acceptance: foot OSRM -> live AFAT backend -> passenger route contract.
// Requires real URLs; does not treat CI graph tests as proof of production deployment.
import assert from 'node:assert/strict';

const footRaw = process.env.AFAT_FOOT_ROUTER_URL;
const apiRaw = process.env.AFAT_API_URL;
assert.ok(footRaw && apiRaw, 'AFAT_FOOT_ROUTER_URL and AFAT_API_URL are required for live acceptance');
const foot = new URL(footRaw), api = new URL(apiRaw);
for (const endpoint of [foot, api]) {
  assert.equal(endpoint.protocol, 'https:', 'Live acceptance requires externally accessible HTTPS URLs');
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash);
}
const cities = [
  {name:'Yaounde',a:[11.516,3.866],b:[11.517,3.867]},
  {name:'Douala',a:[9.7679,4.0511],b:[9.769,4.052]},
];
const validLine = route => route?.geometry?.type === 'LineString' &&
  Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length >= 2 &&
  route.geometry.coordinates.every(p => Array.isArray(p) && p.length >= 2 &&
    Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 &&
    Number.isFinite(p[1]) && Math.abs(p[1]) <= 90);
async function requestJson(url) {
  const response = await fetch(url, {headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, url.pathname + ' HTTP ' + response.status + ' ' + JSON.stringify(body)?.slice(0,180));
  return body;
}
for (const {name,a,b} of cities) {
  const raw = await requestJson(new URL('/route/v1/foot/'+a.join(',')+';'+b.join(',')+'?overview=full&geometries=geojson&steps=true',foot));
  assert.equal(raw.code,'Ok',name+' pedestrian graph is unavailable');
  const engine = raw.routes?.[0];
  assert.ok(engine?.distance>0 && engine?.duration>0 && validLine(engine),name+' invalid real walking geometry');
  const speed = 3.6*engine.distance/engine.duration;
  assert.ok(speed > 0.5 && speed < 12, name+' not a walking-speed engine');

  const params = new URLSearchParams({
    origin_lat:String(a[1]),origin_lon:String(a[0]),
    destination_lat:String(b[1]),destination_lon:String(b[0]),mode:'foot'
  });
  const passenger = await requestJson(new URL('/api/navigation/route?'+params,api));
  assert.equal(passenger.travel_mode,'foot',name+' backend returned wrong mode');
  assert.equal(passenger.source,'osrm',name+' backend has not connected the foot OSRM');
  assert.equal(passenger.traffic_aware,false,name+' unverified live traffic claim');
  const path = passenger.primary;
  assert.ok(path?.distanceMeters>0 && path?.durationValue>0 && validLine(path),name+' passenger foot geometry unavailable');
  assert.ok(Array.isArray(path.maneuvers) && path.maneuvers.length>0,name+' no walking maneuvers');
  assert.ok(Number.isFinite(path.originSnapMeters)&&path.originSnapMeters>=0 &&
    Number.isFinite(path.destinationSnapMeters)&&path.destinationSnapMeters>=0,name+' missing pedestrian network snapping evidence');
  assert.ok(Math.abs(path.distanceMeters-engine.distance)<Math.max(10,engine.distance*0.02),name+' backend route differs from foot graph');
  assert.ok(Math.abs(path.durationValue-engine.duration)<Math.max(5,engine.duration*0.02),name+' backend ETA differs from foot graph');
  console.log(name+': live foot graph -> AFAT passenger route '+Math.round(path.distanceMeters)+' m / '+Math.round(path.durationValue)+' sec; '+path.maneuvers.length+' maneuvers; crossing/accessibility still unverified');
}
console.log('PASS: Cameroon live pedestrian routing in both cities (not a field-safety certification)');
