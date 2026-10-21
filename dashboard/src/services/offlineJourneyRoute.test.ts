import {describe,it,expect} from 'vitest';
import {storeOfflineJourneyRoute,loadOfflineJourneyRoute,clearOfflineJourneyRoute,routeCanBeKeptOffline} from './offlineJourneyRoute';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
import {nextRoadManeuver} from './routeGuidance';

function memory():Storage{const m=new Map<string,string>();return {
 get length(){return m.size;},key(i){return [...m.keys()][i]??null;},
 getItem(k){return m.get(k)??null;},setItem(k,v){m.set(k,v);},removeItem(k){m.delete(k);},clear(){m.clear()}
} as Storage;}
const route:AfatCanonicalRoute={status:'ok',mode:'car',route_source:'osrm',traffic_aware:false,
 distance_m:2171,eta_seconds:177,reason:'unverified_external_road_route',segments:[{
 seq:0,edge_id:'external-road-route',distance_m:2171,passability:'unverified',
 geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.526,3.875]]}
}]};
const journey={profileId:'alice',placeId:'place-1',placeName:'Destination',latitude:3.875,longitude:11.526,mode:'car' as const,intentType:'go',route};
describe('end-to-end offline route geometry custody',()=>{
 it('preserves provider turns through a lost-network journey and resumes GPS guidance',()=>{
  const store=memory();
  const routed:AfatCanonicalRoute={...route,
    segments:[{seq:0,edge_id:'external-road-route',distance_m:2171,
      geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.526,3.866],[11.536,3.866]]}}],
    maneuvers:[
      {latitude:3.866,longitude:11.516,instruction:'Depart',kind:'depart',distanceMeters:1000},
      {latitude:3.866,longitude:11.526,instruction:'Turn right',kind:'turn',distanceMeters:1171},
    ]};
  expect(storeOfflineJourneyRoute({...journey,route:routed},store)).toBe(true);
  const resumed=loadOfflineJourneyRoute('alice','place-1',store);
  expect(resumed?.route.maneuvers).toHaveLength(2);
  const instruction=nextRoadManeuver(resumed?.route,{latitude:3.866,longitude:11.522,accuracy:12});
  expect(instruction?.instruction).toBe('Turn right');
  expect(nextRoadManeuver(resumed?.route,{latitude:3.866,longitude:11.522,accuracy:180})).toBeNull();
 });

 it('restores a real route for same account and destination without network requests',()=>{
  const s=memory();expect(storeOfflineJourneyRoute(journey,s)).toBe(true);
  const loaded=loadOfflineJourneyRoute('alice','place-1',s);
  expect(loaded?.route.route_source).toBe('osrm');
  expect(loaded?.route.segments?.[0].geometry?.coordinates).toEqual([[11.516,3.866],[11.526,3.875]]);
  expect(loadOfflineJourneyRoute('bob','place-1',s)).toBeNull();
  expect(loadOfflineJourneyRoute('alice','another-place',s)).toBeNull();
  clearOfflineJourneyRoute('alice',s);expect(loadOfflineJourneyRoute('alice','place-1',s)).toBeNull();
 });
 it('never persists invented or non-routable geometry as a reusable navigation route',()=>{
  const s=memory();
  expect(routeCanBeKeptOffline({...route,route_source:undefined})).toBe(false);
  expect(routeCanBeKeptOffline({...route,segments:[]})).toBe(false);
  expect(routeCanBeKeptOffline({...route,segments:[{seq:0,edge_id:'x',distance_m:12,geometry:{type:'LineString',coordinates:[[999,3.8],[11.52,3.87]]}}]})).toBe(false);
  expect(storeOfflineJourneyRoute({...journey,route:{...route,status:'unavailable'}},s)).toBe(false);
  expect(s.length).toBe(0);
 });
 it('rejects expired route snapshots instead of certifying stale path knowledge',()=>{
  const s=memory();storeOfflineJourneyRoute(journey,s);
  const k=s.key(0)!;const saved=JSON.parse(s.getItem(k)!);
  saved.savedAt=new Date(Date.now()-49*60*60*1000).toISOString();s.setItem(k,JSON.stringify(saved));
  expect(loadOfflineJourneyRoute('alice','place-1',s)).toBeNull();
 });
});
