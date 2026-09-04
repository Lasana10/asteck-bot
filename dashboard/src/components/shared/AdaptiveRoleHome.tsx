import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Bell, Building2, Car, CheckCircle2, Clock3, FileCheck,
  Gauge, Landmark, Layers3, LogOut, MapPin, Mic, Navigation2, Radio, RefreshCw, Route,
  Search, ShieldCheck, UserCircle, Users, Wallet,
} from 'lucide-react';
import {
  createPassageIntent, fetchActiveDispatches, fetchComplianceRadar, fetchDemandRadar,
  fetchLiveMapOps, fetchMobilityMapFeed, fetchOpsReportCenter, fetchPassageIntents,
  fetchPublicPartnerConditions, supabase, updatePassageIntentStatus,
} from '../../supabaseClient';
import { AFATLogo } from './AFATLogo';
import { InteractiveMap } from './InteractiveMap';
import { PassagePlanner } from '../commuter/PassagePlanner';
import { ROLE_FLOW } from '../../utils/roleWorkspace';

export type AdaptiveWorkspaceRole = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

type Props = {
  role: AdaptiveWorkspaceRole;
  profile: any;
  membership?: any;
  activeTab?: WorkspaceTab;
  onNavigate: (tab: WorkspaceTab) => void;
  onSignOut: () => void;
};

type LiveFeed = { incidents: any[]; tracks: any[]; checkpoints: any[] };

const ROLE_META: Record<AdaptiveWorkspaceRole, { label: string; promise: string; accent: string; icon: React.ElementType }> = {
  commuter: { label: 'Passenger', promise: 'Plan and monitor a real journey from one clear place.', accent: 'text-blue-300', icon: Navigation2 },
  operator: { label: 'Operator', promise: 'Control availability, verified demand and service delivery.', accent: 'text-emerald-300', icon: Gauge },
  organization: { label: 'Organisation', promise: 'Keep your people, vehicles and compliance evidence accountable.', accent: 'text-cyan-300', icon: Building2 },
  government: { label: 'Public Partner', promise: 'Coordinate public mobility from privacy-safe, mandate-scoped evidence.', accent: 'text-teal-300', icon: Landmark },
  planner: { label: 'Planner', promise: 'Move from validated conditions to dispatch and recovery decisions.', accent: 'text-violet-300', icon: Layers3 },
  admin: { label: 'Admin', promise: 'Govern identity, authority, compliance and system integrity.', accent: 'text-rose-300', icon: ShieldCheck },
};

const EMPTY_LIVE: LiveFeed = { incidents: [], tracks: [], checkpoints: [] };

const TAB_COPY: Record<AdaptiveWorkspaceRole, Record<Exclude<WorkspaceTab, 'home'>, { eyebrow: string; title: string; description: string }>> = {
  commuter: {
    bookings: { eyebrow: 'My journeys', title: 'Passage history and active trips', description: 'Follow each request from meeting-point confirmation to safe arrival.' },
    notifications: { eyebrow: 'Journey safety', title: 'Conditions that affect your movement', description: 'Only relevant route, pickup and safety notices appear here.' },
    profile: { eyebrow: 'Passenger identity', title: 'Your trusted travel profile', description: 'Control identity, accessibility and contact preferences without exposing them to other roles.' },
  },
  operator: {
    bookings: { eyebrow: 'Mission queue', title: 'Accept, deliver and complete service', description: 'Verified demand stays connected to pickup, trip and earnings evidence.' },
    notifications: { eyebrow: 'Operator alerts', title: 'Route and service intelligence', description: 'See disruptions and instructions that affect active work.' },
    profile: { eyebrow: 'Operator authority', title: 'Vehicle and approval status', description: 'Your live console depends on verified identity, operator approval and an approved vehicle.' },
  },
  planner: {
    bookings: { eyebrow: 'Dispatch board', title: 'Turn pressure into accountable action', description: 'Monitor open dispatches and preserve the evidence behind every intervention.' },
    notifications: { eyebrow: 'Disruption queue', title: 'Validated conditions requiring attention', description: 'Prioritise movement failures by severity and operational impact.' },
    profile: { eyebrow: 'Planner authority', title: 'Scope and decision accountability', description: 'Planning authority remains separate from platform administration.' },
  },
  organization: {
    bookings: { eyebrow: 'People and fleet', title: 'Assign owned resources', description: 'Manage only the people and vehicles attached to this organisation.' },
    notifications: { eyebrow: 'Compliance', title: 'Evidence and renewal readiness', description: 'Submission, review and approval remain visibly separate states.' },
    profile: { eyebrow: 'Organisation record', title: 'Registration and accountable ownership', description: 'Government-linked registration evidence and AFAT membership scope live here.' },
  },
  government: {
    bookings: { eyebrow: 'Evidence register', title: 'Privacy-safe public conditions', description: 'Review aggregated evidence without exposing passenger or operator personal data.' },
    notifications: { eyebrow: 'Response room', title: 'Coordinate within the public mandate', description: 'Responses remain jurisdiction-scoped, attributable and measurable.' },
    profile: { eyebrow: 'Public mandate', title: 'Jurisdiction and access boundary', description: 'Partner access is tied to an approved institution and explicit mandate.' },
  },
  admin: {
    bookings: { eyebrow: 'Authority queue', title: 'Identity, approval and permissions', description: 'Every elevation requires evidence, explicit scope and a recorded decision.' },
    notifications: { eyebrow: 'System integrity', title: 'Compliance and operational exceptions', description: 'Investigate failures without mixing Admin and Planner authority.' },
    profile: { eyebrow: 'Admin identity', title: 'Privileged access and audit', description: 'High-risk actions remain attributable, reversible and reviewable.' },
  },
};

function RoleFlow({ role, activeTab, onNavigate }: { role: AdaptiveWorkspaceRole; activeTab: WorkspaceTab; onNavigate: Props['onNavigate'] }) {
  const tabs: WorkspaceTab[] = ['home', 'bookings', 'notifications', 'profile'];
  return <div className="mb-5 grid grid-cols-4 gap-2" aria-label={`${ROLE_META[role].label} service flow`}>{ROLE_FLOW[role].map((step, index) => <button key={step} type="button" onClick={() => onNavigate(tabs[index])} className={`rounded-lg border px-2 py-3 text-left transition ${activeTab === tabs[index] ? 'border-cyan-300/35 bg-cyan-400/10 text-white' : 'border-white/10 bg-white/[0.025] text-white/45'}`}><span className="block text-[8px] font-black uppercase tracking-widest">0{index + 1}</span><span className="mt-1 block text-[10px] font-black uppercase sm:text-xs">{step}</span></button>)}</div>;
}

function WorkspaceTabCanvas({ role, activeTab, profile, membership, live, missions, operations, onSignOut }: { role: AdaptiveWorkspaceRole; activeTab: Exclude<WorkspaceTab, 'home'>; profile: any; membership: any; live: LiveFeed; missions: any[]; operations: any; onSignOut: () => void }) {
  const copy = TAB_COPY[role][activeTab];
  const items = activeTab === 'bookings'
    ? (role === 'operator' ? missions : role === 'planner' ? operations?.dispatches || [] : live.tracks)
    : activeTab === 'notifications' ? live.incidents : [];
  const identity = role === 'organization' ? membership?.companies : role === 'government' ? membership?.partner : profile;
  const roleQueueLabel: Record<AdaptiveWorkspaceRole, string> = {
    commuter: activeTab === 'bookings' ? 'Journey timeline' : 'Route safety notices',
    operator: activeTab === 'bookings' ? 'Mission control' : 'Operator intelligence',
    organization: activeTab === 'bookings' ? 'Owned fleet register' : 'Compliance exceptions',
    government: activeTab === 'bookings' ? 'Public evidence register' : 'Mandate response queue',
    planner: activeTab === 'bookings' ? 'Dispatch interventions' : 'Movement failure queue',
    admin: activeTab === 'bookings' ? 'Authority decisions' : 'Integrity exceptions',
  };
  const rolePanel: Record<AdaptiveWorkspaceRole, { icon: React.ElementType; boundary: string; empty: string }> = {
    commuter: { icon: Route, boundary: 'Only your passages, shared meeting instructions and route-relevant safety notices appear here.', empty: 'No active journey records yet. Plan a passage from Home to begin.' },
    operator: { icon: Car, boundary: 'Only verified requests and missions assigned to your approved operator identity appear here.', empty: 'No verified mission is waiting. Stay online to receive eligible demand.' },
    organization: { icon: Building2, boundary: 'People, vehicles and evidence remain scoped to this organisation membership.', empty: 'No owned fleet activity is available in the live feed.' },
    government: { icon: Landmark, boundary: 'Public views remain aggregated, jurisdiction-scoped and free of passenger personal data.', empty: 'No validated public condition requires response in this mandate.' },
    planner: { icon: Layers3, boundary: 'Every dispatch preserves its triggering evidence, decision owner and measurable outcome.', empty: 'No movement failure or dispatch is in the current decision queue.' },
    admin: { icon: ShieldCheck, boundary: 'Privilege changes require evidence, rationale, scope and an attributable audit event.', empty: 'No governance exception is open in the current service response.' },
  };
  const panel = rolePanel[role];
  const PanelIcon = panel.icon;
  return <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-transparent p-5 sm:p-7">
      <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${ROLE_META[role].accent}`}>{copy.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/50">{copy.description}</p>
      {activeTab === 'profile' ? <div className="mt-6 space-y-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-4"><UserCircle className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-base font-black">{identity?.name || identity?.full_name || profile?.email || 'Verified AFAT identity'}</p><p className="mt-1 text-xs text-white/40">Role: {ROLE_META[role].label} · Status: {identity?.status || membership?.status || profile?.status || 'active'}</p></div>
        <button type="button" onClick={onSignOut} className="min-h-12 w-full rounded-lg border border-white/10 bg-white/5 text-xs font-black text-white">Sign out securely</button>
      </div> : <div className="mt-6 grid grid-cols-3 gap-3"><div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-2xl font-black">{items.length}</p><p className="mt-1 text-[8px] uppercase text-white/35">In this queue</p></div><div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-2xl font-black">{live.checkpoints.length}</p><p className="mt-1 text-[8px] uppercase text-white/35">Meeting points</p></div><div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-2xl font-black">{live.incidents.length}</p><p className="mt-1 text-[8px] uppercase text-white/35">Conditions</p></div></div>}
    </section>
    {activeTab === 'profile' ? <section className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.035] p-6"><PanelIcon className="h-7 w-7 text-cyan-200" /><h2 className="mt-4 text-xl font-black">{ROLE_META[role].label} access boundary</h2><p className="mt-2 text-sm leading-7 text-white/50">{panel.boundary}</p><div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/45">Changing workspace never silently changes an approved role, organisation, jurisdiction or authority.</div></section> : <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center gap-2"><PanelIcon className="h-4 w-4 text-cyan-200" /><h2 className="text-sm font-black uppercase tracking-wider">{roleQueueLabel[role]}</h2></div><div className="mt-4 space-y-3">{items.slice(0, 8).map((item: any, index: number) => <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/25 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-sm font-black">{item.destination_text || item.name || item.type || item.status || `${ROLE_META[role].label} record`}</p><p className="mt-1 text-xs text-white/40">{item.origin_text || item.description || item.status || 'Live AFAT service record'}</p><p className="mt-2 text-[9px] font-black uppercase tracking-wider text-white/25">Live evidence · {item.updated_at || item.created_at || item.timestamp ? 'timestamped' : 'time unavailable'}</p></div></div></article>)}{!items.length && <div className="rounded-xl border border-dashed border-white/15 p-8 text-center"><PanelIcon className="mx-auto h-6 w-6 text-white/25" /><p className="mt-3 text-sm text-white/40">{panel.empty}</p></div>}</div></section>}
  </div>;
}

function WorkspaceHeader({ role, profile, onSignOut }: Pick<Props, 'role' | 'profile' | 'onSignOut'>) {
  const meta = ROLE_META[role];
  return (
    <header className="sticky top-0 z-[900] border-b border-white/10 bg-[#050b12]/95 px-4 py-3 backdrop-blur-2xl sm:px-7">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-400/10">
            <AFATLogo className="h-6 w-6 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><p className="text-base font-black text-white">AFAT</p><span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/60">{meta.label}</span></div>
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">African Movement Operating System</p>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center px-6 lg:flex">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3"><Search className="h-4 w-4 text-white/30" /><span className="truncate text-xs font-semibold text-white/35">Search places, journeys, assets or decisions</span></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block"><p className="max-w-44 truncate text-xs font-black text-white">{profile?.full_name || 'AFAT member'}</p><p className={`text-[9px] font-black uppercase tracking-wider ${meta.accent}`}>{meta.label}</p></div>
          <button type="button" onClick={onSignOut} aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </header>
  );
}

function MapPanel({ role, live }: { role: AdaptiveWorkspaceRole; live: LiveFeed }) {
  const mapRole = role === 'admin' ? 'admin' : ['planner', 'government', 'organization'].includes(role) ? 'planner' : role;
  return <InteractiveMap role={mapRole as any} mapMode={role === 'commuter' ? 'standard' : 'intel'} incidents={live.incidents} tracks={live.tracks} checkpoints={live.checkpoints} realtimeOverlay={['operator', 'organization', 'planner', 'admin'].includes(role)} showInformal={role !== 'commuter'} />;
}

function PassengerCanvas({ profile, live, onNavigate }: { profile: any; live: LiveFeed; onNavigate: Props['onNavigate'] }) {
  const [origin, setOrigin] = useState(profile?.preferred_zone || 'My current location');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const requestPassage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !destination.trim()) return;
    setSubmitting(true);
    setNotice('');
    const { data, error } = await createPassageIntent({
      passenger_id: profile.id,
      origin_text: origin.trim() || 'Current location',
      destination_text: destination.trim(),
      metadata: { source: 'passenger_workspace', city: profile?.preferred_city || null },
    });
    setSubmitting(false);
    if (error) {
      setNotice(`Passage request failed: ${error.message}`);
      return;
    }
    const reference = String(data?.passage?.id || data?.id || '').slice(0, 8);
    setNotice(`Passage ${reference || 'request'} is live. AFAT is resolving a safe meeting point and verified supply.`);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="rounded-2xl border border-blue-300/15 bg-gradient-to-br from-blue-500/[0.12] via-blue-500/[0.045] to-transparent p-5 sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Passenger journey</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Where do you need to go?</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">Create one live passage request. AFAT then connects destination confidence, meeting point, available service and safety context.</p>
        <form onSubmit={requestPassage} className="mt-7 space-y-3">
          <label className="block"><span className="sr-only">Starting point</span><div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-4"><MapPin className="h-4 w-4 text-emerald-300" /><input value={origin} onChange={(event) => setOrigin(event.target.value)} className="min-h-14 w-full bg-transparent text-sm font-bold text-white outline-none" /></div></label>
          <label className="block"><span className="sr-only">Destination</span><div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-4"><Search className="h-4 w-4 text-blue-300" /><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Destination or local landmark" className="min-h-14 w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/25" /><Mic className="h-4 w-4 text-white/35" aria-hidden="true" /></div></label>
          <div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><MapPin className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-lg font-black">{live.checkpoints.length}</p><p className="text-[8px] uppercase text-white/35">Meeting points</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><Car className="h-4 w-4 text-blue-300" /><p className="mt-2 text-lg font-black">{live.tracks.length}</p><p className="text-[8px] uppercase text-white/35">Visible supply</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><ShieldCheck className="h-4 w-4 text-amber-300" /><p className="mt-2 text-lg font-black">{live.incidents.length}</p><p className="text-[8px] uppercase text-white/35">Conditions</p></div></div>
          <button type="submit" disabled={!destination.trim() || submitting || !profile?.id} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-400 px-5 text-sm font-black text-white shadow-lg shadow-blue-900/30 transition hover:brightness-110 disabled:opacity-40">{submitting ? 'Creating live passage...' : 'Plan safe passage'} <ArrowRight className="h-4 w-4" /></button>
        </form>
        {notice && <p role="status" className={`mt-4 rounded-lg border p-4 text-xs font-bold ${notice.includes('failed') ? 'border-red-400/20 bg-red-500/10 text-red-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'}`}>{notice}</p>}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase tracking-wider text-blue-200">Recommended passage</p><p className="mt-2 text-sm font-black">AFAT resolves a reachable meeting point after request</p><p className="mt-1 text-xs leading-5 text-white/40">Fare, pickup time and confidence appear only when a live service quote returns—never as invented values.</p></div>
        <button onClick={() => onNavigate('bookings')} className="mt-4 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-black text-white/75">View live journeys and tickets</button>
      </section>
      <section className="xl:col-span-2">
        <PassagePlanner
          profile={profile}
          originText={origin}
          initialDestination={destination}
          onPassageCreated={() => {
            setNotice('Your verified meeting point and passage request are saved. Open journeys to track the next action.');
            onNavigate('bookings');
          }}
        />
      </section>
      <div className="min-h-[440px]"><MapPanel role="commuter" live={live} /></div>
    </div>
  );
}

function OperatorCanvas({ profile, live, missions, onNavigate, onMissionChanged }: { profile: any; live: LiveFeed; missions: any[]; onNavigate: Props['onNavigate']; onMissionChanged: () => void }) {
  const [vehicle, setVehicle] = useState<any>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [missionBusy, setMissionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const first = missions[0];

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    supabase.from('vehicles').select('id, plate_number, type, status, is_available').eq('operator_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setVehicle(data || null);
        if (error) setNotice(`Vehicle status unavailable: ${error.message}`);
      });
    return () => { active = false; };
  }, [profile?.id]);

  const toggleAvailability = async () => {
    if (!vehicle?.id) {
      setNotice('No approved vehicle is attached to this operator. Complete vehicle verification before going online.');
      return;
    }
    setAvailabilityBusy(true);
    const next = !vehicle.is_available;
    const { error } = await supabase.from('vehicles').update({ is_available: next }).eq('id', vehicle.id);
    setAvailabilityBusy(false);
    if (error) setNotice(`Availability update failed: ${error.message}`);
    else {
      setVehicle((current: any) => ({ ...current, is_available: next }));
      setNotice(next ? 'You are visible to verified AFAT demand.' : 'You are offline and will not receive new assignments.');
    }
  };

  const acceptMission = async () => {
    if (!first?.id || !profile?.id) return;
    setMissionBusy(true);
    const { error } = await updatePassageIntentStatus(first.id, { status: 'driver_acknowledged', operator_id: profile.id });
    setMissionBusy(false);
    setNotice(error ? `Mission acceptance failed: ${error.message}` : 'Mission accepted. The passenger can now see the assigned operator and shared meeting point.');
    if (!error) onMissionChanged();
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="space-y-4">
        <div className="rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-500/[0.12] to-transparent p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/70">Operator terminal</p><h1 className="mt-2 text-3xl font-black">{vehicle?.is_available ? 'Ready for verified demand' : 'Service is offline'}</h1><p className="mt-2 text-xs text-white/45">{vehicle ? `${vehicle.plate_number || 'Plate pending'} · ${vehicle.type || 'vehicle'} · ${vehicle.status || 'reviewed'}` : 'No approved vehicle is attached yet.'}</p></div>
            <button onClick={toggleAvailability} disabled={availabilityBusy || !vehicle} className={`min-h-11 rounded-lg px-5 text-xs font-black disabled:opacity-40 ${vehicle?.is_available ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/5 text-white'}`}>{availabilityBusy ? 'Updating...' : vehicle?.is_available ? 'Online' : 'Go online'}</button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3"><div><p className="text-2xl font-black">{missions.length}</p><p className="text-[9px] uppercase text-white/35">Verified requests</p></div><div><p className="text-2xl font-black">{live.tracks.length}</p><p className="text-[9px] uppercase text-white/35">Visible network vehicles</p></div></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Next verified request</p>
          <h2 className="mt-2 text-xl font-black">{first?.destination_text || 'No open request in the queue'}</h2>
          <p className="mt-2 text-sm text-white/45">{first ? `${first.origin_text || 'Origin pending'} to ${first.destination_text}. Passenger identity stays protected.` : 'AFAT only surfaces requests returned by the live passage service.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/10 bg-black/25 p-3"><MapPin className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-[9px] uppercase text-white/35">Safe meeting point</p><p className="mt-1 text-xs font-black">{first?.meeting_point_text || first?.origin_text || 'Awaiting request'}</p></div><div className="rounded-xl border border-white/10 bg-black/25 p-3"><Wallet className="h-4 w-4 text-amber-300" /><p className="mt-2 text-[9px] uppercase text-white/35">Trusted fare</p><p className="mt-1 text-xs font-black">{first?.fare_amount ? `${first.fare_amount} ${first.currency || 'XAF'}` : 'Awaiting live quote'}</p></div><div className="rounded-xl border border-white/10 bg-black/25 p-3"><Clock3 className="h-4 w-4 text-blue-300" /><p className="mt-2 text-[9px] uppercase text-white/35">Pickup readiness</p><p className="mt-1 text-xs font-black">{first?.status ? String(first.status).replace(/_/g, ' ') : 'No mission'}</p></div><div className="rounded-xl border border-white/10 bg-black/25 p-3"><ShieldCheck className="h-4 w-4 text-cyan-300" /><p className="mt-2 text-[9px] uppercase text-white/35">Evidence</p><p className="mt-1 text-xs font-black">{first?.id ? 'Verified service record' : 'Not yet available'}</p></div></div>
          <div className="mt-5 flex gap-2"><button disabled={!vehicle?.is_available || !first?.id || missionBusy} onClick={acceptMission} className="min-h-12 flex-1 rounded-lg bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-35">{missionBusy ? 'Accepting...' : 'Accept request'}</button><button onClick={() => onNavigate('bookings')} className="min-h-12 rounded-lg border border-white/10 px-4 text-xs font-black text-white">Open queue</button></div>
          {notice && <p role="status" className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs font-bold text-amber-100">{notice}</p>}
        </div>
      </section>
      <div className="min-h-[540px]"><MapPanel role="operator" live={live} /></div>
    </div>
  );
}

function OrganizationCanvas({ membership, live, onNavigate }: { membership: any; live: LiveFeed; onNavigate: Props['onNavigate'] }) {
  const company = membership?.companies;
  const attentionCount = live.incidents.length + (membership?.status && membership.status !== 'active' ? 1 : 0);
  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/[0.11] to-transparent p-5 sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">{company?.name || 'Organisation operations'}</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">What needs attention today?</h1>
        <p className="mt-2 text-sm text-white/50">Team, vehicle and compliance views are scoped to this organisation membership. Planner and Admin authority remain separate.</p>
        <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-200" /><div><p className="text-sm font-black">{attentionCount ? `${attentionCount} live exception${attentionCount === 1 ? '' : 's'}` : 'No urgent exception returned'}</p><p className="mt-1 text-xs text-white/45">Derived from live mobility conditions and organisation status.</p></div></div></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button onClick={() => onNavigate('bookings')} className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-left"><Users className="h-5 w-5 text-cyan-200" /><span className="mt-4 block text-base font-black">People and fleet</span><span className="mt-2 block text-xs text-white/45">Open owned resources and live service activity.</span></button>
          <button onClick={() => onNavigate('notifications')} className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-5 text-left"><FileCheck className="h-5 w-5 text-amber-200" /><span className="mt-4 block text-base font-black">Compliance readiness</span><span className="mt-2 block text-xs text-white/45">Review evidence states without treating submission as approval.</span></button>
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-xs font-bold text-white/55">Membership: {membership?.role || 'member'} · Status: {membership?.status || 'active'} · Declared fleet: {company?.fleet_size || 'not supplied'}</div>
      </section>
      <section className="space-y-4"><div className="min-h-[430px]"><MapPanel role="organization" live={live} /></div><div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4">{[['Demand', live.incidents.length], ['Dispatch', 0], ['In service', live.tracks.length], ['Settled', '—']].map(([label, value], index) => <div key={String(label)} className="relative rounded-xl bg-black/20 p-3"><p className="text-xl font-black">{value}</p><p className="mt-1 text-[8px] uppercase text-white/35">{label}</p>{index < 3 && <ArrowRight className="absolute -right-3 top-5 z-10 h-3 w-3 text-cyan-200/40" />}</div>)}</div></section>
    </div>
  );
}

function GovernmentCanvas({ membership, live, onNavigate }: { membership: any; live: LiveFeed; onNavigate: Props['onNavigate'] }) {
  const partner = membership?.partner;
  const situation = live.incidents[0];
  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="rounded-lg border border-teal-300/15 bg-teal-500/[0.045] p-5 sm:p-7">
        <div className="flex flex-wrap gap-2"><span className="rounded-full border border-teal-300/20 bg-teal-500/10 px-3 py-2 text-[9px] font-black uppercase text-teal-200">Aggregated and privacy-safe</span><span className="rounded-full border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-white/45">{partner?.status || 'Under review'}</span></div>
        <h1 className="mt-5 text-3xl font-black">Public movement conditions</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/45">{partner?.name || 'Public partner'} · {partner?.jurisdiction || 'Jurisdiction pending'}</p>
        <div className="mt-6 rounded-lg border border-amber-400/20 bg-amber-500/10 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-amber-200">Priority validated situation</p><h2 className="mt-2 text-xl font-black">{situation?.name || situation?.type || 'No validated priority situation'}</h2><p className="mt-2 text-xs leading-relaxed text-white/45">{situation ? 'Open the response workspace to coordinate only actions allowed by this public mandate.' : 'AFAT will surface aggregated service gaps when the evidence feed validates them.'}</p><button disabled={!situation} onClick={() => onNavigate('notifications')} className="mt-5 min-h-12 w-full rounded-lg bg-teal-400 px-4 text-xs font-black text-slate-950 disabled:opacity-35">Open coordinated response</button></div>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-white/45"><strong className="text-white">Mandate boundary:</strong> aggregated interventions only. No citizen PII, operator finance, Planner authority or AFAT administration.</div>
      </section>
      <div className="min-h-[540px]"><MapPanel role="government" live={live} /></div>
    </div>
  );
}

function PlannerCanvas({ live, operations, onNavigate }: { live: LiveFeed; operations: any; onNavigate: Props['onNavigate'] }) {
  const situations = live.incidents.slice(0, 4);
  const pressure = operations?.demand?.summary?.pressure ?? 0;
  const recommendation = operations?.demand?.summary?.recommendation || 'No live recommendation';
  return (
    <div className="grid gap-5 xl:grid-cols-[0.64fr_1.1fr_0.72fr]">
      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5"><p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Validated situation queue</p>{situations.map((item: any, index: number) => <article key={item.id || index} className={`mt-3 rounded-lg border p-4 ${index === 0 ? 'border-violet-300/30 bg-violet-500/10' : 'border-white/10 bg-black/20'}`}><span className="text-sm font-black">{item.name || item.type || 'Movement signal'}</span><span className="mt-2 block text-[10px] text-white/35">{item.status || 'Awaiting validation'} · severity {item.severity || '—'}</span></article>)}{!situations.length && <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-5 text-sm text-white/40">No validated movement failure is in the current live feed.</div>}</section>
      <div className="min-h-[590px]"><MapPanel role="planner" live={live} /></div>
      <section className="rounded-2xl border border-violet-300/15 bg-violet-500/[0.045] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Live operations posture</p><h2 className="mt-2 text-xl font-black">Decide from current evidence</h2>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-2xl font-black">{pressure}</p><p className="mt-1 text-[9px] uppercase text-white/35">Demand pressure</p></div><div className="rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-2xl font-black">{operations?.dispatches?.length || 0}</p><p className="mt-1 text-[9px] uppercase text-white/35">Active dispatches</p></div></div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase text-white/35">Engine recommendation</p><p className="mt-2 text-sm font-bold capitalize">{String(recommendation).replace(/_/g, ' ')}</p></div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase text-white/35">Evidence provenance</p><p className="mt-2 text-xs leading-5 text-white/55">{live.incidents.length + live.tracks.length + live.checkpoints.length} live records · dispatch and demand services {operations?.demand ? 'responded' : 'awaiting response'}</p></div>
        <button onClick={() => onNavigate('bookings')} className="mt-5 min-h-12 w-full rounded-lg bg-violet-500 text-xs font-black text-white">Open reports, recovery and dispatch</button>
        <button onClick={() => onNavigate('notifications')} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 text-xs font-black text-white/70">Review live disruptions</button>
      </section>
      <section className="xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="mb-3 text-[9px] font-black uppercase tracking-widest text-white/35">Intervention lifecycle</p><div className="grid grid-cols-5 gap-2">{['Detect', 'Simulate', 'Approve', 'Dispatch', 'Measure'].map((step, index) => <div key={step} className={`rounded-xl border p-3 ${index === 0 && situations.length ? 'border-violet-300/30 bg-violet-500/10' : index === 3 && operations?.dispatches?.length ? 'border-cyan-300/30 bg-cyan-500/10' : 'border-white/10 bg-black/20'}`}><span className="text-[8px] font-black text-white/30">0{index + 1}</span><p className="mt-1 text-[9px] font-black uppercase sm:text-xs">{step}</p></div>)}</div></section>
    </div>
  );
}

function AdminCanvas({ operations, onNavigate }: { operations: any; onNavigate: Props['onNavigate'] }) {
  const compliance = operations?.compliance?.summary || {};
  const reports = operations?.reports?.reports || [];
  return (
    <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-6"><p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Governance queue</p><h1 className="mt-3 text-2xl font-black">Evidence before authority</h1><p className="mt-2 text-sm leading-relaxed text-white/45">Open the command workspace for auditable identity, lifecycle, compliance and platform decisions.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-4"><p className="text-2xl font-black">{reports.length}</p><p className="mt-1 text-[9px] uppercase text-white/35">Open reports</p></div><div className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-4"><p className="text-2xl font-black">{compliance.overdue ?? 0}</p><p className="mt-1 text-[9px] uppercase text-white/35">Overdue evidence</p></div></div><button onClick={() => onNavigate('bookings')} className="mt-5 min-h-12 w-full rounded-lg bg-rose-500 px-4 text-xs font-black text-white">Open governance and analytics</button></section>
      <section className="rounded-lg border border-rose-300/15 bg-rose-500/[0.035] p-6"><p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Enforced authority model</p><h2 className="mt-3 text-2xl font-black">Scoped, reasoned and reversible</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4"><p className="text-[9px] font-black uppercase text-emerald-200">Required</p><p className="mt-2 text-xs leading-6 text-white/60">Verified identity<br />Explicit permission<br />Region and duration limit<br />Recorded rationale</p></div><div className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-4"><p className="text-[9px] font-black uppercase text-rose-200">Excluded</p><p className="mt-2 text-xs leading-6 text-white/60">Silent role promotion<br />Unnecessary personal data<br />Unlogged decisions<br />Cross-role privilege drift</p></div></div><div className="mt-5 rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-4 text-xs text-cyan-50/70">Admin governs platform authority. Planner governs movement interventions.</div></section>
    </div>
  );
}

export function AdaptiveRoleHome({ role, profile, membership, activeTab = 'home', onNavigate, onSignOut }: Props) {
  const [live, setLive] = useState<LiveFeed>(EMPTY_LIVE);
  const [missions, setMissions] = useState<any[]>([]);
  const [operations, setOperations] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [serviceErrors, setServiceErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const meta = ROLE_META[role];

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      const errors: string[] = [];
      const city = profile?.preferred_city || profile?.base_city || 'cameroon';
      const mapResult = role === 'government' ? await fetchPublicPartnerConditions(city) : ['planner', 'admin'].includes(role) ? await fetchLiveMapOps(city) : await fetchMobilityMapFeed(city);
      if (!active) return;
      if (mapResult.data) setLive({
        incidents: mapResult.data.incidents || [],
        tracks: mapResult.data.vehicles || [],
        // Render AFAT-owned informal addresses as map checkpoints so every
        // role sees the same verified local geography with its own controls.
        checkpoints: [
          ...(mapResult.data.checkpoints || []),
          ...(mapResult.data.addresses || []).filter((item: any) => item.latitude != null && item.longitude != null).map((item: any) => ({
            ...item,
            id: `address-${item.id}`,
            name: item.canonical_label,
            type: 'local address',
          })),
        ],
      });
      else {
        setLive(EMPTY_LIVE);
        errors.push(`Map: ${mapResult.error?.message || 'temporarily unavailable'}`);
      }

      if (role === 'operator') {
        const requests = await fetchPassageIntents({ open: true });
        if (active) {
          setMissions(requests.data?.passages || []);
          if (requests.error) errors.push(`Mission queue: ${requests.error.message}`);
        }
      }
      if (role === 'planner') {
        const [demand, dispatches] = await Promise.all([fetchDemandRadar(), fetchActiveDispatches()]);
        if (demand.error) errors.push(`Demand radar: ${demand.error.message}`);
        if (dispatches.error) errors.push(`Dispatch board: ${dispatches.error.message}`);
        if (active) setOperations({ demand: demand.data, dispatches: dispatches.data?.dispatches || [] });
      }
      if (role === 'admin') {
        const [reports, compliance] = await Promise.all([fetchOpsReportCenter(), fetchComplianceRadar()]);
        if (reports.error) errors.push(`Report center: ${reports.error.message}`);
        if (compliance.error) errors.push(`Compliance radar: ${compliance.error.message}`);
        if (active) setOperations({ reports: reports.data, compliance: compliance.data });
      }
      if (active) { setServiceErrors(errors); setLoading(false); }
    };
    void hydrate();
    return () => { active = false; };
  }, [profile?.preferred_city, profile?.base_city, role, refreshKey]);

  const content = useMemo(() => {
    if (activeTab !== 'home') return <WorkspaceTabCanvas role={role} activeTab={activeTab} profile={profile} membership={membership} live={live} missions={missions} operations={operations} onSignOut={onSignOut} />;
    if (role === 'commuter') return <PassengerCanvas profile={profile} live={live} onNavigate={onNavigate} />;
    if (role === 'operator') return <OperatorCanvas profile={profile} live={live} missions={missions} onNavigate={onNavigate} onMissionChanged={() => setRefreshKey((value) => value + 1)} />;
    if (role === 'organization') return <OrganizationCanvas membership={membership} live={live} onNavigate={onNavigate} />;
    if (role === 'government') return <GovernmentCanvas membership={membership} live={live} onNavigate={onNavigate} />;
    if (role === 'planner') return <PlannerCanvas live={live} operations={operations} onNavigate={onNavigate} />;
    return <AdminCanvas operations={operations} onNavigate={onNavigate} />;
  }, [activeTab, role, profile, live, missions, membership, operations, onNavigate, onSignOut]);

  return (
    <div className="min-h-screen bg-[#03080e] pb-44 text-white sm:pb-36">
      <WorkspaceHeader role={role} profile={profile} onSignOut={onSignOut} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] ${meta.accent}`}><Radio className="h-3 w-3" /> {meta.label} workspace</div><p className="mt-2 max-w-3xl text-sm font-medium text-white/45">{meta.promise}</p></div>
          <button onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="flex min-h-10 items-center gap-2 self-start rounded-lg border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase tracking-wider text-white/60 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Syncing' : 'Refresh live data'}</button>
        </div>
        <RoleFlow role={role} activeTab={activeTab} onNavigate={onNavigate} />
        {serviceErrors.length > 0 && <div role="status" className="mb-5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Partial service:</strong><ul className="mt-2 list-disc space-y-1 pl-5">{serviceErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        {content}
        {serviceErrors.length === 0 && !loading && <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-emerald-300"><Activity className="h-3 w-3" /> Required {meta.label.toLowerCase()} services responded</div>}
      </main>
    </div>
  );
}
