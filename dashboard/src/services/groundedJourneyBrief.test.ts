import {describe,expect,it} from 'vitest';
import {buildGroundedJourneyBrief} from './groundedJourneyBrief';
import type {AfatCanonicalRoute} from './canonicalRouteClient';
import type {ReviewedEnvironmentAdvisory} from './reviewedEnvironmentRoute';
import type {ReviewedIncidentRouteAdvisory} from './reviewedIncidentRoute';

const now=Date.parse('2026-10-25T08:00:00Z');
const route:AfatCanonicalRoute={status:'ok',mode:'car',route_source:'osrm',distance_m:2171,
 eta_seconds:177,destination_snap_m:82,segments:[{seq:0,edge_id:'external-road-route',distance_m:2171,
 geometry:{type:'LineString',coordinates:[[11.5,3.8],[11.51,3.81]]}}]};
const base:ReviewedEnvironmentAdvisory={checked:true,status:'reviewed_proximity',matched_reviewed_edges:2,
 max_risk_score:70,overlay_types:['flood_risk'],earliest_expiry:'2026-10-25T09:00:00Z',
 checked_at:'2026-10-25T07:59:00Z',road_passability_verified:false,provider_rerouted:false};
const incidents:ReviewedIncidentRouteAdvisory={checked:true,status:'reviewed_incident_proximity',
 matched_reviewed_incidents:1,max_severity:4,incident_types:['roadblock'],
 earliest_expiry:'2026-10-25T08:30:00Z',latest_reviewed_at:'2026-10-25T07:58:00Z',
 checked_at:'2026-10-25T07:59:00Z',road_blocked_verified:false,provider_rerouted:false,
 raw_incident_details_exposed:false};

describe('grounded CityBrain passenger route brief',()=>{
 it('explains only provider route facts and current independently reviewed evidence',()=>{
  const result=buildGroundedJourneyBrief(route,base,{online:true,nowMs:now});
  expect(result.status).toBe('reviewed_context');
  expect(result.facts.join(' ')).toContain('2 mapped road edge(s)');
  expect(result.facts.join(' ')).toContain('provider baseline without live traffic');
  expect(result.unknowns.join(' ')).toContain('last-metre access is not established');
  expect(result.automaticRouteDecision).toBe(false);
 });
 it('adds independently reviewed incident aggregates without claiming closure or exposing reports',()=>{
  const result=buildGroundedJourneyBrief(route,base,{online:true,nowMs:now,incidents});
  expect(result.headline).toContain('environment and incident');
  expect(result.facts.join(' ')).toContain('1 independently reviewed current incident is near');
  expect(result.facts.join(' ')).toContain('Proximity does not establish a closure');
  expect(result.expiresAt).toBe('2026-10-25T08:30:00.000Z');
 });
 it('does not turn no matching evidence into a road safety claim',()=>{
  const result=buildGroundedJourneyBrief(route,{...base,status:'no_matching_reviewed_evidence',
   matched_reviewed_edges:0,overlay_types:[],earliest_expiry:null},{online:true,nowMs:now});
  expect(result.status).toBe('no_matching_reviewed_evidence');
  expect(result.unknowns.join(' ')).toMatch(/passability.*not verified/i);
  expect(result.facts.join(' ')).not.toMatch(/safe|clear|passable/i);
 });
 it('rejects expired or offline evidence as current reviewed context',()=>{
  const expired=buildGroundedJourneyBrief(route,{...base,earliest_expiry:'2026-10-25T07:00:00Z'},
    {online:true,nowMs:now});
  expect(expired.status).toBe('evidence_unavailable');
  expect(expired.expiresAt).toBeNull();
  const offline=buildGroundedJourneyBrief(route,base,{online:false,nowMs:now});
  expect(offline.status).toBe('evidence_unavailable');
  expect(offline.unknowns.join(' ')).toContain('Offline');
 });
});
