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
      source:'osrm',primary:{
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
        source: 'osrm', primary: {
          summary: 'Road', distanceMeters: 1200, durationValue: 180,
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
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('does not present driving route as walking or minibus directions', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable', mode: 'walk' }, error: null });
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const route = await fetchCanonicalAfatRoute({ ...input, mode: 'walk' });
    expect(route.status).toBe('unavailable');
    expect(network).not.toHaveBeenCalled();
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
