import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Car, CheckCircle, Clock, Footprints, MapPin, Navigation2, Search, Share2, ShieldAlert, Square } from 'lucide-react';
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
import { ReachabilityInsightCard } from './ReachabilityInsightCard';
import { fetchCanonicalAfatRoute, type AfatCanonicalRoute, type AfatRouteMode } from '../../services/canonicalRouteClient';
import {
  clearJourneyRuntime,
  loadJourneyRuntime,
  saveJourneyRuntime,
  type AfatJourneyRuntimeSnapshot,
} from '../../services/journeyRuntime';
import {
  assessPlaceReachability,
  planMultimodalJourney,
  recordMobilityGap,
  type AfatMultimodalPlan,
  type AfatReachabilityAssessment,
} from '../../services/mobilityEvidenceClient';
import { decideReroute, formatRouteProgress, type AfatRouteProgress } from '../../services/routeGuidance';

type Props = {
  profile: any;
  originText?: string;
  initialDestination?: string;
  initialIntent?: 'go'|'meet'|'pickup'|'dropoff'|'send'|'deliver'|'board'|'explore';
  onPassageCreated?: (passage: any) => void;
};

type OriginFix = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  label: string;
  source?: 'gps' | 'manual';
};

function pointFrom(value: any, fallbackName?: string) {
  if (!value) return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, name: value.name || value.canonical_name || fallbackName || null, instructions: value.instructions || null };
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
    const distance = km > 0 ? ` · ${km.toFixed(km >= 10 ? 0 : 1)} km` : '';
    if (route.eta_seconds) return `Connected AFAT route ready${distance} · ${Math.ceil(route.eta_seconds / 60)} min observed ETA.`;
    const coverage = Number(route.eta_profile_coverage || 0);
    if (coverage > 0) return `Connected AFAT route ready${distance}. ETA is withheld because trusted speed evidence covers only ${Math.round(coverage * 100)}% of this route.`;
    return `Connected AFAT route ready${distance}. ETA appears only after opted-in real journeys create trusted speed coverage.`;
  }
  const copy: Record<string, string> = {
    origin_not_connected_to_trusted_graph: 'AFAT has not connected your current position to its road graph yet.',
    destination_not_connected_to_trusted_graph: 'This destination is known, but its nearby road graph is not connected yet.',
    no_trusted_graph_path: 'AFAT cannot yet confirm a connected path between these points.',
    no_shared_connected_component_within_snap_radius: 'AFAT cannot connect both points to the same road network within the current search radius.',
    no_graph_path_after_shared_component_snap: 'AFAT found the same road network near both points but could not build a complete path through it.',
  };
  return copy[route.reason || ''] || 'A connected AFAT route is not available for these points yet.';
}

type JourneyDecision = { mode: AfatRouteMode; label: string; reason: string; evidence: 'strong' | 'partial' };

function chooseJourneyDecision(
  routes: Partial<Record<AfatRouteMode, AfatCanonicalRoute>>,
  preflight: Record<string, any>,
): JourneyDecision | null {
  const labels: Record<AfatRouteMode,string> = { walk:'Walk', bike:'Bike', moto:'Moto', car:'Taxi / car', minibus:'Shared' };
  const available = (Object.entries(routes) as [AfatRouteMode,AfatCanonicalRoute][]).filter(([,route]) => route?.status === 'ok');
  if (!available.length) return null;
  const scored = available.map(([mode,route]) => {
    const eta = Number(route.eta_seconds || 0);
    const supply = mode === 'walk' ? 1 : Number(preflight[mode]?.supply?.observed || 0);
    const hasFare = preflight[mode]?.fare?.state === 'historical_range';
    const score = (eta > 0 ? Math.max(0, 3600 - eta) / 60 : 0) + Math.min(supply, 10) * 8 + (hasFare ? 4 : 0) + (mode === 'walk' ? 2 : 0);
    return { mode, route, eta, supply, hasFare, score };
  }).sort((a,b) => b.score - a.score);
  const best = scored[0];
  const reasons:string[] = [];
  if (best.eta > 0) reasons.push(`${Math.ceil(best.eta/60)} min observed ETA`);
  else reasons.push('connected route');
  if (best.mode !== 'walk') {
    reasons.push(best.supply > 0 ? `${best.supply} live option${best.supply === 1 ? '' : 's'} observed` : 'live supply not yet observed');
    if (best.hasFare) reasons.push('fare range has historical evidence');
  }
  return {
    mode: best.mode,
    label: labels[best.mode],
    reason: reasons.join(' · '),
    evidence: best.eta > 0 && (best.mode === 'walk' || best.supply > 0) ? 'strong' : 'partial',
  };
}

function preferredCityKey(profile: any) {
  return String(profile?.preferred_city || '').toLowerCase().includes('douala') ? 'cm-douala' : 'cm-yaounde';
}

export function PassagePlanner({ profile, originText = '', initialDestination = '', initialIntent = 'go', onPassageCreated }: Props) {
  const [destination, setDestination] = useState(initialDestination);
  const [originLabel, setOriginLabel] = useState(originText);
  const [originFix, setOriginFix] = useState<OriginFix | null>(null);
  const [routeOriginFix, setRouteOriginFix] = useState<OriginFix | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState('');
  const [vehicleType, setVehicleType] = useState<AfatRouteMode>('car');
  const [intentType, setIntentType] = useState<'go'|'meet'|'pickup'|'dropoff'|'send'|'deliver'|'board'|'explore'>(initialIntent);
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
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationSamples, setNavigationSamples] = useState(0);
  const [routeProgress, setRouteProgress] = useState<AfatRouteProgress | null>(null);
  const [reachability, setReachability] = useState<AfatReachabilityAssessment | null>(null);
  const [multimodal, setMultimodal] = useState<AfatMultimodalPlan | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [resumeSnapshot, setResumeSnapshot] = useState<AfatJourneyRuntimeSnapshot | null>(() => loadJourneyRuntime());
  const lastRerouteAtRef = useRef<number | null>(null);
  const gapKeysRef = useRef(new Set<string>());
  const [recentPlaces, setRecentPlaces] = useState<AfatPlaceCandidate[]>(() => {
    try {
      const raw = localStorage.getItem('afat_recent_places_v1');
      return raw ? JSON.parse(raw).slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  const recordGapOnce = (key: string, payload: Parameters<typeof recordMobilityGap>[0]) => {
    if (!profile?.id || gapKeysRef.current.has(key)) return;
    gapKeysRef.current.add(key);
    void recordMobilityGap(payload);
  };

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
    setReachability(null);
    setMultimodal(null);
    setRouteProgress(null);
    if (initialDestination) setNavigationActive(false);
  }, [initialDestination]);

  useEffect(() => { setOriginLabel(originText); }, [originText]);
  useEffect(() => { setIntentType(initialIntent); }, [initialIntent]);

  useEffect(() => {
    let active = true;
    const query = destination.trim();
    if (selectedPlace && query === selectedPlace.name) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      if (query.length > 0 && query.length < 2) { setSuggestions([]); return; }
      setSuggestionLoading(true);
      const { data, error } = await discoverAfatPlaces({
        query: query || undefined,
        city: profile?.preferred_city || 'yaounde',
        latitude: originFix?.latitude,
        longitude: originFix?.longitude,
        limit: 10,
      });
      if (!active) return;
      setSuggestionLoading(false);
      if (error) { setSuggestions([]); return; }
      const discovered = (data?.results || []) as AfatPlaceCandidate[];
      const fallback = !query && !discovered.length ? recentPlaces : discovered;
      setSuggestions(fallback);
      setSuggestionsOpen(Boolean(fallback.length));
    }, query ? 220 : 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [destination, originFix?.latitude, originFix?.longitude, profile?.preferred_city, selectedPlace?.id, recentPlaces]);

  const destinationPoint = useMemo(() => pointFrom(selectedPlace, selectedPlace?.name), [selectedPlace]);
  const meetingPoint = useMemo(() => pointFrom(selectedMeetingPoint, selectedMeetingPoint?.name), [selectedMeetingPoint]);
  const accessPoint = useMemo(() => pointFrom(selectedAccessPoint, selectedAccessPoint?.name), [selectedAccessPoint]);
  const arrivalPoint = (intentType==='meet'||intentType==='pickup'||intentType==='board') ? (meetingPoint || accessPoint || destinationPoint) : (accessPoint || meetingPoint || destinationPoint);
  const journeyDecision = useMemo(() => chooseJourneyDecision(routeOptions, preflight), [routeOptions, preflight]);
  const routingOrigin = routeOriginFix || originFix;
  const progressCopy = useMemo(() => formatRouteProgress(routeProgress), [routeProgress]);
  const cityKey = preferredCityKey(profile);

  useEffect(() => {
    let active = true;
    if (!routingOrigin || !arrivalPoint) {
      setCanonicalRoute(null);
      setRouteOptions({});
      setRouteMessage('');
      return;
    }
    const modes: AfatRouteMode[] = navigationActive ? [vehicleType] : ['walk', 'moto', 'car', 'minibus'];
    setRouteLoading(true);
    setRouteMessage('');
    Promise.all(modes.map(async (mode) => {
      try {
        const route = await fetchCanonicalAfatRoute({
          originLatitude: routingOrigin.latitude,
          originLongitude: routingOrigin.longitude,
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
      if (navigationActive) setRouteOptions((previous) => ({ ...previous, ...next }));
      else setRouteOptions(next);
      const selected = next[vehicleType] || (!navigationActive ? next.car || null : null);
      if (selected) {
        setCanonicalRoute(selected);
        setRouteMessage(routeMessageFor(selected));
        if (selected.status !== 'ok' && selectedPlace) {
          recordGapOnce(`route:${selectedPlace.id}:${vehicleType}`, {
            cityKey,
            signalType: 'route_failure',
            label: `${selectedPlace.name} · ${vehicleType} route unavailable`,
            placeId: selectedPlace.id,
            mode: vehicleType,
            latitude: arrivalPoint.latitude,
            longitude: arrivalPoint.longitude,
            metadata: { reason: selected.reason || 'route_unavailable' },
          });
        }
      }
      if (!navigationActive && selected?.status !== 'ok') {
        const firstAvailable = (['moto','car','minibus','walk'] as AfatRouteMode[]).find((mode) => next[mode]?.status === 'ok');
        if (firstAvailable) {
          setVehicleType(firstAvailable);
          setCanonicalRoute(next[firstAvailable] || null);
          setRouteMessage(routeMessageFor(next[firstAvailable] || null));
        }
      }
    }).finally(() => { if (active) setRouteLoading(false); });
    return () => { active = false; };
  }, [routingOrigin?.latitude, routingOrigin?.longitude, arrivalPoint?.latitude, arrivalPoint?.longitude, navigationActive, vehicleType, selectedPlace?.id, cityKey]);

  useEffect(() => {
    if (!selectedPlace || !originFix || canonicalRoute?.status !== 'ok' || navigationActive) return;
    saveJourneyRuntime({
      profileId: profile?.id || null,
      cityKey,
      state: 'route_ready',
      placeId: selectedPlace.id,
      placeName: selectedPlace.name,
      accessPointId: selectedAccessPoint?.id || null,
      meetingPointId: selectedMeetingPoint?.id || null,
      destinationLatitude: arrivalPoint?.latitude || selectedPlace.latitude,
      destinationLongitude: arrivalPoint?.longitude || selectedPlace.longitude,
      mode: vehicleType,
      intentType,
      routeDistanceM: canonicalRoute.distance_m || null,
      lastPosition: { latitude: originFix.latitude, longitude: originFix.longitude, accuracy: originFix.accuracy ?? null, speedKph: originFix.speedKph ?? null, heading: originFix.heading ?? null, recordedAt: new Date().toISOString() },
    });
  }, [selectedPlace?.id, selectedAccessPoint?.id, selectedMeetingPoint?.id, originFix?.latitude, originFix?.longitude, canonicalRoute?.status, canonicalRoute?.distance_m, vehicleType, intentType, navigationActive, cityKey]);

  useEffect(() => {
    let active = true;
    if (!selectedPlace?.id || !originFix) {
      setReachability(null);
      setMultimodal(null);
      setIntelligenceLoading(false);
      return;
    }
    setIntelligenceLoading(true);
    Promise.all([
      assessPlaceReachability({ placeId: selectedPlace.id, originLatitude: originFix.latitude, originLongitude: originFix.longitude, mode: vehicleType }),
      planMultimodalJourney({ placeId: selectedPlace.id, originLatitude: originFix.latitude, originLongitude: originFix.longitude }),
    ]).then(([assessment, plan]) => {
      if (!active) return;
      setReachability(assessment);
      setMultimodal(plan);
      if (assessment.missing_evidence?.includes('verified_access_or_entrance')) {
        recordGapOnce(`access:${selectedPlace.id}`, {
          cityKey,
          signalType: 'access_gap',
          label: `${selectedPlace.name} · entrance/access evidence missing`,
          placeId: selectedPlace.id,
          mode: vehicleType,
          latitude: Number(selectedPlace.latitude),
          longitude: Number(selectedPlace.longitude),
          metadata: { reachability_state: assessment.state, reliability_score: assessment.reliability_score },
        });
      }
      if ((intentType === 'board' || vehicleType === 'minibus') && plan.multimodal_chain_status === 'insufficient_transit_evidence') {
        recordGapOnce(`transit:${selectedPlace.id}`, {
          cityKey,
          signalType: 'transit_gap',
          label: `${selectedPlace.name} · transit evidence insufficient`,
          placeId: selectedPlace.id,
          mode: vehicleType,
          latitude: Number(selectedPlace.latitude),
          longitude: Number(selectedPlace.longitude),
          metadata: { multimodal_chain_status: plan.multimodal_chain_status },
        });
      }
    }).catch(() => {
      if (active) {
        setReachability(null);
        setMultimodal(null);
      }
    }).finally(() => { if (active) setIntelligenceLoading(false); });
    return () => { active = false; };
  }, [selectedPlace?.id, originFix?.latitude, originFix?.longitude, vehicleType, intentType, cityKey]);

  useEffect(() => {
    let active = true;
    if (!originFix || !arrivalPoint) { setPreflight({}); return; }
    const modes: AfatRouteMode[] = navigationActive ? [] : ['moto','car','minibus'];
    if (!modes.length) return;
    Promise.all(modes.map(async (mode) => {
      const route = routeOptions[mode];
      if (!route || route.status !== 'ok') return [mode, null] as const;
      const { data } = await fetchPassagePreflight({ mode, pickupLatitude: originFix.latitude, pickupLongitude: originFix.longitude, distanceM: route.distance_m });
      return [mode, data] as const;
    })).then((entries) => {
      if (active) setPreflight(Object.fromEntries(entries.filter(([, value]) => value)));
    });
    return () => { active = false; };
  }, [originFix?.latitude, originFix?.longitude, arrivalPoint?.latitude, arrivalPoint?.longitude, routeOptions, navigationActive]);

  useEffect(() => {
    if (!selectedPlace?.meeting_points?.length) return;
    const compatible = selectedPlace.meeting_points
      .filter((point) => meetingSupportsMode(point, vehicleType))
      .sort((a, b) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0));
    if (compatible.length && (!selectedMeetingPoint || !meetingSupportsMode(selectedMeetingPoint, vehicleType))) setSelectedMeetingPoint(compatible[0]);
  }, [vehicleType, selectedPlace?.id, selectedMeetingPoint?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedPlace?.id || (selectedPlace as any).search_result_kind === 'road') return;
    resolveAfatDestinationIntent(selectedPlace.id, { intent_type: intentType, mode: vehicleType }).then(({ data, error }) => {
      if (!active || error || !data) return;
      if (data.access_point) setSelectedAccessPoint(data.access_point as AfatAccessPoint);
      if (data.meeting_point) setSelectedMeetingPoint(data.meeting_point as AfatMeetingPoint);
      if (data.target_kind === 'access_point' && data.access_point) {
        const limited = ['limited','stale','disputed'].includes(String(data.access_point.evidence_status||'limited'));
        setStatusText(limited ? `${data.access_point.name} is the strongest reference AFAT currently has, but it still needs verification.` : `AFAT recommends ${data.access_point.name} for this ${intentType} trip.`);
      } else if (data.target_kind === 'meeting_point' && data.meeting_point) {
        const limited = ['limited','stale','disputed'].includes(String(data.meeting_point.evidence_status||'limited'));
        setStatusText(limited ? `${data.meeting_point.name} is a reference meeting point that still needs verification.` : `AFAT recommends ${data.meeting_point.name} as the meeting point.`);
      }
    });
    return () => { active = false; };
  }, [selectedPlace?.id, intentType, vehicleType]);

  const selectCandidate = (candidate: AfatPlaceCandidate) => {
    setDestination(candidate.name);
    setSuggestions([]);
    setSuggestionsOpen(false);
    const nextRecents = [candidate, ...recentPlaces.filter((item) => item.id !== candidate.id)].slice(0, 5);
    setRecentPlaces(nextRecents);
    try { localStorage.setItem('afat_recent_places_v1', JSON.stringify(nextRecents)); } catch {}
    setSelectedPlace(candidate);
    const bestMeetingPoint = [...(candidate.meeting_points || [])].sort((a, b) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0))[0] || null;
    const bestAccessPoint = [...(candidate.access_points || [])].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0] || null;
    setSelectedMeetingPoint(bestMeetingPoint);
    setSelectedAccessPoint(bestAccessPoint);
    setNavigationActive(false);
    setRouteProgress(null);
    setRouteOriginFix(originFix);
    saveJourneyRuntime({
      profileId: profile?.id || null,
      cityKey,
      state: originFix ? 'origin_ready' : 'destination_selected',
      placeId: candidate.id,
      placeName: candidate.name,
      accessPointId: bestAccessPoint?.id || null,
      meetingPointId: bestMeetingPoint?.id || null,
      destinationLatitude: Number(candidate.latitude),
      destinationLongitude: Number(candidate.longitude),
      mode: vehicleType,
      intentType,
      lastPosition: originFix ? { latitude: originFix.latitude, longitude: originFix.longitude, accuracy: originFix.accuracy ?? null, speedKph: originFix.speedKph ?? null, heading: originFix.heading ?? null, recordedAt: new Date().toISOString() } : null,
      sampleCount: 0,
    });
    setStatusText(bestMeetingPoint || bestAccessPoint ? 'Destination selected. AFAT is checking the best arrival point and connected routes.' : 'Destination selected. AFAT is checking nearby roads and last-metre access.');
  };

  const resolveDestination = async () => {
    if (destination.trim().length < 2) return;
    setLoading(true);
    setStatusText('Searching AFAT place intelligence…');
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setSelectedAccessPoint(null);
    setCanonicalRoute(null);
    setRouteOptions({});
    setReachability(null);
    setMultimodal(null);
    const { data, error } = await resolveAfatPlace({ query: destination.trim(), city: profile?.preferred_city || 'yaounde' });
    setLoading(false);
    if (error) { setCandidates([]); setStatusText(error.message); return; }
    const relevantCandidates = filterRelevantPlaceCandidates(destination, data?.candidates || []);
    setCandidates(relevantCandidates);
    if (relevantCandidates.length === 1) selectCandidate(relevantCandidates[0]);
    else if (!relevantCandidates.length && profile?.id) {
      void recordUnresolvedDestination({
        query_text: destination.trim(), city: profile?.preferred_city || 'yaounde', intent_type: intentType,
        origin_lat: originFix?.latitude, origin_lng: originFix?.longitude, requested_mode: vehicleType,
        evidence: { surface: 'passage_planner', automatic_truth: false },
      });
    }
    if (relevantCandidates.length > 1) setStatusText('Choose the place you mean.');
    else if (!relevantCandidates.length) setStatusText('AFAT could not confirm that destination yet. The demand was recorded instead of guessing.');
  };

  const handleMapPlaceSelected = async (place: { id: string; name: string; latitude: number; longitude: number; kind?: string | null; evidence_status?: string | null; source_only?: boolean }) => {
    setDestination(place.name);
    setStatusText(`Opening ${place.name} from the map…`);
    const { data } = await discoverAfatPlaces({
      query: place.name,
      city: profile?.preferred_city || 'yaounde',
      latitude: place.latitude,
      longitude: place.longitude,
      limit: 12,
    });
    const discovered = (data?.results || []) as AfatPlaceCandidate[];
    const exact = discovered.find((candidate) => candidate.id === place.id)
      || discovered.find((candidate) => String(candidate.name).toLowerCase() === String(place.name).toLowerCase());
    if (exact) { selectCandidate(exact); return; }
    selectCandidate({
      id: place.id,
      name: place.name,
      city: profile?.preferred_city || 'Yaoundé',
      latitude: place.latitude,
      longitude: place.longitude,
      vehicle_access: 'unknown',
      confidence: 0,
      confidence_label: 'low',
      successful_pickups: 0,
      explanation: ['Selected directly from the AFAT map. Reachability remains learning.'],
      meeting_points: [],
      access_points: [],
      destination_kind: place.kind || 'place',
      reachability_state: 'learning',
    } as AfatPlaceCandidate);
  };

  const markNoneCorrect = async () => {
    await confirmAfatPlace({ profile_id: profile?.id, query_text: destination.trim(), city: profile?.preferred_city || 'yaounde', resolution_status: 'none_correct', feedback: 'Passenger rejected all ranked candidates.' });
    setSelectedPlace(null); setSelectedMeetingPoint(null); setSelectedAccessPoint(null); setCandidates([]); setCanonicalRoute(null); setNavigationActive(false); setRouteProgress(null);
    clearJourneyRuntime('cancelled');
    setStatusText('AFAT kept this place unresolved instead of sending you to the wrong location.');
  };

  const updateOrigin = (origin: OriginFix) => {
    setOriginFix(origin);
    if (!navigationActive) setRouteOriginFix(origin);
    setOriginLabel(origin.label);
    const current = loadJourneyRuntime();
    saveJourneyRuntime({
      profileId: profile?.id || null,
      cityKey,
      state: navigationActive ? 'navigating' : selectedPlace ? 'origin_ready' : current?.state || 'idle',
      accessPointId: selectedAccessPoint?.id || current?.accessPointId || null,
      meetingPointId: selectedMeetingPoint?.id || current?.meetingPointId || null,
      lastPosition: { latitude: origin.latitude, longitude: origin.longitude, accuracy: origin.accuracy ?? null, speedKph: origin.speedKph ?? null, heading: origin.heading ?? null, recordedAt: new Date().toISOString() },
    });
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
      context: { execution: 'navigation_live', route_distance_m: canonicalRoute.distance_m || null },
    });
    setNavigationSamples(0);
    setRouteProgress(null);
    setRouteOriginFix(originFix);
    lastRerouteAtRef.current = Date.now();
    setNavigationActive(true);
    const snapshot = saveJourneyRuntime({
      profileId: profile?.id || null,
      cityKey,
      state: 'navigating',
      placeId: selectedPlace.id,
      placeName: selectedPlace.name,
      accessPointId: selectedAccessPoint?.id || null,
      meetingPointId: selectedMeetingPoint?.id || null,
      destinationLatitude: arrivalPoint?.latitude || selectedPlace.latitude,
      destinationLongitude: arrivalPoint?.longitude || selectedPlace.longitude,
      mode: vehicleType,
      intentType,
      routeDistanceM: canonicalRoute.distance_m || null,
      startedAt: new Date().toISOString(),
      lastPosition: { latitude: originFix.latitude, longitude: originFix.longitude, accuracy: originFix.accuracy ?? null, speedKph: originFix.speedKph ?? null, heading: originFix.heading ?? null, recordedAt: new Date().toISOString() },
      sampleCount: 0,
    });
    setResumeSnapshot(snapshot);
    setStatusText(error ? 'Live navigation started. AFAT could not sync the navigation intent to the server, so it is not claiming that sync succeeded.' : 'Live navigation started. AFAT follows every GPS sample but reroutes only after meaningful off-route movement.');
  };

  const stopNavigation = () => {
    setNavigationActive(false);
    setRouteProgress(null);
    const stopped = clearJourneyRuntime('cancelled');
    setResumeSnapshot(stopped);
    setStatusText('Live navigation stopped. AFAT kept no claim that the trip was completed.');
  };

  const handleNavigationPosition = (origin: OriginFix) => {
    setOriginFix(origin);
    setOriginLabel(origin.label);
    const decision = decideReroute({
      route: canonicalRoute,
      position: { latitude: origin.latitude, longitude: origin.longitude, accuracy: origin.accuracy ?? null },
      lastRerouteAt: lastRerouteAtRef.current,
      cooldownMs: 20_000,
    });
    setRouteProgress(decision.progress);
    if (decision.shouldReroute) {
      lastRerouteAtRef.current = Date.now();
      setRouteOriginFix(origin);
      setStatusText(`AFAT detected meaningful off-route movement${decision.progress ? ` (${Math.round(decision.progress.nearestDistanceM)} m from the current path)` : ''} and is rebuilding the route.`);
    }
    setNavigationSamples((count) => {
      const next = count + 1;
      saveJourneyRuntime({
        profileId: profile?.id || null,
        cityKey,
        state: 'navigating',
        accessPointId: selectedAccessPoint?.id || null,
        meetingPointId: selectedMeetingPoint?.id || null,
        lastPosition: { latitude: origin.latitude, longitude: origin.longitude, accuracy: origin.accuracy ?? null, speedKph: origin.speedKph ?? null, heading: origin.heading ?? null, recordedAt: new Date().toISOString() },
        sampleCount: next,
      });
      return next;
    });
  };

  const handleArrival = (payload: { latitude: number; longitude: number; distanceM: number; accuracyM?: number | null }) => {
    setNavigationActive(false);
    setRouteProgress(null);
    const snapshot = saveJourneyRuntime({
      profileId: profile?.id || null,
      cityKey,
      state: 'arrived',
      accessPointId: selectedAccessPoint?.id || null,
      meetingPointId: selectedMeetingPoint?.id || null,
      arrivedAt: new Date().toISOString(),
      lastPosition: { latitude: payload.latitude, longitude: payload.longitude, accuracy: payload.accuracyM ?? null, speedKph: null, heading: null, recordedAt: new Date().toISOString() },
      sampleCount: navigationSamples,
    });
    setResumeSnapshot(snapshot);
    setStatusText(`Arrival detected about ${Math.round(payload.distanceM)} m from the selected arrival point. AFAT recorded this as an arrival event, not automatic map truth.`);
    if (selectedPlace) {
      void recordAfatIntent({
        intent_type: intentType,
        place_id: selectedPlace.id,
        access_point_id: selectedAccessPoint?.id,
        meeting_point_id: selectedMeetingPoint?.id,
        movement_mode: vehicleType,
        origin_lat: payload.latitude,
        origin_lng: payload.longitude,
        context: { execution: 'navigation_arrival', distance_to_arrival_m: payload.distanceM, runtime_samples: navigationSamples },
      });
    }
  };

  const resumeNavigation = async () => {
    const snapshot = loadJourneyRuntime();
    if (!snapshot?.placeName || snapshot.state !== 'navigating') return;
    setVehicleType((snapshot.mode as AfatRouteMode) || 'car');
    setIntentType((snapshot.intentType as any) || 'go');
    if (snapshot.lastPosition) {
      const restored: OriginFix = { latitude: snapshot.lastPosition.latitude, longitude: snapshot.lastPosition.longitude, accuracy: snapshot.lastPosition.accuracy, speedKph: snapshot.lastPosition.speedKph, heading: snapshot.lastPosition.heading, label: 'Last navigation position', source: 'gps' };
      setOriginFix(restored);
      setRouteOriginFix(restored);
    }
    const { data } = await discoverAfatPlaces({ query: snapshot.placeName, city: profile?.preferred_city || 'yaounde', limit: 12 });
    const discovered = (data?.results || []) as AfatPlaceCandidate[];
    const exact = discovered.find((candidate) => candidate.id === snapshot.placeId) || discovered[0];
    if (!exact) { setStatusText('AFAT could not safely restore the previous destination. Search it again instead of resuming a guessed journey.'); return; }
    selectCandidate(exact);
    setNavigationSamples(snapshot.sampleCount || 0);
    setNavigationActive(true);
    lastRerouteAtRef.current = Date.now();
    setStatusText('Live navigation resumed from the saved journey state. GPS will replace the last stored position as soon as a fresh fix arrives.');
  };

  const createPassage = async () => {
    if (!profile?.id || !selectedPlace || !arrivalPoint) return;
    if (!originFix) { setStatusText('Use the location button on the map to confirm where the operator should collect you.'); return; }
    if (vehicleType !== 'walk' && Number(preflight[vehicleType]?.supply?.observed || 0) === 0) {
      recordGapOnce(`supply:${selectedPlace.id}:${vehicleType}`, {
        cityKey,
        signalType: 'supply_gap',
        label: `${selectedPlace.name} · ${vehicleType} requested with no live supply observed`,
        placeId: selectedPlace.id,
        mode: vehicleType,
        latitude: originFix.latitude,
        longitude: originFix.longitude,
        metadata: { surface: 'passage_booking' },
      });
    }
    setLoading(true);
    setStatusText('Creating the transport request…');
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
      meeting_point_id: selectedMeetingPoint?.id,
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
        reachability_state: reachability?.state || null,
        reachability_score: reachability?.reliability_score ?? null,
      },
    });
    setLoading(false);
    if (error) { setStatusText(error.message); return; }
    const hasDispatch = Boolean(data?.dispatch?.id || data?.assignment?.id || data?.passage?.dispatch_assignment_id);
    setStatusText(hasDispatch ? 'Transport request created and a dispatch assignment exists.' : 'Transport request created. AFAT will only show operator matching after a real dispatch assignment exists.');
    void recordAfatIntent({ intent_type:intentType, place_id:selectedPlace.id, access_point_id:selectedAccessPoint?.id, meeting_point_id:selectedMeetingPoint?.id, movement_mode:vehicleType, origin_lat:originFix.latitude, origin_lng:originFix.longitude, context:{ passage_id:data?.passage?.id||null, execution:'booking', dispatch_assignment_present:hasDispatch } });
    onPassageCreated?.(data?.passage);
  };

  const proposeHere = async () => {
    if (!originFix || destination.trim().length < 3) { setStatusText('Confirm your real current position first. AFAT will not invent a location for an unknown destination.'); return; }
    setLoading(true);
    const { data, error } = await proposeAfatDestination({
      name: destination.trim(), city: profile?.preferred_city || 'Yaoundé', latitude: originFix.latitude, longitude: originFix.longitude,
      destination_kind: 'other', intent_type: intentType,
      evidence: { source_surface: 'passage_planner', location_source: originFix.source || 'gps', accuracy_m: originFix.accuracy ?? null },
    });
    if (error) { setLoading(false); setStatusText(error.message); return; }
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
    const { error } = await claimAfatDestination(selectedPlace.id, { claim_type: selectedPlace.destination_kind === 'business' ? 'business' : 'manager', evidence: { source_surface: 'passage_planner', requested_at: new Date().toISOString() } });
    setClaimNotice(error ? error.message : 'Claim submitted for review. Claiming a place does not change its map truth or coordinates.');
  };

  const shareReach = async () => {
    if (!selectedPlace) return;
    setShareNotice('');
    const { data, error } = await createAfatReachLink({ place_id: selectedPlace.id, access_point_id: selectedAccessPoint?.id, meeting_point_id: selectedMeetingPoint?.id, intent_type: intentType, label: selectedPlace.name });
    if (error || !data?.reach_link?.path) { setShareNotice(error?.message || 'Could not create ReachLink.'); return; }
    const url = new URL(data.reach_link.path, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: selectedPlace.name, text: 'Reach this place with AFAT', url });
      else { await navigator.clipboard.writeText(url); setShareNotice('AFAT ReachLink copied.'); }
    } catch { setShareNotice('ReachLink ready to share.'); }
  };

  const resumable = resumeSnapshot?.state === 'navigating' && resumeSnapshot?.placeName && (!profile?.id || !resumeSnapshot.profileId || resumeSnapshot.profileId === profile.id);

  return <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">AFAT Passage</p><h2 className="mt-1 text-xl font-black tracking-tight text-white">Where are you going?</h2><p className="mt-1 text-xs leading-relaxed text-white/45">Search or tap a place on the map. AFAT keeps one journey state from destination to arrival.</p></div>
      <Navigation2 className="h-5 w-5 text-blue-300" />
    </div>

    {resumable && !navigationActive && !selectedPlace && (
      <div className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Unfinished journey</p>
        <p className="mt-1 text-sm font-black text-white">{resumeSnapshot?.placeName}</p>
        <p className="mt-1 text-[10px] text-white/45">AFAT saved the previous navigation state. It will require fresh GPS before treating your position as current.</p>
        <button type="button" onClick={resumeNavigation} className="mt-3 min-h-10 rounded-xl bg-emerald-400 px-4 text-[9px] font-black uppercase text-slate-950">Resume navigation</button>
      </div>
    )}

    <div className="relative">
      <div className="grid gap-3 md:grid-cols-[1fr_170px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4">
          <Search className="h-4 w-4 text-white/35" />
          <input
            value={destination}
            onFocus={() => setSuggestionsOpen(Boolean(suggestions.length))}
            onChange={(event) => {
              setDestination(event.target.value);
              setSelectedPlace(null); setSelectedMeetingPoint(null); setSelectedAccessPoint(null); setCanonicalRoute(null); setRouteOptions({}); setNavigationActive(false); setReachability(null); setMultimodal(null); setRouteProgress(null);
            }}
            onKeyDown={(event) => event.key === 'Enter' && resolveDestination()}
            placeholder="Mendong, Biyem-Assi, school, market, pharmacy…"
            className="min-h-14 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
          />
          {suggestionLoading && <span className="text-[8px] font-black uppercase text-cyan-200">Searching…</span>}
        </div>
        <button onClick={resolveDestination} disabled={loading || destination.trim().length < 2} className="min-h-14 rounded-2xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">{loading ? 'Finding…' : 'Find place'}</button>
      </div>

      {suggestionsOpen && !!suggestions.length && !selectedPlace && (
        <div className="absolute inset-x-0 top-[62px] z-40 max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-2xl md:right-[182px]">
          <p className="px-3 pb-2 pt-1 text-[8px] font-black uppercase tracking-widest text-white/30">{destination.trim() ? 'AFAT suggestions' : originFix ? 'Nearby places' : 'Recent places'}</p>
          {suggestions.map((candidate) => (
            <button key={candidate.id} type="button" onClick={() => selectCandidate(candidate)} className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5">
              <div className="min-w-0"><p className="truncate text-xs font-black text-white">{candidate.name}</p><p className="mt-1 text-[10px] text-white/40">{candidate.zone_label || candidate.city}{(candidate as any).distance_m != null ? ` · ${Math.round(Number((candidate as any).distance_m))} m away` : ''}</p></div>
              <span className="shrink-0 rounded-full border border-blue-300/15 bg-blue-400/10 px-2 py-1 text-[8px] font-black uppercase text-blue-100">{matchLabel(Number(candidate.confidence || 0))}</span>
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
        <div className="mt-2 flex flex-wrap gap-2">{(['go','meet','pickup','deliver','board','explore'] as const).map(intent=><button key={intent} type="button" onClick={()=>setIntentType(intent)} className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${intentType===intent?'border-cyan-300/30 bg-cyan-300/12 text-cyan-100':'border-white/10 bg-black/20 text-white/40'}`}>{intent}</button>)}</div>
      </div>
    </div>

    <div className="mt-4">
      <PassengerSpatialMap
        city={profile?.preferred_city || 'yaounde'}
        destination={destinationPoint}
        meetingPoint={meetingPoint}
        accessPoint={accessPoint}
        route={canonicalRoute}
        routeLoading={routeLoading}
        routeMessage={routeMessage}
        navigationActive={navigationActive}
        onOriginResolved={updateOrigin}
        onNavigationPosition={handleNavigationPosition}
        onArrived={handleArrival}
        onPlaceSelected={handleMapPlaceSelected}
      />
    </div>

    {selectedPlace && originFix && (
      <div className="mt-4">
        <ReachabilityInsightCard assessment={reachability} multimodal={multimodal} loading={intelligenceLoading} />
      </div>
    )}

    {navigationActive && (
      <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Live journey runtime</p><p className="mt-1 text-sm font-black text-white">Navigating to {selectedPlace?.name}</p><p className="mt-1 text-[10px] text-white/45">{navigationSamples} live position update{navigationSamples === 1 ? '' : 's'} processed{progressCopy ? ` · ${progressCopy.percent}% route progress · ${progressCopy.remaining} remaining` : ''}.</p>{routeProgress?.offRoute ? <p className="mt-1 text-[10px] font-bold text-amber-200">Off-route signal · {Math.round(routeProgress.nearestDistanceM)} m from path · GPS confidence {routeProgress.confidence}</p> : null}</div>
          <button type="button" onClick={stopNavigation} className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 text-[9px] font-black uppercase text-rose-100"><Square className="h-3.5 w-3.5"/>Stop</button>
        </div>
      </div>
    )}

    {originFix && arrivalPoint && !navigationActive && (
      <div className="mt-4">
        {journeyDecision && !routeLoading && (
          <button type="button" onClick={() => { const option = routeOptions[journeyDecision.mode]; setVehicleType(journeyDecision.mode); setCanonicalRoute(option || null); setRouteMessage(routeMessageFor(option || null)); }} className="mb-3 w-full rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-cyan-400/10 to-emerald-400/[0.06] p-4 text-left">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">Best known option right now</p><p className="mt-2 text-lg font-black text-white">{journeyDecision.label}</p><p className="mt-1 text-xs leading-5 text-white/50">{journeyDecision.reason}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase ${journeyDecision.evidence==='strong'?'border-emerald-300/20 bg-emerald-400/10 text-emerald-100':'border-amber-300/20 bg-amber-400/10 text-amber-100'}`}>{journeyDecision.evidence==='strong'?'Live evidence':'Still learning'}</span></div>
          </button>
        )}
        <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Ways to move</p><p className="mt-1 text-xs text-white/45">Choose from routes AFAT can actually connect.</p></div>{routeLoading && <span className="text-[9px] font-black uppercase text-cyan-200">Checking routes…</span>}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([['walk', Footprints, 'Walk'], ['moto', Bike, 'Moto'], ['car', Car, 'Taxi / car'], ['minibus', Navigation2, 'Shared']] as const).map(([mode, Icon, label]) => {
            const option = routeOptions[mode]; const available = option?.status === 'ok'; const selected = vehicleType === mode; const km = Number(option?.distance_m || 0) / 1000; const dispatchable = mode !== 'walk';
            return <button key={mode} type="button" disabled={!available} onClick={() => { setVehicleType(mode); setCanonicalRoute(option || null); setRouteMessage(routeMessageFor(option || null)); }} className={`rounded-2xl border p-3 text-left transition disabled:opacity-35 ${selected ? 'border-cyan-300/45 bg-cyan-400/12' : 'border-white/10 bg-white/[0.025]'}`}>
              <Icon className={`h-4 w-4 ${selected ? 'text-cyan-200' : 'text-white/45'}`} /><p className="mt-3 text-xs font-black text-white">{label}</p><p className="mt-1 text-[9px] leading-4 text-white/40">{!option ? 'Checking…' : available ? `${km ? km.toFixed(km >= 10 ? 0 : 1) + ' km' : 'Connected'} · ${option.eta_seconds ? Math.ceil(option.eta_seconds / 60) + ' min observed' : option.eta_profile_coverage ? Math.round(Number(option.eta_profile_coverage) * 100) + '% ETA evidence' : 'ETA learning'}` : 'No connected path'}</p>
              {available && dispatchable && preflight[mode] && <div className="mt-2 space-y-1 text-[8px] font-bold uppercase tracking-wide"><p className={preflight[mode]?.supply?.observed > 0 ? 'text-emerald-200' : 'text-amber-200'}>{preflight[mode]?.supply?.observed > 0 ? `${preflight[mode].supply.observed} live supply observed` : 'No live supply observed'}</p><p className="text-white/35">{preflight[mode]?.fare?.state === 'historical_range' ? `${preflight[mode].fare.low}–${preflight[mode].fare.high} XAF historical · not final` : 'Fare evidence insufficient'}</p></div>}
            </button>;
          })}
        </div>
      </div>
    )}

    {statusText && <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/8 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-100/75">{statusText}</div>}

    {!candidates.length && !selectedPlace && destination.trim().length>=3 && statusText.includes('unresolved') && <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-400/[0.05] p-4"><p className="text-sm font-black text-amber-100">AFAT does not know this destination confidently yet.</p><p className="mt-1 text-xs leading-5 text-white/45">The demand is recorded. If you are physically there now, add its real position as provisional evidence.</p><button type="button" onClick={proposeHere} disabled={!originFix||loading} className="mt-3 min-h-10 rounded-xl bg-amber-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35">I am here · add this destination</button></div>}

    {!!candidates.length && !selectedPlace && <div className="mt-4 space-y-3">{candidates.map((candidate, index) => <button key={candidate.id} onClick={() => selectCandidate(candidate)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-blue-400/35"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-white">{index + 1}. {candidate.name}</p><p className="mt-1 text-[11px] font-semibold text-white/45">{candidate.zone_label || candidate.city} · {candidate.vehicle_access} access</p></div><span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase text-blue-200">{matchLabel(Number(candidate.confidence || 0))}</span></div>{candidate.explanation?.length ? <p className="mt-3 text-[11px] leading-relaxed text-white/50">{candidate.explanation.slice(0, 2).join(' · ')}</p> : null}</button>)}<button onClick={markNoneCorrect} className="w-full rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-200">None of these</button></div>}

    {selectedPlace && <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-white">{selectedPlace.name}</p><p className="mt-1 text-[10px] text-white/45">{selectedPlace.zone_label || selectedPlace.city}</p></div><CheckCircle className="h-5 w-5 text-emerald-300" /></div></div>
      <PlaceMediaStrip placeId={selectedPlace.id} placeName={selectedPlace.name} compact />
      <details className="rounded-2xl border border-white/10 bg-white/[0.025] p-3"><summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-white/45">Own or manage this destination?</summary><p className="mt-3 text-xs leading-5 text-white/45">Submit a claim to manage public operational details. AFAT keeps coordinates and evidence status under independent verification.</p><button type="button" onClick={submitClaim} className="mt-3 min-h-10 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-[9px] font-black uppercase text-cyan-100">Submit management claim</button>{claimNotice&&<p className="mt-2 text-[10px] text-cyan-100/70">{claimNotice}</p>}</details>
      {!!selectedPlace.access_points?.length && <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-3"><p className="text-[9px] font-black uppercase tracking-widest text-violet-200">How to enter</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{selectedPlace.access_points.map((access)=><button key={access.id} type="button" onClick={()=>setSelectedAccessPoint(access)} className={`rounded-xl border p-3 text-left ${selectedAccessPoint?.id===access.id?'border-violet-300/40 bg-violet-400/10':'border-white/10 bg-black/20'}`}><p className="text-xs font-black">{access.name}</p><p className="mt-1 text-[9px] uppercase text-white/35">{access.access_type} · {Math.round(Number(access.confidence||0))}% evidence</p>{access.instructions&&<p className="mt-2 text-[10px] leading-4 text-white/50">{access.instructions}</p>}</button>)}</div></div>}
      {[...(selectedPlace.meeting_points || [])].sort((a, b) => { const aCompatible = meetingSupportsMode(a, vehicleType) ? 1 : 0; const bCompatible = meetingSupportsMode(b, vehicleType) ? 1 : 0; return bCompatible - aCompatible || Number(b.suitability_score || 0) - Number(a.suitability_score || 0); }).map((candidateMeetingPoint, index) => {
        const suitability = Number(candidateMeetingPoint.suitability_score || candidateMeetingPoint.confidence || 0);
        return <button key={candidateMeetingPoint.id} onClick={() => setSelectedMeetingPoint(candidateMeetingPoint)} className={`w-full rounded-2xl border p-4 text-left ${selectedMeetingPoint?.id === candidateMeetingPoint.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-orange-300" /><div className="flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-white">{candidateMeetingPoint.name}</p><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[8px] font-black uppercase text-cyan-100">{meetingSupportsMode(candidateMeetingPoint, vehicleType) ? (index === 0 ? 'Best for mode · ' : '') : 'Limited for mode · '}{suitability}/100</span></div><p className="mt-1 text-[11px] leading-relaxed text-white/55">{candidateMeetingPoint.instructions}</p><p className="mt-2 text-[10px] font-bold text-blue-200/70">About {candidateMeetingPoint.walk_minutes} min walk{Number(candidateMeetingPoint.successful_pickups || 0) > 0 ? ` · ${candidateMeetingPoint.successful_pickups} successful pickups` : ''}</p></div></div></button>;
      })}
      {!(selectedPlace.meeting_points || []).length && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/75"><ShieldAlert className="mb-2 h-4 w-4" />This place is known, but AFAT has not yet confirmed a reliable meeting point here.</div>}
      {!originFix && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/80">Confirm your current location on the map before starting navigation or requesting transport.</div>}
      {!navigationActive && <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]"><button onClick={() => { setSelectedPlace(null); setSelectedMeetingPoint(null); setSelectedAccessPoint(null); setRouteOptions({}); setCanonicalRoute(null); setReachability(null); setMultimodal(null); setRouteProgress(null); clearJourneyRuntime('cancelled'); }} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/55">Back</button><button onClick={navigateOnly} disabled={loading || !originFix || canonicalRoute?.status !== 'ok'} className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyan-100 disabled:opacity-40">Start live navigation</button><button onClick={createPassage} disabled={loading || !originFix || !arrivalPoint || vehicleType === 'walk' || canonicalRoute?.status !== 'ok'} className="rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 disabled:opacity-50"><Clock className="mr-2 inline h-4 w-4" />Book transport</button><button type="button" onClick={shareReach} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/65"><Share2 className="mr-2 inline h-4 w-4"/>Share</button></div>}
      {shareNotice&&<p className="text-[10px] text-cyan-100/70">{shareNotice}</p>}
    </div>}
  </section>;
}
