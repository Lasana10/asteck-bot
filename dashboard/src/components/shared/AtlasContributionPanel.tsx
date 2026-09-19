import React, { useEffect, useRef, useState } from 'react';
import { CircleStop, MapPinned, Navigation, Radio, ShieldCheck } from 'lucide-react';
import {
  completeAtlasContributionSession,
  ingestAtlasContributionSample,
  startAtlasContributionSession,
  type AtlasContributionMode,
  type AtlasPrivacyMode,
} from '../../services/livingAtlasClient';

const MODES: Array<{ value: AtlasContributionMode; label: string }> = [
  { value: 'walk', label: 'Walking' },
  { value: 'moto', label: 'Moto' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'car', label: 'Car' },
  { value: 'minibus', label: 'Minibus' },
  { value: 'bus', label: 'Bus' },
  { value: 'bike', label: 'Bicycle' },
  { value: 'delivery', label: 'Delivery' },
];

export function AtlasContributionPanel({ defaultMode = 'walk' }: { defaultMode?: AtlasContributionMode }) {
  const [mode, setMode] = useState<AtlasContributionMode>(defaultMode);
  const [privacy, setPrivacy] = useState<AtlasPrivacyMode>('private_aggregate');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [samples, setSamples] = useState(0);
  const [matched, setMatched] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  const stopWatcher = () => {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  useEffect(() => () => stopWatcher(), []);

  const begin = async () => {
    if (!navigator.geolocation) {
      setNotice('Location is not available on this device.');
      return;
    }

    setBusy(true);
    setNotice('');
    const { data, error } = await startAtlasContributionSession({
      movementMode: mode,
      purpose: 'community_movement',
      privacyMode: privacy,
      metadata: { source_surface: 'living_atlas_panel' },
    });
    setBusy(false);

    if (error || !data?.id) {
      setNotice(error?.message || 'Could not start contribution.');
      return;
    }

    const id = String(data.id);
    setSessionId(id);
    setSamples(0);
    setMatched(0);
    setNotice('Contribution started. AFAT will treat these points as evidence, not automatic map truth.');

    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < 5000) return;
        lastSentAt.current = now;

        const speedKph = Number.isFinite(position.coords.speed)
          ? Number(position.coords.speed) * 3.6
          : null;

        const { data: sample, error: sampleError } = await ingestAtlasContributionSample({
          sessionId: id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          speedKph,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          recordedAt: new Date(position.timestamp).toISOString(),
          idempotencyKey: `${id}:${Math.round(position.timestamp)}`,
        });

        if (sampleError) {
          setNotice(sampleError.message || 'A movement point could not be recorded.');
          return;
        }

        setSamples((count) => count + 1);
        if (sample?.match_state === 'matched') setMatched((count) => count + 1);
      },
      (error) => setNotice(error.message || 'Location permission is required.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };

  const finish = async () => {
    if (!sessionId) return;
    stopWatcher();
    setBusy(true);
    const { data, error } = await completeAtlasContributionSession(sessionId);
    setBusy(false);

    if (error) {
      setNotice(error.message || 'Could not finish contribution.');
      return;
    }

    const candidate = data?.candidate_feature_id
      ? ' AFAT found a possible unmapped segment and kept it as a reviewable candidate.'
      : '';

    setNotice(`Contribution saved: ${data?.sample_count ?? samples} points, ${data?.matched_sample_count ?? matched} matched to known Atlas roads.${candidate}`);
    setSessionId(null);
  };

  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.08] to-slate-950/70 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Living Atlas</p>
          <h2 className="mt-2 text-xl font-black">Help AFAT learn the roads you really use</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">
            This works even when you are not booking a trip. Your movement is quality-checked and compared with AFAT's map. It never becomes a new road automatically.
          </p>
        </div>
        <MapPinned className="h-6 w-6 shrink-0 text-cyan-200" />
      </div>

      {!sessionId && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-white/45">
            How are you moving?
            <select value={mode} onChange={(event) => setMode(event.target.value as AtlasContributionMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-white/45">
            Privacy
            <select value={privacy} onChange={(event) => setPrivacy(event.target.value as AtlasPrivacyMode)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              <option value="private_aggregate">Private contribution</option>
              <option value="trusted_review">Visible to trusted reviewers</option>
              <option value="public_mapping">Public mapping session</option>
            </select>
          </label>
        </div>
      )}

      {sessionId && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Navigation className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-xl font-black">{samples}</p><p className="text-[8px] uppercase tracking-wider text-white/35">Points</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Radio className="h-4 w-4 text-emerald-200" /><p className="mt-2 text-xl font-black">{matched}</p><p className="text-[8px] uppercase tracking-wider text-white/35">Known road matches</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4"><ShieldCheck className="h-4 w-4 text-violet-200" /><p className="mt-2 text-xl font-black">{Math.max(0, samples - matched)}</p><p className="text-[8px] uppercase tracking-wider text-white/35">Needs review</p></div>
        </div>
      )}

      <button
        onClick={sessionId ? finish : begin}
        disabled={busy}
        className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-xs font-black disabled:opacity-40 ${sessionId ? 'bg-rose-400 text-slate-950' : 'bg-cyan-300 text-slate-950'}`}
      >
        {sessionId ? <CircleStop className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
        {sessionId ? 'Finish contribution' : 'Start contributing movement'}
      </button>

      {notice && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/60">{notice}</p>}
    </section>
  );
}
