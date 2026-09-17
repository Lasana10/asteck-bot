import React from 'react';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ShieldCheck, UserCircle } from 'lucide-react';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type Tab = 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function State({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-violet-200" /><p className="mt-3 text-lg font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

export function PlannerWorkspaceTabs({
  activeTab,
  profile,
  live,
  operations,
  onSignOut,
}: {
  activeTab: Tab;
  profile: any;
  live: RoleWorkspaceLiveFeed;
  operations: any;
  onSignOut: () => void;
}) {
  const dispatches = operations?.dispatches || [];
  const demand = operations?.demand?.summary || {};

  if (activeTab === 'profile') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Planner authority</p>
          <h1 className="mt-2 text-3xl font-black">{profile?.full_name || 'AFAT planner'}</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={UserCircle} label="Identity" value={profile?.verification_status || 'verified'} />
            <State icon={ShieldCheck} label="Workspace" value="Planner" />
          </div>
          <button onClick={onSignOut} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-sm font-black uppercase tracking-wider">Authority boundary</h2>
          <p className="mt-4 text-sm leading-7 text-white/50">Planner authority controls mobility operations and intervention decisions. Identity governance, global role grants and platform administration remain Admin responsibilities.</p>
        </Surface>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Movement failures</p>
          <h1 className="mt-2 text-3xl font-black">Validated conditions requiring attention</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={AlertTriangle} label="Validated conditions" value={live.incidents.length} />
            <State icon={Activity} label="Demand pressure" value={demand.pressure ?? 0} />
          </div>
        </Surface>
        <Surface className="p-5">
          <div className="space-y-3">
            {live.incidents.slice(0, 15).map((item: any, index: number) => (
              <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black">{item.name || item.type || 'Movement condition'}</p>
                <p className="mt-1 text-xs text-white/40">{item.description || item.status || 'Validated AFAT evidence'} · severity {item.severity || '—'}</p>
              </article>
            ))}
            {!live.incidents.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No validated movement failure requires action.</p>}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
      <Surface className="p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Dispatch board</p>
        <h1 className="mt-2 text-3xl font-black">Interventions with accountable state</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">Each dispatch remains connected to its owner, current state, evidence and operational outcome.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <State icon={BarChart3} label="Open dispatches" value={dispatches.length} />
          <State icon={Activity} label="Demand pressure" value={demand.pressure ?? 0} />
        </div>
      </Surface>
      <Surface className="p-5">
        <div className="space-y-3">
          {dispatches.slice(0, 15).map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-violet-300" />
                <div>
                  <p className="text-sm font-black">{String(item.status || 'dispatch').replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-white/40">Dispatch {String(item.id || '').slice(0, 8)} · booking {String(item.booking_id || '').slice(0, 8) || '—'} · operator {String(item.operator_id || '').slice(0, 8) || 'unassigned'}</p>
                </div>
              </div>
            </article>
          ))}
          {!dispatches.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No active dispatch intervention is open.</p>}
        </div>
      </Surface>
    </div>
  );
}
