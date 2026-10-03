import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Layers3, LocateFixed, MapPin, Navigation2, Route, Satellite, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
} from 'maplibre-gl';
import { routeToLatLngs, type AfatCanonicalRoute } from '../../services/canonicalRouteClient';
import { supabase } from '../../supabaseClient';
import { AFAT_BASEMAPS, type AfatBasemapMode } from '../../services/mapBasemaps';
import { fetchAtlasNearby, type AtlasEdge, type AtlasNearbyResponse, type AtlasNode } from '../../services/atlasClient';
import { distanceMeters } from '../../services/journeyRuntime';

type SpatialPoint = {
  latitude?: number | null;
  longitude?: number | null;
  name?: string | null;
  instructions?: string | null;
};

type ResolvedOrigin = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string;
  source?: 'gps' | 'manual';
};

type SelectedMapPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind?: string | null;
  evidence_status?: string | null;
  source_only?: boolean;
};

type Props = {
  destination?: SpatialPoint | null;
  meetingPoint?: SpatialPoint | null;
  accessPoint?: SpatialPoint | null;
  city?: string | null;
  route?: AfatCanonicalRoute | null;
  routeLoading?: boolean;
  routeMessage?: string | null;
  navigationActive?: boolean;
  onOriginResolved?: (origin: ResolvedOrigin) => void;
  onNavigationPosition?: (origin: ResolvedOrigin) => void;
  onArrived?: (payload: { latitude: number; longitude: number; distanceM: number; accuracyM?: number | null }) => void;
  onPlaceSelected?: (place: SelectedMapPlace) => void;
};

type MarkerKind = 'origin' | 'destination' | 'meeting' | 'access';
type BasemapMode = AfatBasemapMode;

const YAOUNDE_CENTER: [number, number] = [11.514, 3.866];
const DOUALA_CENTER: [number, number] = [9.7043, 4.0511];
const ROUTE_SOURCE_ID = 'afat-canonical-route';
const ATLAS_EDGE_SOURCE_ID = 'afat-atlas-edges';
const ATLAS_NODE_SOURCE_ID = 'afat-atlas-nodes';
const VIEW_PLACE_SOURCE_ID = 'afat-view-places';
const SELECTED_PLACE_SOURCE_ID = 'afat-selected-place';

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
  const shell = document.createElement('div');
  shell.setAttribute('aria-label', kind === 'origin' ? 'Your start point' : kind === 'meeting' ? 'Recommended meeting point' : kind === 'access' ? 'Recommended access point' : 'Destination');
  shell.style.width = kind === 'origin' ? '30px' : '26px';
  shell.style.height = kind === 'origin' ? '30px' : '26px';
  shell.style.display = 'grid';
  shell.style.placeItems = 'center';
  shell.style.borderRadius = '9999px';
  shell.style.background = kind === 'origin' ? 'rgba(14,165,233,.16)' : 'rgba(2,6,23,.34)';
  shell.style.boxShadow = kind === 'origin' ? '0 0 0 8px rgba(56,189,248,.08),0 12px 30px rgba(2,6,23,.46)' : '0 10px 26px rgba(2,6,23,.42)';

  const core = document.createElement('div');
  core.style.width = kind === 'origin' ? '13px' : '15px';
  core.style.height = kind === 'origin' ? '13px' : '15px';
  core.style.borderRadius = '9999px';
  core.style.border = '3px solid rgba(255,255,255,.98)';
  core.style.background = kind === 'origin' ? '#0ea5e9' : kind === 'meeting' ? '#f59e0b' : kind === 'access' ? '#8b5cf6' : '#10b981';
  shell.appendChild(core);
  return shell;
}

function atlasEdgeCollection(atlas: AtlasNearbyResponse | null) {
  const nodes = new Map<string, AtlasNode>();
  (atlas?.nodes || []).forEach((node) => {
    if (node.id && Number.isFinite(Number(node.latitude)) && Number.isFinite(Number(node.longitude))) nodes.set(node.id, node);
  });
  const features = (atlas?.edges || []).map((edge: AtlasEdge) => {
    const from = edge.from_node_id ? nodes.get(edge.from_node_id) : null;
    const to = edge.to_node_id ? nodes.get(edge.to_node_id) : null;
    const geometry = edge.geometry_geojson && edge.geometry_geojson.type === 'LineString'
      ? edge.geometry_geojson
      : from && to
        ? { type: 'LineString' as const, coordinates: [[Number(from.longitude), Number(from.latitude)], [Number(to.longitude), Number(to.latitude)]] }
        : null;
    if (!geometry) return null;
    return {
      type: 'Feature' as const,
      properties: {
        id: edge.id,
        name: edge.name || '',
        evidence_status: edge.evidence_status || '',
        confidence: Number(edge.confidence || 0),
        modes: (edge.access_modes || edge.modes || []).join(','),
      },
      geometry,
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
        name: node.name || node.canonical_name || node.node_type || 'AFAT graph node',
        node_type: node.node_type || 'place',
        evidence_status: node.evidence_status || '',
        confidence: Number(node.confidence || 0),
      },
      geometry: { type: 'Point' as const, coordinates: [Number(node.longitude), Number(node.latitude)] },
    }));
  return { type: 'FeatureCollection' as const, features };
}

function evidenceCopy(place: SelectedMapPlace | null) {
  if (!place) return '';
  if (place.evidence_status === 'field_verified') return 'Field verified';
  if (place.evidence_status === 'corroborated') return 'Corroborated';
  if (place.evidence_status === 'disputed') return 'Evidence disputed';
  return place.source_only ? 'Source-backed · reachability learning' : 'AFAT learning';
}

export function PassengerSpatialMap({
  destination,
  meetingPoint,
  accessPoint,
  city = 'yaounde',
  route = null,
  routeLoading = false,
  routeMessage = null,
  navigationActive = false,
  onOriginResolved,
  onNavigationPosition,
  onArrived,
  onPlaceSelected,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const navigationWatchRef = useRef<number | null>(null);
  const lastRuntimePushAt = useRef(0);
  const arrivalNotified = useRef(false);
  const manualModeRef = useRef(false);
  const onOriginResolvedRef = useRef(onOriginResolved);
  const onNavigationPositionRef = useRef(onNavigationPosition);
  const onArrivedRef = useRef(onArrived);
  const onPlaceSelectedRef = useRef(onPlaceSelected);

  const [origin, setOrigin] = useState<(SpatialPoint & { accuracy?: number | null; source?: 'gps' | 'manual' }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('intel');
  const [atlas, setAtlas] = useState<AtlasNearbyResponse | null>(null);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasError, setAtlasError] = useState('');
  const [viewPlaces, setViewPlaces] = useState<any[]>([]);
  const [mapStatus, setMapStatus] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [selectedMapPlace, setSelectedMapPlace] = useState<SelectedMapPlace | null>(null);
  const [zoom, setZoom] = useState(13.2);

  useEffect(() => { manualModeRef.current = manualMode; }, [manualMode]);
  useEffect(() => { onOriginResolvedRef.current = onOriginResolved; }, [onOriginResolved]);
  useEffect(() => { onNavigationPositionRef.current = onNavigationPosition; }, [onNavigationPosition]);
  useEffect(() => { onArrivedRef.current = onArrived; }, [onArrived]);
  useEffect(() => { onPlaceSelectedRef.current = onPlaceSelected; }, [onPlaceSelected]);

  const arrivalPoint = useMemo(() => validPoint(meetingPoint) ? meetingPoint : validPoint(accessPoint) ? accessPoint : destination, [meetingPoint, accessPoint, destination]);
  const routePoints = useMemo(() => routeToLatLngs(route), [route]);
  const originPoint = validPoint(origin);
  const destinationPoint = validPoint(destination);
  const meeting = validPoint(meetingPoint);
  const access = validPoint(accessPoint);
  const hasRoute = route?.status === 'ok' && routePoints.length > 1;
  const atlasEdges = useMemo(() => atlasEdgeCollection(atlas), [atlas]);
  const atlasNodes = useMemo(() => atlasNodeCollection(atlas), [atlas]);
  const edgeCount = atlas?.edges?.length || 0;

  const loadPlacesInView = async (map: MapLibreMap) => {
    const bounds = map.getBounds();
    const cityKey = String(city || '').toLowerCase().includes('douala') ? 'cm-douala' : 'cm-yaounde';
    const { data, error } = await supabase.rpc('afat_places_in_view', {
      p_city_key: cityKey,
      p_west: bounds.getWest(),
      p_south: bounds.getSouth(),
      p_east: bounds.getEast(),
      p_north: bounds.getNorth(),
      p_limit: zoom >= 15 ? 900 : zoom >= 13 ? 650 : 350,
    });
    if (error) {
      setMapStatus('AFAT places could not be loaded for this view.');
      return;
    }
    setMapStatus('');
    setViewPlaces(Array.isArray(data?.places) ? data.places : []);
  };

  const loadAtlas = async (latitude: number, longitude: number) => {
    setAtlasLoading(true);
    setAtlasError('');
    try {
      const graph = await fetchAtlasNearby({ latitude, longitude, radiusM: navigationActive ? 2200 : 4200, limit: navigationActive ? 220 : 320 });
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
    const basemap = AFAT_BASEMAPS[basemapMode];
    const map = new MapLibreMap({
      container: containerRef.current,
      center: mapCenter(city),
      zoom: 13.2,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
      style: {
        version: 8,
        sources: {
          basemap: { type: 'raster', tiles: basemap.tiles, tileSize: 256, attribution: basemap.attribution, maxzoom: 19 },
        },
        layers: [
          { id: 'afat-background', type: 'background', paint: { 'background-color': basemapMode === 'standard' ? '#d9e3ea' : '#06101a' } },
          { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': basemap.opacity, 'raster-saturation': basemapMode === 'satellite' ? -0.08 : -0.18, 'raster-contrast': basemapMode === 'intel' ? 0.12 : 0.04 } },
        ],
      },
    });

    map.once('load', () => {
      setMapReady(true);
      setMapStatus('');
      setZoom(map.getZoom());
      void loadPlacesInView(map);
      window.setTimeout(() => map.resize(), 50);
    });
    map.on('moveend', () => {
      setZoom(map.getZoom());
      void loadPlacesInView(map);
    });
    map.on('zoom', () => setZoom(map.getZoom()));
    map.on('error', (event: any) => {
      if (String(event?.error?.message || '')) setMapStatus('Map tiles or map data failed to load. AFAT is not hiding the failure.');
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on('click', (event) => {
      if (!manualModeRef.current) return;
      const next = {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
        accuracy: null,
        source: 'manual' as const,
        name: 'Pinned start point',
      };
      setOrigin(next);
      setManualMode(false);
      setLocationMessage('Start point pinned manually. This is user-selected, not GPS evidence.');
      onOriginResolvedRef.current?.({ latitude: next.latitude, longitude: next.longitude, accuracy: null, label: 'Pinned start point', source: 'manual' });
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
  }, [basemapMode, city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const placeCollection = {
      type: 'FeatureCollection' as const,
      features: viewPlaces
        .filter((place) => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
        .map((place) => ({
          type: 'Feature' as const,
          properties: {
            id: place.id,
            name: place.name || 'AFAT place',
            kind: place.kind || 'place',
            evidence_status: place.evidence_status || 'limited',
            source_only: Boolean(place.source_only),
          },
          geometry: { type: 'Point' as const, coordinates: [Number(place.longitude), Number(place.latitude)] },
        })),
    };

    const existingPlaces = map.getSource(VIEW_PLACE_SOURCE_ID) as GeoJSONSource | undefined;
    if (existingPlaces) existingPlaces.setData(placeCollection as any);
    else {
      map.addSource(VIEW_PLACE_SOURCE_ID, { type: 'geojson', data: placeCollection as any });
      map.addLayer({
        id: 'afat-place-halo',
        type: 'circle',
        source: VIEW_PLACE_SOURCE_ID,
        minzoom: 11,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 8, 17, 12] as any,
          'circle-color': '#07111f',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.18, 15, 0.42] as any,
        },
      });
      map.addLayer({
        id: VIEW_PLACE_SOURCE_ID,
        type: 'circle',
        source: VIEW_PLACE_SOURCE_ID,
        minzoom: 11,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 13, 4, 15, 6, 17, 7.5] as any,
          'circle-color': ['match', ['get', 'kind'], 'hospital', '#fb7185', 'school', '#facc15', 'market', '#fb923c', 'business', '#22d3ee', 'venue', '#a78bfa', 'neighborhood', '#34d399', 'road', '#94a3b8', '#f8fafc'] as any,
          'circle-stroke-color': '#020617',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 2] as any,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.62, 14, 0.9] as any,
        },
      });
      map.on('click', VIEW_PLACE_SOURCE_ID, (event: any) => {
        if (manualModeRef.current) return;
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [event.lngLat.lng, event.lngLat.lat];
        const place: SelectedMapPlace = {
          id: String(props.id || ''),
          name: String(props.name || 'AFAT place'),
          longitude: Number(coords[0]),
          latitude: Number(coords[1]),
          kind: props.kind ? String(props.kind) : null,
          evidence_status: props.evidence_status ? String(props.evidence_status) : null,
          source_only: props.source_only === true || props.source_only === 'true',
        };
        setSelectedMapPlace(place);
        map.easeTo({ center: [place.longitude, place.latitude], zoom: Math.max(map.getZoom(), 15.4), pitch: 18, duration: 520 });
        onPlaceSelectedRef.current?.(place);
      });
      map.on('mouseenter', VIEW_PLACE_SOURCE_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', VIEW_PLACE_SOURCE_ID, () => { map.getCanvas().style.cursor = ''; });
    }

    const edgeSource = map.getSource(ATLAS_EDGE_SOURCE_ID) as GeoJSONSource | undefined;
    if (edgeSource) edgeSource.setData(atlasEdges as any);
    else {
      map.addSource(ATLAS_EDGE_SOURCE_ID, { type: 'geojson', data: atlasEdges as any });
      map.addLayer({
        id: 'afat-atlas-edge-shadow',
        type: 'line',
        source: ATLAS_EDGE_SOURCE_ID,
        minzoom: 12,
        paint: { 'line-color': '#020617', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 8] as any, 'line-opacity': 0.28 },
      });
      map.addLayer({
        id: 'afat-atlas-edge-line',
        type: 'line',
        source: ATLAS_EDGE_SOURCE_ID,
        minzoom: 12,
        paint: {
          'line-color': ['case', ['>=', ['get', 'confidence'], 80], '#38bdf8', ['>=', ['get', 'confidence'], 60], '#22c55e', '#64748b'] as any,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 15, 2.6, 17, 4] as any,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 15, 0.72] as any,
        },
      });
    }

    const nodeSource = map.getSource(ATLAS_NODE_SOURCE_ID) as GeoJSONSource | undefined;
    if (nodeSource) nodeSource.setData(atlasNodes as any);
    else {
      map.addSource(ATLAS_NODE_SOURCE_ID, { type: 'geojson', data: atlasNodes as any });
      map.addLayer({ id: 'afat-atlas-node-core', type: 'circle', source: ATLAS_NODE_SOURCE_ID, minzoom: 15.2, paint: { 'circle-radius': 2.4, 'circle-color': '#f8fafc', 'circle-stroke-width': 1.2, 'circle-stroke-color': '#38bdf8', 'circle-opacity': 0.7 } });
    }

    const selectedCollection = selectedMapPlace ? {
      type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [selectedMapPlace.longitude, selectedMapPlace.latitude] } }],
    } : { type: 'FeatureCollection' as const, features: [] };
    const selectedSource = map.getSource(SELECTED_PLACE_SOURCE_ID) as GeoJSONSource | undefined;
    if (selectedSource) selectedSource.setData(selectedCollection as any);
    else {
      map.addSource(SELECTED_PLACE_SOURCE_ID, { type: 'geojson', data: selectedCollection as any });
      map.addLayer({ id: 'afat-selected-place-halo', type: 'circle', source: SELECTED_PLACE_SOURCE_ID, paint: { 'circle-radius': 18, 'circle-color': '#22d3ee', 'circle-opacity': 0.16, 'circle-stroke-color': '#67e8f9', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'afat-selected-place-core', type: 'circle', source: SELECTED_PLACE_SOURCE_ID, paint: { 'circle-radius': 7, 'circle-color': '#22d3ee', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
    }
  }, [atlasEdges, atlasNodes, mapReady, selectedMapPlace, viewPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const coordinates: [number, number][] = routePoints.map(([latitude, longitude]) => [longitude, latitude]);
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } };
    const existingSource = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (existingSource) existingSource.setData(data as any);
    else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: data as any });
      map.addLayer({ id: 'afat-route-glow', type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#22d3ee', 'line-width': 14, 'line-opacity': 0.16, 'line-blur': 7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'afat-route-casing', type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#020617', 'line-width': 9, 'line-opacity': 0.88 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'afat-route-main', type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#e6fbff', 'line-width': 6, 'line-opacity': 0.98 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'afat-route-accent', type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#22d3ee', 'line-width': 2.4, 'line-opacity': 1 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];
    const addMarker = (kind: MarkerKind, longitude: number, latitude: number) => {
      markerRefs.current.push(new Marker({ element: markerElement(kind), anchor: 'center' }).setLngLat([longitude, latitude]).addTo(map));
    };
    if (originPoint) addMarker('origin', originPoint.longitude, originPoint.latitude);
    if (destinationPoint) addMarker('destination', destinationPoint.longitude, destinationPoint.latitude);
    if (access) addMarker('access', access.longitude, access.latitude);
    if (meeting) addMarker('meeting', meeting.longitude, meeting.latitude);

    if (navigationActive && originPoint) {
      map.easeTo({ center: [originPoint.longitude, originPoint.latitude], zoom: Math.max(map.getZoom(), 16.2), pitch: 48, bearing: map.getBearing(), duration: 480 });
      return;
    }
    if (coordinates.length > 1) {
      const bounds = new LngLatBounds();
      coordinates.forEach(([longitude, latitude]) => bounds.extend([longitude, latitude]));
      map.fitBounds(bounds, { padding: { top: 100, left: 38, right: 38, bottom: 150 }, maxZoom: 16, duration: 720, pitch: 18 } as any);
      return;
    }
    const arrival = validPoint(arrivalPoint);
    if (originPoint && arrival) {
      const bounds = new LngLatBounds();
      bounds.extend([originPoint.longitude, originPoint.latitude]);
      bounds.extend([arrival.longitude, arrival.latitude]);
      map.fitBounds(bounds, { padding: { top: 100, left: 40, right: 40, bottom: 145 }, maxZoom: 16, duration: 680 } as any);
      return;
    }
    const single = arrival || originPoint;
    if (single) map.flyTo({ center: [single.longitude, single.latitude], zoom: 16, pitch: 14, duration: 680 });
  }, [mapReady, origin?.latitude, origin?.longitude, origin?.accuracy, origin?.source, destination?.latitude, destination?.longitude, meetingPoint?.latitude, meetingPoint?.longitude, accessPoint?.latitude, accessPoint?.longitude, arrivalPoint, routePoints, route?.status, navigationActive]);

  useEffect(() => {
    if (!navigationActive) {
      if (navigationWatchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(navigationWatchRef.current);
      navigationWatchRef.current = null;
      arrivalNotified.current = false;
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage('Live navigation needs device location. A pinned start can preview a route but cannot provide live guidance.');
      return;
    }

    setLocationMessage('Live navigation · waiting for GPS movement…');
    navigationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps' as const,
          name: 'Live navigation position',
        };
        setOrigin(next);
        setLocationMessage(`GPS live · ±${Math.round(position.coords.accuracy)} m`);
        const now = Date.now();
        if (now - lastRuntimePushAt.current >= 8000 || lastRuntimePushAt.current === 0) {
          lastRuntimePushAt.current = now;
          const resolved = { latitude: next.latitude, longitude: next.longitude, accuracy: next.accuracy, label: `Live position · ±${Math.round(next.accuracy)} m`, source: 'gps' as const };
          onOriginResolvedRef.current?.(resolved);
          onNavigationPositionRef.current?.(resolved);
          void loadAtlas(next.latitude, next.longitude);
        }
        const arrival = validPoint(arrivalPoint);
        if (arrival && !arrivalNotified.current) {
          const remaining = distanceMeters(next, arrival);
          const threshold = Math.max(35, Math.min(100, Number(next.accuracy || 0) * 1.5 || 35));
          if (remaining <= threshold) {
            arrivalNotified.current = true;
            setLocationMessage(`Arrival detected · about ${Math.round(remaining)} m from the selected arrival point.`);
            onArrivedRef.current?.({ latitude: next.latitude, longitude: next.longitude, distanceM: remaining, accuracyM: next.accuracy });
            if (navigationWatchRef.current != null) navigator.geolocation.clearWatch(navigationWatchRef.current);
            navigationWatchRef.current = null;
          }
        }
      },
      (error) => {
        setLocationMessage(error.code === 1 ? 'Location permission is required for live navigation.' : 'Live GPS is temporarily unavailable. AFAT kept the route but stopped claiming live guidance.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
    return () => {
      if (navigationWatchRef.current != null) navigator.geolocation.clearWatch(navigationWatchRef.current);
      navigationWatchRef.current = null;
    };
  }, [navigationActive, arrivalPoint?.latitude, arrivalPoint?.longitude]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is unavailable on this device. Pin your start point on the map instead.');
      setManualMode(true);
      return;
    }
    setLocating(true);
    setLocationMessage('Locating you…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: 'gps' as const, name: 'Your current position' };
        setOrigin(next);
        setLocating(false);
        setLocationMessage(position.coords.accuracy <= 100 ? 'Current position ready.' : 'Position found, but GPS accuracy is broad. Pin a more precise start if needed.');
        onOriginResolvedRef.current?.({ latitude: next.latitude, longitude: next.longitude, accuracy: next.accuracy, label: `Current position · ±${Math.round(next.accuracy)} m`, source: 'gps' });
        void loadAtlas(next.latitude, next.longitude);
      },
      () => {
        setLocating(false);
        setManualMode(true);
        setLocationMessage('GPS was not reliable. Tap the map to pin your start point.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const modeButton = (mode: BasemapMode, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button key={mode} type="button" onClick={() => setBasemapMode(mode)} className={`grid h-10 min-w-10 place-items-center rounded-xl px-2 text-[8px] font-black uppercase tracking-wider transition ${basemapMode === mode ? 'bg-white text-slate-950 shadow-lg' : 'text-white/65 hover:bg-white/10'}`} aria-label={`Use ${label} map`}>
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[#040a11] shadow-[0_28px_90px_rgba(0,0,0,0.4)]">
      <div className="relative h-[480px] sm:h-[590px]">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="AFAT living mobility map" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-slate-950/72 via-slate-950/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-slate-950/72 via-slate-950/15 to-transparent" />

        <div className="absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-3">
          <div className="max-w-[72%] rounded-[20px] border border-white/10 bg-slate-950/76 px-4 py-3 shadow-xl backdrop-blur-2xl">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${navigationActive ? 'bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.85)]' : hasRoute ? 'bg-cyan-300' : 'bg-blue-300'}`} />
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/45">{navigationActive ? 'Moving with AFAT' : hasRoute ? 'Route ready' : 'Living map'}</p>
            </div>
            <p className="mt-1 truncate text-[15px] font-black text-white">{meetingPoint?.name || accessPoint?.name || destination?.name || selectedMapPlace?.name || (String(city).toLowerCase().includes('douala') ? 'Douala' : 'Yaoundé')}</p>
            {hasRoute ? <p className="mt-1 text-[11px] font-semibold text-cyan-100/85">{formatDistance(route?.distance_m)}{route?.eta_seconds ? ` · ${Math.ceil(route.eta_seconds / 60)} min` : ' · ETA learns from real journeys'}</p> : <p className="mt-1 text-[10px] text-white/45">{atlasLoading ? 'Reading nearby mobility…' : `${viewPlaces.length} useful places visible`}</p>}
          </div>
          <div className="flex rounded-2xl border border-white/10 bg-slate-950/74 p-1 shadow-xl backdrop-blur-2xl">
            {modeButton('intel', 'AFAT intelligence', Layers3)}
            {modeButton('street', 'Street', MapPin)}
            {modeButton('satellite', 'Satellite', Satellite)}
          </div>
        </div>

        {!navigationActive && <div className="absolute right-3 top-[72px] z-20 flex flex-col gap-2">
          <button type="button" onClick={locate} disabled={locating} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-slate-950/76 text-cyan-100 shadow-xl backdrop-blur-2xl disabled:opacity-50" aria-label="Find my location">{locating ? <Crosshair className="h-4 w-4 animate-pulse" /> : <LocateFixed className="h-4 w-4" />}</button>
          <button type="button" onClick={() => { setManualMode((value) => !value); setLocationMessage(manualMode ? '' : 'Tap the map to choose your start point.'); }} className={`grid h-11 w-11 place-items-center rounded-2xl border shadow-xl backdrop-blur-2xl ${manualMode ? 'border-amber-300/35 bg-amber-400/20 text-amber-100' : 'border-white/10 bg-slate-950/76 text-white/65'}`} aria-label="Pin a start point"><MapPin className="h-4 w-4" /></button>
        </div>}

        {navigationActive && <div className="absolute left-3 bottom-4 z-20 rounded-[22px] border border-emerald-300/20 bg-slate-950/82 px-4 py-3 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-2"><Navigation2 className="h-4 w-4 text-emerald-300"/><p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200">Navigation live</p></div>
          <p className="mt-1 max-w-[240px] text-[11px] font-semibold text-white/75">{locationMessage || 'Following your movement and refreshing the route.'}</p>
        </div>}

        {!navigationActive && selectedMapPlace && <div className="absolute inset-x-3 bottom-3 z-20 rounded-[24px] border border-white/10 bg-slate-950/88 p-4 shadow-[0_20px_55px_rgba(0,0,0,.45)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300"/><p className="text-[8px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Selected on AFAT</p></div>
              <h3 className="mt-1 truncate text-base font-black text-white">{selectedMapPlace.name}</h3>
              <p className="mt-1 text-[10px] text-white/45">{String(selectedMapPlace.kind || 'place').replace(/_/g, ' ')} · {evidenceCopy(selectedMapPlace)}</p>
            </div>
            <button type="button" onClick={() => setSelectedMapPlace(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55" aria-label="Close selected place"><X className="h-4 w-4"/></button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => onPlaceSelectedRef.current?.(selectedMapPlace)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-[9px] font-black uppercase tracking-wider text-slate-950"><Navigation2 className="h-4 w-4"/>Go here</button>
            <button type="button" onClick={() => mapRef.current?.flyTo({ center: [selectedMapPlace.longitude, selectedMapPlace.latitude], zoom: 17, pitch: 28, duration: 620 })} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-[9px] font-black uppercase text-white/65">Inspect</button>
          </div>
        </div>}

        {!navigationActive && !selectedMapPlace && <div className="absolute bottom-3 left-3 z-20 rounded-2xl border border-white/10 bg-slate-950/72 px-3 py-2 shadow-lg backdrop-blur-xl">
          <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-emerald-200"><ShieldCheck className="h-3 w-3"/>AFAT intelligence</p>
          <p className="mt-1 text-[9px] text-white/45">{viewPlaces.length} places · {edgeCount} nearby links · zoom {zoom.toFixed(1)}</p>
        </div>}

        {manualMode && <div className="pointer-events-none absolute inset-x-10 top-28 z-20 rounded-2xl border border-amber-300/25 bg-slate-950/84 px-4 py-3 text-center text-[10px] font-bold text-amber-100 shadow-xl backdrop-blur-2xl">Tap the exact point you want AFAT to use as your start.</div>}
        {routeLoading && <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-[10px] font-bold text-white/75 shadow-2xl backdrop-blur-2xl">Building a connected path…</div>}
      </div>

      {(locationMessage || routeMessage || atlasError || mapStatus) && !navigationActive && (
        <div className="border-t border-white/8 bg-slate-950/70 px-4 py-3">
          <p className="text-[10px] font-semibold leading-5 text-white/55">{locationMessage || routeMessage || atlasError || mapStatus}</p>
        </div>
      )}
    </section>
  );
}

export default PassengerSpatialMap;
