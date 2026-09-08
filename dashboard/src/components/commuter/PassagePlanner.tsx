import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, MapPin, Navigation2, Search, ShieldAlert } from 'lucide-react';
import {
  confirmAfatPlace,
  createPassageIntent,
  resolveAfatPlace,
} from '../../supabaseClient';
import type { AfatMeetingPoint, AfatPlaceCandidate } from '../../supabaseClient';
import { PlaceMediaStrip } from '../shared/PlaceMediaStrip';
import { filterRelevantPlaceCandidates } from '../../utils/productionTruth';
import { AtlasContextPanel } from './AtlasContextPanel';
import { PassengerSpatialMap } from './PassengerSpatialMap';
import { fetchCanonicalAfatRoute, type AfatCanonicalRoute, type AfatRouteMode } from '../../services/canonicalRouteClient';

type Props = {
  profile: any;
  originText?: string;
  initialDestination?: string;
  onPassageCreated?: (passage: any) => void;
};

type OriginFix = { latitude: number; longitude: number; accuracy: number; label: string };

function pointFrom(value: any, fallbackName?: string) {
  if (!value) return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    name: value.name || value.canonical_name || fallbackName || null,
    instructions: value.instructions || null,
  };
}

function matchLabel(confidence: number) {
  if (confidence >= 85) return 'Strong match';
  if (confidence >= 70) return 'Good match';
  return 'Possible match';
}

function routeMessageFor(route: AfatCanonicalRoute | null) {
  if (!route) return '';
  if (route.status === 'ok') {
    const km = Number(route.distance_m || 0) / 1000;
    return `Connected AFAT route ready${km > 0 ? ` · ${km.toFixed(km >= 10 ? 0 : 1)} km` : ''}. ETA appears only after AFAT has a trusted speed profile.`;
  }
  const copy: Record<string, string> = {
    origin_not_connected_to_trusted_graph: 'AFAT has not connected your current position to a trusted road graph yet.',
    destination_not_connected_to_trusted_graph: 'This destination is known, but its nearby road graph is not trusted yet.',
    no_trusted_graph_path: 'AFAT cannot yet confirm a connected trusted path between these points.',
  };
  return copy[route.reason || ''] || 'A trusted AFAT route is not available for these points yet.';
}

export function PassagePlanner({ profile, originText = '', initialDestination = '', onPassageCreated }: Props) {
  const [destination, setDestination] = useState(initialDestination);
  const [originLabel, setOriginLabel] = useState(originText);
  const [originFix, setOriginFix] = useState<OriginFix | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState('');
  const [vehicleType, setVehicleType] = useState<AfatRouteMode>('car');
  const [candidates, setCandidates] = useState<AfatPlaceCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<AfatPlaceCandidate | null>(null);
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState<AfatMeetingPoint | null>(null);
  const [statusText, setStatusText] = useState('');
  const [loading, setLoading] = useState(false);
  const [canonicalRoute, setCanonicalRoute] = useState<AfatCanonicalRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');

  useEffect(() => {
    setDestination(initialDestination);
    setCandidates([]);
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setCanonicalRoute(null);
    setRouteMessage('');
    setStatusText('');
  }, [initialDestination]);

  useEffect(() => { setOriginLabel(originText); }, [originText]);

  const destinationPoint = useMemo(() => pointFrom(selectedPlace, selectedPlace?.name), [selectedPlace]);
  const meetingPoint = useMemo(() => pointFrom(selectedMeetingPoint, selectedMeetingPoint?.name), [selectedMeetingPoint]);
  const arrivalPoint = meetingPoint || destinationPoint;

  useEffect(() => {
    let active = true;
    if (!originFix || !arrivalPoint) {
      setCanonicalRoute(null);
      setRouteMessage('');
      return;
    }

    setRouteLoading(true);
    setRouteMessage('');
    fetchCanonicalAfatRoute({
      originLatitude: originFix.latitude,
      originLongitude: originFix.longitude,
      destinationLatitude: arrivalPoint.latitude,
      destinationLongitude: arrivalPoint.longitude,
      mode: vehicleType,
      snapRadiusM: 1200,
    })
      .then((route) => {
        if (!active) return;
        setCanonicalRoute(route);
        setRouteMessage(routeMessageFor(route));
      })
      .catch((error: any) => {
        if (!active) return;
        setCanonicalRoute(null);
        setRouteMessage(error?.message || 'AFAT could not calculate the connected route.');
      })
      .finally(() => { if (active) setRouteLoading(false); });

    return () => { active = false; };
  }, [originFix?.latitude, originFix?.longitude, arrivalPoint?.latitude, arrivalPoint?.longitude, vehicleType]);

  const resolveDestination = async () => {
    if (destination.trim().length < 3) return;
    setLoading(true);
    setStatusText('Finding the place and the easiest way to meet there…');
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setCanonicalRoute(null);
    const { data, error } = await resolveAfatPlace({ query: destination.trim(), city: profile?.preferred_city || 'yaounde', vehicle_type: vehicleType });
    setLoading(false);
    if (error) { setCandidates([]); setStatusText(error.message); return; }
    const relevantCandidates = filterRelevantPlaceCandidates(destination, data?.candidates || []);
    setCandidates(relevantCandidates);
    setStatusText(relevantCandidates.length ? 'Choose the place you mean.' : 'We could not confirm that place yet. Add a clearer landmark, gate, junction or nearby business rather than guessing.');
  };

  const selectCandidate = (candidate: AfatPlaceCandidate) => {
    setSelectedPlace(candidate);
    setSelectedMeetingPoint(candidate.meeting_points?.[0] || null);
    setStatusText(candidate.meeting_points?.length ? 'Confirm the meeting point that both you and the driver should use.' : 'This place is known, but a reliable pickup point has not been confirmed yet.');
  };

  const markNoneCorrect = async () => {
    await confirmAfatPlace({ profile_id: profile?.id, query_text: destination.trim(), city: profile?.preferred_city || 'yaounde', resolution_status: 'none_correct', feedback: 'Passenger rejected all ranked candidates.' });
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setCandidates([]);
    setCanonicalRoute(null);
    setStatusText('Thanks. AFAT will keep this place unresolved instead of sending someone to the wrong location.');
  };

  const createPassage = async () => {
    if (!profile?.id || !selectedPlace || !selectedMeetingPoint) return;
    setLoading(true);
    setStatusText('Confirming your pickup point…');
    await confirmAfatPlace({ profile_id: profile.id, query_text: destination.trim(), city: selectedPlace.city, place_id: selectedPlace.id, meeting_point_id: selectedMeetingPoint.id, confidence: selectedPlace.confidence, resolution_status: 'selected' });
    const { data, error } = await createPassageIntent({
      passenger_id: profile.id,
      origin_text: originLabel || undefined,
      destination_text: destination.trim(),
      arrival_target: arrivalTarget ? new Date(arrivalTarget).toISOString() : undefined,
      selected_place_id: selectedPlace.id,
      meeting_point_id: selectedMeetingPoint.id,
      place_confidence: selectedPlace.confidence,
      requested_vehicle_type: vehicleType,
      metadata: {
        place_explanation: selectedPlace.explanation,
        meeting_instructions: selectedMeetingPoint.instructions,
        atlas_origin_label: originLabel || null,
        canonical_route_status: canonicalRoute?.status || null,
        canonical_route_distance_m: canonicalRoute?.status === 'ok' ? canonicalRoute.distance_m || null : null,
      },
    });
    setLoading(false);
    if (error) { setStatusText(error.message); return; }
    setStatusText('Pickup confirmed. You and the driver now share the same meeting point.');
    onPassageCreated?.(data?.passage);
  };

  return <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">AFAT Passage</p><h2 className="mt-1 text-xl font-black tracking-tight text-white">Where are you going?</h2><p className="mt-1 text-xs leading-relaxed text-white/45">A place name is enough. Add a landmark, entrance or gate when it helps.</p></div>
      <Navigation2 className="h-5 w-5 text-blue-300" />
    </div>

    <div className="grid gap-3 md:grid-cols-[1fr_170px]">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4"><Search className="h-4 w-4 text-white/35" /><input value={destination} onChange={(event) => setDestination(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && resolveDestination()} placeholder="Mendong market, school gate, pharmacy…" className="min-h-14 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25" /></div>
      <button onClick={resolveDestination} disabled={loading || destination.trim().length < 3} className="min-h-14 rounded-2xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">{loading ? 'Finding…' : 'Find place'}</button>
    </div>

    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"><span className="text-[9px] font-black uppercase tracking-widest text-white/35">Arrive by</span><input type="datetime-local" value={arrivalTarget} onChange={(event) => setArrivalTarget(event.target.value)} className="mt-1 block w-full bg-transparent text-xs font-bold text-white outline-none" /></label>
      <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"><span className="text-[9px] font-black uppercase tracking-widest text-white/35">How are you moving?</span><select value={vehicleType} onChange={(event) => setVehicleType(event.target.value as AfatRouteMode)} className="mt-1 block w-full bg-slate-950 text-xs font-bold text-white outline-none"><option value="car">Car / taxi</option><option value="moto">Motorcycle</option><option value="minibus">Shared / minibus</option></select></label>
    </div>

    <div className="mt-4"><PassengerSpatialMap city={profile?.preferred_city || 'yaounde'} destination={destinationPoint} meetingPoint={meetingPoint} route={canonicalRoute} routeLoading={routeLoading} routeMessage={routeMessage} onOriginResolved={(origin) => { setOriginFix(origin); setOriginLabel(origin.label); }} /></div>
    {statusText && <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/8 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-100/75">{statusText}</div>}
    <AtlasContextPanel city={profile?.preferred_city || 'yaounde'} onOriginResolved={({ label }) => setOriginLabel(label)} />

    {!!candidates.length && !selectedPlace && <div className="mt-4 space-y-3">
      {candidates.map((candidate, index) => <button key={candidate.id} onClick={() => selectCandidate(candidate)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-blue-400/35"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-white">{index + 1}. {candidate.name}</p><p className="mt-1 text-[11px] font-semibold text-white/45">{candidate.zone_label || candidate.city} · {candidate.vehicle_access} access</p></div><span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase text-blue-200">{matchLabel(Number(candidate.confidence || 0))}</span></div>{candidate.explanation?.length ? <p className="mt-3 text-[11px] leading-relaxed text-white/50">{candidate.explanation.slice(0, 2).join(' · ')}</p> : null}{Number(candidate.successful_pickups || 0) > 0 && <p className="mt-2 text-[10px] font-bold text-emerald-300/70">Recently used for {candidate.successful_pickups} successful pickup{candidate.successful_pickups === 1 ? '' : 's'}</p>}</button>)}
      <button onClick={markNoneCorrect} className="w-full rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-200">None of these</button>
    </div>}

    {selectedPlace && <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-white">{selectedPlace.name}</p><p className="mt-1 text-[10px] text-white/45">{selectedPlace.zone_label || selectedPlace.city}</p></div><CheckCircle className="h-5 w-5 text-emerald-300" /></div></div>
      <PlaceMediaStrip placeId={selectedPlace.id} placeName={selectedPlace.name} compact />
      {selectedPlace.meeting_points.map((candidateMeetingPoint) => <button key={candidateMeetingPoint.id} onClick={() => setSelectedMeetingPoint(candidateMeetingPoint)} className={`w-full rounded-2xl border p-4 text-left ${selectedMeetingPoint?.id === candidateMeetingPoint.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-orange-300" /><div className="flex-1"><p className="text-xs font-black text-white">{candidateMeetingPoint.name}</p><p className="mt-1 text-[11px] leading-relaxed text-white/55">{candidateMeetingPoint.instructions}</p><p className="mt-2 text-[10px] font-bold text-blue-200/70">About {candidateMeetingPoint.walk_minutes} min walk{Number(candidateMeetingPoint.successful_pickups || 0) > 0 ? ` · ${candidateMeetingPoint.successful_pickups} successful pickups` : ''}</p></div></div></button>)}
      {!selectedPlace.meeting_points.length && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/75"><ShieldAlert className="mb-2 h-4 w-4" />This landmark is known, but AFAT has not yet confirmed a reliable meeting point here.</div>}
      <div className="flex gap-3"><button onClick={() => { setSelectedPlace(null); setSelectedMeetingPoint(null); }} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/55">Back</button><button onClick={createPassage} disabled={loading || !selectedMeetingPoint} className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 disabled:opacity-50"><Clock className="mr-2 inline h-4 w-4" />Confirm pickup</button></div>
    </div>}
  </section>;
}
