import React, { useMemo } from 'react';
import {
  AlertTriangle, Building2, Gauge, Landmark, Layers3, LogOut,
  Navigation2, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';

import { AFATLogo } from './AFATLogo';
import { ROLE_FLOW } from '../../utils/roleWorkspace';
import { useRoleWorkspaceData, type RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { PassengerWorkspaceHome } from '../commuter/PassengerWorkspaceHome';
import { OperatorWorkspaceHome } from '../operator/OperatorWorkspaceHome';
import { PlannerWorkspaceHome } from '../planner/PlannerWorkspaceHome';
import { InstitutionalWorkspaceHome } from './InstitutionalWorkspaceHome';
import { PassengerWorkspaceTabs } from '../commuter/PassengerWorkspaceTabs';
import { OperatorWorkspaceTabs } from '../operator/OperatorWorkspaceTabs';
import { PlannerWorkspaceTabs } from '../planner/PlannerWorkspaceTabs';
import { InstitutionalWorkspaceTabs } from './InstitutionalWorkspaceTabs';

export type AdaptiveWorkspaceRole = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';
type LiveFeed = RoleWorkspaceLiveFeed;

type Props = {
  role: AdaptiveWorkspaceRole;
  profile: any;
  membership?: any;
  activeTab?: WorkspaceTab;
  onNavigate: (tab: WorkspaceTab) => void;
  onSignOut: () => void;
};

const ROLE_META: Record<AdaptiveWorkspaceRole, { label: string; eyebrow: string; promise: string; accent: string; icon: React.ElementType }> = {
  commuter: { label: 'Passenger', eyebrow: 'Move safely', promise: 'Plan, request and follow one real journey without invented fares, ETAs or availability.', accent: 'text-blue-300', icon: Navigation2 },
  operator: { label: 'Operator', eyebrow: 'Deliver service', promise: 'Control availability, receive verified demand and move each mission through pickup, journey and closure.', accent: 'text-emerald-300', icon: Gauge },
  organization: { label: 'Organisation', eyebrow: 'Run your fleet', promise: 'Manage your own people, vehicles and compliance evidence without crossing into planner or admin authority.', accent: 'text-cyan-300', icon: Building2 },
  government: { label: 'Public Partner', eyebrow: 'Coordinate mobility', promise: 'Use privacy-safe, mandate-scoped movement evidence for accountable public response.', accent: 'text-teal-300', icon: Landmark },
  planner: { label: 'Planner', eyebrow: 'Operate the city', promise: 'Turn validated movement evidence into dispatch, recovery and measured interventions.', accent: 'text-violet-300', icon: Layers3 },
  admin: { label: 'Admin', eyebrow: 'Protect the system', promise: 'Govern identity, roles, compliance and platform integrity without taking planner decisions.', accent: 'text-rose-300', icon: ShieldCheck },
};

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${className}`}>{children}</section>;
}

function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : tone === 'warn' ? 'border-amber-400/25 bg-amber-400/10 text-amber-100' : tone === 'bad' ? 'border-red-400/25 bg-red-400/10 text-red-100' : 'border-white/10 bg-white/5 text-white/55';
  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${cls}`}>{children}</span>;
}

function WorkspaceHeader({ role, profile, onSignOut, loading, onRefresh }: { role: AdaptiveWorkspaceRole; profile: any; onSignOut: () => void; loading: boolean; onRefresh: () => void }) {
  const meta = ROLE_META[role];
  return <header className="sticky top-0 z-[900] border-b border-white/10 bg-[#050812]/92 px-4 py-3 backdrop-blur-2xl sm:px-7">
    <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10"><AFATLogo className="h-6 w-6 text-cyan-100" /></div><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-base font-black">AFAT</p><StatusPill>{meta.label}</StatusPill></div><p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-white/30">African Movement Operating System</p></div></div>
      <div className="hidden min-w-0 flex-1 justify-center px-6 lg:flex"><div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"><Search className="h-4 w-4 text-white/30" /><span className="truncate text-xs text-white/35">Search places, journeys, vehicles, evidence or decisions</span></div></div>
      <div className="flex items-center gap-2"><button type="button" onClick={onRefresh} aria-label="Refresh live workspace" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/55"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><div className="hidden text-right sm:block"><p className="max-w-40 truncate text-xs font-black">{profile?.full_name || profile?.email || 'AFAT member'}</p><p className={`text-[9px] font-black uppercase tracking-wider ${meta.accent}`}>{meta.label}</p></div><button type="button" onClick={onSignOut} aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/55"><LogOut className="h-4 w-4" /></button></div>
    </div>
  </header>;
}

function RoleFlow({ role, activeTab, onNavigate }: { role: AdaptiveWorkspaceRole; activeTab: WorkspaceTab; onNavigate: Props['onNavigate'] }) {
  const tabs: WorkspaceTab[] = ['home', 'bookings', 'notifications', 'profile'];
  return <div className="grid grid-cols-4 gap-2">{ROLE_FLOW[role].map((label, i) => <button key={label} type="button" onClick={() => onNavigate(tabs[i])} className={`min-h-14 rounded-xl border px-3 py-2 text-left transition ${activeTab === tabs[i] ? 'border-cyan-300/30 bg-cyan-400/10 text-white' : 'border-white/10 bg-black/15 text-white/38 hover:bg-white/5'}`}><span className="block text-[8px] font-black uppercase tracking-widest text-white/25">0{i + 1}</span><span className="mt-1 block text-[10px] font-black uppercase sm:text-xs">{label}</span></button>)}</div>;
}

function RealityBar({ live, loading, errors }: { live: LiveFeed; loading: boolean; errors: string[] }) {
  const records = live.incidents.length + live.tracks.length + live.checkpoints.length;
  return <div className="flex flex-wrap items-center gap-2"><StatusPill tone={loading ? 'warn' : errors.length ? 'warn' : 'good'}>{loading ? 'Refreshing live services' : errors.length ? 'Partial live service' : 'Live services connected'}</StatusPill><StatusPill>{records} map records</StatusPill><StatusPill>{live.incidents.length} conditions</StatusPill><StatusPill>{live.tracks.length} moving assets</StatusPill><StatusPill>{live.checkpoints.length} meeting points</StatusPill></div>;
}

export function AdaptiveRoleHome({ role, profile, membership, activeTab = 'home', onNavigate, onSignOut }: Props) {
  const { live, missions, operations, loading, serviceErrors, refresh } = useRoleWorkspaceData(role, profile);
  const meta = ROLE_META[role]; const Icon = meta.icon; const participantDispatches = operations?.participantDispatches || []; const currentDispatch = participantDispatches.find((item: any) => ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed'].includes(String(item.status || '').toLowerCase())) || participantDispatches[0] || null; const home = useMemo(() => { if (role === 'commuter') return <PassengerWorkspaceHome profile={profile} live={live} currentDispatch={currentDispatch} onNavigate={onNavigate} onChanged={refresh} />; if (role === 'operator') return <OperatorWorkspaceHome profile={profile} live={live} missions={missions} currentDispatch={currentDispatch} onNavigate={onNavigate} onChanged={refresh} />; if (role === 'planner') return <PlannerWorkspaceHome live={live} operations={operations} onNavigate={onNavigate} />; if (role === 'organization' || role === 'government' || role === 'admin') return <InstitutionalWorkspaceHome role={role} membership={membership} live={live} operations={operations} onNavigate={onNavigate} />; return null; }, [role, profile, membership, live, missions, operations, onNavigate]);
  const tabs = activeTab === 'home' ? null
    : role === 'commuter'
      ? <PassengerWorkspaceTabs activeTab={activeTab} profile={profile} live={live} operations={operations} onSignOut={onSignOut} onChanged={refresh} />
      : role === 'operator'
        ? <OperatorWorkspaceTabs activeTab={activeTab} profile={profile} live={live} missions={missions} operations={operations} onSignOut={onSignOut} onChanged={refresh} />
        : role === 'planner'
          ? <PlannerWorkspaceTabs activeTab={activeTab} profile={profile} live={live} operations={operations} onSignOut={onSignOut} onChanged={refresh} />
          : <InstitutionalWorkspaceTabs role={role as 'organization' | 'government' | 'admin'} activeTab={activeTab} profile={profile} membership={membership} live={live} operations={operations} onSignOut={onSignOut} onChanged={refresh} />;
  return <div className="min-h-screen bg-[#050812] text-white"><WorkspaceHeader role={role} profile={profile} onSignOut={onSignOut} loading={loading} onRefresh={refresh} /><main className="mx-auto max-w-[1540px] px-4 pb-28 pt-5 sm:px-7"><div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${meta.accent}`} /><p className={`text-[10px] font-black uppercase tracking-[0.25em] ${meta.accent}`}>{meta.eyebrow}</p></div><h2 className="mt-2 text-2xl font-black tracking-tight">{meta.label} workspace</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">{meta.promise}</p></div><RealityBar live={live} loading={loading} errors={serviceErrors} /></div><RoleFlow role={role} activeTab={activeTab} onNavigate={onNavigate} />{serviceErrors.length > 0 && <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /><div><p className="text-xs font-black text-amber-100">AFAT is operating with partial live data.</p><p className="mt-1 text-xs leading-5 text-white/45">{serviceErrors.join(' · ')}</p></div></div></div>}<div className="mt-5">{activeTab === 'home' ? home : tabs}</div></main></div>;
}
