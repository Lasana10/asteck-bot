import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const spatialMap=readFileSync(new URL('../components/commuter/PassengerSpatialMap.tsx',import.meta.url),'utf8');
const routeGuidance=readFileSync(new URL('./routeGuidance.ts',import.meta.url),'utf8');
describe('AFAT passenger progress and real maneuvers use one shared route authority',()=>{
 it('uses confidence-aware route projection rather than a separate planar progress implementation',()=>{
  expect(spatialMap).toContain("const routeFix=calculateRouteProgress(route,");
  expect(spatialMap).toContain("!routeFix.offRoute&&routeFix.confidence!=='low'");
  expect(spatialMap).not.toContain("function routeProgress(points:");
 });
 it('only shows actual Valhalla-supplied turns and not speculative Atlas instructions',()=>{
  expect(routeGuidance).toContain("'osrm','google','valhalla'");
  expect(routeGuidance).toContain("!Array.isArray(route.maneuvers)");
 });
});
