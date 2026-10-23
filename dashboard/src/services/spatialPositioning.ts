/**
 * Evidence-aware outdoor positioning for field mapping and live Atlas traces.
 * GPS samples are observations, not verified visual anchors, road matches or VPS.
 * No coordinate is silently snapped to a road or submitted as ground truth.
 */
export type SpatialFix = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  timestampMs: number;
  source: 'device_gnss' | 'field_observation';
};
export type SpatialDecision = {
  accepted: boolean;
  reason: 'accepted' | 'invalid_coordinate' | 'missing_timestamp' | 'stale' | 'uncertain' | 'out_of_order' | 'implausible_motion';
  fix: SpatialFix | null;
  confidence: 'medium' | 'low' | 'unknown';
  uncertaintyRadiusM: number | null;
};
const EARTH_M = 6371000;
const rad = (n: number) => n * Math.PI / 180;
export function spatialDistanceMeters(a: SpatialFix, b: SpatialFix): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function evaluateSpatialFix(
  candidate: unknown,
  previous: SpatialFix | null = null,
  nowMs = Date.now(),
): SpatialDecision {
  const raw = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
  const lat = raw.latitude;
  const lon = raw.longitude;
  const invalid = (): SpatialDecision => ({ accepted: false, reason: 'invalid_coordinate', fix: null, confidence: 'unknown', uncertaintyRadiusM: null });
  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return invalid();
  const time = raw.timestampMs;
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > nowMs + 5000) {
    return { ...invalid(), reason: 'missing_timestamp' };
  }
  const accuracy = raw.accuracyM;
  const accuracyM = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
  const fix: SpatialFix = { latitude: lat, longitude: lon, accuracyM, timestampMs: time,
    source: raw.source === 'field_observation' ? 'field_observation' : 'device_gnss' };
  const confidence = accuracyM !== null && accuracyM <= 40 ? 'medium' : accuracyM !== null && accuracyM <= 120 ? 'low' : 'unknown';
  const result = (reason: SpatialDecision['reason'], accepted = false): SpatialDecision =>
    ({ accepted, reason, fix, confidence, uncertaintyRadiusM: accuracyM });
  if (time < nowMs - 120000) return result('stale');
  if (accuracyM === null || accuracyM > 120) return result('uncertain');
  if (previous) {
    if (time <= previous.timestampMs) return result('out_of_order');
    const deltaSeconds = (time - previous.timestampMs) / 1000;
    const separation = spatialDistanceMeters(previous, fix);
    // Both GPS accuracy circles may overlap; only reject excessive *unexplained*
    // displacement. A generous 75m/s bound accommodates moving vehicles.
    const unexplained = Math.max(0, separation - accuracyM - (previous.accuracyM ?? 120));
    if (unexplained / deltaSeconds > 75) return result('implausible_motion');
  }
  return result('accepted', true);
}


/**
 * Legacy and role-native field reporting must use actual on-device observations.
 * This is GNSS evidence, NOT an independently verified road or incident location.
 * A successful position API response can still be stale/inaccurate, so check it.
 */
export function evaluateCurrentFieldGpsPosition(
  position: Pick<GeolocationPosition,'coords'|'timestamp'>,
  nowMs = Date.now(),
): SpatialDecision {
  const decision = evaluateSpatialFix({
    latitude: position.coords.latitude, longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy, timestampMs: position.timestamp,
    source:'field_observation',
  }, null, nowMs);
  if (!decision.accepted) return decision;
  // Community incident and mission statements must correspond to a *fresh*
  // observed place, not an earlier cached navigation point.
  if (!Number.isFinite(position.timestamp) || nowMs - position.timestamp > 30_000) {
    return { ...decision, accepted:false, reason:'stale' };
  }
  return decision;
}

export async function captureCurrentFieldGps(): Promise<SpatialFix> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Live location is unavailable. AFAT will not invent an incident or field position.');
  }
  return new Promise<SpatialFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        const decision = evaluateCurrentFieldGpsPosition(position);
        if (!decision.accepted || !decision.fix) {
          reject(new Error(`Device position rejected: ${decision.reason.replace(/_/g,' ')}. Move outdoors and try again; no report was submitted.`));
          return;
        }
        resolve(decision.fix);
      },
      error => reject(new Error(error.code === 1 ?
        'Location permission was denied. No report was submitted.' :
        'AFAT could not obtain a current, reliable GPS position. No report was submitted.')),
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 },
    );
  });
}
