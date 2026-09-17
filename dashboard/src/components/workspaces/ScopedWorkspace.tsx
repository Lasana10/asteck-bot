import React from 'react';
import { AlertTriangle, FileCheck, Users } from 'lucide-react';
import { AdaptiveWorkspaceRole, LiveFeed, MapPanel, Surface } from './WorkspacePrimitives';

type Props = {
  role: 'organization' | 'government' | 'admin';
  membership: any;
  live: LiveFeed;
  operations: any;
  onNavigate: (tab: 'home' | 'bookings' | 'notifications' | 'profile') => void;
  meta: {
    eyebrow: string;
    promise: string;
    accent: string;
    icon: React.ElementType;
  };
};

export function ScopedWorkspace({ role, membership, live, operations, onNavigate, meta }: Props) {
  const Icon = meta.icon;
  const title = role === 'organization'
    ? membership?.companies?.name || 'Organisation operations'
    : role === 'government'
      ? membership?.partner?.name || 'Public mobility coordination'
      : 'Platform governance';

  const attention = role === 'admin'
    ? (operations?.reports?.reports?.length || 0) + (operations?.compliance?.summary?.overdue || 0)
    : live.incidents.length;

  return <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
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
      <MapPanel role={role as AdaptiveWorkspaceRole} live={live} />
    </div>
  </div>;
}
