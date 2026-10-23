import type { AfatCanonicalRoute, AfatRouteMode } from './canonicalRouteClient';

/** A route is not the same as a bookable ride. Prefer evidence over theoretical speed. */
export type PassengerModeDecision = {
  mode: AfatRouteMode;
  label: string;
  reason: string;
  confidence: 'observed' | 'limited';
  bookable: boolean;
  observedSupply: number;
  etaMinutes: number | null;
};

export type PassengerPreflight = Record<string, {
  supply?: { observed?: number | null } | null;
  fare?: { state?: string; low?: number; high?: number } | null;
} | null | undefined>;

const LABELS: Record<AfatRouteMode, string> = {
  walk: 'Walk', bike: 'Bike', moto: 'Moto', car: 'Taxi / car', minibus: 'Shared',
};

const TRANSPORT_MODES: AfatRouteMode[] = ['moto', 'car', 'minibus'];

export function observedTransportSupply(preflight: PassengerPreflight, mode: AfatRouteMode): number {
  if (!TRANSPORT_MODES.includes(mode)) return 0;
  const value = preflight[mode]?.supply?.observed;
  const number = typeof value === 'number' ? value : NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function choosePassengerMode(
  routes: Partial<Record<AfatRouteMode, AfatCanonicalRoute>>,
  preflight: PassengerPreflight,
  online: boolean,
): PassengerModeDecision | null {
  const candidates = (Object.entries(routes) as [AfatRouteMode, AfatCanonicalRoute][])
    .filter(([mode,route]) => route?.status === 'ok' && route.mode === mode && Number.isFinite(route.distance_m) && Number(route.distance_m) > 0)
    .flatMap(([mode,route]) => {
      const observedSupply = online ? observedTransportSupply(preflight,mode) : 0;
      // A motor route without real observed availability is a path, not a live transport offer.
      if (mode !== 'walk' && observedSupply === 0) return [];
      const etaMinutes = Number.isFinite(route.eta_seconds) && Number(route.eta_seconds) > 0
        ? Math.ceil(Number(route.eta_seconds) / 60) : null;
      const baseline = route.route_source === 'osrm' || route.route_source === 'google';
      const isObserved = mode !== 'walk' && !baseline && etaMinutes !== null;
      return [{
        mode, label: LABELS[mode], observedSupply, etaMinutes,
        bookable: mode !== 'walk',
        confidence: isObserved ? 'observed' as const : 'limited' as const,
        reason: [
          etaMinutes === null ? 'ETA not yet supported by evidence' :
            `${etaMinutes} min ${baseline ? 'road baseline, without live traffic' : 'route estimate'}`,
          mode === 'walk' ? 'walking path only — crossing and access safety not verified' :
            `${observedSupply} nearby transport option${observedSupply===1?'':'s'} observed; booking is not guaranteed`,
        ].join(' · '),
      }];
    });
  if (!candidates.length) return null;
  // Always compare routes conservatively; absent ETA must not score as instant travel.
  candidates.sort((a,b) => {
    if (a.etaMinutes === null && b.etaMinutes !== null) return 1;
    if (b.etaMinutes === null && a.etaMinutes !== null) return -1;
    if (a.etaMinutes !== null && b.etaMinutes !== null && a.etaMinutes !== b.etaMinutes)
      return a.etaMinutes - b.etaMinutes;
    if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
    return b.observedSupply - a.observedSupply;
  });
  return candidates[0];
}

export function passengerSupplyNotice(mode: AfatRouteMode, preflight: PassengerPreflight, online: boolean) {
  if (mode === 'walk') return 'Walking needs no vehicle; the route is not a field-verified safe crossing.';
  if (!online) return 'Offline: transport availability and fares cannot be confirmed.';
  const current = preflight[mode];
  if (!current) return 'Transport availability is not confirmed. A request is not an accepted booking.';
  const observed = observedTransportSupply(preflight,mode);
  return observed > 0
    ? `${observed} transport option${observed===1?'':'s'} observed. A request still requires assignment confirmation.`
    : 'No live vehicle availability observed. You can request transport, but a ride is not confirmed.';
}
