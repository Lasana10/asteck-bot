import React from 'react';
import { AlertTriangle, Building2, FileCheck, Landmark, ShieldCheck, Users } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type ScopedRole = 'organization' | 'government' | 'admin';
type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

const META: Record<ScopedRole, { eyebrow: string; promise: string; accent: string; icon: React.ElementType }> = {
  organization: { eyebrow: 'Run your fleet', promise: 'Manage your own people, vehicles and compliance evidence without crossing into planner or admin authority.', accent: 'text-cyan-300', icon: Building2 },
  government: { eyebrow: 'Coordinate mobility', promise: 'Use privacy-safe, mandate-scoped movement evidence for accountable public response.', accent: 'text-teal-300', icon: Landmark },
  admin: { eyebrow: 'Protect the system', promise: 'Govern identity, roles, compliance and platform integrity without taking planner decisions.', accent: 'text-rose-300', icon: ShieldCheck },
};

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

export function InstitutionalWorkspaceHome({
  role,
  membership,
  live,
  operations,
  onNavigate,
}: {
  role: ScopedRole;
  membership: any;
  live: RoleWorkspaceLiveFeed;
  operations: any;
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  const meta = META[role];
  const Icon = meta.icon;
  const title = role === 'organization'
    ? membership?.companies?.name || 'Organisation operations'
    : role === 'government'
      ? membership?.partner?.name || 'Public mobility coordination'
      : 'Platform governance';
  const attention = role === 'admin'
    ? (operations?.reports?.reports?.length || 0) + (operations?.compliance?.summary?.overdue || 0)
    : live.incidents.length;
  const mapRole = role === 'admin' ? 'admin' : 'planner';

  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <Surface className="p-6 sm:p-8">
        <Icon className={`h-7 w-7 ${meta.accent}`} />
        <p className={`mt-5 text-[10px] font-black uppercase tracking-[0.25em] ${meta.accent}`}>{meta.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">{meta.promise}</p>

        <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-200" />
            <div>
              <p className="text-sm font-black">{attention ? `${attention} live item${attention === 1 ? '' : 's'} need attention` : 'No urgent exception returned'}</p>
              <p className="mt-1 text-xs text-white/45">Derived from current AFAT service evidence.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={() => onNavigate('bookings')} className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-left">
            <Users className="h-5 w-5 text-cyan-200" />
            <span className="mt-4 block text-base font-black">{role === 'admin' ? 'Authority queue' : role === 'government' ? 'Evidence register' : 'People and fleet'}</span>
            <span className="mt-2 block text-xs text-white/45">Open the role-owned operational queue.</span>
          </button>
          <button onClick={() => onNavigate('notifications')} className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-5 text-left">
            <FileCheck className="h-5 w-5 text-amber-200" />
            <span className="mt-4 block text-base font-black">{role === 'admin' ? 'Integrity exceptions' : role === 'government' ? 'Response room' : 'Compliance readiness'}</span>
            <span className="mt-2 block text-xs text-white/45">Keep evidence, review and approval states explicit.</span>
          </button>
        </div>
      </Surface>

      <div className="min-h-[540px]">
        <InteractiveMap role={mapRole as any} mapMode="intel" incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay={role !== 'government'} showInformal />
      </div>
    </div>
  );
}
