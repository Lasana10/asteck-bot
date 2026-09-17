import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, Phone, Shield, WifiOff } from 'lucide-react';
import { sendPanicAlert } from '../../supabaseClient';

const SOS_FALLBACK_STORAGE_KEY = 'afat_pending_sos_events';

interface Props {
  userId: string;
  userName: string;
  activeDispatchId?: string | null;
  onClose: () => void;
}

type Phase = 'confirm' | 'sending' | 'active' | 'failed';

export function EmergencySOS({ activeDispatchId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [locationState, setLocationState] = useState<'locating' | 'device' | 'unavailable'>('locating');
  const [countdown, setCountdown] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [serverResult, setServerResult] = useState<any>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationState('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
        setLocationState('device');
      },
      () => setLocationState('unavailable'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (phase !== 'confirm') return;
    if (countdown <= 0) {
      void triggerSOS();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, phase]);

  const triggerSOS = async () => {
    if (phase === 'sending' || phase === 'active') return;
    setPhase('sending');
    setFeedback('');

    const { data, error } = await sendPanicAlert({
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      accuracy_m: coords?.accuracy ?? null,
      dispatch_assignment_id: activeDispatchId || null,
      source: 'sos_button',
    });

    if (error) {
      const pendingRaw = localStorage.getItem(SOS_FALLBACK_STORAGE_KEY);
      let pending: any[] = [];
      try { pending = pendingRaw ? JSON.parse(pendingRaw) : []; } catch { pending = []; }
      pending.push({
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        accuracy_m: coords?.accuracy ?? null,
        dispatch_assignment_id: activeDispatchId || null,
        source: 'sos_button_retry_required',
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(SOS_FALLBACK_STORAGE_KEY, JSON.stringify(pending.slice(-20)));
      setFeedback('AFAT could not confirm delivery of this alert. Call an emergency service directly and retry when connectivity is available.');
      setPhase('failed');
      return;
    }

    setServerResult(data);
    setFeedback(
      data?.location_status === 'unavailable'
        ? 'AFAT recorded your authenticated SOS without a verified location. Call emergency services directly if you need immediate assistance.'
        : data?.location_status === 'journey_last_known'
          ? 'AFAT recorded your SOS using the latest real journey location because a fresh device fix was unavailable.'
          : 'AFAT recorded your SOS with the current device location.'
    );
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
    setPhase('active');
  };

  const close = () => {
    setCountdown(5);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className={`absolute inset-0 transition-all duration-500 ${phase === 'active' ? 'bg-red-950/95' : 'bg-slate-950/95 backdrop-blur-xl'}`} />
      <div className="relative w-full max-w-md">
        {phase === 'confirm' && (
          <div className="rounded-[2rem] border border-red-500/30 bg-slate-900 p-7 text-center shadow-2xl shadow-red-500/20">
            <div className="relative mx-auto mb-6 h-28 w-28">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="4" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#ef4444" strokeWidth="4" strokeDasharray={`${(countdown / 5) * 264} 264`} strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl font-black text-red-500">{countdown}</span></div>
            </div>

            <h2 className="text-2xl font-black uppercase tracking-tight text-red-400">Emergency SOS</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">AFAT will record an authenticated safety event and bind it to your active journey when available.</p>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-left">
              <div className="flex items-start gap-3">
                <MapPin className={`mt-0.5 h-4 w-4 ${locationState === 'device' ? 'text-emerald-300' : 'text-amber-300'}`} />
                <div>
                  <p className="text-xs font-black text-white">{locationState === 'device' ? 'Current device location ready' : locationState === 'locating' ? 'Getting a real location fix…' : 'Fresh device location unavailable'}</p>
                  <p className="mt-1 text-[11px] leading-5 text-white/40">{locationState === 'unavailable' ? 'AFAT will use only genuine last-known journey evidence if it exists. It will never substitute a city-centre coordinate.' : coords ? `Accuracy approximately ${Math.round(coords.accuracy || 0)} m` : 'No synthetic location is used.'}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <button onClick={() => void triggerSOS()} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-red-600 px-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-red-500/20">
                <AlertTriangle className="h-5 w-5" /> Send AFAT SOS now
              </button>
              <button onClick={close} className="min-h-12 w-full rounded-2xl bg-slate-800 px-4 text-sm font-bold text-slate-300">Cancel — I’m safe</button>
            </div>
          </div>
        )}

        {phase === 'sending' && (
          <div className="rounded-[2rem] border border-red-500/20 bg-slate-900 p-10 text-center shadow-2xl">
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-red-400" />
            <h2 className="mt-5 text-xl font-black uppercase text-red-400">Recording safety alert…</h2>
            <p className="mt-2 text-sm text-slate-500">AFAT is confirming server receipt before showing the alert as active.</p>
          </div>
        )}

        {phase === 'failed' && (
          <div className="rounded-[2rem] border border-amber-400/30 bg-slate-900 p-7 text-center shadow-2xl">
            <WifiOff className="mx-auto h-12 w-12 text-amber-300" />
            <h2 className="mt-4 text-xl font-black text-white">Delivery not confirmed</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{feedback}</p>
            <EmergencyCalls />
            <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => { setPhase('confirm'); setCountdown(5); }} className="min-h-12 rounded-xl bg-red-600 text-xs font-black text-white">Retry AFAT SOS</button><button onClick={close} className="min-h-12 rounded-xl border border-white/10 text-xs font-black text-white/60">Close</button></div>
          </div>
        )}

        {phase === 'active' && (
          <div className="rounded-[2rem] border-2 border-red-500 bg-red-950/90 p-7 text-center shadow-2xl shadow-red-500/30">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15 ring-4 ring-red-500/20"><Shield className="h-10 w-10 text-red-300" /></div>
            <h2 className="mt-5 text-2xl font-black uppercase text-red-300">AFAT SOS recorded</h2>
            <p className="mt-2 text-sm leading-6 text-red-100/65">{feedback}</p>
            {serverResult?.sos_event_id && <p className="mt-3 text-[10px] font-mono text-red-100/40">Event {String(serverResult.sos_event_id).slice(0, 12)}</p>}
            {coords && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-900/20 p-4"><div className="flex items-center justify-center gap-2 text-xs font-mono text-red-200"><MapPin className="h-3.5 w-3.5" />{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div></div>}
            <EmergencyCalls />
            <button onClick={close} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-slate-900/60 text-sm font-bold text-slate-300">Close safety panel</button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmergencyCalls() {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      <a href="tel:117" className="rounded-xl bg-red-600 px-2 py-4 text-xs font-black text-white"><Phone className="mx-auto mb-1 h-4 w-4" />Police 117</a>
      <a href="tel:118" className="rounded-xl bg-red-600 px-2 py-4 text-xs font-black text-white"><Phone className="mx-auto mb-1 h-4 w-4" />Fire 118</a>
      <a href="tel:119" className="rounded-xl bg-red-600 px-2 py-4 text-xs font-black text-white"><Phone className="mx-auto mb-1 h-4 w-4" />Medical 119</a>
    </div>
  );
}
