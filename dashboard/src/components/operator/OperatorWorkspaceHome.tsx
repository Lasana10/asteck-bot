import React, { useEffect, useState } from 'react';
import { Car, Clock3, MapPin, Radio, ShieldCheck, Wallet } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
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

  return (
    <div className="grid gap-5 xl:grid-cols-[0.74fr_1.26fr]">
      <div className="space-y-5">
        <OperatorMissionLifecycle assignment={currentDispatch} onChanged={onChanged} />
        <Surface className="bg-gradient-to-br from-emerald-500/[0.13] to-transparent p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/70">Operator control</p>
              <h1 className="mt-2 text-3xl font-black">{vehicle?.is_available ? 'Ready for verified demand' : 'Service is offline'}</h1>
              <p className="mt-2 text-xs text-white/45">{vehicle ? `${vehicle.plate_number || 'Plate pending'} · ${vehicle.type || 'vehicle'} · ${vehicle.status || 'reviewed'}` : 'No approved vehicle is attached.'}</p>
            </div>
            <button onClick={toggleOnline} disabled={busy || !vehicle} className={`min-h-11 rounded-xl px-5 text-xs font-black disabled:opacity-35 ${vehicle?.is_available ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/5'}`}>
              {vehicle?.is_available ? 'Online' : 'Go online'}
            </button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Metric icon={Radio} label="Verified requests" value={missions.length} />
            <Metric icon={Car} label="Network vehicles" value={live.tracks.length} />
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Next verified mission</p>
          <h2 className="mt-2 text-xl font-black">{mission?.destination_text || 'No open request'}</h2>
          <p className="mt-2 text-sm text-white/45">{mission ? `${mission.origin_text || 'Origin pending'} → ${mission.destination_text || 'Destination pending'}` : 'AFAT will show only a real eligible request.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={MapPin} label="Meeting point" value={mission?.meeting_point_text || mission?.origin_text || '—'} />
            <Metric icon={Wallet} label="Trusted fare" value={mission?.fare_amount ? `${mission.fare_amount} ${mission.currency || 'XAF'}` : 'Awaiting quote'} />
            <Metric icon={Clock3} label="Mission state" value={mission?.status ? String(mission.status).replace(/_/g, ' ') : '—'} />
            <Metric icon={ShieldCheck} label="Evidence" value={mission?.id ? 'Verified' : '—'} />
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={accept} disabled={!vehicle?.is_available || !mission?.id || busy || missionLocked} className="min-h-12 flex-1 rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-35">Accept request</button>
            <button onClick={() => onNavigate('bookings')} className="min-h-12 rounded-xl border border-white/10 px-4 text-xs font-black">Mission queue</button>
          </div>
          {notice && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
        </Surface>
      </div>

      <div className="min-h-[620px]">
        <InteractiveMap role="operator" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay showInformal />
      </div>
    </div>
  );
}
