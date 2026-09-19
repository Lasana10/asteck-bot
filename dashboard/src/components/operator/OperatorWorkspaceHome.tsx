import React, { useEffect, useState } from 'react';
import { Car, Clock3, MapPin, Radio, ShieldCheck, Wallet } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import { ActiveDispatchMap } from '../shared/ActiveDispatchMap';
import { OperatorMissionLifecycle } from './OperatorMissionLifecycle';
import { supabase, updatePassageIntentStatus } from '../../supabaseClient';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200" /><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
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
  const [vehicle, setVehicle] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const mission = missions[0];

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    supabase.from('vehicles')
      .select('id, plate_number, type, status, is_available')
      .eq('operator_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setVehicle(data || null);
        if (error) setNotice(error.message);
      });
    return () => { active = false; };
  }, [profile?.id]);

  const toggleOnline = async () => {
    if (!vehicle?.id) {
      setNotice('An approved vehicle is required before going online.');
      return;
    }
    setBusy(true);
    const next = !vehicle.is_available;
    const { error } = await supabase.from('vehicles').update({ is_available: next }).eq('id', vehicle.id);
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setVehicle((current: any) => ({ ...current, is_available: next }));
    setNotice(next ? 'Operator is online for verified demand.' : 'Operator is offline.');
    onChanged();
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
              <h1 className="mt-2 text-2xl font-black">{vehicle?.is_available ? 'Ready for verified demand' : 'Go online when ready'}</h1>
              <p className="mt-2 text-xs leading-5 text-white/45">
                {vehicle ? `${vehicle.plate_number || 'Plate pending'} · ${vehicle.type || 'vehicle'} · ${vehicle.status || 'reviewed'}` : 'No approved vehicle is attached. Vehicle readiness must be resolved before dispatch work.'}
              </p>
            </div>
            <button onClick={toggleOnline} disabled={busy || !vehicle || missionLocked} className={`min-h-11 rounded-xl px-5 text-xs font-black disabled:opacity-35 ${vehicle?.is_available ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/5'}`}>
              {vehicle?.is_available ? 'Online' : 'Go online'}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric icon={Radio} label="Eligible requests" value={missions.length} />
            <Metric icon={Car} label="Visible supply" value={live.tracks.length} />
          </div>
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
          {notice && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
        </Surface>
      </div>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200/70">Operating map</p>
          <p className="mt-1 text-xs text-white/40">Use the map to understand supply, road conditions and meeting points after shift readiness and job state are clear.</p>
        </div>
        <div className="min-h-[460px] sm:min-h-[580px]">
          <InteractiveMap
            role="operator"
            mapMode="intel"
            incidents={live.incidents}
            tracks={live.tracks}
            checkpoints={live.checkpoints}
            realtimeOverlay
            showInformal
          />
        </div>
      </Surface>
    </div>
  );
}
