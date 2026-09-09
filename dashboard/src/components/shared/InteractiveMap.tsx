import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, MapPin, Navigation2, Radio, ShieldAlert, Wifi } from 'lucide-react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
} from 'maplibre-gl';
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

const DEFAULT_CENTER: [number, number] = [11.514, 3.866];

const BASEMAPS = {
  standard: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
  },
  hybrid: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
  },
  intel: {
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors © CARTO',
  },
} as const;

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

function popupNode(point: PointLike, fallback: string) {
  const root = document.createElement('div');
  root.className = 'min-w-[180px] bg-slate-950 p-3 text-white';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'text-[10px] font-black uppercase tracking-[0.22em] text-white/40';
  eyebrow.textContent = point.type || point.source || fallback;
  const title = document.createElement('p');
  title.className = 'mt-1 text-sm font-black text-white';
  title.textContent = markerLabel(point, fallback);
  const detail = document.createElement('p');
  detail.className = 'mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50';
  const fields = [`Severity ${point.severity || 1}`, point.status || 'verified'];
  if (point.current_speed !== undefined) fields.push(`${Math.round(Number(point.current_speed))} km/h`);
  if (point.source) fields.push(point.source);
  detail.textContent = fields.join(' · ');
  root.append(eyebrow, title, detail);
  return root;
}

function markerElement(color: string, size: number, ring = false) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', 'AFAT map signal');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = '9999px';
  el.style.background = color;
  el.style.border = ring ? '3px solid #34d399' : '2px solid rgba(255,255,255,.82)';
  el.style.boxShadow = '0 4px 18px rgba(0,0,0,.45)';
  el.style.cursor = 'pointer';
  return el;
}

function lineFeature(points: PointLike[]) {
  const coordinates = points.map(extractPoint).filter(Boolean).map((p) => [p!.longitude, p!.latitude]);
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };
}

export function InteractiveMap({
  incidents = [], tracks = [], routePath = [], checkpoints = [], trackedVehicle = null,
  driveMode = false, showInformal = false, role = 'commuter', mapMode = 'standard', realtimeOverlay = false,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
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
      setLiveVehicles((prev) => [nextVehicle, ...prev.filter((item) => item.id !== nextVehicle.id && item.id !== nextVehicle.vehicle_id)].slice(0, 20));
    });
    const movementChannel = subscribeToMovementLogs((payload) => {
      const nextMovement = payload?.new;
      if (nextMovement) setLiveTracks((prev) => [nextMovement, ...prev].slice(0, 24));
    });
    void Promise.all([
      supabase.from('vehicles').select('*').eq('is_available', true).limit(20),
      supabase.from('movement_logs').select('*').order('timestamp', { ascending: false }).limit(12),
    ]).then(([vehiclesResult, movementResult]) => {
      if (vehiclesResult.data?.length) setLiveVehicles(vehiclesResult.data);
      if (movementResult.data?.length) setLiveTracks(movementResult.data);
    });
    return () => {
      supabase.removeChannel(vehiclesChannel);
      supabase.removeChannel(movementChannel);
    };
  }, [realtimeOverlay]);

  const vehicleSignals = useMemo(() => [...tracks, ...liveTracks, ...liveVehicles], [tracks, liveTracks, liveVehicles]);
  const hazardSignals = useMemo(() => incidents, [incidents]);
  const movementSignals = useMemo(() => vehicleSignals.slice(0, 8), [vehicleSignals]);
  const allSignals = useMemo(() => [
    ...hazardSignals, ...vehicleSignals, ...routePath, ...checkpoints, ...(trackedVehicle ? [trackedVehicle] : []),
  ], [hazardSignals, vehicleSignals, routePath, checkpoints, trackedVehicle]);
  const primaryVehicle = trackedVehicle || liveVehicles[0] || tracks[0] || null;
  const activeSignalCount = liveTracks.length + liveVehicles.length + incidents.length;

  useEffect(() => {
    if (!containerRef.current) return;
    const basemap = BASEMAPS[mapMode] || BASEMAPS.standard;
    const map = new MapLibreMap({
      container: containerRef.current,
      center: DEFAULT_CENTER,
      zoom: 13,
      attributionControl: true,
      style: {
        version: 8,
        sources: {
          basemap: { type: 'raster', tiles: [...basemap.tiles], tileSize: 256, attribution: basemap.attribution },
          ...(mapMode === 'hybrid' ? {
            labels: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
          } : {}),
        },
        layers: [
          { id: 'basemap', type: 'raster', source: 'basemap' },
          ...(mapMode === 'hybrid' ? [{ id: 'labels', type: 'raster' as const, source: 'labels', paint: { 'raster-opacity': 0.32 } }] : []),
        ],
      },
    });
    map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');
    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      const addMarker = (point: PointLike, fallback: string, color: string, size: number, ring = false) => {
        const coords = extractPoint(point);
        if (!coords) return;
        const popup = new Popup({ offset: 14 }).setDOMContent(popupNode(point, fallback));
        const marker = new Marker({ element: markerElement(color, size, ring) })
          .setLngLat([coords.longitude, coords.latitude]).setPopup(popup).addTo(map);
        markerRefs.current.push(marker);
      };
      hazardSignals.forEach((p) => addMarker(p, 'Hazard signal', severityColor(p.severity), 14 + Math.min(Number(p.severity || 1), 5)));
      vehicleSignals.forEach((p) => addMarker(p, 'Verified sentinel', '#1d4ed8', 14));
      checkpoints.forEach((p) => addMarker(p, 'Checkpoint', '#0891b2', 13));
      if (primaryVehicle) addMarker(primaryVehicle, 'Primary dispatch', '#10b981', 20, true);

      const upsertLine = (id: string, points: PointLike[], color: string, dashed = false) => {
        const feature = lineFeature(points);
        if (feature.geometry.coordinates.length < 2) return;
        const source = map.getSource(id) as GeoJSONSource | undefined;
        if (source) source.setData(feature);
        else {
          map.addSource(id, { type: 'geojson', data: feature });
          map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': color, 'line-width': dashed ? 4 : 5, 'line-opacity': 0.76, ...(dashed ? { 'line-dasharray': [2, 2] } : {}) } });
        }
      };
      if (showInformal) upsertLine('afat-movement-route', movementSignals, '#34d399', true);
      upsertLine('afat-route', routePath, '#38bdf8');

      const coords = allSignals.map(extractPoint).filter(Boolean);
      if (!coords.length) map.easeTo({ center: DEFAULT_CENTER, zoom: 13 });
      else if (coords.length === 1) map.easeTo({ center: [coords[0]!.longitude, coords[0]!.latitude], zoom: 14 });
      else {
        const bounds = new LngLatBounds();
        coords.forEach((p) => bounds.extend([p!.longitude, p!.latitude]));
        map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 500 });
      }
    };
    if (map.loaded()) render(); else map.once('load', render);
  }, [allSignals, checkpoints, hazardSignals, movementSignals, primaryVehicle, routePath, showInformal, vehicleSignals]);

  return (
    <div className="sentinel-atlas-container relative h-full min-h-[260px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.14),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.38))]" />
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Activity className="h-4 w-4 text-emerald-400" />
        <div><p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">Dispatch Map</p><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{driveMode ? 'Live drive feed' : role === 'admin' ? 'Fleet intelligence' : role === 'planner' ? 'Planning intelligence' : 'Passenger view'}</p></div>
      </div>
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
        <Radio className="h-4 w-4 animate-pulse text-blue-400" />
        <div className="text-right"><p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40">{realtimeOverlay ? 'Live sync' : 'Feed sync'}</p><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{activeSignalCount} active signals</p></div>
      </div>
      {allSignals.length === 0 && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-8 text-center"><div className="max-w-xs rounded-[24px] border border-white/10 bg-black/55 px-5 py-4 backdrop-blur-xl"><Wifi className="mx-auto mb-2 h-5 w-5 text-blue-400" /><p className="text-[11px] font-black uppercase tracking-[0.24em] text-white">Waiting for live dispatch</p><p className="mt-1 text-[10px] font-medium text-white/45">The map stays online and will hydrate as telemetry, vehicles, or reports arrive.</p></div></div>}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl"><span className="text-blue-300">{vehicleSignals.length}</span> moving nodes</div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl"><span className="text-emerald-300">{hazardSignals.length}</span> hazard signals</div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/70 backdrop-blur-xl"><span className="text-cyan-300">{checkpoints.length}</span> checkpoints</div>
        {driveMode && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-xl">live dispatch feed</div>}
        <div className="ml-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45 backdrop-blur-xl">{mapMode === 'satellite' || mapMode === 'hybrid' ? <Navigation2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{mapMode}</div>
      </div>
      {hazardSignals.length > 0 && <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-red-400/20"><ShieldAlert className="h-24 w-24" /></div>}
    </div>
  );
}
