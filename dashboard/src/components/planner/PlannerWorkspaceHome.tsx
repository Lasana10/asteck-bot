import React from 'react';
import { Activity, Radio } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { AtlasLearningControl } from './AtlasLearningControl';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200" /><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

export function PlannerWorkspaceHome({
  live,
  operations,
  onNavigate,
}: {
  live: RoleWorkspaceLiveFeed;
  operations: any;
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  const situations = live.incidents.slice(0, 6);
  const dispatches = operations?.dispatches || [];
  const pressure = operations?.demand?.summary?.pressure ?? 0;
  const recommendation = operations?.demand?.summary?.recommendation || 'No live recommendation';

  return (
    <div className="space-y-5">
      <Surface className="bg-gradient-to-br from-violet-500/[0.14] to-transparent p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300/75">Planner control</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">What needs action now?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Start with demand, active journeys and verified problems. Use the map and Atlas learning signals to decide where AFAT needs intervention or better evidence.</p>
          </div>
          <button onClick={() => onNavigate('bookings')} className="min-h-12 rounded-xl bg-violet-500 px-5 text-xs font-black">Open dispatch control</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric icon={Activity} label="Demand pressure" value={pressure} />
          <Metric icon={Radio} label="Active dispatches" value={dispatches.length} />
          <Metric icon={Activity} label="Verified problems" value={situations.length} />
        </div>
      </Surface>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Action queue</p>
              <h2 className="mt-2 text-2xl font-black">Movement problems needing a decision</h2>
            </div>
            <button onClick={() => onNavigate('notifications')} className="min-h-10 rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-white/65">All disruptions</button>
          </div>
          <div className="mt-4 space-y-3">
            {situations.map((item: any, index: number) => (
              <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black">{item.name || item.type || 'Movement condition'}</p>
                    <p className="mt-2 text-[10px] uppercase text-white/35">{item.status || 'validated'} · severity {item.severity || '—'}</p>
                  </div>
                  <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[8px] font-black uppercase text-violet-100">Verified</span>
                </div>
              </article>
            ))}
            {!situations.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-white/35">No verified movement problem is waiting for intervention.</p>}
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Decision support</p>
          <h2 className="mt-2 text-2xl font-black">Evidence before action</h2>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[9px] font-black uppercase text-white/35">Current recommendation</p>
            <p className="mt-2 text-sm font-bold capitalize">{String(recommendation).replace(/_/g, ' ')}</p>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[9px] font-black uppercase text-white/35">Evidence available</p>
            <p className="mt-2 text-xs leading-5 text-white/55">{live.incidents.length + live.tracks.length + live.checkpoints.length} live records. AFAT keeps uncertain information uncertain until stronger evidence arrives.</p>
          </div>
        </Surface>
      </div>

      <AtlasLearningControl />

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-200/70">Network evidence map</p>
          <p className="mt-1 text-xs text-white/40">Vehicles, verified conditions, checkpoints and map-learning evidence belong here in spatial context.</p>
        </div>
        <div className="min-h-[500px] sm:min-h-[620px]">
          <InteractiveMap role="planner" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay showInformal />
        </div>
      </Surface>
    </div>
  );
}
