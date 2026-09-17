import React, { useMemo } from 'react';
import {
  AlertTriangle, Bell, Building2, CheckCircle2, Gauge, Landmark, Layers3, LogOut,
  MapPin, Navigation2, Radio, RefreshCw, Search, ShieldCheck, UserCircle,
} from 'lucide-react';

import { AFATLogo } from './AFATLogo';
import { InteractiveMap } from './InteractiveMap';
import { ROLE_FLOW } from '../../utils/roleWorkspace';
import { useRoleWorkspaceData, type RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { PassengerWorkspaceHome } from '../commuter/PassengerWorkspaceHome';
import { OperatorWorkspaceHome } from '../operator/OperatorWorkspaceHome';
import { PlannerWorkspaceHome } from '../planner/PlannerWorkspaceHome';
import { InstitutionalWorkspaceHome } from './InstitutionalWorkspaceHome';

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

const TAB_COPY: Record<AdaptiveWorkspaceRole, Record<Exclude<WorkspaceTab, 'home'>, { title: string; description: string; empty: string }>> = {
  commuter: {
    bookings: { title: 'My journeys', description: 'Requests, assigned service, pickup, trip, closure and receipt live in one passenger timeline.', empty: 'No journey exists yet. Create a passage from Home to start.' },
    notifications: { title: 'Journey safety', description: 'Only route, pickup and safety information that affects your movement appears here.', empty: 'No route-relevant safety notice is active.' },
    profile: { title: 'Passenger identity', description: 'Identity and preferences remain passenger-scoped.', empty: '' },
  },
  operator: {
    bookings: { title: 'Mission control', description: 'Verified demand becomes an operator mission with clear next actions.', empty: 'No verified mission is waiting for this operator.' },
    notifications: { title: 'Service alerts', description: 'Disruptions and operating conditions connected to active work.', empty: 'No operator alert requires attention.' },
    profile: { title: 'Operator authority', description: 'Approval and vehicle state determine whether service can go online.', empty: '' },
  },
  planner: {
    bookings: { title: 'Dispatch board', description: 'Every intervention stays connected to evidence, owner, state and outcome.', empty: 'No active dispatch intervention is open.' },
    notifications: { title: 'Movement failures', description: 'Validated conditions requiring operational attention.', empty: 'No validated movement failure requires action.' },
    profile: { title: 'Planner authority', description: 'Planning scope stays separate from platform administration.', empty: '' },
  },
  organization: {
    bookings: { title: 'People and fleet', description: 'Operate only assets and members owned by this organisation.', empty: 'No owned fleet activity is visible yet.' },
    notifications: { title: 'Compliance readiness', description: 'Submission, review and approval remain different states.', empty: 'No organisation exception requires attention.' },
    profile: { title: 'Organisation record', description: 'Registration and membership boundaries stay explicit.', empty: '' },
  },
  government: {
    bookings: { title: 'Evidence register', description: 'Aggregated public mobility conditions without passenger or operator personal data.', empty: 'No validated public condition is in scope.' },
    notifications: { title: 'Response room', description: 'Coordinate only within the approved public mandate.', empty: 'No public response is currently required.' },
    profile: { title: 'Public mandate', description: 'Jurisdiction and access boundaries remain explicit.', empty: '' },
  },
  admin: {
    bookings: { title: 'Authority queue', description: 'Identity, privilege and compliance decisions remain auditable.', empty: 'No governance decision is waiting.' },
    notifications: { title: 'System integrity', description: 'Operational exceptions without mixing Admin and Planner authority.', empty: 'No platform integrity exception is open.' },
    profile: { title: 'Admin identity', description: 'Privileged actions remain attributable and reviewable.', empty: '' },
  },
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

function MapPanel({ role, live }: { role: AdaptiveWorkspaceRole; live: LiveFeed }) {
  const mapRole = role === 'admin' ? 'admin' : ['planner', 'government', 'organization'].includes(role) ? 'planner' : role;
  return <InteractiveMap role={mapRole as any} mapMode={role === 'commuter' ? 'standard' : 'intel'} incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay={['operator', 'organization', 'planner', 'admin'].includes(role)} showInformal={role !== 'commuter'} />;
}

function RealityBar({ live, loading, errors }: { live: LiveFeed; loading: boolean; errors: string[] }) {
  const records = live.incidents.length + live.tracks.length + live.checkpoints.length;
  return <div className="flex flex-wrap items-center gap-2"><StatusPill tone={loading ? 'warn' : errors.length ? 'warn' : 'good'}>{loading ? 'Refreshing live services' : errors.length ? 'Partial live service' : 'Live services connected'}</StatusPill><StatusPill>{records} map records</StatusPill><StatusPill>{live.incidents.length} conditions</StatusPill><StatusPill>{live.tracks.length} moving assets</StatusPill><StatusPill>{live.checkpoints.length} meeting points</StatusPill></div>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) { return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200" /><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>; }

function TabCanvas({ role, activeTab, profile, membership, live, missions, operations, onSignOut }: { role: AdaptiveWorkspaceRole; activeTab: Exclude<WorkspaceTab, 'home'>; profile: any; membership: any; live: LiveFeed; missions: any[]; operations: any; onSignOut: () => void }) {
  const copy = TAB_COPY[role][activeTab]; const items = activeTab === 'bookings' ? role === 'operator' ? missions : role === 'planner' ? operations?.dispatches || [] : live.tracks : activeTab === 'notifications' ? live.incidents : []; const identity = role === 'organization' ? membership?.companies : role === 'government' ? membership?.partner : profile;
  return <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]"><Surface className="p-6 sm:p-8"><p className={`text-[10px] font-black uppercase tracking-[0.25em] ${ROLE_META[role].accent}`}>{ROLE_META[role].label}</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">{copy.title}</h1><p className="mt-3 text-sm leading-6 text-white/50">{copy.description}</p>{activeTab === 'profile' ? <div className="mt-6 space-y-3"><div className="rounded-xl border border-white/10 bg-black/20 p-4"><UserCircle className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-base font-black">{identity?.name || identity?.full_name || profile?.email || 'Verified AFAT identity'}</p><p className="mt-1 text-xs text-white/40">Status: {identity?.status || membership?.status || profile?.status || 'active'}</p></div><button onClick={onSignOut} className="min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button></div> : <div className="mt-6 grid grid-cols-3 gap-3"><Metric icon={Radio} label="Queue" value={items.length} /><Metric icon={MapPin} label="Meeting points" value={live.checkpoints.length} /><Metric icon={Bell} label="Conditions" value={live.incidents.length} /></div>}</Surface><Surface className="p-5"><h2 className="text-sm font-black uppercase tracking-wider">Live {activeTab === 'profile' ? 'access boundary' : 'operational records'}</h2>{activeTab === 'profile' ? <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] p-5 text-sm leading-7 text-white/55">Changing workspace never silently changes an approved role, organisation, jurisdiction or authority.</div> : <div className="mt-4 space-y-3">{items.slice(0, 10).map((item: any, i: number) => <article key={item.id || i} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" /><div><p className="text-sm font-black">{item.destination_text || item.name || item.type || item.status || `${ROLE_META[role].label} record`}</p><p className="mt-1 text-xs text-white/40">{item.origin_text || item.description || item.status || 'Live AFAT service record'}</p></div></div></article>)}{!items.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">{copy.empty}</p>}</div>}</Surface></div>;
}

export function AdaptiveRoleHome({ role, profile, membership, activeTab = 'home', onNavigate, onSignOut }: Props) {
  const { live, missions, operations, loading, serviceErrors, refresh } = useRoleWorkspaceData(role, profile);
  const meta = ROLE_META[role]; const Icon = meta.icon; const participantDispatches = operations?.participantDispatches || []; const currentDispatch = participantDispatches.find((item: any) => ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed'].includes(String(item.status || '').toLowerCase())) || participantDispatches[0] || null; const home = useMemo(() => { if (role === 'commuter') return <PassengerWorkspaceHome profile={profile} live={live} currentDispatch={currentDispatch} onNavigate={onNavigate} onChanged={refresh} />; if (role === 'operator') return <OperatorWorkspaceHome profile={profile} live={live} missions={missions} currentDispatch={currentDispatch} onNavigate={onNavigate} onChanged={refresh} />; if (role === 'planner') return <PlannerWorkspaceHome live={live} operations={operations} onNavigate={onNavigate} />; if (role === 'organization' || role === 'government' || role === 'admin') return <InstitutionalWorkspaceHome role={role} membership={membership} live={live} operations={operations} onNavigate={onNavigate} />; return null; }, [role, profile, membership, live, missions, operations, onNavigate]);
  return <div className="min-h-screen bg-[#050812] text-white"><WorkspaceHeader role={role} profile={profile} onSignOut={onSignOut} loading={loading} onRefresh={refresh} /><main className="mx-auto max-w-[1540px] px-4 pb-28 pt-5 sm:px-7"><div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${meta.accent}`} /><p className={`text-[10px] font-black uppercase tracking-[0.25em] ${meta.accent}`}>{meta.eyebrow}</p></div><h2 className="mt-2 text-2xl font-black tracking-tight">{meta.label} workspace</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">{meta.promise}</p></div><RealityBar live={live} loading={loading} errors={serviceErrors} /></div><RoleFlow role={role} activeTab={activeTab} onNavigate={onNavigate} />{serviceErrors.length > 0 && <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /><div><p className="text-xs font-black text-amber-100">AFAT is operating with partial live data.</p><p className="mt-1 text-xs leading-5 text-white/45">{serviceErrors.join(' · ')}</p></div></div></div>}<div className="mt-5">{activeTab === 'home' ? home : <TabCanvas role={role} activeTab={activeTab as Exclude<WorkspaceTab, 'home'>} profile={profile} membership={membership} live={live} missions={missions} operations={operations} onSignOut={onSignOut} />}</div></main></div>;
}
