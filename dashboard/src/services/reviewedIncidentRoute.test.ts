import {beforeEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../supabaseClient',()=>({supabase:{rpc}}));
import {inspectReviewedIncidentRoute} from './reviewedIncidentRoute';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
const route:AfatCanonicalRoute={status:'ok',mode:'car',route_source:'osrm',distance_m:300,
 segments:[{seq:0,edge_id:'external-road-route',distance_m:300,
  geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.521,3.870]]}}]};
beforeEach(()=>{rpc.mockReset();vi.stubGlobal('navigator',{onLine:true});});
describe('reviewed incident route boundary',()=>{
 it('accepts only current aggregate reviewed proximity without raw incident details',async()=>{
  rpc.mockResolvedValue({data:{checked:true,status:'reviewed_incident_proximity',matched_reviewed_incidents:2,
   max_severity:4,incident_types:['accident','roadblock'],earliest_expiry:new Date(Date.now()+120000).toISOString(),
   latest_reviewed_at:new Date(Date.now()-1000).toISOString(),checked_at:new Date().toISOString(),
   road_blocked_verified:false,provider_rerouted:false,raw_incident_details_exposed:false},error:null});
  const result=await inspectReviewedIncidentRoute('cm-yaounde',route);
  expect(rpc).toHaveBeenCalledWith('afat_reviewed_incident_route_advisory',{
   p_city_key:'cm-yaounde',p_route_points:[[11.516,3.866],[11.521,3.870]],
  });
  expect(result.status).toBe('reviewed_incident_proximity');
  expect(result.raw_incident_details_exposed).toBe(false);
 });
 it('fails closed for expiry, raw-detail exposure, unknown types or future review time',async()=>{
  const base={checked:true,status:'reviewed_incident_proximity',matched_reviewed_incidents:1,max_severity:3,
   incident_types:['hazard'],earliest_expiry:new Date(Date.now()+120000).toISOString(),
   latest_reviewed_at:new Date(Date.now()-1000).toISOString(),road_blocked_verified:false,
   provider_rerouted:false,raw_incident_details_exposed:false};
  for(const data of [{...base,earliest_expiry:new Date(Date.now()-1).toISOString()},
   {...base,raw_incident_details_exposed:true},{...base,incident_types:['untrusted_kind']},
   {...base,latest_reviewed_at:new Date(Date.now()+120000).toISOString()}]){
   rpc.mockResolvedValueOnce({data,error:null});
   expect((await inspectReviewedIncidentRoute('cm-yaounde',route)).status).toBe('unavailable');
  }
 });
 it('keeps zero matching reviewed incidents distinct from a safety clearance',async()=>{
  rpc.mockResolvedValue({data:{checked:true,status:'no_matching_reviewed_incidents',matched_reviewed_incidents:0,
   max_severity:null,incident_types:[],earliest_expiry:null,latest_reviewed_at:null,
   road_blocked_verified:false,provider_rerouted:false,raw_incident_details_exposed:false},error:null});
  const result=await inspectReviewedIncidentRoute('cm-yaounde',route);
  expect(result.status).toBe('no_matching_reviewed_incidents');
  expect(result.road_blocked_verified).toBe(false);
 });
});
