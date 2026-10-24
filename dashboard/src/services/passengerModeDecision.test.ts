import { describe, expect, it } from 'vitest';
import { choosePassengerMode, passengerSupplyNotice } from './passengerModeDecision';
import type { AfatCanonicalRoute, AfatRouteMode } from './canonicalRouteClient';
const route=(mode:AfatRouteMode,eta:number|null):AfatCanonicalRoute=>({
 status:'ok',mode,route_source:'osrm',distance_m:1200,eta_seconds:eta,
 segments:[{seq:0,edge_id:'road',distance_m:1200,geometry:{type:'LineString',coordinates:[[11.5,3.8],[11.51,3.81]]}}]
});
describe('AFAT mode choice and booking truth',()=>{
 it('never calls an unavailable motor route a live ride',()=>{
  expect(choosePassengerMode({car:route('car',100),walk:route('walk',900)},{car:{supply:{observed:0}}},true)?.mode).toBe('walk');
  expect(choosePassengerMode({car:route('car',100)},{},true)).toBeNull();
 });
 it('uses real bicycle route geometry without implying a bookable bicycle',()=>{
  const cycle={...route('bike',470),route_source:'valhalla' as const};
  const picked=choosePassengerMode({bike:cycle},{},true);
  expect(picked?.mode).toBe('bike');
  expect(picked?.bookable).toBe(false);
  expect(picked?.confidence).toBe('limited');
  expect(picked?.reason).toContain('cycling path only');
  expect(passengerSupplyNotice('bike',{},true)).toContain('Self-cycling');
 });
 it('does not reuse live availability offline',()=>{
  expect(choosePassengerMode({moto:route('moto',300)},{moto:{supply:{observed:2}}},false)).toBeNull();
 });
 it('requires availability and distinguishes baseline estimates',()=>{
  const x=choosePassengerMode({moto:route('moto',300)},{moto:{supply:{observed:2}}},true);
  expect(x?.bookable).toBe(true);
  expect(x?.reason).toContain('without live traffic');
 });
 it('never presents unknown ETA as instant travel',()=>{
  expect(choosePassengerMode({walk:route('walk',null),car:route('car',800)},{car:{supply:{observed:1}}},true)?.mode).toBe('car');
 });
 it('requires real assignment confirmation',()=>{
  expect(passengerSupplyNotice('car',{car:{supply:{observed:1}}},true)).toContain('assignment confirmation');
 });
});
