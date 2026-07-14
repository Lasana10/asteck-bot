import React, { useEffect, useState } from 'react';
import { CheckCircle, Clock, MapPin, Navigation2, Search, ShieldAlert } from 'lucide-react';
import {
  confirmAfatPlace,
  createPassageIntent,
  resolveAfatPlace,
} from '../../supabaseClient';
import type { AfatMeetingPoint, AfatPlaceCandidate } from '../../supabaseClient';

type Props = {
  profile: any;
  originText?: string;
  initialDestination?: string;
  onPassageCreated?: (passage: any) => void;
};

export function PassagePlanner({ profile, originText = '', initialDestination = '', onPassageCreated }: Props) {
  const [destination, setDestination] = useState(initialDestination);
  const [arrivalTarget, setArrivalTarget] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  const [candidates, setCandidates] = useState<AfatPlaceCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<AfatPlaceCandidate | null>(null);
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState<AfatMeetingPoint | null>(null);
  const [statusText, setStatusText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDestination(initialDestination);
    setCandidates([]);
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setStatusText('');
  }, [initialDestination]);

  const resolveDestination = async () => {
    if (destination.trim().length < 3) return;
    setLoading(true);
    setStatusText('AFAT is comparing landmark aliases, access evidence, and successful pickups...');
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);

    const { data, error } = await resolveAfatPlace({
      query: destination.trim(),
      city: profile?.preferred_city || 'yaounde',
      vehicle_type: vehicleType,
    });

    setLoading(false);
    if (error) {
      setCandidates([]);
      setStatusText(error.message);
      return;
    }

    setCandidates(data?.candidates || []);
    setStatusText(data?.message || 'Place candidates loaded.');
  };

  const selectCandidate = (candidate: AfatPlaceCandidate) => {
    setSelectedPlace(candidate);
    setSelectedMeetingPoint(candidate.meeting_points?.[0] || null);
    setStatusText(candidate.meeting_points?.length
      ? 'Choose the shared meeting point AFAT should show to both passenger and driver.'
      : 'This place has no verified meeting point yet. Operations follow-up is required.');
  };

  const markNoneCorrect = async () => {
    await confirmAfatPlace({
      profile_id: profile?.id,
      query_text: destination.trim(),
      city: profile?.preferred_city || 'yaounde',
      resolution_status: 'none_correct',
      feedback: 'Passenger rejected all ranked candidates.',
    });
    setSelectedPlace(null);
    setSelectedMeetingPoint(null);
    setCandidates([]);
    setStatusText('Correction recorded. AFAT can route this description into a mapping mission instead of pretending certainty.');
  };

  const createPassage = async () => {
    if (!profile?.id || !selectedPlace || !selectedMeetingPoint) return;
    setLoading(true);
    setStatusText('Saving one shared passenger-driver meeting identity...');

    await confirmAfatPlace({
      profile_id: profile.id,
      query_text: destination.trim(),
      city: selectedPlace.city,
      place_id: selectedPlace.id,
      meeting_point_id: selectedMeetingPoint.id,
      confidence: selectedPlace.confidence,
      resolution_status: 'selected',
    });

    const { data, error } = await createPassageIntent({
      passenger_id: profile.id,
      origin_text: originText || undefined,
      destination_text: destination.trim(),
      arrival_target: arrivalTarget ? new Date(arrivalTarget).toISOString() : undefined,
      selected_place_id: selectedPlace.id,
      meeting_point_id: selectedMeetingPoint.id,
      place_confidence: selectedPlace.confidence,
      requested_vehicle_type: vehicleType,
      metadata: {
        place_explanation: selectedPlace.explanation,
        meeting_instructions: selectedMeetingPoint.instructions,
      },
    });

    setLoading(false);
    if (error) {
      setStatusText(error.message);
      return;
    }

    setStatusText('Passage is active. Drivers will receive the same meeting point and instructions.');
    onPassageCreated?.(data?.passage);
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300/65">AFAT Place Intelligence</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-white">Where must your passage succeed?</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/45">Describe a landmark, entrance, gate, junction, or familiar local reference.</p>
        </div>
        <Navigation2 className="h-5 w-5 text-blue-300" />
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_170px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4">
          <Search className="h-4 w-4 text-white/35" />
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && resolveDestination()}
            placeholder="Behind Santa Lucia, blue gate beside the pharmacy"
            className="min-h-14 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
          />
        </div>
        <button
          onClick={resolveDestination}
          disabled={loading || destination.trim().length < 3}
          className="min-h-14 rounded-2xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
        >
          {loading ? 'Resolving...' : 'Find candidates'}
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Arrive by</span>
          <input
            type="datetime-local"
            value={arrivalTarget}
            onChange={(event) => setArrivalTarget(event.target.value)}
            className="mt-1 block w-full bg-transparent text-xs font-bold text-white outline-none"
          />
        </label>
        <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Vehicle access</span>
          <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} className="mt-1 block w-full bg-slate-950 text-xs font-bold text-white outline-none">
            <option value="car">Car / taxi</option>
            <option value="moto">Motorcycle</option>
            <option value="minibus">Minibus</option>
          </select>
        </label>
      </div>

      {statusText && (
        <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/8 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-100/75">
          {statusText}
        </div>
      )}

      {!!candidates.length && !selectedPlace && (
        <div className="mt-4 space-y-3">
          {candidates.map((candidate, index) => (
            <button key={candidate.id} onClick={() => selectCandidate(candidate)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-blue-400/35">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-white">{index + 1}. {candidate.name}</p>
                  <p className="mt-1 text-[11px] font-semibold text-white/45">{candidate.zone_label || candidate.city} · {candidate.vehicle_access} vehicle access</p>
                </div>
                <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase text-blue-200">
                  {candidate.confidence}% {candidate.confidence_label}
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/55">{candidate.explanation.join(' · ')}</p>
              <p className="mt-2 text-[10px] font-bold text-emerald-300/70">{candidate.successful_pickups} successful pickup signals</p>
            </button>
          ))}
          <button onClick={markNoneCorrect} className="w-full rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-200">
            None is correct
          </button>
        </div>
      )}

      {selectedPlace && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black text-white">{selectedPlace.name}</p>
                <p className="mt-1 text-[10px] text-white/45">Place confidence {selectedPlace.confidence}%</p>
              </div>
              <CheckCircle className="h-5 w-5 text-emerald-300" />
            </div>
          </div>

          {selectedPlace.meeting_points.map((meetingPoint) => (
            <button key={meetingPoint.id} onClick={() => setSelectedMeetingPoint(meetingPoint)} className={`w-full rounded-2xl border p-4 text-left ${selectedMeetingPoint?.id === meetingPoint.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-orange-300" />
                <div className="flex-1">
                  <p className="text-xs font-black text-white">{meetingPoint.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/55">{meetingPoint.instructions}</p>
                  <p className="mt-2 text-[10px] font-bold text-blue-200/70">Walk {meetingPoint.walk_minutes} min · confidence {meetingPoint.confidence}% · {meetingPoint.successful_pickups} successful pickups</p>
                </div>
              </div>
            </button>
          ))}

          {!selectedPlace.meeting_points.length && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-xs text-amber-100/75">
              <ShieldAlert className="mb-2 h-4 w-4" />
              AFAT knows this landmark but has not verified a reachable meeting point yet.
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setSelectedPlace(null); setSelectedMeetingPoint(null); }} className="rounded-2xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/55">Back</button>
            <button onClick={createPassage} disabled={loading || !selectedMeetingPoint} className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">
              <Clock className="mr-2 inline h-4 w-4" /> Activate passage
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
