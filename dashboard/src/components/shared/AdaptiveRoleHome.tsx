import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Building2, Gauge, Landmark, Layers3, LogOut,
  MapPin, Navigation2, Radio, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import {
  createPassageIntent, fetchActiveDispatches, fetchComplianceRadar, fetchDemandRadar,
  fetchLiveMapOps, fetchMobilityMapFeed, fetchOpsReportCenter, fetchPassageIntents,
  fetchPublicPartnerConditions, supabase, updatePassageIntentStatus,
} from '../../supabaseClient';
import { AFATLogo } from './AFATLogo';
import { InteractiveMap } from './InteractiveMap';

export type AdaptiveWorkspaceRole = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
type WorkspaceTab = 'bookings' | 'notifications' | 'profile';

type Props = {
  role: AdaptiveWorkspaceRole;
  profile: any;
  membership?: any;
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
      <section className="rounded-lg border border-blue-300/15 bg-blue-500/[0.055] p-5 sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Passenger journey</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Where do you need to go?</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">Create one live passage request. AFAT then connects destination confidence, meeting point, available service and safety context.</p>
        <form onSubmit={requestPassage} className="mt-7 space-y-3">
          <label className="block"><span className="sr-only">Starting point</span><div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-4"><MapPin className="h-4 w-4 text-emerald-300" /><input value={origin} onChange={(event) => setOrigin(event.target.value)} className="min-h-14 w-full bg-transparent text-sm font-bold text-white outline-none" /></div></label>
          <label className="block"><span className="sr-only">Destination</span><div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-4"><Search className="h-4 w-4 text-blue-300" /><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Destination or local landmark" className="min-h-14 w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/25" /></div></label>
          <button type="submit" disabled={!destination.trim() || submitting || !profile?.id} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 text-sm font-black text-white transition hover:bg-blue-400 disabled:opacity-40">{submitting ? 'Creating live passage...' : 'Request safe passage'} <ArrowRight className="h-4 w-4" /></button>
        </form>
        {notice && <p role="status" className={`mt-4 rounded-lg border p-4 text-xs font-bold ${notice.includes('failed') ? 'border-red-400/20 bg-red-500/10 text-red-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'}`}>{notice}</p>}
        <button onClick={() => onNavigate('bookings')} className="mt-4 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-black text-white/75">View live journeys and tickets</button>
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
        <div className="rounded-lg border border-emerald-300/15 bg-emerald-500/[0.055] p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/70">Operator terminal</p><h1 className="mt-2 text-3xl font-black">{vehicle?.is_available ? 'Ready for verified demand' : 'Service is offline'}</h1><p className="mt-2 text-xs text-white/45">{vehicle ? `${vehicle.plate_number || 'Plate pending'} · ${vehicle.type || 'vehicle'} · ${vehicle.status || 'reviewed'}` : 'No approved vehicle is attached yet.'}</p></div>
            <button onClick={toggleAvailability} disabled={availabilityBusy || !vehicle} className={`min-h-11 rounded-lg px-5 text-xs font-black disabled:opacity-40 ${vehicle?.is_available ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/5 text-white'}`}>{availabilityBusy ? 'Updating...' : vehicle?.is_available ? 'Online' : 'Go online'}</button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3"><div><p className="text-2xl font-black">{missions.length}</p><p className="text-[9px] uppercase text-white/35">Verified requests</p></div><div><p className="text-2xl font-black">{live.tracks.length}</p><p className="text-[9px] uppercase text-white/35">Visible network vehicles</p></div></div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Next verified request</p>
          <h2 className="mt-2 text-xl font-black">{first?.destination_text || 'No open request in the queue'}</h2>
          <p className="mt-2 text-sm text-white/45">{first ? `${first.origin_text || 'Origin pending'} to ${first.destination_text}. Passenger identity stays protected.` : 'AFAT only surfaces requests returned by the live passage service.'}</p>
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
  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-lg border border-cyan-300/15 bg-white/[0.035] p-5 sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">{company?.name || 'Organisation operations'}</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Control the fleet you actually own.</h1>
        <p className="mt-2 text-sm text-white/50">Team, vehicle and compliance views are scoped to this organisation membership. Planner and Admin authority remain separate.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button onClick={() => onNavigate('bookings')} className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 p-5 text-left"><Building2 className="h-5 w-5 text-cyan-200" /><span className="mt-4 block text-base font-black">People and vehicles</span><span className="mt-2 block text-xs text-white/45">Open the live organisation roster and vehicle register.</span></button>
          <button onClick={() => onNavigate('notifications')} className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-5 text-left"><ShieldCheck className="h-5 w-5 text-amber-200" /><span className="mt-4 block text-base font-black">Compliance readiness</span><span className="mt-2 block text-xs text-white/45">Review evidence states without treating submission as approval.</span></button>
        </div>
        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4 text-xs font-bold text-white/55">Membership: {membership?.role || 'member'} · Status: {membership?.status || 'active'} · Declared fleet: {company?.fleet_size || 'not supplied'}</div>
      </section>
      <div className="min-h-[500px]"><MapPanel role="organization" live={live} /></div>
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
      <section className="rounded-lg border border-violet-300/15 bg-violet-500/[0.045] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Live operations posture</p><h2 className="mt-2 text-xl font-black">Decide from current evidence</h2>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-2xl font-black">{pressure}</p><p className="mt-1 text-[9px] uppercase text-white/35">Demand pressure</p></div><div className="rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-2xl font-black">{operations?.dispatches?.length || 0}</p><p className="mt-1 text-[9px] uppercase text-white/35">Active dispatches</p></div></div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase text-white/35">Engine recommendation</p><p className="mt-2 text-sm font-bold capitalize">{String(recommendation).replace(/_/g, ' ')}</p></div>
        <button onClick={() => onNavigate('bookings')} className="mt-5 min-h-12 w-full rounded-lg bg-violet-500 text-xs font-black text-white">Open reports, recovery and dispatch</button>
        <button onClick={() => onNavigate('notifications')} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 text-xs font-black text-white/70">Review live disruptions</button>
      </section>
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

export function AdaptiveRoleHome({ role, profile, membership, onNavigate, onSignOut }: Props) {
  const [live, setLive] = useState<LiveFeed>(EMPTY_LIVE);
  const [missions, setMissions] = useState<any[]>([]);
  const [operations, setOperations] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const meta = ROLE_META[role];

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      setFeedError('');
      const city = profile?.preferred_city || profile?.base_city || 'cameroon';
      const mapResult = role === 'government' ? await fetchPublicPartnerConditions(city) : ['planner', 'admin'].includes(role) ? await fetchLiveMapOps(city) : await fetchMobilityMapFeed(city);
      if (!active) return;
      if (mapResult.data) setLive({ incidents: mapResult.data.incidents || [], tracks: mapResult.data.vehicles || [], checkpoints: mapResult.data.checkpoints || [] });
      else {
        setLive(EMPTY_LIVE);
        setFeedError(mapResult.error?.message || 'The live map feed is temporarily unavailable.');
      }

      if (role === 'operator') {
        const requests = await fetchPassageIntents({ open: true });
        if (active) {
          setMissions(requests.data?.passages || []);
          if (requests.error) setFeedError((current) => current || requests.error.message);
        }
      }
      if (role === 'planner') {
        const [demand, dispatches] = await Promise.all([fetchDemandRadar(), fetchActiveDispatches()]);
        if (active) setOperations({ demand: demand.data, dispatches: dispatches.data?.dispatches || [] });
      }
      if (role === 'admin') {
        const [reports, compliance] = await Promise.all([fetchOpsReportCenter(), fetchComplianceRadar()]);
        if (active) setOperations({ reports: reports.data, compliance: compliance.data });
      }
      if (active) setLoading(false);
    };
    void hydrate();
    return () => { active = false; };
  }, [profile?.preferred_city, profile?.base_city, role, refreshKey]);

  const content = useMemo(() => {
    if (role === 'commuter') return <PassengerCanvas profile={profile} live={live} onNavigate={onNavigate} />;
    if (role === 'operator') return <OperatorCanvas profile={profile} live={live} missions={missions} onNavigate={onNavigate} onMissionChanged={() => setRefreshKey((value) => value + 1)} />;
    if (role === 'organization') return <OrganizationCanvas membership={membership} live={live} onNavigate={onNavigate} />;
    if (role === 'government') return <GovernmentCanvas membership={membership} live={live} onNavigate={onNavigate} />;
    if (role === 'planner') return <PlannerCanvas live={live} operations={operations} onNavigate={onNavigate} />;
    return <AdminCanvas operations={operations} onNavigate={onNavigate} />;
  }, [role, profile, live, missions, membership, operations, onNavigate]);

  return (
    <div className="min-h-screen bg-[#03080e] pb-28 text-white">
      <WorkspaceHeader role={role} profile={profile} onSignOut={onSignOut} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] ${meta.accent}`}><Radio className="h-3 w-3" /> {meta.label} workspace</div><p className="mt-2 max-w-3xl text-sm font-medium text-white/45">{meta.promise}</p></div>
          <button onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="flex min-h-10 items-center gap-2 self-start rounded-lg border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase tracking-wider text-white/60 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Syncing' : 'Refresh live data'}</button>
        </div>
        {feedError && <div role="status" className="mb-5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Partial service:</strong> {feedError}</div>}
        {content}
        {!feedError && !loading && <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-emerald-300"><Activity className="h-3 w-3" /> Live role services synchronized</div>}
      </main>
    </div>
  );
}
