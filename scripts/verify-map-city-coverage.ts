import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const map=readFileSync('dashboard/src/components/commuter/PassengerSpatialMap.tsx','utf8');
const resolver=readFileSync('dashboard/src/services/mapCityResolution.ts','utf8');
assert.ok(resolver.includes('return null;'),'unknown city must not map to Yaoundé');
assert.ok(map.includes('resolveAfatMappedCity(city)?.cityKey||null'),'unknown city must not enter source-backed city RPC');
assert.ok(map.includes('if(!cityKey){setViewPlaces([])'),'clear invalid map place inventory');
assert.ok(map.includes('if(!resolveAfatMappedCity(city)){'),'do not mount unrelated basemap');
assert.ok(map.includes('Atlas coverage for this city has not been verified.'));
assert.ok(map.includes('The app will not display Yaoundé map data as though it belonged here.'));
const planner=readFileSync('dashboard/src/components/commuter/PassagePlanner.tsx','utf8');
assert.ok(planner.includes("resolveAfatMappedCity(profile?.preferred_city || 'yaounde')?.cityKey || null"),
 'journey city resolver must reject explicit unsupported cities');
assert.ok(planner.includes("if (!preferredCityKey(profile) || !profile?.id"),
 'unsupported city must not be written as Yaoundé demand evidence');
assert.ok(planner.includes("if (!preferredCityKey(profile) || !routingOrigin || !arrivalPoint)"),
 'unsupported city must not request canonical routes');
assert.ok(planner.includes('disabled={!preferredCityKey(profile) || loading'),
 'unsupported city destination requests must be disabled');
assert.ok(planner.includes('if (!preferredCityKey(profile) || resumeSnapshot?.cityKey !== preferredCityKey(profile))'),
 'saved navigation must not cross city boundaries');
assert.ok(planner.includes("if (!preferredCityKey(profile)) {\\n      setStatusText('Transport requests"),
 'unsupported city cannot submit a passenger booking');
assert.ok(planner.includes("resolveAfatMappedCity(place.city)?.cityKey === preferredCityKey(profile)"),
 'recent places must be restricted to the currently mapped city');
assert.ok(planner.includes('searchCachedPlaces(preferredCityKey(profile)!,'),
 'offline cache cannot quietly use another city');

console.log('PASS map city resolver prevents false atlas coverage on unsupported cities');
