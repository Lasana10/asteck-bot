import { describe, expect, it, vi } from 'vitest';
vi.mock('./canonicalRouteClient', () => ({
  routeToLatLngs: () => [[3.866, 11.516], [3.875, 11.526]],
}));
vi.mock('./journeyRuntime', () => ({
  distanceMeters: (a: {latitude:number;longitude:number}, z: {latitude:number;longitude:number}) =>
    Math.hypot(a.latitude-z.latitude,a.longitude-z.longitude)*100000,
}));
import { calculateRouteProgress, decideReroute } from './routeGuidance';

const route = { status: 'ok' as const, mode: 'car' as const };
const offRoute = {latitude:4.5,longitude:12.5};
describe('GPS evidence must be reliable before rerouting', () => {
  it('does not reroute when accuracy is unknown', () => {
    const decision = decideReroute({ route, position: offRoute });
    expect(decision.reason).toBe('gps_uncertain');
    expect(decision.shouldReroute).toBe(false);
    expect(decision.progress?.confidence).toBe('low');
    expect(decision.progress?.offRouteThresholdM).toBe(130);
  });
  it('does not reroute on invalid GPS accuracy', () => {
    expect(decideReroute({ route, position: { ...offRoute, accuracy: -10 } }).reason).toBe('gps_uncertain');
    expect(decideReroute({ route, position: { ...offRoute, accuracy: Number.NaN } }).reason).toBe('gps_uncertain');
  });
  it('allows rerouting with precise GPS far off the route', () => {
    const decision = decideReroute({route,position:{...offRoute,accuracy:10},now:100000});
    expect(decision.reason).toBe('off_route');
    expect(decision.shouldReroute).toBe(true);
  });
  it('does not claim high confidence without measured accuracy', () => {
    expect(calculateRouteProgress(route,{latitude:3.866,longitude:11.516})?.confidence).toBe('low');
  });
});
