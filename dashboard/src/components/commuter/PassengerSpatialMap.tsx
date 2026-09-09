import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, MapPin, Navigation2, Route } from 'lucide-react';
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap } from 'maplibre-gl';
import { routeToLatLngs, type AfatCanonicalRoute } from '../../services/canonicalRouteClient';

type SpatialPoint = {
  latitude?: number | null;
  longitude?: number | null;
  name?: string | null;
  instructions?: string | null;
};

type Props = {
  destination?: SpatialPoint | null;
  meetingPoint?: SpatialPoint | null;
  city?: string | null;
  route?: AfatCanonicalRoute | null;
  routeLoading?: boolean;
  routeMessage?: string | null;
  onOriginResolved?: (origin: { latitude: number; longitude: number; accuracy: number; label: string }) => void;
};

type MarkerKind = 'origin' | 'destination' | 'meeting';

const YAOUNDE_CENTER: [number, number] = [11.514, 3.866];
const DOUALA_CENTER: [number, number] = [9.7043, 4.0511];
const ROUTE_SOURCE_ID = 'afat-canonical-route';
const ROUTE_LAYER_ID = 'afat-canonical-route-line';

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
  element.setAttribute('aria-label', kind === 'origin' ? 'Your current position' : kind === 'meeting' ? 'Recommended meeting point' : 'Destination');
  element.style.width = kind === 'meeting' ? '22px' : '18px';
  element.style.height = kind === 'meeting' ? '22px' : '18px';
  element.style.borderRadius = '9999px';
  element.style.border = '3px solid rgba(255,255,255,0.96)';
  element.style.boxShadow = '0 6px 18px rgba(2,6,23,0.45)';
  element.style.background = kind === 'origin' ? '#38bdf8' : kind === 'meeting' ? '#f59e0b' : '#34d399';
  return element;
}

function popupHtml(title: string, detail?: string | null) {
  const safeTitle = title.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
  const safeDetail = String(detail || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
  return `<div style="font:600 12px/1.4 system-ui;color:#0f172a"><strong>${safeTitle}</strong>${safeDetail ? `<br>${safeDetail}` : ''}</div>`;
}

export function PassengerSpatialMap({ destination, meetingPoint, city = 'yaounde', route = null, routeLoading = false, routeMessage = null, onOriginResolved }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const [origin, setOrigin] = useState<(SpatialPoint & { accuracy?: number }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const arrivalPoint = useMemo(() => validPoint(meetingPoint) ? meetingPoint : destination, [meetingPoint, destination]);
  const routePoints = useMemo(() => routeToLatLngs(route), [route]);
  const originPoint = validPoint(origin);
  const destinationPoint = validPoint(destination);
  const meeting = validPoint(meetingPoint);
  const hasArrival = Boolean(meeting || destinationPoint);
  const hasRoute = route?.status === 'ok' && routePoints.length > 1;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: mapCenter(city),
      zoom: 13,
      attributionControl: true,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
            maxzoom: 19,
          },
        },
        layers: [{ id: 'osm-raster', type: 'raster', source: 'osm-raster' }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.once('load', () => setMapReady(true));
    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const coordinates = routePoints.map(([latitude, longitude]) => [longitude, latitude]);
    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: { evidenceStatus: route?.status || 'unavailable' },
      geometry: { type: 'LineString', coordinates },
    };

    const existingSource = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(data);
    } else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#34d399',
          'line-width': 6,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    const addMarker = (kind: MarkerKind, longitude: number, latitude: number, title: string, detail?: string | null) => {
      const marker = new maplibregl.Marker({ element: markerElement(kind), anchor: 'center' })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(popupHtml(title, detail)))
        .addTo(map);
      markerRefs.current.push(marker);
    };

    if (originPoint) addMarker('origin', originPoint.longitude, originPoint.latitude, 'Your current position', `GPS accuracy ±${Math.round(Number(origin?.accuracy || 0))} m`);
    if (destinationPoint) addMarker('destination', destinationPoint.longitude, destinationPoint.latitude, destination?.name || 'Destination');
    if (meeting) addMarker('meeting', meeting.longitude, meeting.latitude, meetingPoint?.name || 'Recommended meeting point', meetingPoint?.instructions);

    if (coordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach(([longitude, latitude]) => bounds.extend([longitude, latitude]));
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 46, maxZoom: 16, duration: 700 });
      return;
    }

    const arrival = validPoint(arrivalPoint);
    if (originPoint && arrival) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([originPoint.longitude, originPoint.latitude]);
      bounds.extend([arrival.longitude, arrival.latitude]);
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 50, maxZoom: 16, duration: 700 });
      return;
    }

    const single = arrival || originPoint;
    if (single) map.flyTo({ center: [single.longitude, single.latitude], zoom: 16, duration: 700 });
  }, [mapReady, origin?.latitude, origin?.longitude, origin?.accuracy, destination?.latitude, destination?.longitude, meetingPoint?.latitude, meetingPoint?.longitude, meetingPoint?.instructions, meetingPoint?.name, destination?.name, arrivalPoint, routePoints, route?.status]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available on this device. You can still search by landmark.');
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
          name: 'Your current position',
        };
        setOrigin(next);
        setLocating(false);
        setLocationMessage(position.coords.accuracy <= 100 ? 'Current position ready.' : 'Position found, but GPS accuracy is still broad.');
        onOriginResolved?.({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracy: next.accuracy,
          label: `Current position · ±${Math.round(next.accuracy)} m`,
        });
      },
      (error) => {
        setLocating(false);
        setLocationMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was not granted. Search by landmark or choose a point manually.'
          : 'AFAT could not get a reliable current position.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  return <section className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
    <div className="relative h-[280px] sm:h-[340px]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="AFAT mobility map" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-slate-950/45 to-transparent" />
      <div className="absolute left-4 top-4 z-20 max-w-[72%] rounded-2xl border border-white/10 bg-slate-950/72 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">{hasRoute ? <Route className="h-4 w-4 text-emerald-300" /> : <Navigation2 className="h-4 w-4 text-blue-300" />}<p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{hasRoute ? 'AFAT route' : hasArrival ? 'Your arrival' : 'Explore nearby'}</p></div>
        <p className="mt-1 truncate text-sm font-black text-white">{meetingPoint?.name || destination?.name || (String(city).toLowerCase().includes('douala') ? 'Douala' : 'Yaoundé')}</p>
        {hasRoute && <p className="mt-1 text-[11px] font-bold text-emerald-100/80">{formatDistance(route?.distance_m)} · {route?.eta_seconds ? `${Math.ceil(route.eta_seconds / 60)} min` : 'ETA calibrating'}</p>}
        {!hasRoute && meetingPoint?.instructions && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/55">{meetingPoint.instructions}</p>}
      </div>

      <button type="button" onClick={locate} disabled={locating} className="absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white text-slate-950 shadow-xl transition active:scale-95 disabled:opacity-60" aria-label="Use my current location">
        {locating ? <Crosshair className="h-5 w-5 animate-pulse" /> : <LocateFixed className="h-5 w-5" />}
      </button>

      {!hasArrival && <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[68%] rounded-2xl border border-white/10 bg-slate-950/72 px-3 py-2 backdrop-blur-xl">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-white/65"><MapPin className="h-3.5 w-3.5 text-orange-300" /> Search a landmark, entrance, gate or familiar place.</p>
      </div>}

      {routeLoading && <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-white/70 backdrop-blur-xl">Finding the best connected path…</div>}
    </div>
    {(locationMessage || routeMessage) && <div className="border-t border-white/8 px-4 py-3 text-[10px] font-semibold text-white/50">{routeMessage || locationMessage}</div>}
  </section>;
}

export default PassengerSpatialMap;
