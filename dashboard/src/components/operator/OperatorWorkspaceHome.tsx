import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Car, Clock3, MapPin, Radio, ShieldCheck, Wallet } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import { ActiveDispatchMap } from '../shared/ActiveDispatchMap';
import { OperatorMissionLifecycle } from './OperatorMissionLifecycle';
import { updatePassageIntentStatus } from '../../supabaseClient';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import {
  fetchOperatorExecutionSnapshot,
  requestOperatorPayout,
  updateOperatorPresence,
  type OperatorExecutionSnapshot,
} from '../../services/operatorExecutionClient';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200" /><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

function money(value: unknown) {
  return `${Math.max(0, Number(value || 0)).toLocaleString()} XAF`;
}

export function OperatorWorkspaceHome({
  profile,
  live,
  missions,
  currentDispatch,
  onNavigate,
  onChanged,
}: {
  profile: any;
  live: RoleWorkspaceLiveFeed;
  missions: any[];
  currentDispatch: any | null;
  onNavigate: (tab: WorkspaceTab) => void;
  onChanged: () => void;
}) {
  const [execution, setExecution] = useState<OperatorExecutionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutProvider, setPayoutProvider] = useState('mobile_money');
  const [payoutDestination, setPayoutDestination] = useState('');
  const watchRef = useRef<number | null>(null);
  const lastPresencePushRef = useRef(0);
  const mission = missions[0];
  const vehicle = execution?.vehicle || null;
  const wallet = execution?.wallet || {};

  const refreshExecution = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await fetchOperatorExecutionSnapshot();
    if (error) {
      setNotice(error.message);
      return;
    }
    setExecution(data);
  }, [profile?.id]);

  useEffect(() => { void refreshExecution(); }, [refreshExecution]);

  useEffect(() => {
    if (!vehicle?.is_available || !vehicle?.id || !navigator.geolocation) {
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastPresencePushRef.current < 45_000) return;
        lastPresencePushRef.current = now;
        void updateOperatorPresence({
          vehicleId: vehicle.id,
          available: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          heading: position.coords.heading,
          speedKph: position.coords.speed == null ? null : position.coords.speed * 3.6,
        }).then(({ error }) => {
          if (error) setNotice(`Live supply update paused: ${error.message}`);
        });
      },
      () => setNotice('AFAT cannot refresh your live supply position. Your availability will expire automatically if GPS stays stale.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );

    return () => {
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [vehicle?.id, vehicle?.is_available]);

  const toggleOnline = async () => {
    if (!vehicle?.id) {
      setNotice('An approved vehicle is required before going online.');
      return;
    }
    if (vehicle.clearance_status !== 'verified') {
      setNotice('This vehicle must be verified before AFAT can advertise it as live supply.');
      return;
    }

    setBusy(true);
    if (vehicle.is_available) {
      const { error } = await updateOperatorPresence({ vehicleId: vehicle.id, available: false });
      setBusy(false);
      if (error) { setNotice(error.message); return; }
      setNotice('You are offline. AFAT no longer counts this vehicle as live supply.');
      await refreshExecution();
      onChanged();
      return;
    }

    if (!navigator.geolocation) {
      setBusy(false);
      setNotice('Device location is required to go online because AFAT does not advertise stale or invented supply.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { error } = await updateOperatorPresence({
        vehicleId: vehicle.id,
        available: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        heading: position.coords.heading,
        speedKph: position.coords.speed == null ? null : position.coords.speed * 3.6,
      });
      setBusy(false);
      if (error) { setNotice(error.message); return; }
      lastPresencePushRef.current = Date.now();
      setNotice(`Online with live GPS · ±${Math.round(position.coords.accuracy)} m. AFAT will expire availability if the signal goes stale.`);
      await refreshExecution();
      onChanged();
    }, (error) => {
      setBusy(false);
      setNotice(error.code === 1 ? 'Location permission is required to go online.' : 'AFAT could not get a reliable current position. Try again when GPS is available.');
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 });
  };

  const submitPayout = async () => {
    const amount = Math.round(Number(payoutAmount));
    if (!Number.isFinite(amount) || amount <= 0) { setNotice('Enter a valid payout amount.'); return; }
    if (!payoutDestination.trim()) { setNotice('Enter the mobile-money or payout destination.'); return; }
    setBusy(true);
    const { data, error } = await requestOperatorPayout({ amountXaf: amount, provider: payoutProvider, destinationRef: payoutDestination.trim() });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setPayoutAmount('');
    setNotice(`Payout request created${data?.amount_xaf ? ` · ${money(data.amount_xaf)}` : ''}. Funds are reserved until the provider result is confirmed.`);
    await refreshExecution();
  };

  const accept = async () => {
    if (!mission?.id || !profile?.id) return;
    setBusy(true);
    const { error } = await updatePassageIntentStatus(mission.id, { status: 'driver_acknowledged', operator_id: profile.id });
    setBusy(false);
    setNotice(error ? error.message : 'Mission accepted. Pickup and passenger tracking can now progress.');
    if (!error) onChanged();
  };

  const missionLocked = Boolean(currentDispatch && !['completed','cancelled','expired','declined','no_show'].includes(String(currentDispatch.status || '').toLowerCase()));

  if (currentDispatch) {
    return (
      <div className="space-y-5">
        <Surface className="bg-gradient-to-br from-emerald-500/[0.14] to-transparent p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/75">Mission in progress</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Complete the current passenger movement</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Navigation, pickup state, passenger confirmation and journey completion stay together until the mission closes.</p>
        </Surface>
        <ActiveDispatchMap assignment={currentDispatch} role="operator" incidents={live.incidents} liveTracks={live.tracks} />
        <OperatorMissionLifecycle assignment={currentDispatch} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface className="bg-gradient-to-br from-emerald-500/[0.13] to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/70">Start shift</p>
              <h1 className="mt-2 text-3xl font-black">{vehicle?.is_available ? 'You’re online.' : 'Go online.'}</h1>
              <p className="mt-2 text-xs leading-5 text-white/45">
                {vehicle ? `${vehicle.plate_number || 'Plate pending'} · ${vehicle.type || 'vehicle'} · ${vehicle.clearance_status || 'unreviewed'} · AFAT counts this vehicle as supply only while verified and recently located.` : 'No approved vehicle is attached. Vehicle readiness must be resolved before dispatch work.'}
              </p>
            </div>
            <button onClick={toggleOnline} disabled={busy || !vehicle || missionLocked} className={`min-h-11 rounded-xl px-5 text-xs font-black disabled:opacity-35 ${vehicle?.is_available ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/5'}`}>
              {vehicle?.is_available ? 'GO OFFLINE' : 'GO ONLINE'}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric icon={Radio} label="Eligible requests" value={missions.length} />
            <Metric icon={Car} label="Visible supply" value={live.tracks.length} />
          </div>
          {vehicle?.last_ping_at && <p className="mt-3 text-[10px] text-white/35">Last live supply ping · {new Date(vehicle.last_ping_at).toLocaleTimeString()}</p>}
          {!vehicle && <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Attach and approve a vehicle before this workspace offers live missions.</p>}
        </Surface>

        <Surface className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Next job</p>
              <h2 className="mt-2 text-xl font-black">{mission?.destination_text || 'No verified request waiting'}</h2>
            </div>
            <button onClick={() => onNavigate('bookings')} className="min-h-10 rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-white/65">All missions</button>
          </div>
          <p className="mt-2 text-sm text-white/45">{mission ? `${mission.origin_text || 'Origin pending'} → ${mission.destination_text || 'Destination pending'}` : 'Stay available. AFAT will surface only work this operator and vehicle are eligible to perform.'}</p>
          {mission && <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={MapPin} label="Pickup" value={mission?.meeting_point_text || mission?.origin_text || '—'} />
            <Metric icon={Wallet} label="Fare authority" value={mission?.fare_amount ? `${mission.fare_amount} ${mission.currency || 'XAF'}` : 'Awaiting authority'} />
            <Metric icon={Clock3} label="Request state" value={mission?.status ? String(mission.status).replace(/_/g, ' ') : '—'} />
            <Metric icon={ShieldCheck} label="Evidence" value={mission?.id ? 'Server verified' : '—'} />
          </div>}
          <button onClick={accept} disabled={!vehicle?.is_available || !mission?.id || busy || missionLocked} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-35">Accept verified request</button>
        </Surface>
      </div>

      <Surface className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200/65">Earnings & payout</p>
            <h2 className="mt-2 text-2xl font-black">{money(wallet.available_xaf)}</h2>
            <p className="mt-1 text-xs text-white/40">Available now · wallet {money(wallet.balance_xaf)} · reserved {money(wallet.reserved_xaf)}</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[130px_150px_1fr_auto]">
            <input value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} inputMode="numeric" placeholder="Amount XAF" className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-xs outline-none" />
            <select value={payoutProvider} onChange={(event) => setPayoutProvider(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs">
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Bank</option>
              <option value="manual">Manual settlement</option>
            </select>
            <input value={payoutDestination} onChange={(event) => setPayoutDestination(event.target.value)} placeholder="Phone / payout account" className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-xs outline-none" />
            <button onClick={submitPayout} disabled={busy || Number(wallet.available_xaf || 0) <= 0} className="min-h-11 rounded-xl bg-cyan-300 px-4 text-[10px] font-black uppercase text-slate-950 disabled:opacity-35">Request payout</button>
          </div>
        </div>
        {!!execution?.payouts?.length && <div className="mt-4 flex flex-wrap gap-2">
          {execution.payouts.slice(0, 4).map((payout) => <span key={payout.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold text-white/55">{money(payout.amount_xaf)} · {payout.status.replace(/_/g, ' ')}</span>)}
        </div>}
        {notice && <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
      </Surface>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200/70">Operating map</p>
          <p className="mt-1 text-xs text-white/40">Passenger meeting points, road conditions and live supply remain spatial. AFAT does not expose another operator’s private identity or raw location through the public supply surface.</p>
        </div>
        <div className="min-h-[460px] sm:min-h-[580px]">
          <InteractiveMap role="operator" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay showInformal />
        </div>
      </Surface>
    </div>
  );
}
