import {beforeEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../supabaseClient',()=>({supabase:{rpc}}));
import {inspectReviewedEnvironmentRoute,reviewedCorridorCoordinates} from './reviewedEnvironmentRoute';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
const path:AfatCanonicalRoute={status:'ok',mode:'car',route_source:'osrm',distance_m:300,
 segments:[{seq:0,edge_id:'external-road-route',distance_m:300,geometry:{type:'LineString',
  coordinates:[[11.516,3.866],[11.518,3.867],[11.521,3.870]]}}]};
beforeEach(()=>{rpc.mockReset();vi.stubGlobal('navigator',{onLine:true});});
describe('independently reviewed route corridor safety boundary',()=>{
 it('passes actual ordered provider geometry to reviewed RPC rather than a straight-line shortcut',async()=>{
  rpc.mockResolvedValue({data:{checked:true,status:'reviewed_proximity',matched_reviewed_edges:2,
   max_risk_score:70,overlay_types:['rain_risk'],earliest_expiry:new Date(Date.now()+120000).toISOString(),
   checked_at:new Date().toISOString(),road_passability_verified:false,provider_rerouted:false},error:null});
  const advisory=await inspectReviewedEnvironmentRoute('cm-yaounde',path);
  expect(rpc).toHaveBeenCalledWith('afat_reviewed_environment_route_advisory',{
   p_city_key:'cm-yaounde',p_route_points:[[11.516,3.866],[11.518,3.867],[11.521,3.870]],
  });
  expect(advisory.status).toBe('reviewed_proximity');
  expect(advisory.road_passability_verified).toBe(false);
 });
 it('never skips path coordinates, accepts oversized or malformed routes, or calls RPC offline',async()=>{
  expect(reviewedCorridorCoordinates({...path,segments:[{...path.segments![0],
   geometry:{type:'LineString',coordinates:Array.from({length:501},(_,i)=>[11.5+i*0.0001,3.8])}}]})).toBeNull();
  expect(reviewedCorridorCoordinates({...path,segments:[{...path.segments![0],
   geometry:{type:'LineString',coordinates:[[11.5,3.8],[200,3.9]]}}]})).toBeNull();
  vi.stubGlobal('navigator',{onLine:false});
  expect((await inspectReviewedEnvironmentRoute('cm-yaounde',path)).status).toBe('unavailable');
  expect(rpc).not.toHaveBeenCalled();
 });
 it('does not present a rejected, expired, or forged server response as reviewed risk evidence',async()=>{
  for(const data of [
   {checked:false,status:'reviewed_proximity'},
   {checked:true,status:'reviewed_proximity',matched_reviewed_edges:3,overlay_types:['rain_risk'],
    earliest_expiry:new Date(Date.now()-1000).toISOString(),road_passability_verified:false,provider_rerouted:false},
   {checked:true,status:'reviewed_proximity',matched_reviewed_edges:3,overlay_types:['rain_risk'],
    earliest_expiry:new Date(Date.now()+100000).toISOString(),road_passability_verified:true,provider_rerouted:false},
  ]){rpc.mockResolvedValueOnce({data,error:null});
   expect((await inspectReviewedEnvironmentRoute('cm-yaounde',path)).status).toBe('unavailable');}
 });
 it('shows zero matching reviewed evidence as unknown safety, not a false safety certification',async()=>{
  rpc.mockResolvedValue({data:{checked:true,status:'no_matching_reviewed_evidence',
   matched_reviewed_edges:0,overlay_types:[],earliest_expiry:null,
   road_passability_verified:false,provider_rerouted:false},error:null});
  const result=await inspectReviewedEnvironmentRoute('cm-yaounde',path);
  expect(result.checked).toBe(true);
  expect(result.status).toBe('no_matching_reviewed_evidence');
  expect(result.road_passability_verified).toBe(false);
 });
});
