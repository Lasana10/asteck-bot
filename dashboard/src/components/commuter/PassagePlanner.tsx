import React, { useEffect, useMemo, useState } from 'react';
import { Bike, Car, CheckCircle, Clock, Footprints, MapPin, Navigation2, Search, Share2, ShieldAlert } from 'lucide-react';
import {
  claimAfatDestination,
  confirmAfatPlace,
  createAfatReachLink,
  createPassageIntent,
  discoverAfatPlaces,
  fetchPassagePreflight,
  proposeAfatDestination,
  recordAfatIntent,
  recordUnresolvedDestination,
  resolveAfatDestinationIntent,
  resolveAfatPlace,
} from '../../supabaseClient';
import type { AfatAccessPoint, AfatMeetingPoint, AfatPlaceCandidate } from '../../supabaseClient';
import { PlaceMediaStrip } from '../shared/PlaceMediaStrip';
import { filterRelevantPlaceCandidates } from '../../utils/productionTruth';
import { PassengerSpatialMap } from './PassengerSpatialMap';
import { fetchCanonicalAfatRoute, type AfatCanonicalRoute, type AfatRouteMode } from '../../services/canonicalRouteClient';

type Props = {
  profile: any;
  originText?: string;
  initialDestination?: string;
  onPassageCreated?: (passage: any) => void;
};

type OriginFix = { latitude: number; longitude: number; accuracy?: number | null; label: string; source?: 'gps' | 'manual' };

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

function meetingSupportsMode(point: AfatMeetingPoint, mode: AfatRouteMode) {
  const modes = (point.access_modes || []).map((value) => String(value).toLowerCase());
  if (!modes.length) return true;
  const aliases: Record<string,string[]> = {
    walk: ['walk','pedestrian','foot'],
    moto: ['moto','motorcycle','bike'],
    car: ['car','taxi','vehicle'],
    minibus: ['minibus','bus','shared'],
  };
  return (aliases[mode] || [mode]).some((alias) => modes.some((value) => value.includes(alias)));
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
  const [intentType, setIntentType] = useState<'go'|'meet'|'pickup'|'dropoff'|'send'|'deliver'|'board'|'explore'>('go');
  const [candidates, setCandidates] = useState<AfatPlaceCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<AfatPlaceCandidate | null>(null);
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState<AfatMeetingPoint | null>(null);
  const [selectedAccessPoint, setSelectedAccessPoint] = useState<AfatAccessPoint | null>(null);
  const [shareNotice, setShareNotice] = useState('');
  const [claimNotice, setClaimNotice] = useState('');
  const [statusText, setStatusText] = useState('');
  const [loading, setLoading] = useState(false);
  const [canonicalRoute, setCanonicalRoute] = useState<AfatCanonicalRoute | null>(null);
  const [routeOptions, setRouteOptions] = useState<Partial<Record<AfatRouteMode, AfatCanonicalRoute>>>({});
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [suggestions, setSuggestions] = useState<AfatPlaceCandidate[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [preflight, setPreflight] = useState<Record<string, any>>({});
  const [recentPlaces, setRecentPlaces] = useState<AfatPlaceCandidate[]>(() => {
    try {
      const raw = localStorage.getItem('afat_recent_places_v1');
      return raw ? JSON.parse(raw).slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    setDestination(initialDestination);
    setCandidates([]);
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setSelectedAccessPoint(null);
    setCanonicalRoute(null);
    setRouteOptions({});
    setRouteMessage('');
    setStatusText('');
  }, [initialDestination]);

  useEffect(() => { setOriginLabel(originText); }, [originText]);

  useEffect(() => {
    let active = true;
    const query = destination.trim();
    if (selectedPlace && query === selectedPlace.name) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      if (query.length > 0 && query.length < 2) {
        setSuggestions([]);
        return;
      }
      setSuggestionLoading(true);
      const { data, error } = await discoverAfatPlaces({
        query: query || undefined,
        city: profile?.preferred_city || 'yaounde',
        latitude: originFix?.latitude,
        longitude: originFix?.longitude,
        limit: 7,
      });
      if (!active) return;
      setSuggestionLoading(false);
      if (error) {
        setSuggestions([]);
        return;
      }
      const discovered = (data?.results || []) as AfatPlaceCandidate[];
      const fallback = !query && !discovered.length ? recentPlaces : discovered;
      setSuggestions(fallback);
      setSuggestionsOpen(Boolean(fallback.length));
    }, query ? 280 : 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [destination, originFix?.latitude, originFix?.longitude, profile?.preferred_city, selectedPlace?.id, recentPlaces]);

  const destinationPoint = useMemo(() => pointFrom(selectedPlace, selectedPlace?.name), [selectedPlace]);
  const meetingPoint = useMemo(() => pointFrom(selectedMeetingPoint, selectedMeetingPoint?.name), [selectedMeetingPoint]);
  const accessPoint = useMemo(() => pointFrom(selectedAccessPoint, selectedAccessPoint?.name), [selectedAccessPoint]);
  const arrivalPoint = (intentType==='meet'||intentType==='pickup'||intentType==='board') ? (meetingPoint || accessPoint || destinationPoint) : (accessPoint || meetingPoint || destinationPoint);

  useEffect(() => {
    let active = true;
    if (!originFix || !arrivalPoint) {
      setCanonicalRoute(null);
      setRouteOptions({});
      setRouteMessage('');
      return;
    }

    const modes: AfatRouteMode[] = ['walk', 'moto', 'car', 'minibus'];
    setRouteLoading(true);
    setRouteMessage('');

    Promise.all(modes.map(async (mode) => {
      try {
        const route = await fetchCanonicalAfatRoute({
          originLatitude: originFix.latitude,
          originLongitude: originFix.longitude,
          destinationLatitude: arrivalPoint.latitude,
          destinationLongitude: arrivalPoint.longitude,
          mode,
          snapRadiusM: 1200,
        });
        return [mode, route] as const;
      } catch {
        return [mode, { status: 'unavailable', mode, reason: 'route_request_failed' } as AfatCanonicalRoute] as const;
      }
    })).then((entries) => {
      if (!active) return;
      const next = Object.fromEntries(entries) as Partial<Record<AfatRouteMode, AfatCanonicalRoute>>;
      setRouteOptions(next);
      const selected = next[vehicleType] || next.car || null;
      setCanonicalRoute(selected);
      setRouteMessage(routeMessageFor(selected));
      if (selected?.status !== 'ok') {
        const firstDispatchable = (['moto','car','minibus'] as AfatRouteMode[]).find((mode) => next[mode]?.status === 'ok');
        if (firstDispatchable) {
          setVehicleType(firstDispatchable);
          setCanonicalRoute(next[firstDispatchable] || null);
          setRouteMessage(routeMessageFor(next[firstDispatchable] || null));
        }
      }
    }).finally(() => { if (active) setRouteLoading(false); });

    return () => { active = false; };
  }, [originFix?.latitude, originFix?.longitude, arrivalPoint?.latitude, arrivalPoint?.longitude]);

  useEffect(() => {
    let active = true;
    if (!originFix || !arrivalPoint) {
      setPreflight({});
      return;
    }
    const modes: AfatRouteMode[] = ['moto','car','minibus'];
    Promise.all(modes.map(async (mode) => {
      const route = routeOptions[mode];
      if (!route || route.status !== 'ok') return [mode, null] as const;
      const { data } = await fetchPassagePreflight({
        mode,
        pickupLatitude: originFix.latitude,
        pickupLongitude: originFix.longitude,
        distanceM: route.distance_m,
      });
      return [mode, data] as const;
    })).then((entries) => {
      if (!active) return;
      setPreflight(Object.fromEntries(entries.filter(([, value]) => value)));
    });
    return () => { active = false; };
  }, [originFix?.latitude, originFix?.longitude, arrivalPoint?.latitude, arrivalPoint?.longitude, routeOptions]);

  useEffect(() => {
    if (!selectedPlace?.meeting_points?.length) return;
    const compatible = selectedPlace.meeting_points
      .filter((point) => meetingSupportsMode(point, vehicleType))
      .sort((a, b) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0));
    if (compatible.length && (!selectedMeetingPoint || !meetingSupportsMode(selectedMeetingPoint, vehicleType))) {
      setSelectedMeetingPoint(compatible[0]);
    }
  }, [vehicleType, selectedPlace?.id, selectedMeetingPoint?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedPlace?.id) return;
    resolveAfatDestinationIntent(selectedPlace.id, { intent_type: intentType, mode: vehicleType }).then(({ data, error }) => {
      if (!active || error || !data) return;
      if (data.access_point) setSelectedAccessPoint(data.access_point as AfatAccessPoint);
      if (data.meeting_point) setSelectedMeetingPoint(data.meeting_point as AfatMeetingPoint);
      if (data.target_kind === 'access_point' && data.access_point) {
        setStatusText(`AFAT recommends ${data.access_point.name} for this ${intentType} trip and ${vehicleType} mode.`);
      } else if (data.target_kind === 'meeting_point' && data.meeting_point) {
        setStatusText(`AFAT recommends ${data.meeting_point.name} as the meeting point for this ${intentType} trip.`);
      }
    });
    return () => { active = false; };
  }, [selectedPlace?.id, intentType, vehicleType]);


  const resolveDestination = async () => {
    if (destination.trim().length < 3) return;
    setLoading(true);
    setStatusText('Finding the place and the easiest way to meet there…');
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setSelectedAccessPoint(null);
    setCanonicalRoute(null);
    setRouteOptions({});
    const { data, error } = await resolveAfatPlace({ query: destination.trim(), city: profile?.preferred_city || 'yaounde' });
    setLoading(false);
    if (error) { setCandidates([]); setStatusText(error.message); return; }
    const relevantCandidates = filterRelevantPlaceCandidates(destination, data?.candidates || []);
    setCandidates(relevantCandidates);
    if (!relevantCandidates.length && profile?.id) {
      void recordUnresolvedDestination({
        query_text: destination.trim(),
        city: profile?.preferred_city || 'yaounde',
        intent_type: intentType,
        origin_lat: originFix?.latitude,
        origin_lng: originFix?.longitude,
        requested_mode: vehicleType,
        evidence: { surface: 'passage_planner', automatic_truth: false },
      });
    }
    setStatusText(relevantCandidates.length ? 'Choose the place you mean.' : 'AFAT could not confirm that destination yet. The demand has been recorded as unresolved evidence instead of guessing.');
  };

  const selectCandidate = (candidate: AfatPlaceCandidate) => {
    setDestination(candidate.name);
    setSuggestions([]);
    setSuggestionsOpen(false);
    const nextRecents = [candidate, ...recentPlaces.filter((item) => item.id !== candidate.id)].slice(0, 5);
    setRecentPlaces(nextRecents);
    try { localStorage.setItem('afat_recent_places_v1', JSON.stringify(nextRecents)); } catch {}
    setSelectedPlace(candidate);
    const bestMeetingPoint = [...(candidate.meeting_points || [])]
      .sort((a, b) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0))[0] || null;
    setSelectedMeetingPoint(bestMeetingPoint);
    const bestAccessPoint = [...(candidate.access_points || [])].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0] || null;
    setSelectedAccessPoint(bestAccessPoint);
    setStatusText(bestMeetingPoint || bestAccessPoint
      ? 'AFAT selected the strongest known access or meeting point for this destination. You can change it below.'
      : 'This destination is known, but AFAT still needs stronger last-metre access evidence.');
  };

  const markNoneCorrect = async () => {
    await confirmAfatPlace({ profile_id: profile?.id, query_text: destination.trim(), city: profile?.preferred_city || 'yaounde', resolution_status: 'none_correct', feedback: 'Passenger rejected all ranked candidates.' });
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setSelectedAccessPoint(null);
    setCandidates([]);
    setCanonicalRoute(null);
    setStatusText('Thanks. AFAT will keep this place unresolved instead of sending someone to the wrong location.');
  };

  const createPassage = async () => {
    if (!profile?.id || !selectedPlace || !arrivalPoint) return;
    if (!originFix) {
      setStatusText('Use the location button on the map to confirm where the operator should collect you.');
      return;
    }
    setLoading(true);
    setStatusText('Confirming your pickup point…');
    await confirmAfatPlace({ profile_id: profile.id, query_text: destination.trim(), city: selectedPlace.city, place_id: selectedPlace.id, meeting_point_id: selectedMeetingPoint?.id, confidence: selectedPlace.confidence, resolution_status: 'selected' });
    const { data, error } = await createPassageIntent({
      passenger_id: profile.id,
      origin_text: originLabel || undefined,
      origin_lat: originFix.latitude,
      origin_lng: originFix.longitude,
      request_key: `passage:${profile.id}:${originFix.latitude.toFixed(5)}:${originFix.longitude.toFixed(5)}:${selectedPlace.id}:${arrivalTarget || 'now'}`,
      destination_text: destination.trim(),
      arrival_target: arrivalTarget ? new Date(arrivalTarget).toISOString() : undefined,
      selected_place_id: selectedPlace.id,
      meeting_point_id: selectedMeetingPoint.id,
      place_confidence: selectedPlace.confidence,
      requested_vehicle_type: vehicleType,
      metadata: {
        place_explanation: selectedPlace.explanation,
        meeting_instructions: selectedMeetingPoint?.instructions || null,
        intent_type: intentType,
        access_point_id: selectedAccessPoint?.id || null,
        access_instructions: selectedAccessPoint?.instructions || null,
        atlas_origin_label: originLabel || null,
        origin_accuracy_m: originFix.accuracy ?? null,
        origin_source: originFix.source || 'gps',
        canonical_route_status: canonicalRoute?.status || null,
        canonical_route_distance_m: canonicalRoute?.status === 'ok' ? canonicalRoute.distance_m || null : null,
      },
    });
    setLoading(false);
    if (error) { setStatusText(error.message); return; }
    setStatusText('Transport requested. AFAT created the dispatch and is matching an approved operator.');
    void recordAfatIntent({intent_type:intentType,place_id:selectedPlace.id,access_point_id:selectedAccessPoint?.id,meeting_point_id:selectedMeetingPoint?.id,movement_mode:vehicleType,origin_lat:originFix.latitude,origin_lng:originFix.longitude,context:{passage_id:data?.passage?.id||null,execution:'booking'}});
    onPassageCreated?.(data?.passage);
  };


  const navigateOnly = async () => {
    if (!selectedPlace || !originFix || canonicalRoute?.status !== 'ok') return;
    const { error } = await recordAfatIntent({
      intent_type: intentType,
      place_id: selectedPlace.id,
      access_point_id: selectedAccessPoint?.id,
      meeting_point_id: selectedMeetingPoint?.id,
      movement_mode: vehicleType,
      origin_lat: originFix.latitude,
      origin_lng: originFix.longitude,
      context: { execution: 'navigation_only', route_distance_m: canonicalRoute.distance_m || null },
    });
    setStatusText(error ? error.message : 'Navigation intent saved. You can use the AFAT route without booking transport.');
  };


  const proposeHere = async () => {
    if (!originFix || destination.trim().length < 3) {
      setStatusText('Confirm your real current position first. AFAT will not invent a location for an unknown destination.');
      return;
    }
    setLoading(true);
    const { data, error } = await proposeAfatDestination({
      name: destination.trim(),
      city: profile?.preferred_city || 'Yaoundé',
      latitude: originFix.latitude,
      longitude: originFix.longitude,
      destination_kind: 'other',
      intent_type: intentType,
      evidence: { source_surface: 'passage_planner', location_source: originFix.source || 'gps', accuracy_m: originFix.accuracy ?? null },
    });
    if (error) {
      setLoading(false);
      setStatusText(error.message);
      return;
    }
    const { data: resolved } = await resolveAfatPlace({ query: destination.trim(), city: profile?.preferred_city || 'yaounde', vehicle_type: vehicleType });
    setLoading(false);
    const next = filterRelevantPlaceCandidates(destination, resolved?.candidates || []);
    setCandidates(next);
    if (next[0]) selectCandidate(next[0]);
    else setStatusText(`Provisional destination ${data?.destination?.place_ref || ''} recorded. It remains unverified until independent evidence confirms it.`);
  };

  const submitClaim = async () => {
    if (!selectedPlace) return;
    setClaimNotice('');
    const { error } = await claimAfatDestination(selectedPlace.id, {
      claim_type: selectedPlace.destination_kind === 'business' ? 'business' : 'manager',
      evidence: { source_surface: 'passage_planner', requested_at: new Date().toISOString() },
    });
    setClaimNotice(error ? error.message : 'Claim submitted for review. Claiming a place does not change its map truth or coordinates.');
  };

  const shareReach = async () => {
    if (!selectedPlace) return;
    setShareNotice('');
    const { data, error } = await createAfatReachLink({
      place_id: selectedPlace.id,
      access_point_id: selectedAccessPoint?.id,
      meeting_point_id: selectedMeetingPoint?.id,
      intent_type: intentType,
      label: selectedPlace.name,
    });
    if (error || !data?.reach_link?.path) { setShareNotice(error?.message || 'Could not create ReachLink.'); return; }
    const url = new URL(data.reach_link.path, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: selectedPlace.name, text: 'Reach this place with AFAT', url });
      else { await navigator.clipboard.writeText(url); setShareNotice('AFAT ReachLink copied.'); }
    } catch {
      setShareNotice('ReachLink ready to share.');
    }
  };

  return <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">AFAT Passage</p><h2 className="mt-1 text-xl font-black tracking-tight text-white">Where are you going?</h2><p className="mt-1 text-xs leading-relaxed text-white/45">A place name is enough. Add a landmark, entrance or gate when it helps.</p></div>
      <Navigation2 className="h-5 w-5 text-blue-300" />
    </div>

    <div className="relative">
      <div className="grid gap-3 md:grid-cols-[1fr_170px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4">
          <Search className="h-4 w-4 text-white/35" />
          <input
            value={destination}
            onFocus={() => setSuggestionsOpen(Boolean(suggestions.length))}
            onChange={(event) => {
              setDestination(event.target.value);
              setSelectedPlace(null);
              setSelectedMeetingPoint(null);
              setCanonicalRoute(null);
              setRouteOptions({});
            }}
            onKeyDown={(event) => event.key === 'Enter' && resolveDestination()}
            placeholder="Mendong market, school gate, pharmacy…"
            className="min-h-14 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
          />
          {suggestionLoading && <span className="text-[8px] font-black uppercase text-cyan-200">Searching…</span>}
        </div>
        <button onClick={resolveDestination} disabled={loading || destination.trim().length < 3} className="min-h-14 rounded-2xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">{loading ? 'Finding…' : 'Find place'}</button>
      </div>

      {suggestionsOpen && !!suggestions.length && !selectedPlace && (
        <div className="absolute inset-x-0 top-[62px] z-40 max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-2xl md:right-[182px]">
          <p className="px-3 pb-2 pt-1 text-[8px] font-black uppercase tracking-widest text-white/30">
            {destination.trim() ? 'AFAT suggestions' : originFix ? 'Nearby verified places' : 'Recent places'}
          </p>
          {suggestions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectCandidate(candidate)}
              className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-white">{candidate.name}</p>
                <p className="mt-1 text-[10px] text-white/40">
                  {candidate.zone_label || candidate.city}
                  {(candidate as any).distance_m != null ? ` · ${Math.round(Number((candidate as any).distance_m))} m away` : ''}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-blue-300/15 bg-blue-400/10 px-2 py-1 text-[8px] font-black uppercase text-blue-100">
                {matchLabel(Number(candidate.confidence || 0))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
      <label className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Arrive by</span>
        <input type="datetime-local" value={arrivalTarget} onChange={(event) => setArrivalTarget(event.target.value)} className="mt-1 block w-full bg-transparent text-xs font-bold text-white outline-none" />
      </label>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">What do you need to do?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['go','meet','pickup','deliver','board','explore'] as const).map(intent=><button key={intent} type="button" onClick={()=>setIntentType(intent)} className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${intentType===intent?'border-cyan-300/30 bg-cyan-300/12 text-cyan-100':'border-white/10 bg-black/20 text-white/40'}`}>{intent}</button>)}
        </div>
      </div>
    </div>

    <div className="mt-4"><PassengerSpatialMap city={profile?.preferred_city || 'yaounde'} destination={destinationPoint} meetingPoint={meetingPoint} accessPoint={accessPoint} route={canonicalRoute} routeLoading={routeLoading} routeMessage={routeMessage} onOriginResolved={(origin) => { setOriginFix(origin); setOriginLabel(origin.label); }} /></div>

    {originFix && arrivalPoint && (
      <div className="mt-4">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Ways to move</p>
            <p className="mt-1 text-xs text-white/45">Choose from routes AFAT can actually connect. Unknown remains unknown.</p>
          </div>
          {routeLoading && <span className="text-[9px] font-black uppercase text-cyan-200">Checking routes…</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['walk', Footprints, 'Walk'],
            ['moto', Bike, 'Moto'],
            ['car', Car, 'Taxi / car'],
            ['minibus', Navigation2, 'Shared'],
          ] as const).map(([mode, Icon, label]) => {
            const option = routeOptions[mode];
            const available = option?.status === 'ok';
            const selected = vehicleType === mode;
            const km = Number(option?.distance_m || 0) / 1000;
            const dispatchable = mode !== 'walk';
            return (
              <button
                key={mode}
                type="button"
                disabled={!available}
                onClick={() => {
                  setVehicleType(mode);
                  setCanonicalRoute(option || null);
                  setRouteMessage(routeMessageFor(option || null));
                }}
                className={`rounded-2xl border p-3 text-left transition disabled:opacity-35 ${selected ? 'border-cyan-300/45 bg-cyan-400/12' : 'border-white/10 bg-white/[0.025]'}`}
              >
                <Icon className={`h-4 w-4 ${selected ? 'text-cyan-200' : 'text-white/45'}`} />
                <p className="mt-3 text-xs font-black text-white">{label}</p>
                <p className="mt-1 text-[9px] leading-4 text-white/40">
                  {!option ? 'Checking…' : available ? `${km ? km.toFixed(km >= 10 ? 0 : 1) + ' km' : 'Connected'} · ${option.eta_seconds ? Math.ceil(option.eta_seconds / 60) + ' min' : 'ETA learning'}` : 'No trusted path'}
                </p>
                {available && dispatchable && preflight[mode] && (
                  <div className="mt-2 space-y-1 text-[8px] font-bold uppercase tracking-wide">
                    <p className={preflight[mode]?.supply?.observed > 0 ? 'text-emerald-200' : 'text-amber-200'}>
                      {preflight[mode]?.supply?.observed > 0 ? `${preflight[mode].supply.observed} live supply observed` : 'No live supply observed'}
                    </p>
                    <p className="text-white/35">
                      {preflight[mode]?.fare?.state === 'historical_range'
                        ? `${preflight[mode].fare.low}–${preflight[mode].fare.high} XAF historical · not final`
                        : 'Fare evidence insufficient'}
                    </p>
                  </div>
                )}
                {available && !dispatchable && <p className="mt-2 text-[8px] font-black uppercase text-amber-200/75">Route preview</p>}
              </button>
            );
          })}
        </div>
      </div>
    )}

    {statusText && <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/8 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-100/75">{statusText}</div>}

    {!candidates.length && !selectedPlace && destination.trim().length>=3 && statusText.includes('unresolved') && <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-400/[0.05] p-4">
      <p className="text-sm font-black text-amber-100">AFAT does not know this destination confidently yet.</p>
      <p className="mt-1 text-xs leading-5 text-white/45">The demand is recorded. If you are physically at the destination now, you can add its real position as provisional evidence.</p>
      <button type="button" onClick={proposeHere} disabled={!originFix||loading} className="mt-3 min-h-10 rounded-xl bg-amber-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35">I am here · add this destination</button>
    </div>}

    {!!candidates.length && !selectedPlace && <div className="mt-4 space-y-3">
      {candidates.map((candidate, index) => <button key={candidate.id} onClick={() => selectCandidate(candidate)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-blue-400/35"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-white">{index + 1}. {candidate.name}</p><p className="mt-1 text-[11px] font-semibold text-white/45">{candidate.zone_label || candidate.city} · {candidate.vehicle_access} access</p></div><span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase text-blue-200">{matchLabel(Number(candidate.confidence || 0))}</span></div>{candidate.explanation?.length ? <p className="mt-3 text-[11px] leading-relaxed text-white/50">{candidate.explanation.slice(0, 2).join(' · ')}</p> : null}{Number(candidate.successful_pickups || 0) > 0 && <p className="mt-2 text-[10px] font-bold text-emerald-300/70">Recently used for {candidate.successful_pickups} successful pickup{candidate.successful_pickups === 1 ? '' : 's'}</p>}</button>)}
      <button onClick={markNoneCorrect} className="w-full rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-200">None of these</button>
    </div>}

    {selectedPlace && <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-white">{selectedPlace.name}</p><p className="mt-1 text-[10px] text-white/45">{selectedPlace.zone_label || selectedPlace.city}</p></div><CheckCircle className="h-5 w-5 text-emerald-300" /></div></div>
      <PlaceMediaStrip placeId={selectedPlace.id} placeName={selectedPlace.name} compact />
      <details className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-white/45">Own or manage this destination?</summary>
        <p className="mt-3 text-xs leading-5 text-white/45">Submit a claim to manage public operational details such as directions and hours. AFAT keeps map coordinates and evidence status under independent verification.</p>
        <button type="button" onClick={submitClaim} className="mt-3 min-h-10 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-[9px] font-black uppercase text-cyan-100">Submit management claim</button>
        {claimNotice&&<p className="mt-2 text-[10px] text-cyan-100/70">{claimNotice}</p>}
      </details>
      {!!selectedPlace.access_points?.length && <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-violet-200">How to enter</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {selectedPlace.access_points.map((access)=><button key={access.id} type="button" onClick={()=>setSelectedAccessPoint(access)} className={`rounded-xl border p-3 text-left ${selectedAccessPoint?.id===access.id?'border-violet-300/40 bg-violet-400/10':'border-white/10 bg-black/20'}`}>
            <p className="text-xs font-black">{access.name}</p><p className="mt-1 text-[9px] uppercase text-white/35">{access.access_type} · {Math.round(Number(access.confidence||0))}% evidence</p>{access.instructions&&<p className="mt-2 text-[10px] leading-4 text-white/50">{access.instructions}</p>}
          </button>)}
        </div>
      </div>
      {[...selectedPlace.meeting_points]
        .sort((a, b) => {
          const aCompatible = meetingSupportsMode(a, vehicleType) ? 1 : 0;
          const bCompatible = meetingSupportsMode(b, vehicleType) ? 1 : 0;
          return bCompatible - aCompatible || Number(b.suitability_score || 0) - Number(a.suitability_score || 0);
        })
        .map((candidateMeetingPoint, index) => {
        const suitability = Number(candidateMeetingPoint.suitability_score || candidateMeetingPoint.confidence || 0);
        return (
          <button
            key={candidateMeetingPoint.id}
            onClick={() => setSelectedMeetingPoint(candidateMeetingPoint)}
            className={`w-full rounded-2xl border p-4 text-left ${selectedMeetingPoint?.id === candidateMeetingPoint.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}
          >
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-orange-300" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-white">{candidateMeetingPoint.name}</p>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[8px] font-black uppercase text-cyan-100">
                    {meetingSupportsMode(candidateMeetingPoint, vehicleType) ? (index === 0 ? 'Best for mode · ' : '') : 'Limited for mode · '}{suitability}/100
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{candidateMeetingPoint.instructions}</p>
                <p className="mt-2 text-[10px] font-bold text-blue-200/70">
                  About {candidateMeetingPoint.walk_minutes} min walk
                  {Number(candidateMeetingPoint.successful_pickups || 0) > 0 ? ` · ${candidateMeetingPoint.successful_pickups} successful pickups` : ''}
                </p>
                {!!candidateMeetingPoint.suitability_explanation?.length && (
                  <p className="mt-2 text-[10px] leading-4 text-white/40">
                    {candidateMeetingPoint.suitability_explanation.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
      {!selectedPlace.meeting_points.length && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/75"><ShieldAlert className="mb-2 h-4 w-4" />This landmark is known, but AFAT has not yet confirmed a reliable meeting point here.</div>}
      {!originFix && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/80">Confirm your current location on the map before requesting transport.</div>}
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]"><button onClick={() => { setSelectedPlace(null); setSelectedMeetingPoint(null); setSelectedAccessPoint(null); setRouteOptions({}); setCanonicalRoute(null); }} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/55">Back</button><button onClick={navigateOnly} disabled={loading || !originFix || canonicalRoute?.status !== 'ok'} className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyan-100 disabled:opacity-40">Navigate only</button><button onClick={createPassage} disabled={loading || !originFix || !arrivalPoint || vehicleType === 'walk' || canonicalRoute?.status !== 'ok'} className="rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 disabled:opacity-50"><Clock className="mr-2 inline h-4 w-4" />Book transport</button><button type="button" onClick={shareReach} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/65"><Share2 className="mr-2 inline h-4 w-4"/>Share</button></div>
      {shareNotice&&<p className="text-[10px] text-cyan-100/70">{shareNotice}</p>}
    </div>}
  </section>;
}
