import React, { useEffect, useMemo, useState } from 'react';
import { Activity, MapPin, Navigation2, Radio, ShieldAlert, Wifi } from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
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
  source?: string;
};

interface InteractiveMapProps {
  incidents?: PointLike[];
  tracks?: PointLike[];
  routePath?: PointLike[];
  checkpoints?: Array<PointLike & { id: string; name: string; type?: string }>;
  trackedVehicle?: PointLike | null;
  driveMode?: boolean;
  showInformal?: boolean;
  role?: 'commuter' | 'operator' | 'planner' | 'admin';
  mapMode?: 'standard' | 'satellite' | 'hybrid' | 'intel';
  realtimeOverlay?: boolean;
}

const DEFAULT_CENTER: LatLngExpression = [3.866, 11.514];

const TILE_LAYERS = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    className: 'afat-tiles-standard',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    className: 'afat-tiles-satellite',
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    className: 'afat-tiles-hybrid',
  },
  intel: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    className: 'afat-tiles-intel',
  },
};

function parseLocationText(location?: string) {
  if (!location) return null;
  const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function extractPoint(item?: PointLike | null) {
  if (!item) return null;
  const parsedLocation = parseLocationText(item.location);
  const latitude = item.latitude ?? item.lat ?? item.current_lat ?? parsedLocation?.latitude;
  const longitude = item.longitude ?? item.lng ?? item.current_lng ?? parsedLocation?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function markerLabel(item: PointLike, fallback: string) {
  return item.name || item.label || item.plate_number || item.id || fallback;
}

function severityColor(severity?: number) {
  if (severity && severity >= 5) return '#ef4444';
  if (severity && severity >= 4) return '#f97316';
  if (severity && severity >= 3) return '#f59e0b';
  return '#38bdf8';
}

function pointToLatLng(item: PointLike): LatLngExpression | null {
  const coords = extractPoint(item);
  if (!coords) return null;
  return [coords.latitude, coords.longitude];
}

function FitMapToSignals({ points }: { points: PointLike[] }) {
  const map = useMap();

  useEffect(() => {
    const latLngs = points.map(pointToLatLng).filter(Boolean) as LatLngExpression[];
    if (latLngs.length === 0) {
      map.setView(DEFAULT_CENTER, 13);
      return;
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
      return;
    }

    map.fitBounds(latLngs as LatLngBoundsExpression, { padding: [44, 44], maxZoom: 15 });
  }, [map, points]);

  return null;
}

function SignalPopup({ point, fallback }: { point: PointLike; fallback: string }) {
  return (
    <div className="min-w-[180px] bg-slate-950 p-3 text-white">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
        {point.type || point.source || fallback}
      </p>
      <p className="mt-1 text-sm font-black text-white">{markerLabel(point, fallback)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
        <span>Severity {point.severity || 1}</span>
        <span>{point.status || 'verified'}</span>
        {point.current_speed !== undefined && <span>{Math.round(Number(point.current_speed))} km/h</span>}
        {point.source && <span>{point.source}</span>}
      </div>
    </div>
  );
}

export function InteractiveMap({
  incidents = [],
  tracks = [],
  routePath = [],
  checkpoints = [],
  trackedVehicle = null,
  driveMode = false,
  showInformal = false,
  role = 'commuter',
  mapMode = 'standard',
  realtimeOverlay = false,
}: InteractiveMapProps) {
  const [liveTracks, setLiveTracks] = useState<PointLike[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<PointLike[]>([]);

  useEffect(() => {
    if (!realtimeOverlay) {
      setLiveTracks([]);
      setLiveVehicles([]);
      return;
    }

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
        supabase.from('movement_logs').select('*').order('timestamp', { ascending: false }).limit(12),
      ]);

      if (vehiclesData?.length) setLiveVehicles(vehiclesData);
      if (movementData?.length) setLiveTracks(movementData);
    };

    refresh();

    return () => {
      supabase.removeChannel(vehiclesChannel);
      supabase.removeChannel(movementChannel);
    };
  }, [realtimeOverlay]);

  const vehicleSignals = useMemo(() => [...tracks, ...liveTracks, ...liveVehicles], [tracks, liveTracks, liveVehicles]);
  const hazardSignals = useMemo(() => incidents, [incidents]);

  const routeSignals = useMemo(() => routePath.map(pointToLatLng).filter(Boolean) as LatLngExpression[], [routePath]);
  const movementRoute = useMemo(
    () => vehicleSignals.slice(0, 8).map(pointToLatLng).filter(Boolean) as LatLngExpression[],
    [vehicleSignals]
  );

  const allSignals = useMemo(
    () => [
      ...hazardSignals,
      ...vehicleSignals,
      ...routePath,
      ...checkpoints,
      ...(trackedVehicle ? [trackedVehicle] : []),
    ],
    [hazardSignals, vehicleSignals, routePath, checkpoints, trackedVehicle]
  );

  const tileLayer = TILE_LAYERS[mapMode] || TILE_LAYERS.standard;
  const primaryVehicle = trackedVehicle || liveVehicles[0] || tracks[0] || null;
  const primaryLatLng = pointToLatLng(primaryVehicle || {});
  const activeSignalCount = liveTracks.length + liveVehicles.length + incidents.length;

  return (
    <div className="sentinel-atlas-container relative h-full min-h-[260px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        scrollWheelZoom={false}
        className="absolute inset-0 z-0 h-full w-full"
        zoomControl={false}
      >
        <TileLayer key={mapMode} url={tileLayer.url} attribution={tileLayer.attribution} className={tileLayer.className} />
        {mapMode === 'hybrid' && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            opacity={0.32}
            attribution="&copy; OpenStreetMap contributors"
            className="afat-tiles-hybrid-labels"
          />
        )}

        <FitMapToSignals points={allSignals} />

        {showInformal && movementRoute.length > 1 && (
          <Polyline positions={movementRoute} pathOptions={{ color: '#34d399', weight: 4, opacity: 0.72, dashArray: '8 8' }} />
        )}

        {routeSignals.length > 1 && (
          <Polyline positions={routeSignals} pathOptions={{ color: '#38bdf8', weight: 5, opacity: 0.74 }} />
        )}

        {hazardSignals.map((point, idx) => {
          const position = pointToLatLng(point);
          if (!position) return null;
          const color = severityColor(point.severity);
          return (
            <CircleMarker
              key={`hazard-${point.id || point.created_at || idx}`}
              center={position}
              radius={9 + Math.min(Number(point.severity || 1), 5)}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}
            >
              <Popup className="afat-popup">
                <SignalPopup point={point} fallback="Hazard signal" />
              </Popup>
            </CircleMarker>
          );
        })}

        {vehicleSignals.map((point, idx) => {
          const position = pointToLatLng(point);
          if (!position) return null;
          return (
            <CircleMarker
              key={`vehicle-${point.id || point.updated_at || idx}`}
              center={position}
              radius={7}
              pathOptions={{ color: '#60a5fa', fillColor: '#1d4ed8', fillOpacity: 0.72, weight: 2 }}
            >
              <Popup className="afat-popup">
                <SignalPopup point={point} fallback="Verified sentinel" />
              </Popup>
            </CircleMarker>
          );
        })}

        {checkpoints.map((point, idx) => {
          const position = pointToLatLng(point);
          if (!position) return null;
          return (
            <CircleMarker
              key={`checkpoint-${point.id || point.name || idx}`}
              center={position}
              radius={6}
              pathOptions={{ color: '#22d3ee', fillColor: '#0891b2', fillOpacity: 0.65, weight: 2 }}
            >
              <Popup className="afat-popup">
                <SignalPopup point={point} fallback="Checkpoint" />
              </Popup>
            </CircleMarker>
          );
        })}

        {primaryLatLng && (
          <CircleMarker
            center={primaryLatLng}
            radius={13}
            pathOptions={{ color: '#34d399', fillColor: '#10b981', fillOpacity: 0.42, weight: 3 }}
          >
            <Popup className="afat-popup">
              <SignalPopup point={primaryVehicle || {}} fallback="Primary dispatch" />
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.14),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.38))]" />

      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Activity className="h-4 w-4 text-emerald-400" />
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">Dispatch Map</p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {driveMode ? 'Live drive feed' : role === 'admin' ? 'Fleet intelligence' : role === 'planner' ? 'Planning intelligence' : 'Passenger view'}
          </p>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Radio className="h-4 w-4 animate-pulse text-blue-400" />
        <div className="text-right">
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">
            {realtimeOverlay ? 'Live sync' : 'Feed sync'}
          </p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {activeSignalCount} active signals
          </p>
        </div>
      </div>

      {allSignals.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-8 text-center">
          <div className="max-w-xs rounded-[24px] border border-white/10 bg-black/55 px-5 py-4 backdrop-blur-xl">
            <Wifi className="mx-auto mb-2 h-5 w-5 text-blue-400" />
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white">Waiting for live dispatch</p>
            <p className="mt-1 text-[10px] font-medium text-white/45">
              The map stays online and will hydrate as telemetry, vehicles, or reports arrive.
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-blue-300">{vehicleSignals.length}</span> moving nodes
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-emerald-300">{hazardSignals.length}</span> hazard signals
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl">
          <span className="text-cyan-300">{checkpoints.length}</span> checkpoints
        </div>
        {driveMode && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-xl">
            live dispatch feed
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45 backdrop-blur-xl">
          {mapMode === 'satellite' || mapMode === 'hybrid' ? <Navigation2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {mapMode}
        </div>
      </div>

      {hazardSignals.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-red-400/20">
          <ShieldAlert className="h-24 w-24" />
        </div>
      )}
    </div>
  );
}
