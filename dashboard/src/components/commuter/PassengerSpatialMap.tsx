import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, LocateFixed, MapPin, Navigation2, Route } from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
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

const YAOUNDE_CENTER: LatLngExpression = [3.866, 11.514];

function validPoint(point?: SpatialPoint | null) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function CameraGuide({ origin, destination, routePoints }: { origin: SpatialPoint | null; destination: SpatialPoint | null; routePoints: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (routePoints.length > 1) {
      map.fitBounds(routePoints as LatLngExpression[], { padding: [46, 46], maxZoom: 16 });
      return;
    }
    const originPoint = validPoint(origin);
    const destinationPoint = validPoint(destination);
    if (originPoint && destinationPoint) {
      map.fitBounds([
        [originPoint.latitude, originPoint.longitude],
        [destinationPoint.latitude, destinationPoint.longitude],
      ], { padding: [50, 50], maxZoom: 16 });
      return;
    }
    const single = destinationPoint || originPoint;
    if (single) map.flyTo([single.latitude, single.longitude], 16, { duration: 0.7 });
  }, [map, origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, routePoints]);
  return null;
}

function formatDistance(distanceM?: number) {
  const value = Number(distanceM || 0);
  if (!value) return '';
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
}

export function PassengerSpatialMap({ destination, meetingPoint, city = 'yaounde', route = null, routeLoading = false, routeMessage = null, onOriginResolved }: Props) {
  const [origin, setOrigin] = useState<(SpatialPoint & { accuracy?: number }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const arrivalPoint = useMemo(() => validPoint(meetingPoint) ? meetingPoint : destination, [meetingPoint, destination]);
  const routePoints = useMemo(() => routeToLatLngs(route), [route]);

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

  const originPoint = validPoint(origin);
  const destinationPoint = validPoint(destination);
  const meeting = validPoint(meetingPoint);
  const hasArrival = Boolean(meeting || destinationPoint);
  const hasRoute = route?.status === 'ok' && routePoints.length > 1;

  return <section className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
    <div className="relative h-[280px] sm:h-[340px]">
      <MapContainer center={YAOUNDE_CENTER} zoom={13} zoomControl={false} scrollWheelZoom className="absolute inset-0 h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <CameraGuide origin={origin} destination={arrivalPoint || null} routePoints={routePoints} />

        {hasRoute && <Polyline positions={routePoints as LatLngExpression[]} pathOptions={{ weight: 6, opacity: 0.9 }} />}

        {originPoint && <CircleMarker center={[originPoint.latitude, originPoint.longitude]} radius={8} pathOptions={{ weight: 3, fillOpacity: 0.92 }}>
          <Popup><strong>Your current position</strong><br />GPS accuracy ±{Math.round(Number(origin?.accuracy || 0))} m</Popup>
        </CircleMarker>}

        {destinationPoint && <CircleMarker center={[destinationPoint.latitude, destinationPoint.longitude]} radius={9} pathOptions={{ weight: 3, fillOpacity: 0.78 }}>
          <Popup><strong>{destination?.name || 'Destination'}</strong></Popup>
        </CircleMarker>}

        {meeting && <CircleMarker center={[meeting.latitude, meeting.longitude]} radius={11} pathOptions={{ weight: 4, fillOpacity: 0.9 }}>
          <Popup><strong>{meetingPoint?.name || 'Recommended meeting point'}</strong>{meetingPoint?.instructions ? <><br />{meetingPoint.instructions}</> : null}</Popup>
        </CircleMarker>}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] h-28 bg-gradient-to-b from-slate-950/45 to-transparent" />
      <div className="absolute left-4 top-4 z-[600] max-w-[72%] rounded-2xl border border-white/10 bg-slate-950/72 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">{hasRoute ? <Route className="h-4 w-4 text-emerald-300" /> : <Navigation2 className="h-4 w-4 text-blue-300" />}<p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{hasRoute ? 'AFAT route' : hasArrival ? 'Your arrival' : 'Explore nearby'}</p></div>
        <p className="mt-1 truncate text-sm font-black text-white">{meetingPoint?.name || destination?.name || (String(city).toLowerCase().includes('douala') ? 'Douala' : 'Yaoundé')}</p>
        {hasRoute && <p className="mt-1 text-[11px] font-bold text-emerald-100/80">{formatDistance(route?.distance_m)} · {route?.eta_seconds ? `${Math.ceil(route.eta_seconds / 60)} min` : 'ETA calibrating'}</p>}
        {!hasRoute && meetingPoint?.instructions && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/55">{meetingPoint.instructions}</p>}
      </div>

      <button type="button" onClick={locate} disabled={locating} className="absolute bottom-4 right-4 z-[600] flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white text-slate-950 shadow-xl transition active:scale-95 disabled:opacity-60" aria-label="Use my current location">
        {locating ? <Crosshair className="h-5 w-5 animate-pulse" /> : <LocateFixed className="h-5 w-5" />}
      </button>

      {!hasArrival && <div className="pointer-events-none absolute bottom-4 left-4 z-[600] max-w-[68%] rounded-2xl border border-white/10 bg-slate-950/72 px-3 py-2 backdrop-blur-xl">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-white/65"><MapPin className="h-3.5 w-3.5 text-orange-300" /> Search a landmark, entrance, gate or familiar place.</p>
      </div>}

      {routeLoading && <div className="pointer-events-none absolute bottom-4 left-4 z-[600] rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-white/70 backdrop-blur-xl">Finding the best connected path…</div>}
    </div>
    {(locationMessage || routeMessage) && <div className="border-t border-white/8 px-4 py-3 text-[10px] font-semibold text-white/50">{routeMessage || locationMessage}</div>}
  </section>;
}

export default PassengerSpatialMap;
