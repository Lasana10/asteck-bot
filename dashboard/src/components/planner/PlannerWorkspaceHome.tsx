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
    <div className="grid gap-5 xl:grid-cols-[0.58fr_1.08fr_0.72fr]">
      <Surface className="p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Validated situation queue</p>
        <div className="mt-4 space-y-3">
          {situations.map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black">{item.name || item.type || 'Movement condition'}</p>
              <p className="mt-2 text-[10px] uppercase text-white/35">{item.status || 'validated'} · severity {item.severity || '—'}</p>
            </article>
          ))}
          {!situations.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-white/35">No validated movement failure is in the live queue.</p>}
        </div>
      </Surface>

      <div className="min-h-[620px]">
        <InteractiveMap role="planner" mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} atlasNodes={live.atlasNodes} atlasEdges={live.atlasEdges} realtimeOverlay showInformal />
      </div>

      <Surface className="p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">City operations posture</p>
        <h2 className="mt-2 text-2xl font-black">Decide from current evidence</h2>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric icon={Activity} label="Demand pressure" value={pressure} />
          <Metric icon={Radio} label="Active dispatches" value={dispatches.length} />
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[9px] font-black uppercase text-white/35">Engine recommendation</p>
          <p className="mt-2 text-sm font-bold capitalize">{String(recommendation).replace(/_/g, ' ')}</p>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[9px] font-black uppercase text-white/35">Evidence provenance</p>
          <p className="mt-2 text-xs leading-5 text-white/55">{live.incidents.length + live.tracks.length + live.checkpoints.length + live.atlasNodes.length + live.atlasEdges.length} evidence records. Unknown values remain unknown.</p>
        </div>
        <button onClick={() => onNavigate('bookings')} className="mt-5 min-h-12 w-full rounded-xl bg-violet-500 text-xs font-black">Open dispatch board</button>
        <button onClick={() => onNavigate('notifications')} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 text-xs font-black text-white/70">Review disruptions</button>
      </Surface>

      <Surface className="xl:col-span-3 p-4">
        <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-white/35">Intervention lifecycle</p>
        <div className="grid grid-cols-5 gap-2">
          {['Detect', 'Simulate', 'Approve', 'Dispatch', 'Measure'].map((step, index) => (
            <div key={step} className={`rounded-xl border p-3 ${index === 0 && situations.length ? 'border-violet-300/30 bg-violet-500/10' : index === 3 && dispatches.length ? 'border-cyan-300/30 bg-cyan-500/10' : 'border-white/10 bg-black/20'}`}>
              <span className="text-[8px] font-black text-white/30">0{index + 1}</span>
              <p className="mt-1 text-[9px] font-black uppercase sm:text-xs">{step}</p>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
