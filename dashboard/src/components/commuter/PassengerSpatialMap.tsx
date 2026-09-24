import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Layers3, LocateFixed, MapPin, Navigation2, Route, Satellite, ShieldCheck } from 'lucide-react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  Popup,
} from 'maplibre-gl';
import { routeToLatLngs, type AfatCanonicalRoute } from '../../services/canonicalRouteClient';
import { fetchAtlasNearby, type AtlasEdge, type AtlasNearbyResponse, type AtlasNode } from '../../services/atlasClient';

type SpatialPoint = {
  latitude?: number | null;
  longitude?: number | null;
  name?: string | null;
  instructions?: string | null;
};

type Props = {
  destination?: SpatialPoint | null;
  meetingPoint?: SpatialPoint | null;
  accessPoint?: SpatialPoint | null;
  city?: string | null;
  route?: AfatCanonicalRoute | null;
  routeLoading?: boolean;
  routeMessage?: string | null;
  onOriginResolved?: (origin: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    label: string;
    source?: 'gps' | 'manual';
  }) => void;
};

type MarkerKind = 'origin' | 'destination' | 'meeting' | 'access';
type BasemapMode = 'standard' | 'satellite' | 'intel';

const YAOUNDE_CENTER: [number, number] = [11.514, 3.866];
const DOUALA_CENTER: [number, number] = [9.7043, 4.0511];
const ROUTE_SOURCE_ID = 'afat-canonical-route';
const ROUTE_LAYER_ID = 'afat-canonical-route-line';
const ATLAS_EDGE_SOURCE_ID = 'afat-atlas-edges';
const ATLAS_NODE_SOURCE_ID = 'afat-atlas-nodes';

const BASEMAPS: Record<BasemapMode, { tiles: string[]; attribution: string; opacity: number }> = {
  standard: {
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors © CARTO',
    opacity: 0.82,
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
    opacity: 0.92,
  },
  intel: {
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors © CARTO',
    opacity: 0.92,
  },
};

function validPoint(point?: SpatialPoint | null) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function formatDistance(distanceM?: number) {
  const value = Number(distanceM || 0);
  if (!value) return '';
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
}

function mapCenter(city?: string | null): [number, number] {
  return String(city || '').toLowerCase().includes('douala') ? DOUALA_CENTER : YAOUNDE_CENTER;
}

function markerElement(kind: MarkerKind) {
  const element = document.createElement('div');
  element.setAttribute('aria-label', kind === 'origin' ? 'Your start point' : kind === 'meeting' ? 'Recommended meeting point' : kind === 'access' ? 'Recommended access point' : 'Destination');
  element.style.width = kind === 'meeting' || kind === 'access' ? '22px' : '18px';
  element.style.height = kind === 'meeting' || kind === 'access' ? '22px' : '18px';
  element.style.borderRadius = '9999px';
  element.style.border = '3px solid rgba(255,255,255,0.96)';
  element.style.boxShadow = '0 6px 18px rgba(2,6,23,0.45)';
  element.style.background = kind === 'origin' ? '#38bdf8' : kind === 'meeting' ? '#f59e0b' : kind === 'access' ? '#a78bfa' : '#34d399';
  return element;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char] || char));
}

function popupHtml(title: string, detail?: string | null) {
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(String(detail || ''));
  return `<div style="font:600 12px/1.4 system-ui;color:#0f172a"><strong>${safeTitle}</strong>${safeDetail ? `<br>${safeDetail}` : ''}</div>`;
}

function atlasEdgeCollection(atlas: AtlasNearbyResponse | null) {
  const nodes = new Map<string, AtlasNode>();
  (atlas?.nodes || []).forEach((node) => {
    if (node.id && Number.isFinite(Number(node.latitude)) && Number.isFinite(Number(node.longitude))) nodes.set(node.id, node);
  });

  const features = (atlas?.edges || []).map((edge: AtlasEdge) => {
    const from = edge.from_node_id ? nodes.get(edge.from_node_id) : null;
    const to = edge.to_node_id ? nodes.get(edge.to_node_id) : null;
    if (!from || !to) return null;
    return {
      type: 'Feature' as const,
      properties: {
        id: edge.id,
        name: edge.name || '',
        evidence_status: edge.evidence_status || '',
        confidence: Number(edge.confidence || 0),
        modes: (edge.modes || []).join(','),
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [Number(from.longitude), Number(from.latitude)],
          [Number(to.longitude), Number(to.latitude)],
        ],
      },
    };
  }).filter(Boolean);

  return { type: 'FeatureCollection' as const, features: features as any[] };
}

function atlasNodeCollection(atlas: AtlasNearbyResponse | null) {
  const features = (atlas?.nodes || [])
    .filter((node) => Number.isFinite(Number(node.latitude)) && Number.isFinite(Number(node.longitude)))
    .map((node) => ({
      type: 'Feature' as const,
      properties: {
        id: node.id,
        name: node.canonical_name || node.node_type || 'AFAT place',
        node_type: node.node_type || 'place',
        evidence_status: node.evidence_status || '',
        confidence: Number(node.confidence || 0),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [Number(node.longitude), Number(node.latitude)],
      },
    }));
  return { type: 'FeatureCollection' as const, features };
}

export function PassengerSpatialMap({
  destination,
  meetingPoint,
  accessPoint,
  city = 'yaounde',
  route = null,
  routeLoading = false,
  routeMessage = null,
  onOriginResolved,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const [origin, setOrigin] = useState<(SpatialPoint & { accuracy?: number | null; source?: 'gps' | 'manual' }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('intel');
  const [atlas, setAtlas] = useState<AtlasNearbyResponse | null>(null);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasError, setAtlasError] = useState('');
  const [manualMode, setManualMode] = useState(false);

  const arrivalPoint = useMemo(() => validPoint(meetingPoint) ? meetingPoint : validPoint(accessPoint) ? accessPoint : destination, [meetingPoint, accessPoint, destination]);
  const routePoints = useMemo(() => routeToLatLngs(route), [route]);
  const originPoint = validPoint(origin);
  const destinationPoint = validPoint(destination);
  const meeting = validPoint(meetingPoint);
  const access = validPoint(accessPoint);
  const hasArrival = Boolean(meeting || access || destinationPoint);
  const hasRoute = route?.status === 'ok' && routePoints.length > 1;
  const atlasEdges = useMemo(() => atlasEdgeCollection(atlas), [atlas]);
  const atlasNodes = useMemo(() => atlasNodeCollection(atlas), [atlas]);
  const trustedEdgeCount = atlas?.edges?.length || 0;
  const trustedNodeCount = atlas?.nodes?.length || 0;

  const loadAtlas = async (latitude: number, longitude: number) => {
    setAtlasLoading(true);
    setAtlasError('');
    try {
      const graph = await fetchAtlasNearby({ latitude, longitude, radiusM: 3500, limit: 180 });
      setAtlas(graph);
    } catch (error: any) {
      setAtlas(null);
      setAtlasError(error?.message || 'AFAT Atlas is temporarily unavailable.');
    } finally {
      setAtlasLoading(false);
    }
  };

  useEffect(() => {
    const [longitude, latitude] = mapCenter(city);
    void loadAtlas(latitude, longitude);
  }, [city]);

  useEffect(() => {
    if (!containerRef.current) return;
    const basemap = BASEMAPS[basemapMode];

    const map = new MapLibreMap({
      container: containerRef.current,
      center: mapCenter(city),
      zoom: 13.2,
      attributionControl: true,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'raster',
            tiles: basemap.tiles,
            tileSize: 256,
            attribution: basemap.attribution,
            maxzoom: 19,
          },
        },
        layers: [
          { id: 'afat-background', type: 'background', paint: { 'background-color': basemapMode === 'standard' ? '#d9e3ea' : '#06101a' } },
          { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': basemap.opacity } },
        ],
      },
    });

    map.once('load', () => {
      setMapReady(true);
      window.setTimeout(() => map.resize(), 50);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on('click', (event) => {
      if (!manualMode) return;
      const next = {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
        accuracy: null,
        source: 'manual' as const,
        name: 'Pinned start point',
      };
      setOrigin(next);
      setManualMode(false);
      setLocationMessage('Start point pinned manually. AFAT will treat it as user-selected, not GPS evidence.');
      onOriginResolved?.({
        latitude: next.latitude,
        longitude: next.longitude,
        accuracy: null,
        label: 'Pinned start point',
        source: 'manual',
      });
      void loadAtlas(next.latitude, next.longitude);
    });

    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [basemapMode, city, manualMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const edgeSource = map.getSource(ATLAS_EDGE_SOURCE_ID) as GeoJSONSource | undefined;
    if (edgeSource) edgeSource.setData(atlasEdges as any);
    else {
      map.addSource(ATLAS_EDGE_SOURCE_ID, { type: 'geojson', data: atlasEdges as any });
      map.addLayer({
        id: 'afat-atlas-edge-shadow',
        type: 'line',
        source: ATLAS_EDGE_SOURCE_ID,
        paint: { 'line-color': '#020617', 'line-width': 7, 'line-opacity': 0.45 },
      });
      map.addLayer({
        id: 'afat-atlas-edge-line',
        type: 'line',
        source: ATLAS_EDGE_SOURCE_ID,
        paint: {
          'line-color': [
            'case',
            ['>=', ['get', 'confidence'], 80], '#38bdf8',
            ['>=', ['get', 'confidence'], 60], '#22c55e',
            '#64748b',
          ] as any,
          'line-width': 3.2,
          'line-opacity': 0.82,
        },
      });
    }

    const nodeSource = map.getSource(ATLAS_NODE_SOURCE_ID) as GeoJSONSource | undefined;
    if (nodeSource) nodeSource.setData(atlasNodes as any);
    else {
      map.addSource(ATLAS_NODE_SOURCE_ID, { type: 'geojson', data: atlasNodes as any });
      map.addLayer({
        id: 'afat-atlas-node-halo',
        type: 'circle',
        source: ATLAS_NODE_SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#0f172a',
          'circle-opacity': 0.7,
        },
      });
      map.addLayer({
        id: 'afat-atlas-node-core',
        type: 'circle',
        source: ATLAS_NODE_SOURCE_ID,
        paint: {
          'circle-radius': 3.4,
          'circle-color': '#f8fafc',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#38bdf8',
        },
      });
    }
  }, [atlasEdges, atlasNodes, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const coordinates: [number, number][] = routePoints.map(([latitude, longitude]) => [longitude, latitude]);
    const data = {
      type: 'Feature' as const,
      properties: { evidenceStatus: route?.status || 'unavailable' },
      geometry: { type: 'LineString' as const, coordinates },
    };

    const existingSource = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (existingSource) existingSource.setData(data as any);
    else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: data as any });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#f8fafc',
          'line-width': 7,
          'line-opacity': 0.94,
          'line-blur': 0.2,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'afat-route-accent',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#22d3ee',
          'line-width': 3,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    const addMarker = (kind: MarkerKind, longitude: number, latitude: number, title: string, detail?: string | null) => {
      const marker = new Marker({ element: markerElement(kind), anchor: 'center' })
        .setLngLat([longitude, latitude])
        .setPopup(new Popup({ offset: 18, closeButton: false }).setHTML(popupHtml(title, detail)))
        .addTo(map);
      markerRefs.current.push(marker);
    };

    if (originPoint) addMarker(
      'origin',
      originPoint.longitude,
      originPoint.latitude,
      origin?.source === 'manual' ? 'Pinned start point' : 'Your current position',
      origin?.source === 'manual' ? 'Selected manually' : `GPS accuracy ±${Math.round(Number(origin?.accuracy || 0))} m`,
    );
    if (destinationPoint) addMarker('destination', destinationPoint.longitude, destinationPoint.latitude, destination?.name || 'Destination');
    if (access) addMarker('access', access.longitude, access.latitude, accessPoint?.name || 'Recommended access point', accessPoint?.instructions);
    if (meeting) addMarker('meeting', meeting.longitude, meeting.latitude, meetingPoint?.name || 'Recommended meeting point', meetingPoint?.instructions);

    if (coordinates.length > 1) {
      const bounds = new LngLatBounds();
      coordinates.forEach(([longitude, latitude]) => bounds.extend([longitude, latitude]));
      map.fitBounds(bounds, { padding: 54, maxZoom: 16, duration: 650 });
      return;
    }

    const arrival = validPoint(arrivalPoint);
    if (originPoint && arrival) {
      const bounds = new LngLatBounds();
      bounds.extend([originPoint.longitude, originPoint.latitude]);
      bounds.extend([arrival.longitude, arrival.latitude]);
      map.fitBounds(bounds, { padding: 58, maxZoom: 16, duration: 650 });
      return;
    }

    const single = arrival || originPoint;
    if (single) map.flyTo({ center: [single.longitude, single.latitude], zoom: 16, duration: 650 });
  }, [
    mapReady,
    origin?.latitude,
    origin?.longitude,
    origin?.accuracy,
    origin?.source,
    destination?.latitude,
    destination?.longitude,
    meetingPoint?.latitude,
    meetingPoint?.longitude,
    accessPoint?.latitude,
    accessPoint?.longitude,
    meetingPoint?.instructions,
    meetingPoint?.name,
    accessPoint?.instructions,
    accessPoint?.name,
    destination?.name,
    arrivalPoint,
    routePoints,
    route?.status,
  ]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is unavailable on this device. Pin your start point on the map instead.');
      setManualMode(true);
      return;
    }

    setLocating(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps' as const,
          name: 'Your current position',
        };
        setOrigin(next);
        setLocating(false);
        setLocationMessage(position.coords.accuracy <= 100 ? 'Current position ready.' : 'Position found, but GPS accuracy is broad. You can pin a more precise start point.');
        onOriginResolved?.({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracy: next.accuracy,
          label: `Current position · ±${Math.round(next.accuracy)} m`,
          source: 'gps',
        });
        void loadAtlas(next.latitude, next.longitude);
      },
      () => {
        setLocating(false);
        setManualMode(true);
        setLocationMessage('GPS was not reliable. Tap the map to pin your start point, or search a landmark.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#050b12] shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
      <div className="relative h-[430px] sm:h-[520px]">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="AFAT mobility atlas map" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-slate-950/55 to-transparent" />
        <div className="absolute left-3 top-3 z-20 max-w-[64%] rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            {hasRoute ? <Route className="h-4 w-4 text-cyan-300" /> : <Navigation2 className="h-4 w-4 text-blue-300" />}
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{hasRoute ? 'AFAT route' : 'AFAT Atlas'}</p>
          </div>
          <p className="mt-1 truncate text-sm font-black text-white">{meetingPoint?.name || accessPoint?.name || destination?.name || (String(city).toLowerCase().includes('douala') ? 'Douala' : 'Yaoundé')}</p>
          {hasRoute && <p className="mt-1 text-[11px] font-bold text-cyan-100/85">{formatDistance(route?.distance_m)} · {route?.eta_seconds ? `${Math.ceil(route.eta_seconds / 60)} min` : 'ETA calibrating from real journeys'}</p>}
          {!hasRoute && <p className="mt-1 text-[10px] text-white/50">{atlasLoading ? 'Loading trusted mobility graph…' : `${trustedNodeCount} places · ${trustedEdgeCount} trusted links`}</p>}
        </div>

        <div className="absolute right-3 top-3 z-20 flex rounded-xl border border-white/10 bg-slate-950/82 p-1 backdrop-blur-xl">
          {([
            ['intel', Layers3, 'Intel'],
            ['standard', MapPin, 'Map'],
            ['satellite', Satellite, 'Sat'],
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setBasemapMode(mode)}
              className={`flex min-h-9 items-center gap-1 rounded-lg px-2 text-[8px] font-black uppercase tracking-wider ${basemapMode === mode ? 'bg-white text-slate-950' : 'text-white/55'}`}
              aria-label={`Use ${label} map`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="absolute bottom-3 left-3 z-20 flex max-w-[72%] flex-wrap gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300/20 bg-slate-950/86 px-3 text-[9px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xl disabled:opacity-60"
          >
            {locating ? <Crosshair className="h-4 w-4 animate-pulse" /> : <LocateFixed className="h-4 w-4" />}
            {locating ? 'Locating' : 'My location'}
          </button>
          <button
            type="button"
            onClick={() => {
              setManualMode((value) => !value);
              setLocationMessage(manualMode ? '' : 'Tap the map where you want AFAT to treat as your start point.');
            }}
            className={`min-h-11 rounded-xl border px-3 text-[9px] font-black uppercase tracking-wider backdrop-blur-xl ${manualMode ? 'border-amber-300/40 bg-amber-400/20 text-amber-100' : 'border-white/10 bg-slate-950/86 text-white/65'}`}
          >
            Pin start
          </button>
        </div>

        <div className="absolute bottom-3 right-3 z-20 rounded-xl border border-white/10 bg-slate-950/86 px-3 py-2 text-right backdrop-blur-xl">
          <p className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-200"><ShieldCheck className="h-3 w-3" /> Trusted graph</p>
          <p className="mt-1 text-[9px] text-white/50">{trustedEdgeCount} links · {trustedNodeCount} nodes</p>
        </div>

        {manualMode && (
          <div className="pointer-events-none absolute inset-x-4 top-24 z-20 rounded-xl border border-amber-300/25 bg-amber-400/15 px-4 py-3 text-center text-[10px] font-bold text-amber-100 backdrop-blur-xl">
            Tap anywhere on the map to choose your start point.
          </div>
        )}

        {routeLoading && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-[10px] font-bold text-white/75 backdrop-blur-xl">
            Finding the best connected path…
          </div>
        )}
      </div>

      {(locationMessage || routeMessage || atlasError) && (
        <div className="border-t border-white/8 px-4 py-3">
          <p className="text-[10px] font-semibold leading-5 text-white/55">{routeMessage || locationMessage || atlasError}</p>
        </div>
      )}
    </section>
  );
}

export default PassengerSpatialMap;
