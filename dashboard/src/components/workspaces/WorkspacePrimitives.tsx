import React from 'react';
import { MapPin } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';

export type AdaptiveWorkspaceRole = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
export type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';
export type LiveFeed = { incidents: any[]; tracks: any[]; checkpoints: any[]; atlasNodes: any[] };

export function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${className}`}>{children}</section>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
      : tone === 'bad'
        ? 'border-red-400/25 bg-red-400/10 text-red-100'
        : 'border-white/10 bg-white/5 text-white/55';
  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${cls}`}>{children}</span>;
}

export function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <Icon className="h-4 w-4 text-cyan-200" />
    <p className="mt-3 text-2xl font-black">{value}</p>
    <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p>
  </div>;
}

export function MapPanel({ role, live }: { role: AdaptiveWorkspaceRole; live: LiveFeed }) {
  const mapRole = role === 'admin'
    ? 'admin'
    : ['planner', 'government', 'organization'].includes(role)
      ? 'planner'
      : role;

  return <InteractiveMap
    role={mapRole as any}
    mapMode={role === 'commuter' ? 'standard' : 'intel'}
    incidents={live.incidents}
    tracks={live.tracks}
    checkpoints={live.checkpoints}
    atlasNodes={live.atlasNodes}
    realtimeOverlay={['operator', 'organization', 'planner', 'admin'].includes(role)}
    showInformal={role !== 'commuter'}
  />;
}

export function WorkspaceEmptyState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-8 text-center">
    <MapPin className="mx-auto h-5 w-5 text-white/25" />
    <p className="mt-3 text-sm font-black text-white/65">{title}</p>
    <p className="mt-2 text-xs leading-5 text-white/35">{body}</p>
  </div>;
}
