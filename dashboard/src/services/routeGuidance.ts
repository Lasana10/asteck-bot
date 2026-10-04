import type { AfatCanonicalRoute } from './canonicalRouteClient';
import { routeToLatLngs } from './canonicalRouteClient';
import { distanceMeters } from './journeyRuntime';

export type RoutePosition = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt?: string | null;
};

export type AfatRouteProgress = {
  matched: boolean;
  nearestDistanceM: number;
  progressRatio: number;
  travelledDistanceM: number;
  remainingDistanceM: number;
  routeDistanceM: number;
  nearestSegmentIndex: number;
  offRouteThresholdM: number;
  offRoute: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type RerouteDecision = {
  shouldReroute: boolean;
  reason: 'on_route' | 'gps_uncertain' | 'off_route' | 'cooldown' | 'insufficient_route';
  progress: AfatRouteProgress | null;
};

const EARTH_RADIUS_M = 6371000;

function toLocalMeters(point: { latitude: number; longitude: number }, referenceLat: number) {
  const latScale = Math.PI * EARTH_RADIUS_M / 180;
  const lonScale = latScale * Math.cos(referenceLat * Math.PI / 180);
  return { x: point.longitude * lonScale, y: point.latitude * latScale };
}

function nearestPointOnSegment(
  point: { latitude: number; longitude: number },
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
) {
  const refLat = (point.latitude + start.latitude + end.latitude) / 3;
  const p = toLocalMeters(point, refLat);
  const a = toLocalMeters(start, refLat);
  const b = toLocalMeters(end, refLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator)) : 0;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return {
    t,
    distanceM: Math.hypot(p.x - x, p.y - y),
  };
}

function thresholdFor(position: RoutePosition, mode?: string | null) {
  const accuracy = Math.max(0, Number(position.accuracy || 0));
  const base = mode === 'walk' ? 28 : mode === 'moto' || mode === 'bike' ? 38 : 48;
  return Math.max(base, Math.min(130, accuracy * 1.6 || base));
}

export function calculateRouteProgress(
  route: AfatCanonicalRoute | null | undefined,
  position: RoutePosition,
): AfatRouteProgress | null {
  const points = routeToLatLngs(route).map(([latitude, longitude]) => ({ latitude, longitude }));
  if (route?.status !== 'ok' || points.length < 2) return null;

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + distanceMeters(points[i - 1], points[i]);
  }
  const routeDistanceM = cumulative[cumulative.length - 1];
  let nearestDistanceM = Number.POSITIVE_INFINITY;
  let nearestSegmentIndex = 0;
  let travelledDistanceM = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const nearest = nearestPointOnSegment(position, points[i], points[i + 1]);
    if (nearest.distanceM < nearestDistanceM) {
      nearestDistanceM = nearest.distanceM;
      nearestSegmentIndex = i;
      const segmentLength = cumulative[i + 1] - cumulative[i];
      travelledDistanceM = cumulative[i] + segmentLength * nearest.t;
    }
  }

  const progressRatio = routeDistanceM > 0 ? Math.max(0, Math.min(1, travelledDistanceM / routeDistanceM)) : 0;
  const offRouteThresholdM = thresholdFor(position, route?.mode);
  const accuracy = Number(position.accuracy || 0);
  const confidence: AfatRouteProgress['confidence'] = accuracy <= 25 ? 'high' : accuracy <= 70 ? 'medium' : 'low';

  return {
    matched: Number.isFinite(nearestDistanceM),
    nearestDistanceM,
    progressRatio,
    travelledDistanceM,
    remainingDistanceM: Math.max(0, routeDistanceM - travelledDistanceM),
    routeDistanceM,
    nearestSegmentIndex,
    offRouteThresholdM,
    offRoute: nearestDistanceM > offRouteThresholdM,
    confidence,
  };
}

export function decideReroute(input: {
  route: AfatCanonicalRoute | null | undefined;
  position: RoutePosition;
  lastRerouteAt?: number | null;
  now?: number;
  cooldownMs?: number;
}): RerouteDecision {
  const progress = calculateRouteProgress(input.route, input.position);
  if (!progress) return { shouldReroute: false, reason: 'insufficient_route', progress: null };

  const accuracy = Number(input.position.accuracy || 0);
  if (accuracy > 120) return { shouldReroute: false, reason: 'gps_uncertain', progress };
  if (!progress.offRoute) return { shouldReroute: false, reason: 'on_route', progress };

  const now = input.now ?? Date.now();
  const cooldownMs = input.cooldownMs ?? 20_000;
  if (input.lastRerouteAt && now - input.lastRerouteAt < cooldownMs) {
    return { shouldReroute: false, reason: 'cooldown', progress };
  }

  return { shouldReroute: true, reason: 'off_route', progress };
}

export function formatRouteProgress(progress: AfatRouteProgress | null) {
  if (!progress) return null;
  const pct = Math.round(progress.progressRatio * 100);
  const remaining = progress.remainingDistanceM < 1000
    ? `${Math.round(progress.remainingDistanceM)} m`
    : `${(progress.remainingDistanceM / 1000).toFixed(1)} km`;
  return { percent: pct, remaining, offRoute: progress.offRoute, confidence: progress.confidence };
}
