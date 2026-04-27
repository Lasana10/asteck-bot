import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { Info, Layers, Flame, Activity, Sun, Moon, Satellite, Map as MapIconLucide, Navigation, Shield, AlertTriangle, Radio, Eye, Crosshair, MapPin } from 'lucide-react';
import { supabase, getAvailableVehicles } from '../../supabaseClient';
import { mapOfflineService } from '../../services/MapOfflineService';

// Fix for default marker icons in Leaflet + React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Interfaces ──────────────────────────────────────────────
interface Incident {
  id: string;
  type: string;
  latitude: number;
  longitude: number;
  description: string;
  severity: number;
  status?: 'pending' | 'verified' | 'expired' | 'false';
  address?: string;
  created_at?: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  type: string;
  current_lat: number | null;
  current_lng: number | null;
  rating: number;
  current_speed?: number;
}

interface Checkpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'police' | 'toll' | 'fuel' | 'rest' | 'waypoint';
}

interface Props {
  incidents: Incident[];
  tracks?: any[];
  center?: [number, number];
  zoom?: number;
  mode?: 'standard' | 'satellite' | 'hybrid' | 'intel';
  showInformal?: boolean;
  role?: 'commuter' | 'operator' | 'admin';
  driveMode?: boolean;
  trackedVehicle?: Vehicle | null;
  checkpoints?: Checkpoint[];
  routePath?: [number, number][];
}

// ═══════════════════════════════════════════════════════════════
//  SENTINEL ATLAS — Tile Layer System (GTA S.A.R. Inspired)
//  Satellite detail + Atlas coloring + Crisp Road vectors
// ═══════════════════════════════════════════════════════════════

const TILE_PROVIDERS = {
  // ── "Sentinel Atlas" — Our UNIQUE signature tile ──
  // Fuses satellite imagery with atlas-colored road labels
  sentinel: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Esri Satellite | &copy; CARTO Atlas | AFAT Sentinel',
    label: 'Atlas',
    icon: Eye,
  },
  // ── Clean daytime vector ──
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    overlay: null,
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/">OSM</a>',
    label: 'Clean',
    icon: Sun,
  },
  // ── Night tactical ──
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    overlay: null,
    attribution: '&copy; CARTO',
    label: 'Night',
    icon: Moon,
  },
  // ── Raw satellite ──
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Esri',
    label: 'SAT',
    icon: Satellite,
  },
  // ── High-detail OSM ──
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    overlay: null,
    attribution: '&copy; OpenStreetMap contributors',
    label: 'OSM',
    icon: MapIconLucide,
  },
} as const;

type TileStyle = keyof typeof TILE_PROVIDERS;

// ═══════════════════════════════════════════════════════════════
//  INCIDENT CLASSIFICATION — GTA-Style Blip System
// ═══════════════════════════════════════════════════════════════

const INCIDENT_META: Record<string, { color: string; emoji: string; label: string; priority: string }> = {
  accident:        { color: '#ef4444', emoji: '💥', label: 'ACCIDENT',        priority: 'CRITICAL' },
  road_awareness:  { color: '#3b82f6', emoji: '🛡️', label: 'VIGILANCE',      priority: 'HIGH' },
  traffic_jam:     { color: '#f59e0b', emoji: '🚗', label: 'EMBOUTEILLAGE',  priority: 'MEDIUM' },
  flooding:        { color: '#06b6d4', emoji: '🌊', label: 'INONDATION',     priority: 'HIGH' },
  road_damage:     { color: '#f97316', emoji: '🕳️', label: 'ROUTE ENDOM.',   priority: 'MEDIUM' },
  road_works:      { color: '#a855f7', emoji: '🚧', label: 'TRAVAUX',        priority: 'LOW' },
  hazard:          { color: '#eab308', emoji: '⚠️', label: 'DANGER',         priority: 'HIGH' },
  protest:         { color: '#ec4899', emoji: '📢', label: 'MANIFESTATION',  priority: 'HIGH' },
  roadblock:       { color: '#dc2626', emoji: '🚫', label: 'BARRAGE',        priority: 'CRITICAL' },
  sos:             { color: '#ff0000', emoji: '🆘', label: 'SOS',            priority: 'CRITICAL' },
  other:           { color: '#94a3b8', emoji: '📍', label: 'SIGNAL',         priority: 'LOW' },
};

// ── Road Styling (Atlas-style crisp roads with glow) ──
const ROAD_COLORS: Record<string, string> = {
  trunk: '#e67e22', primary: '#3498db', secondary: '#27ae60',
  tertiary: '#8e44ad', residential: '#7f8c8d', default: '#95a5a6'
};
const CONGESTION_COLORS: Record<string, string> = {
  critical: '#e74c3c', high: '#e67e22', medium: '#f39c12', low: '#2ecc71'
};

// ═══════════════════════════════════════════════════════════════
//  VEHICLE BLIPS — GTA-Style Distinctive Icons
// ═══════════════════════════════════════════════════════════════

const VEHICLE_DEFS: Record<string, { color: string; bg: string; label: string; svg: string }> = {
  moto: {
    color: '#22c55e', bg: '#052e16', label: 'Bendskin',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round"><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 18V6l4 4"/><path d="M8 18h3"/></svg>`
  },
  taxi: {
    color: '#f59e0b', bg: '#451a03', label: 'Taxi Ville',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="7" rx="2"/><path d="M6 18v2"/><path d="M18 18v2"/><path d="M7 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/><circle cx="8" cy="15" r="1" fill="#f59e0b"/><circle cx="16" cy="15" r="1" fill="#f59e0b"/></svg>`
  },
  minibus: {
    color: '#a855f7', bg: '#3b0764', label: 'Cargo',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 18v2"/><path d="M18 18v2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`
  },
  bus: {
    color: '#6366f1', bg: '#1e1b4b', label: 'VIP Express',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 20v2"/><path d="M16 20v2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/></svg>`
  },
  private: {
    color: '#64748b', bg: '#1e293b', label: 'Private',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="7" rx="2"/><path d="M7 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/></svg>`
  },
};

// ── POI Category System ──
const POI_META: Record<string, { color: string; emoji: string; label: string }> = {
  transport:     { color: '#3b82f6', emoji: '🚏', label: 'Transport Hub' },
  market:        { color: '#f59e0b', emoji: '🏪', label: 'Marché' },
  junction:      { color: '#8b5cf6', emoji: '🔀', label: 'Carrefour' },
  landmark:      { color: '#ec4899', emoji: '🏛️', label: 'Landmark' },
  health:        { color: '#ef4444', emoji: '🏥', label: 'Hôpital' },
  education:     { color: '#10b981', emoji: '🎓', label: 'École' },
  sport:         { color: '#06b6d4', emoji: '⚽', label: 'Sport' },
  neighborhood:  { color: '#64748b', emoji: '🏘️', label: 'Quartier' },
};

// ── Checkpoint Icons ──
const CHECKPOINT_META: Record<string, { color: string; emoji: string; label: string }> = {
  police:   { color: '#3b82f6', emoji: '🚔', label: 'Contrôle Police' },
  toll:     { color: '#f59e0b', emoji: '💰', label: 'Péage' },
  fuel:     { color: '#22c55e', emoji: '⛽', label: 'Station Essence' },
  rest:     { color: '#8b5cf6', emoji: '☕', label: 'Aire de Repos' },
  waypoint: { color: '#06b6d4', emoji: '📍', label: 'Waypoint' },
};

// ═══════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom]);
  return null;
}

// ── Driver Tracking (Drive Mode) ──
function DriverTrackingCamera({ vehicle, active }: { vehicle?: Vehicle | null, active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (active && vehicle?.current_lat && vehicle?.current_lng) {
      map.flyTo([vehicle.current_lat, vehicle.current_lng], 17, {
        animate: true, duration: 1.5, easeLinearity: 0.25
      });
    }
  }, [vehicle?.current_lat, vehicle?.current_lng, active, map]);

  if (!active || !vehicle?.current_lat) return null;

  // GTA-style "you are here" blip — pulsing blue circle around the vehicle
  return (
    <>
      <CircleMarker
        center={[vehicle.current_lat, vehicle.current_lng]}
        radius={60}
        pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.08, color: '#3b82f6', weight: 1.5, className: 'animate-pulse' }}
      />
      <CircleMarker
        center={[vehicle.current_lat, vehicle.current_lng]}
        radius={25}
        pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.15, color: '#60a5fa', weight: 2 }}
      />
    </>
  );
}

function Heatmap({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    // @ts-ignore
    const heat = L.heatLayer(points, {
      radius: 25, blur: 15, maxZoom: 17,
      gradient: { 0.4: '#60a5fa', 0.65: '#fbbf24', 1: '#ef4444' }
    }).addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, points]);
  return null;
}

// ── Sentinel Grid Overlay (subtle tactical grid on every map) ──
function GridOverlay() {
  const map = useMap();
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    const updateCenter = () => { const c = map.getCenter(); setCenter([c.lat, c.lng]); };
    updateCenter();
    map.on('move', updateCenter);
    return () => { map.off('move', updateCenter); };
  }, [map]);

  if (!center) return null;

  return (
    <>
      <CircleMarker
        center={center}
        radius={200}
        pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.03, color: '#3b82f6', weight: 0.5, className: 'animate-radar' }}
      />
      <div className="absolute inset-0 pointer-events-none z-[400] opacity-[0.06]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hex-grid" width="100" height="173.2" patternUnits="userSpaceOnUse" patternTransform="scale(0.5)">
              <path d="M50 0 L100 28.8 L100 86.6 L50 115.4 L0 86.6 L0 28.8 Z" fill="none" stroke="#60a5fa" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
        </svg>
      </div>
    </>
  );
}

function getRoadStyle(feature: any) {
  const hw = feature?.properties?.highway || 'default';
  const surface = feature?.properties?.surface || 'paved';
  const congestion = feature?.properties?.congestion;

  const baseColor = congestion
    ? CONGESTION_COLORS[congestion] || ROAD_COLORS[hw] || ROAD_COLORS.default
    : ROAD_COLORS[hw] || ROAD_COLORS.default;

  const weight = hw === 'trunk' ? 5 : hw === 'primary' ? 4 : hw === 'secondary' ? 3 : hw === 'tertiary' ? 2.5 : 1.5;
  const dashArray = surface === 'unpaved' ? '6, 4' : undefined;
  const opacity = hw === 'residential' ? 0.6 : 0.85;

  return { color: baseColor, weight, dashArray, opacity, lineCap: 'round' as const, lineJoin: 'round' as const };
}

// ── Time of day helper ──
function getTimeLabel(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'MORNING';
  if (h >= 12 && h < 17) return 'AFTERNOON';
  if (h >= 17 && h < 21) return 'EVENING';
  return 'NIGHT';
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT — The Sentinel Atlas
// ═══════════════════════════════════════════════════════════════

export function InteractiveMap({
  incidents,
  tracks = [],
  center = [3.848, 11.502],
  zoom = 13,
  role = 'commuter',
  driveMode = false,
  trackedVehicle = null,
  checkpoints = [],
  routePath = [],
}: Props) {

  const getAdaptiveTile = (): TileStyle => {
    // Return our critically acclaimed Sentinel (Satellite + Smart UI) balance by default for everyone.
    // We do not force 'dark' at night or 'voyager' during the day anymore,
    // so no one gets blinded, and we rely on the user choosing from the Map controls if they want to switch.
    return 'sentinel';
  };

  const [tileStyle, setTileStyle] = useState<TileStyle>(getAdaptiveTile());
  const [showTilePicker, setShowTilePicker] = useState(false);
  const [roadData, setRoadData] = useState<any>(null);
  const [poiData, setPoiData] = useState<any>(null);
  const [showRoads, setShowRoads] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showIncidentHeatmap, setShowIncidentHeatmap] = useState(true);
  const [showTrafficHeatmap, setShowTrafficHeatmap] = useState(true);
  const [showCheckpoints, setShowCheckpoints] = useState(true);
  const [activeVehicles, setActiveVehicles] = useState<Vehicle[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [proprietaryLandmarks, setProprietaryLandmarks] = useState<any[]>([]);

  // ═══ GTA-STYLE ICON FACTORIES ═══

  // Incident blips — diamond shape with glow ring
  const getIncidentIcon = useCallback((type: string, severity: number = 3, status: string = 'verified') => {
    const meta = INCIDENT_META[type] || INCIDENT_META.other;
    const size = 30 + severity * 4;
    const isPending = status === 'pending';
    const glowSize = size + 10;

    return L.divIcon({
      className: 'afat-incident-marker',
      html: `<div style="position:relative; width:${glowSize}px; height:${glowSize}px; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; inset:0; background:${meta.color}; opacity:0.15; border-radius:50%; animation:pulse 2s infinite;"></div>
        <div style="
          width:${size}px; height:${size}px; 
          background: linear-gradient(135deg, ${meta.color}, ${meta.color}dd);
          border: 2px solid rgba(255,255,255,${isPending ? 0.3 : 0.9});
          border-radius: 6px;
          transform: rotate(45deg);
          box-shadow: 0 0 20px ${meta.color}88, 0 0 40px ${meta.color}44;
          display:flex; align-items:center; justify-content:center;
          ${isPending ? 'opacity:0.5; border-style:dashed;' : ''}
        ">
          <span style="transform:rotate(-45deg); font-size:${size * 0.45}px; line-height:1;">${meta.emoji}</span>
        </div>
      </div>`,
      iconSize: [glowSize, glowSize],
      iconAnchor: [glowSize / 2, glowSize / 2],
    });
  }, []);

  // Vehicle blips — rounded square with colored border (GTA radar style)
  const getVehicleIcon = useCallback((type: string) => {
    const def = VEHICLE_DEFS[type] || VEHICLE_DEFS.private;
    return L.divIcon({
      className: 'afat-vehicle-marker',
      html: `<div style="position:relative;">
        <div style="position:absolute; inset:-4px; background:${def.color}; opacity:0.15; border-radius:14px; animation:pulse 3s infinite;"></div>
        <div style="
          background: ${def.bg};
          width: 36px; height: 36px; border-radius: 10px;
          border: 2.5px solid ${def.color};
          box-shadow: 0 0 15px ${def.color}66, 0 2px 8px rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; padding: 5px;
          position: relative;
        ">${def.svg}
        <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:${def.bg};border:1px solid ${def.color}55;border-radius:4px;padding:0 4px;white-space:nowrap;">
          <span style="font-size:7px;font-weight:900;color:${def.color};letter-spacing:0.5px;">${def.label.toUpperCase()}</span>
        </div>
        </div>
      </div>`,
      iconSize: [36, 44],
      iconAnchor: [18, 22],
    });
  }, []);

  // POI blips — circle with emoji
  const getPoiIcon = useCallback((category: string) => {
    const meta = POI_META[category] || POI_META.neighborhood;
    return L.divIcon({
      className: 'afat-poi-marker',
      html: `<div style="
        width:22px; height:22px; border-radius:50%;
        background: ${meta.color}33;
        border: 2px solid ${meta.color};
        display:flex; align-items:center; justify-content:center;
        box-shadow: 0 0 8px ${meta.color}44;
        font-size:11px; line-height:1;
      ">${meta.emoji}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }, []);

  // Checkpoint blips — hexagonal style
  const getCheckpointIcon = useCallback((type: string) => {
    const meta = CHECKPOINT_META[type] || CHECKPOINT_META.waypoint;
    return L.divIcon({
      className: 'afat-checkpoint-marker',
      html: `<div style="position:relative;">
        <div style="
          width:32px; height:32px;
          background: linear-gradient(180deg, ${meta.color}cc, ${meta.color});
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          display:flex; align-items:center; justify-content:center;
          box-shadow: 0 0 12px ${meta.color}66;
        "><span style="font-size:14px;">${meta.emoji}</span></div>
        <div style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#0f172a;border:1px solid ${meta.color}88;border-radius:4px;padding:1px 6px;white-space:nowrap;">
          <span style="font-size:7px;font-weight:900;color:${meta.color};letter-spacing:0.5px;text-transform:uppercase;">${meta.label}</span>
        </div>
      </div>`,
      iconSize: [32, 42],
      iconAnchor: [16, 21],
    });
  }, []);

  // ═══ DATA LOADING ═══

  useEffect(() => {
    fetch('/data/yaounde_roads.geojson').then(res => res.json()).then(data => setRoadData(data)).catch(() => {});
    fetch('/data/yaounde_pois.geojson').then(res => res.json()).then(data => setPoiData(data)).catch(() => {});

    const fetchProprietaryLandmarks = async () => {
      const { data } = await supabase.from('landmark_inventory').select('*').limit(100);
      if (data) setProprietaryLandmarks(data);
    };
    fetchProprietaryLandmarks();

    const fetchVehiclesInternal = async () => {
      const { data } = await getAvailableVehicles();
      if (data && data.length > 0) setActiveVehicles(data as Vehicle[]);
      else setActiveVehicles([
        { id: '1', plate_number: 'CE 1234 AB', type: 'taxi', current_lat: 3.866, current_lng: 11.514, rating: 4.8, current_speed: 42 },
        { id: '2', plate_number: 'CE 5678 CD', type: 'moto', current_lat: 3.860, current_lng: 11.497, rating: 4.5, current_speed: 55 },
        { id: '3', plate_number: 'LT 9012 EF', type: 'minibus', current_lat: 3.846, current_lng: 11.492, rating: 4.9, current_speed: 28 },
        { id: '4', plate_number: 'CE 3456 GH', type: 'bus', current_lat: 3.855, current_lng: 11.508, rating: 4.7, current_speed: 35 },
        { id: '5', plate_number: 'LT 7890 IJ', type: 'taxi', current_lat: 3.840, current_lng: 11.520, rating: 4.6, current_speed: 60 },
      ]);
    };
    fetchVehiclesInternal();

    const channel = supabase.channel('v-r').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => fetchVehiclesInternal()).subscribe();

    // Listen for online/offline
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeTile = TILE_PROVIDERS[tileStyle];

  // ═══ RENDER ═══

  return (
    <div className={`w-full h-full relative overflow-hidden border border-white/5 shadow-2xl sentinel-atlas-container ${driveMode ? 'rounded-none' : 'rounded-3xl'}`}>
      <MapContainer
        center={center}
        zoom={driveMode ? 17 : zoom}
        className="w-full h-full z-0"
        zoomControl={false}
        scrollWheelZoom={true}
        dragging={true}
      >
        <GridOverlay />
        <DriverTrackingCamera vehicle={trackedVehicle} active={driveMode} />

        {/* ═══ TILE LAYERS — S.A.R. System ═══ */}
        {driveMode ? (
          <>
            {/* Drive Mode: Satellite base + atlas labels = crystal clear road guidance */}
            <TileLayer url={TILE_PROVIDERS.satellite.url} maxZoom={20} />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png" opacity={0.9} />
          </>
        ) : (
          <>
            <TileLayer url={activeTile.url} attribution={activeTile.attribution} maxZoom={19} />
            {/* S.A.R. overlay: atlas-colored labels on top of satellite */}
            {(activeTile as any).overlay && (
              <TileLayer url={(activeTile as any).overlay} opacity={0.85} />
            )}
          </>
        )}

        {!driveMode && <ChangeView center={center} zoom={zoom} />}

        {/* ═══ GeoJSON Road Network ═══ */}
        {showRoads && roadData && (
          <GeoJSON
            data={roadData}
            style={(f) => getRoadStyle(f)}
            onEachFeature={(f, l) => {
              if (f.properties?.name) {
                const hw = f.properties.highway || 'road';
                const surface = f.properties.surface || 'paved';
                l.bindTooltip(
                  `<div style="font-family:Inter,sans-serif;">
                    <div style="font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:1px;">${f.properties.name}</div>
                    <div style="font-size:9px;opacity:0.6;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px;">${hw} • ${surface}</div>
                  </div>`,
                  { sticky: true, className: 'afat-road-tooltip' }
                );
              }
            }}
          />
        )}

        {/* ═══ Sentinel Proprietary Landmarks ═══ */}
        {showPOIs && proprietaryLandmarks.map((poi, i) => (
          <Marker key={`prop-${i}`} position={[poi.latitude, poi.longitude]} icon={L.divIcon({
            className: 'sentinel-verified-marker',
            html: `<div style="position:relative;">
              <div style="position:absolute; inset:-4px; background:#fbbf24; opacity:0.1; border-radius:50%; animation:pulse 2s infinite;"></div>
              <div style="
                width:24px; height:24px; border-radius:6px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                border: 2px solid #fff;
                box-shadow: 0 0 10px rgba(245,158,11,0.5);
                display:flex; align-items:center; justify-content:center;
                color: #fff; font-size:12px; font-weight:900;
                transform: rotate(45deg);
              "><div style="transform:rotate(-45deg)">✨</div></div>
            </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })}>
            <Popup className="afat-popup">
              <div className="p-4 bg-slate-900/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl text-white min-w-[200px] shadow-2xl">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">✨</div>
                  <div>
                    <p className="font-black text-[13px] uppercase tracking-tight">{poi.name}</p>
                    <p className="text-[9px] text-amber-400 font-black uppercase tracking-widest">Sentinel Verified Node</p>
                  </div>
                </div>
                <p className="text-[11px] text-white/60 mt-1">{poi.description}</p>
                <div className="mt-3 py-1.5 px-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-[8px] text-amber-400 font-black uppercase tracking-widest">Confiance: {poi.trust_score}%</p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ═══ POI Markers (Standard OSM) ═══ */}
        {showPOIs && poiData && (poiData as any).features?.map((poi: any, i: number) => {
          const meta = POI_META[poi.properties?.category] || POI_META.neighborhood;
          return (
            <Marker key={`p-${i}`} position={[poi.geometry.coordinates[1], poi.geometry.coordinates[0]]} icon={getPoiIcon(poi.properties?.category)}>
              <Popup className="afat-popup">
                <div className="p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl text-white min-w-[200px] shadow-2xl">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{meta.emoji}</span>
                    <div>
                      <p className="font-black text-[13px] uppercase tracking-tight">{poi.properties?.name}</p>
                      <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">{meta.label}</p>
                    </div>
                  </div>
                  {poi.properties?.description && (
                    <p className="text-[11px] text-white/60 mt-1">{poi.properties.description}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ═══ Incident Heatmap ═══ */}
        {showIncidentHeatmap && <Heatmap points={incidents.map(inc => [inc.latitude, inc.longitude, inc.severity / 5])} />}

        {/* ═══ INCIDENT MARKERS — Rich "Fertile Data" Popups ═══ */}
        {incidents.filter(inc => inc.status !== 'false').map(inc => {
          const meta = INCIDENT_META[inc.type] || INCIDENT_META.other;
          const timeAgo = inc.created_at
            ? `${Math.round((Date.now() - new Date(inc.created_at).getTime()) / 60000)}min ago`
            : 'Recent';

          return (
            <Marker key={inc.id} position={[inc.latitude, inc.longitude]} icon={getIncidentIcon(inc.type, inc.severity, inc.status || 'pending')}>
              <Popup className="afat-popup" maxWidth={300}>
                <div className="p-0 min-w-[260px]">
                  {/* Header bar with incident color */}
                  <div style={{ background: meta.color }} className="px-4 py-3 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="font-black text-white text-[12px] uppercase tracking-widest">{meta.label}</span>
                    </div>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[8px] font-black text-white uppercase tracking-wider">{meta.priority}</span>
                  </div>
                  {/* Data body */}
                  <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-b-2xl border border-white/10 border-t-0">
                    <p className="text-[12px] text-white/80 mb-3 leading-relaxed">{inc.description || 'Signalé par un citoyen du réseau.'}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Sévérité</p>
                        <p className="text-[14px] font-black text-white">{inc.severity}/5</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Status</p>
                        <p className="text-[10px] font-black text-emerald-400 uppercase">{inc.status || 'LIVE'}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Signal</p>
                        <p className="text-[10px] font-black text-blue-400">{timeAgo}</p>
                      </div>
                    </div>
                    {inc.address && (
                      <div className="mt-2 flex items-center gap-2 bg-white/5 rounded-lg p-2">
                        <MapPin className="w-3 h-3 text-white/40 shrink-0" />
                        <p className="text-[10px] text-white/50 truncate">{inc.address}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ═══ VEHICLE MARKERS — Rich Data Cards ═══ */}
        {activeVehicles.map(v => {
          const def = VEHICLE_DEFS[v.type] || VEHICLE_DEFS.private;
          return (
            <Marker key={v.id} position={[v.current_lat!, v.current_lng!]} icon={getVehicleIcon(v.type)}>
              <Popup className="afat-popup" maxWidth={280}>
                <div className="p-0 min-w-[240px]">
                  <div style={{ background: def.bg, borderBottom: `2px solid ${def.color}` }} className="px-4 py-3 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div style={{ border: `2px solid ${def.color}` }} className="w-8 h-8 rounded-lg flex items-center justify-center" dangerouslySetInnerHTML={{ __html: def.svg.replace('width="2.5"', 'width="2"') }} />
                      <div>
                        <p className="font-black text-white text-[14px] tracking-tight">{v.plate_number}</p>
                        <p style={{ color: def.color }} className="text-[9px] font-black uppercase tracking-widest">{def.label}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-b-2xl border border-white/10 border-t-0">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Vitesse</p>
                        <p className="text-[14px] font-black text-white">{v.current_speed || '—'} <span className="text-[8px] text-white/40">km/h</span></p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Trust</p>
                        <p className="text-[14px] font-black text-amber-400">{v.rating}★</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/30 font-black uppercase">Signal</p>
                        <p className="text-[10px] font-black text-emerald-400 uppercase">LIVE</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ═══ CHECKPOINT MARKERS (Driver Guide) ═══ */}
        {showCheckpoints && checkpoints.map(cp => (
          <Marker key={cp.id} position={[cp.lat, cp.lng]} icon={getCheckpointIcon(cp.type)}>
            <Popup className="afat-popup">
              <div className="p-3 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl text-white min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{CHECKPOINT_META[cp.type]?.emoji || '📍'}</span>
                  <div>
                    <p className="font-black text-[12px] uppercase">{cp.name}</p>
                    <p className="text-[9px] text-white/40 font-bold uppercase">{CHECKPOINT_META[cp.type]?.label || 'Checkpoint'}</p>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ═══ ROUTE PATH (Driver Guide Polyline) ═══ */}
        {routePath.length > 1 && (
          <Polyline
            positions={routePath}
            pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.8, dashArray: '12, 8', lineCap: 'round' }}
          />
        )}

      </MapContainer>

      {/* ═══ SENTINEL ATLAS HUD OVERLAY ═══ */}

      {/* Top-left: Network Status Badge */}
      <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'} shadow-[0_0_8px_currentColor]`} />
            <p className="text-[8px] font-black text-white/50 uppercase tracking-[0.2em]">{isOfflineMode ? 'Offline Grid' : 'Sentinel Live'}</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="text-center">
              <p className="text-[16px] font-black text-white leading-none">{activeVehicles.length}</p>
              <p className="text-[7px] text-blue-400 font-black uppercase">Nodes</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-[16px] font-black text-white leading-none">{incidents.filter(i => i.status !== 'false').length}</p>
              <p className="text-[7px] text-orange-400 font-black uppercase">Events</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-black text-emerald-400 leading-none uppercase">{getTimeLabel()}</p>
              <p className="text-[7px] text-white/30 font-black uppercase">Period</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top-right: Map Settings & Controls */}
      {!driveMode && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000] items-end">
          
          {/* Tile Style Picker */}
          <div className="relative flex justify-end">
            {showTilePicker && (
              <div className="absolute top-0 right-12 bg-black/80 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl flex gap-1.5 animate-in slide-in-from-right-2 shadow-2xl mr-2">
                {Object.entries(TILE_PROVIDERS).map(([k, v]) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={k}
                      onClick={() => { setTileStyle(k as TileStyle); setShowTilePicker(false); }}
                      className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition-all min-w-[52px] ${tileStyle === k ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-105' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase tracking-wider">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={() => setShowTilePicker(!showTilePicker)} title="Change Map Type" className="bg-black/70 backdrop-blur-xl border border-white/10 w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-2xl hover:scale-105 transition-all active:scale-95">
              <MapIconLucide className="w-4 h-4" />
            </button>
          </div>

          {/* Layer Toggles */}
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 rounded-xl flex flex-col gap-1 shadow-2xl">
            <button onClick={() => setShowRoads(!showRoads)} title="Roads" className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${showRoads ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:bg-white/5'}`}><Layers className="w-4 h-4" /></button>
            <button onClick={() => setShowPOIs(!showPOIs)} title="POIs" className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${showPOIs ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400 hover:bg-white/5'}`}><MapPin className="w-4 h-4" /></button>
            <button onClick={() => setShowIncidentHeatmap(!showIncidentHeatmap)} title="Heatmap" className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${showIncidentHeatmap ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-400 hover:bg-white/5'}`}><Flame className="w-4 h-4" /></button>
            <button onClick={() => setShowCheckpoints(!showCheckpoints)} title="Checkpoints" className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${showCheckpoints ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:bg-white/5'}`}><Shield className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Bottom-right: Legend (compact, visible in overview) */}
      {!driveMode && incidents.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000]">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl max-w-[180px]">
            <p className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Active Events</p>
            <div className="space-y-1.5">
              {Object.entries(
                incidents.reduce((acc, inc) => {
                  const key = inc.type;
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).slice(0, 4).map(([type, count]) => {
                const meta = INCIDENT_META[type] || INCIDENT_META.other;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <div style={{ background: meta.color }} className="w-2.5 h-2.5 rounded-sm rotate-45 shrink-0" />
                    <span className="text-[9px] font-bold text-white/60 flex-1 truncate uppercase">{meta.label}</span>
                    <span className="text-[10px] font-black text-white">{count as number}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Drive Mode: Bottom gradient + Sentinel bar */}
      {driveMode && (
        <div className="absolute inset-0 pointer-events-none z-[800]">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent"></div>
        </div>
      )}

      {/* Offline indicator */}
      {isOfflineMode && (
        <div className="absolute bottom-16 right-4 z-[1000] bg-amber-500/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 shadow-2xl">
          <span className="text-[9px] font-black text-white uppercase tracking-widest animate-pulse">Offline Grid Active</span>
        </div>
      )}
    </div>
  );
}
