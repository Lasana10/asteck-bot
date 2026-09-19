import React from 'react';
import { Activity, Radio } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

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
      <Surface className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={Activity} label="Demand pressure" value={pressure} />
          <Metric icon={Radio} label="Active dispatches" value={dispatches.length} />
          <Metric icon={Activity} label="Validated conditions" value={situations.length} />
        </div>
      </Surface>

      <div className="min-h-[520px] sm:min-h-[640px]">
        <InteractiveMap role="planner" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay showInformal />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Validated situation queue</p>
              <h2 className="mt-2 text-2xl font-black">What needs action now</h2>
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
            {!situations.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-white/35">No validated movement failure is in the live queue.</p>}
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Operational decision</p>
          <h2 className="mt-2 text-2xl font-black">Act only on current evidence</h2>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[9px] font-black uppercase text-white/35">Engine recommendation</p>
            <p className="mt-2 text-sm font-bold capitalize">{String(recommendation).replace(/_/g, ' ')}</p>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[9px] font-black uppercase text-white/35">Evidence provenance</p>
            <p className="mt-2 text-xs leading-5 text-white/55">{live.incidents.length + live.tracks.length + live.checkpoints.length} live records. AFAT does not promote unknowns into facts.</p>
          </div>
          <button onClick={() => onNavigate('bookings')} className="mt-5 min-h-12 w-full rounded-xl bg-violet-500 text-xs font-black">Open operational dispatch</button>
        </Surface>
      </div>
    </div>
  );
}
