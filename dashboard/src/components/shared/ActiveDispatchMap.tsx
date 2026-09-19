import React, { useEffect, useMemo, useState } from 'react';
import { Navigation2, Route, ShieldCheck } from 'lucide-react';
import { InteractiveMap } from './InteractiveMap';
import { fetchCanonicalAfatRoute, routeToLatLngs, type AfatCanonicalRoute, type AfatRouteMode } from '../../services/canonicalRouteClient';

function finite(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vehicleMode(type?: string | null): AfatRouteMode {
  const value = String(type || '').toLowerCase();
  if (value.includes('moto') || value.includes('bike')) return 'moto';
  if (value.includes('minibus') || value.includes('bus') || value.includes('shared')) return 'minibus';
  return 'car';
}

function point(latitude: any, longitude: any, name: string, type: string) {
  const lat = finite(latitude);
  const lng = finite(longitude);
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng, name, type };
}

export function ActiveDispatchMap({
  assignment,
  role,
  incidents = [],
  liveTracks = [],
}: {
  assignment: any;
  role: 'commuter' | 'operator';
  incidents?: any[];
  liveTracks?: any[];
}) {
  const status = String(assignment?.status || '').toLowerCase();
  const pickup = useMemo(() => point(assignment?.pickup_lat, assignment?.pickup_lng, 'Verified pickup', 'pickup'), [assignment?.pickup_lat, assignment?.pickup_lng]);
  const dropoff = useMemo(() => point(assignment?.dropoff_lat, assignment?.dropoff_lng, assignment?.destination || 'Destination', 'dropoff'), [assignment?.dropoff_lat, assignment?.dropoff_lng, assignment?.destination]);
  const vehicle = useMemo(() => point(
    assignment?.vehicle?.current_lat,
    assignment?.vehicle?.current_lng,
    assignment?.vehicle?.plate_number || 'Assigned vehicle',
    'assigned_vehicle',
  ), [assignment?.vehicle?.current_lat, assignment?.vehicle?.current_lng, assignment?.vehicle?.plate_number]);

  const towardPickup = ['offered','accepted','assigned','en_route','arrived'].includes(status);
  const journeyLeg = ['pickup_verified','in_journey','emergency','disputed'].includes(status);
  const routeOrigin = towardPickup && vehicle ? vehicle : journeyLeg && vehicle ? vehicle : pickup;
  const routeDestination = towardPickup ? pickup : dropoff;
  const [route, setRoute] = useState<AfatCanonicalRoute | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  useEffect(() => {
    let active = true;
    if (!routeOrigin || !routeDestination || ['queued','completed','cancelled','declined','expired','no_show'].includes(status)) {
      setRoute(null);
      setRouteState('idle');
      return;
    }

    setRouteState('loading');
    fetchCanonicalAfatRoute({
      originLatitude: routeOrigin.latitude,
      originLongitude: routeOrigin.longitude,
      destinationLatitude: routeDestination.latitude,
      destinationLongitude: routeDestination.longitude,
      mode: vehicleMode(assignment?.vehicle?.type),
      snapRadiusM: 1400,
    }).then((next) => {
      if (!active) return;
      setRoute(next);
      setRouteState(next.status === 'ok' ? 'ready' : 'unavailable');
    }).catch(() => {
      if (!active) return;
      setRoute(null);
      setRouteState('unavailable');
    });
    return () => { active = false; };
  }, [
    status,
    routeOrigin?.latitude,
    routeOrigin?.longitude,
    routeDestination?.latitude,
    routeDestination?.longitude,
    assignment?.vehicle?.type,
  ]);

  const routePath = useMemo(
    () => routeToLatLngs(route).map(([latitude, longitude], index) => ({ latitude, longitude, id: `guidance-${index}`, type: 'route' })),
    [route],
  );

  const checkpoints = useMemo(() => {
    const output: any[] = [];
    if (pickup) output.push({ ...pickup, id: 'pickup' });
    if (dropoff) output.push({ ...dropoff, id: 'dropoff' });
    return output;
  }, [pickup, dropoff]);

  const stageLabel =
    towardPickup ? (status === 'arrived' ? 'At pickup' : 'Approaching pickup')
    : journeyLeg ? 'Journey guidance'
    : status === 'queued' ? 'Matching a verified ride'
    : status === 'completed' ? 'Journey completed'
    : 'Journey map';

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/70 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10">
            <Navigation2 className="h-4 w-4 text-cyan-200" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Live journey map</p>
            <p className="mt-0.5 text-sm font-black text-white">{stageLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {routeState === 'ready' && <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[8px] font-black uppercase text-emerald-100"><Route className="mr-1 inline h-3 w-3" />Canonical route</span>}
          {routeState === 'unavailable' && <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[8px] font-black uppercase text-amber-100">Route not yet trusted</span>}
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[8px] font-black uppercase text-white/45"><ShieldCheck className="mr-1 inline h-3 w-3" />{String(status || 'unknown').replace(/_/g, ' ')}</span>
        </div>
      </div>
      <div className="min-h-[360px] sm:min-h-[480px]">
        <InteractiveMap
          role={role}
          mapMode="intel"
          incidents={incidents}
          tracks={liveTracks}
          routePath={routePath}
          checkpoints={checkpoints}
          trackedVehicle={vehicle}
          realtimeOverlay
          driveMode={journeyLeg || towardPickup}
          showInformal
        />
      </div>
      {routeState === 'unavailable' && (
        <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-white/45">
          AFAT has the verified pickup/destination points, but it is not drawing a road path until the canonical graph can support this leg.
        </p>
      )}
    </section>
  );
}
