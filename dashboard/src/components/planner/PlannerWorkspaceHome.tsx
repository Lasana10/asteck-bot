import React from 'react';
import { Activity, ArrowRight, Radio, ShieldCheck } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { AtlasLearningControl } from './AtlasLearningControl';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3.5"><div className="flex items-center justify-between gap-3"><Icon className="h-4 w-4 text-cyan-200" /><p className="text-xl font-black">{value}</p></div><p className="mt-2 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
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
    <div className="space-y-4">
      <section className="rounded-[1.8rem] border border-violet-300/15 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.17),transparent_34%),linear-gradient(135deg,rgba(15,23,42,.96),rgba(2,6,23,.98))] p-5 shadow-2xl sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-violet-100">Planner operations</span><span className="text-[10px] text-white/35">See the city · decide · dispatch · measure</span></div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">What needs action now?</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">Start from the city itself. Demand, active journeys and verified disruptions stay spatial so the planner sees where intervention matters before opening control panels.</p>
          </div>
          <button onClick={() => onNavigate('bookings')} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-500 px-6 text-sm font-black">Open dispatch control <ArrowRight className="h-4 w-4"/></button>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Metric icon={Activity} label="Demand pressure" value={pressure} />
          <Metric icon={Radio} label="Active dispatches" value={dispatches.length} />
          <Metric icon={ShieldCheck} label="Verified problems" value={situations.length} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200/70">Live city operating map</p>
            <p className="mt-1 text-xs text-white/40">Vehicles, verified conditions and meeting points stay in the geography where decisions are made.</p>
          </div>
          <div className="min-h-[620px]">
            <InteractiveMap role="planner" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay showInformal />
          </div>
        </Surface>

        <div className="space-y-4">
          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300">Action queue</p><h2 className="mt-1 text-lg font-black">Needs a decision</h2></div><button onClick={() => onNavigate('notifications')} className="rounded-xl border border-white/10 px-3 py-2 text-[8px] font-black uppercase text-white/55">All</button></div>
            <div className="mt-3 space-y-2">
              {situations.map((item: any, index: number) => (
                <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{item.name || item.type || 'Movement condition'}</p><p className="mt-1 text-[9px] uppercase text-white/35">{item.status || 'validated'} · severity {item.severity || '—'}</p></div><span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[8px] font-black uppercase text-violet-100">Verified</span></div>
                </article>
              ))}
              {!situations.length && <p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No verified movement problem is waiting for intervention.</p>}
            </div>
          </Surface>

          <Surface className="p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300">Decision support</p>
            <p className="mt-2 text-sm font-black capitalize">{String(recommendation).replace(/_/g, ' ')}</p>
            <p className="mt-2 text-xs leading-5 text-white/45">{live.incidents.length + live.tracks.length + live.checkpoints.length} live records. Uncertain information remains uncertain until stronger evidence arrives.</p>
          </Surface>

          <AtlasLearningControl />
        </div>
      </div>
    </div>
  );
}
