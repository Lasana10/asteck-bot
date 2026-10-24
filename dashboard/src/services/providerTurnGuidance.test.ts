import {describe,it,expect} from 'vitest';
import {nextRoadInstruction} from './providerTurnGuidance';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
const route:AfatCanonicalRoute={status:'ok',mode:'car',route_source:'osrm',distance_m:2100,segments:[{seq:0,edge_id:'road',distance_m:2100,geometry:{type:'LineString',coordinates:[[11.50,3.86],[11.51,3.86],[11.52,3.86]]}}],maneuvers:[
 {latitude:3.86,longitude:11.51,instruction:'Turn right onto Route',distanceMeters:300,kind:'turn'},
 {latitude:3.86,longitude:11.52,instruction:'Arrive at destination',distanceMeters:0,kind:'arrive'},
]};
describe('provider turn guidance through connected route',()=>{
 it('uses upcoming provider maneuver without inventing road turns',()=>{
  const turn=nextRoadInstruction(route,{latitude:3.86,longitude:11.505,accuracy:12});
  expect(turn?.instruction).toBe('Turn right onto Route');
  expect(turn?.distanceM).toBeGreaterThan(400);
 });
 it('uses genuine mapped Valhalla bicycle turn instructions with source provenance',()=>{
  const bike={...route,mode:'bike' as const,route_source:'valhalla' as const};
  expect(nextRoadInstruction(bike,{latitude:3.86,longitude:11.505,accuracy:12})?.instruction)
    .toBe('Turn right onto Route');
  expect(nextRoadInstruction({...bike,maneuvers:[]},{latitude:3.86,longitude:11.505,accuracy:12})).toBeNull();
  expect(nextRoadInstruction(bike,{latitude:3.87,longitude:11.505,accuracy:10})).toBeNull();
 });
 it('advances to the next maneuver with GPS progress',()=>{
  expect(nextRoadInstruction(route,{latitude:3.86,longitude:11.513,accuracy:10})?.kind).toBe('arrive');
 });
 it('does not guide from uncertain or off-route positioning',()=>{
  expect(nextRoadInstruction(route,{latitude:3.87,longitude:11.505,accuracy:10})).toBeNull();
  expect(nextRoadInstruction(route,{latitude:3.86,longitude:11.505,accuracy:130})).toBeNull();
 });
 it('does not manufacture guidance for Atlas graph with no provider turn data',()=>{
  expect(nextRoadInstruction({...route,route_source:'afat_atlas'},{latitude:3.86,longitude:11.505,accuracy:10})).toBeNull();
 });
});
