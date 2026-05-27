import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Car,
  MapPin,
  Navigation2,
  Radio,
  ShieldAlert,
  Wifi
} from 'lucide-react';
import { supabase, subscribeToMovementLogs, subscribeToVehicles } from '../../supabaseClient';

type PointLike = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  current_lat?: number;
  current_lng?: number;
  location?: string;
  type?: string;
  id?: string;
  name?: string;
  plate_number?: string;
  label?: string;
  severity?: number;
  status?: string;
  current_speed?: number;
  heading?: number;
  updated_at?: string;
  created_at?: string;
};

interface InteractiveMapProps {
  incidents?: PointLike[];
  tracks?: PointLike[];
  routePath?: PointLike[];
  checkpoints?: Array<PointLike & { id: string; name: string; type?: string }>;
  trackedVehicle?: PointLike | null;
  driveMode?: boolean;
  showInformal?: boolean;
  role?: 'commuter' | 'operator' | 'admin';
}

const DEFAULT_CENTER = { latitude: 3.866, longitude: 11.514 };

function parseLocationText(location?: string) {
  if (!location) return null;
  const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
}

function extractPoint(item?: PointLike | null) {
  if (!item) return null;
  const parsedLocation = parseLocationText(item.location);
  const latitude = item.latitude ?? item.lat ?? item.current_lat ?? parsedLocation?.latitude;
  const longitude = item.longitude ?? item.lng ?? item.current_lng ?? parsedLocation?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
}

function normalizePoints(points: PointLike[], fallbackCenter = DEFAULT_CENTER) {
  const extracted = points
    .map((point) => ({ point, coords: extractPoint(point) }))
    .filter((entry): entry is { point: PointLike; coords: { latitude: number; longitude: number } } => Boolean(entry.coords));

  if (extracted.length === 0) {
    return {
      entries: [] as Array<{ point: PointLike; x: number; y: number; coords: { latitude: number; longitude: number } }>,
      bounds: {
        minLat: fallbackCenter.latitude - 0.02,
        maxLat: fallbackCenter.latitude + 0.02,
        minLng: fallbackCenter.longitude - 0.02,
        maxLng: fallbackCenter.longitude + 0.02
      }
    };
  }

  let minLat = extracted[0].coords.latitude;
  let maxLat = extracted[0].coords.latitude;
  let minLng = extracted[0].coords.longitude;
  let maxLng = extracted[0].coords.longitude;

  extracted.forEach(({ coords }) => {
    minLat = Math.min(minLat, coords.latitude);
    maxLat = Math.max(maxLat, coords.latitude);
    minLng = Math.min(minLng, coords.longitude);
    maxLng = Math.max(maxLng, coords.longitude);
  });

  const latPadding = Math.max((maxLat - minLat) * 0.22, 0.01);
  const lngPadding = Math.max((maxLng - minLng) * 0.22, 0.01);

  minLat -= latPadding;
  maxLat += latPadding;
  minLng -= lngPadding;
  maxLng += lngPadding;

  const spanLat = Math.max(maxLat - minLat, 0.0001);
  const spanLng = Math.max(maxLng - minLng, 0.0001);

  return {
    entries: extracted.map(({ point, coords }) => {
      const x = ((coords.longitude - minLng) / spanLng) * 100;
      const y = 100 - ((coords.latitude - minLat) / spanLat) * 100;
      return { point, coords, x, y };
    }),
    bounds: { minLat, maxLat, minLng, maxLng }
  };
}

function severityTone(severity?: number) {
  if (severity && severity >= 4) return 'border-red-400/50 bg-red-500/15 text-red-200';
  if (severity && severity >= 3) return 'border-amber-400/40 bg-amber-500/15 text-amber-100';
  return 'border-blue-400/30 bg-blue-500/15 text-blue-100';
}

function markerLabel(item: PointLike, fallback: string) {
  return item.name || item.label || item.plate_number || item.id || fallback;
}

export function InteractiveMap({
  incidents = [],
  tracks = [],
  routePath = [],
  checkpoints = [],
  trackedVehicle = null,
  driveMode = false,
  showInformal = false,
  role = 'commuter'
}: InteractiveMapProps) {
  const [liveTracks, setLiveTracks] = useState<PointLike[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<PointLike[]>([]);

  useEffect(() => {
    const vehiclesChannel = subscribeToVehicles((payload) => {
      const nextVehicle = payload?.new || payload?.old;
      if (!nextVehicle) return;
      setLiveVehicles((prev) => {
        const next = prev.filter((item) => item.id !== nextVehicle.id && item.id !== nextVehicle.vehicle_id);
        return [nextVehicle, ...next].slice(0, 20);
      });
    });

    const movementChannel = subscribeToMovementLogs((payload) => {
      const nextMovement = payload?.new;
      if (!nextMovement) return;
      setLiveTracks((prev) => [nextMovement, ...prev].slice(0, 24));
    });

    const refresh = async () => {
      const [{ data: vehiclesData }, { data: movementData }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('is_available', true).limit(20),
        supabase.from('movement_logs').select('*').order('created_at', { ascending: false }).limit(12)
      ]);

      if (vehiclesData) setLiveVehicles(vehiclesData);
      if (movementData) setLiveTracks(movementData);
    };

    refresh();

    return () => {
      supabase.removeChannel(vehiclesChannel);
      supabase.removeChannel(movementChannel);
    };
  }, []);

  const allTrackedPoints = useMemo(() => {
    return [
      ...incidents,
      ...tracks,
      ...routePath,
      ...checkpoints,
      ...liveTracks,
      ...liveVehicles,
      ...(trackedVehicle ? [trackedVehicle] : [])
    ].filter(Boolean) as PointLike[];
  }, [incidents, tracks, routePath, checkpoints, liveTracks, liveVehicles, trackedVehicle]);

  const normalized = useMemo(() => normalizePoints(allTrackedPoints), [allTrackedPoints]);
  const incidentPoints = useMemo(() => normalizePoints(incidents), [incidents]);
  const trackPoints = useMemo(() => normalizePoints([...tracks, ...liveTracks]), [tracks, liveTracks]);
  const routePoints = useMemo(() => normalizePoints(routePath), [routePath]);
  const checkpointPoints = useMemo(() => normalizePoints(checkpoints), [checkpoints]);

  const primaryVehicle = trackedVehicle || liveVehicles[0] || tracks[0] || null;
  const primaryPoint = extractPoint(primaryVehicle);

  const polylinePoints = useMemo(() => {
    const merged = [...routePoints.entries, ...trackPoints.entries];
    if (merged.length < 2) return '';
    return merged
      .sort((a, b) => {
        const ta = new Date((a.point.updated_at || a.point.created_at || 0) as any).getTime();
        const tb = new Date((b.point.updated_at || b.point.created_at || 0) as any).getTime();
        return ta - tb;
      })
      .map(({ x, y }) => `${x},${y}`)
      .join(' ');
  }, [routePoints.entries, trackPoints.entries]);

  return (
    <div className="relative h-full min-h-[260px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_45%)]" />
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '28px 28px'
      }} />
      <div className="absolute inset-0" style={{
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.08), transparent 0), radial-gradient(circle at 80% 25%, rgba(16,185,129,0.06), transparent 0), radial-gradient(circle at 55% 85%, rgba(244,63,94,0.05), transparent 0)'
      }} />

      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Activity className="h-4 w-4 text-emerald-400" />
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">Dispatch Map</p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {driveMode ? 'Live drive feed' : role === 'admin' ? 'Fleet intelligence' : 'Passenger view'}
          </p>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Radio className="h-4 w-4 text-blue-400 animate-pulse" />
        <div className="text-right">
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">Live sync</p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {liveTracks.length + liveVehicles.length + incidents.length} active signals
          </p>
        </div>
      </div>

      <div className="absolute inset-0 z-10">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {polylinePoints && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="rgba(56, 189, 248, 0.7)"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={showInformal ? '0' : '1.5 1'}
            />
          )}
          {routePoints.entries.slice(0, 1).map(({ x, y }, idx) => (
            <circle key={idx} cx={x} cy={y} r="1.4" fill="rgba(96,165,250,0.9)" />
          ))}
        </svg>

        {incidentPoints.entries.map(({ point, x, y }, idx) => (
          <div
            key={`incident-${idx}-${point.id || point.created_at || idx}`}
            className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] shadow-2xl ${severityTone(point.severity)}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3" />
              <span>{markerLabel(point, 'Incident')}</span>
            </div>
          </div>
        ))}

        {checkpointPoints.entries.map(({ point, x, y }, idx) => (
          <div
            key={`checkpoint-${idx}-${point.id || point.name || idx}`}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-cyan-50 shadow-xl backdrop-blur-md"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              <span>{markerLabel(point, 'Checkpoint')}</span>
            </div>
          </div>
        ))}

        {trackPoints.entries.map(({ point, x, y }, idx) => (
          <div
            key={`track-${idx}-${point.id || point.updated_at || idx}`}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="absolute inset-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/20 blur-md" />
            <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-blue-300/50 bg-slate-950/90 shadow-[0_0_20px_rgba(59,130,246,0.35)]">
              <Car className="h-3.5 w-3.5 text-blue-300" />
            </div>
          </div>
        ))}

        {primaryPoint && (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((primaryPoint.longitude - normalized.bounds.minLng) / Math.max(normalized.bounds.maxLng - normalized.bounds.minLng, 0.0001)) * 100}%`,
              top: `${100 - ((primaryPoint.latitude - normalized.bounds.minLat) / Math.max(normalized.bounds.maxLat - normalized.bounds.minLat, 0.0001)) * 100}%`
            }}
          >
            <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/60 bg-black/90 shadow-[0_0_30px_rgba(16,185,129,0.45)]">
              <Navigation2 className="h-5 w-5 text-emerald-300" />
            </div>
          </div>
        )}

        {normalized.entries.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-8 text-center">
            <div className="max-w-xs rounded-[24px] border border-white/10 bg-black/55 px-5 py-4 backdrop-blur-xl">
              <Wifi className="mx-auto mb-2 h-5 w-5 text-blue-400" />
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white">Waiting for live dispatch</p>
              <p className="mt-1 text-[10px] font-medium text-white/45">
                When telemetry, vehicles, or incident reports arrive, the map updates in place.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-blue-300">{tracks.length + liveTracks.length}</span> moving nodes
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-emerald-300">{incidents.length}</span> hazard signals
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-cyan-300">{checkpoints.length}</span> checkpoints
        </div>
        {driveMode && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-xl">
            live dispatch feed
          </div>
        )}
        <div className="ml-auto rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45 backdrop-blur-xl">
          {showInformal ? 'informal routes visible' : 'formal routes only'}
        </div>
      </div>
    </div>
  );
}
