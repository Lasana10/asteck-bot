import {describe,it,expect,vi} from 'vitest';
vi.mock('./canonicalRouteClient',()=>({
 routeToLatLngs:(route:any)=>route?.segments?.flatMap((segment:any)=>segment.geometry?.coordinates?.map(([lon,lat]:number[])=>[lat,lon])||[])||[],
}));
import {offlineRouteSchematic,schematicProgressPoint} from './offlineRouteSchematic';
const route:any={
 status:'ok',mode:'car',route_source:'osrm',distance_m:2200,
 segments:[{seq:0,edge_id:'external',distance_m:2200,geometry:{type:'LineString',coordinates:[[11.5,3.85],[11.51,3.85],[11.52,3.86]]}}],
};
describe('network-independent route visualization',()=>{
 it('draws actual stored route geometry without basemap or network requests',()=>{
  const diagram=offlineRouteSchematic(route);
  expect(diagram?.path).toMatch(/^M/);
  expect(diagram?.points).toHaveLength(3);
  expect(diagram?.start).not.toEqual(diagram?.end);
 });
 it('moves the progress indicator along route length rather than point index',()=>{
  const diagram=offlineRouteSchematic(route)!;
  const first=schematicProgressPoint(diagram,0),last=schematicProgressPoint(diagram,1);
  expect(first).toEqual(diagram.start);
  expect(last).toEqual(diagram.end);
  const half=schematicProgressPoint(diagram,.5);
  expect(Number.isFinite(half.x)&&Number.isFinite(half.y)).toBe(true);
  expect(half).not.toEqual(first);
  expect(half).not.toEqual(last);
 });
 it('refuses absent or unconnected routes and malformed geometry',()=>{
  expect(offlineRouteSchematic({...route,status:'unavailable'})).toBeNull();
  expect(offlineRouteSchematic({...route,segments:[]})).toBeNull();
  expect(offlineRouteSchematic({...route,segments:[{geometry:{coordinates:[[999,3.85],[11.5,3.85]]}}]})).toBeNull();
 });
});
