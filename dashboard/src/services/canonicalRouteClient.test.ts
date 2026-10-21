import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, metric } = vi.hoisted(() => ({ rpc: vi.fn(), metric: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: { rpc },
  getApiBaseUrl: () => 'https://api.example.test',
}));
vi.mock('./performanceMetrics', () => ({
  elapsedMs: () => 0,
  performanceNow: () => 0,
  recordAfatMetric: metric,
}));

import { clearCanonicalRouteCache, fetchCanonicalAfatRoute, routeToLatLngs } from './canonicalRouteClient';
import {nextRoadManeuver} from './routeGuidance';

const input = {
  originLatitude: 3.866, originLongitude: 11.516,
  destinationLatitude: 3.875, destinationLongitude: 11.526,
  mode: 'car' as const,
};
beforeEach(() => { clearCanonicalRouteCache(); rpc.mockReset(); metric.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('canonical route integration', () => {
  it('carries real geolocated provider turns from backend to GPS-aware passenger guidance', async () => {
    rpc.mockResolvedValue({data:{status:'unavailable',mode:'car'},error:null});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
      source:'osrm',travel_mode:'driving',primary:{
        summary:'Actual road',distanceMeters:1800,durationValue:240,
        geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.526,3.866],[11.536,3.866]]},
        maneuvers:[{latitude:3.866,longitude:11.516,kind:'depart',instruction:'Depart',distanceMeters:800},
          {latitude:3.866,longitude:11.526,kind:'turn',instruction:'Turn right on Market Street',distanceMeters:900},
          {latitude:300,longitude:11.5,kind:'invalid',instruction:'Invalid',distanceMeters:1}],
      },
    })}));
    const route=await fetchCanonicalAfatRoute(input);
    expect(route.maneuvers).toHaveLength(2);
    const next=nextRoadManeuver(route,{latitude:3.866,longitude:11.522,accuracy:12});
    expect(next?.instruction).toContain('Turn right');
    expect(next?.untilM).toBeGreaterThan(0);
    expect(nextRoadManeuver(route,{latitude:3.866,longitude:11.522,accuracy:180})).toBeNull();
  });

  it('preserves authoritative AFAT route without requesting external routing', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', mode: 'car', segments: [] }, error: null });
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const route = await fetchCanonicalAfatRoute(input);
    expect(route.route_source).toBe('afat_atlas');
    expect(network).not.toHaveBeenCalled();
  });

  it('falls back to a real road geometry when the atlas is incomplete', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable', mode: 'car' }, error: null });
    const network = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'osrm', travel_mode:'driving', primary: {
          summary: 'Road', distanceMeters: 1200, durationValue: 180,
          originSnapMeters:8.5,destinationSnapMeters:215.3,
          geometry: { type: 'LineString', coordinates: [[11.516, 3.866], [11.526, 3.875]] },
        },
      }),
    });
    vi.stubGlobal('fetch', network);
    const route = await fetchCanonicalAfatRoute(input);
    expect(route.status).toBe('ok');
    expect(route.route_source).toBe('osrm');
    expect(route.reason).toBe('unverified_external_road_route');
    expect(route.traffic_aware).toBe(false);
    expect(routeToLatLngs(route)).toEqual([[3.866, 11.516], [3.875, 11.526]]);
    expect(route.eta_seconds).toBe(180);
    expect(route.origin_snap_m).toBe(8.5);
    expect(route.destination_snap_m).toBe(215.3);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('accepts only actual separately sourced foot graph for pedestrian navigation',async()=>{
    rpc.mockResolvedValue({data:{status:'unavailable',mode:'walk'},error:null});
    const network=vi.fn().mockResolvedValue({ok:true,json:async()=>({
      source:'osrm',travel_mode:'foot',primary:{
        summary:'Pedestrian path',distanceMeters:270,durationValue:210,
        geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.517,3.867]]},
        originSnapMeters:12,destinationSnapMeters:18,
        maneuvers:[{kind:'depart',latitude:3.866,longitude:11.516,instruction:'Depart on foot',distanceMeters:270}],
      },
    })});
    vi.stubGlobal('fetch',network);
    const route=await fetchCanonicalAfatRoute({...input,mode:'walk'});
    expect(route.status).toBe('ok');
    expect(route.mode).toBe('walk');
    expect(route.route_source).toBe('osrm');
    expect(route.reason).toBe('unverified_osm_pedestrian_route');
    expect(route.eta_reason).toBe('baseline_no_live_traffic');
    expect(route.destination_snap_m).toBe(18);
    expect(network.mock.calls[0][0]).toContain('mode=foot');
  });
  it('refuses to relabel the driving service as a pedestrian route',async()=>{
    rpc.mockResolvedValue({data:{status:'unavailable',mode:'walk'},error:null});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
       source:'osrm',travel_mode:'driving',primary:{summary:'car',distanceMeters:270,durationValue:18,
         geometry:{type:'LineString',coordinates:[[11.516,3.866],[11.517,3.867]]}},
    })}));
    const route=await fetchCanonicalAfatRoute({...input,mode:'walk'});
    expect(route.status).toBe('unavailable');
  });

  it('does not misrepresent an unavailable foot route as successful pedestrian navigation', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable', mode: 'walk' }, error: null });
    const network = vi.fn().mockResolvedValue({ok:false,status:503});
    vi.stubGlobal('fetch', network);
    const route = await fetchCanonicalAfatRoute({ ...input, mode: 'walk' });
    expect(route.status).toBe('unavailable');
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toContain('mode=foot');
    const minibus = await fetchCanonicalAfatRoute({ ...input, mode: 'minibus' });
    expect(minibus.status).toBe('unavailable');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('rejects missing provider provenance and invented zero ETA', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable', mode: 'car' }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ source: 'unspecified', primary: {
        distanceMeters: 0, durationValue: 0,
        geometry: { type: 'LineString', coordinates: [[11.516, 3.866], [11.526, 3.875]] },
      } }),
    }));
    const route = await fetchCanonicalAfatRoute(input);
    expect(route.status).toBe('unavailable');
  });

  it('rejects malformed external road geometry', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable', mode: 'car' }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ source: 'osrm', primary: { geometry: { type: 'LineString', coordinates: [[999, 0], [11, 3]] } } }),
    }));
    const route = await fetchCanonicalAfatRoute(input);
    expect(route.status).toBe('unavailable');
  });
});
