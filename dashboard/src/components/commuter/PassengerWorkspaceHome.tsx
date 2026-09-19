import React from 'react';
import { Car, MapPin, ShieldCheck } from 'lucide-react';
import { PassagePlanner } from './PassagePlanner';
import { PassengerJourneyContinuity } from './PassengerJourneyContinuity';
import { ActiveDispatchMap } from '../shared/ActiveDispatchMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <Icon className="h-4 w-4 text-cyan-200" />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p>
    </div>
  );
}

export function PassengerWorkspaceHome({
  profile,
  live,
  currentDispatch,
  onNavigate,
  onChanged,
}: {
  profile: any;
  live: RoleWorkspaceLiveFeed;
  currentDispatch: any | null;
  onNavigate: (tab: WorkspaceTab) => void;
  onChanged: () => void;
}) {
  if (currentDispatch) {
    return (
      <div className="space-y-5">
        <section className="rounded-[1.5rem] border border-blue-300/15 bg-gradient-to-br from-blue-500/[0.12] to-cyan-400/[0.03] p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Active journey</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Your movement is now the primary workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Map, pickup verification, journey state, payment and closure stay together until this passage is resolved.</p>
        </section>
        <ActiveDispatchMap assignment={currentDispatch} role="commuter" incidents={live.incidents} liveTracks={live.tracks} />
        <PassengerJourneyContinuity assignment={currentDispatch} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.12] to-blue-500/[0.03] p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Plan a passage</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Where do you need to go?</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Choose a real destination first. AFAT then resolves trusted routes, meeting points, observed supply and fare evidence before you commit.</p>
      </section>

      <PassagePlanner
        profile={profile}
        onPassageCreated={() => {
          onChanged();
          onNavigate('bookings');
        }}
      />

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 shadow-xl backdrop-blur-xl sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Around your journey</p>
          <p className="mt-1 text-xs leading-5 text-white/45">Useful context, not the task itself. These signals should help a decision without competing with trip planning.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric icon={MapPin} label="Meeting points" value={live.checkpoints.length} />
          <Metric icon={Car} label="Visible supply" value={live.tracks.length} />
          <Metric icon={ShieldCheck} label="Conditions" value={live.incidents.length} />
        </div>
      </section>

      <div className="rounded-[1.5rem] border border-cyan-300/10 bg-cyan-400/[0.035] p-4 text-xs leading-6 text-white/45">
        AFAT plans from places, entrances, meeting points and trusted mobility graph evidence. If GPS is weak, pin the start point directly on the Atlas instead of abandoning the journey.
      </div>
    </div>
  );
}
