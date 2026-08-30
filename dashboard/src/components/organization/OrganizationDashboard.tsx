import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  LogOut,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react';
import { fetchComplianceSummary, supabase } from '../../supabaseClient';

interface Props {
  activeTab?: string;
  membership: any;
  profile: any;
  onSignOut: () => void;
}

function statusStyle(status?: string) {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'verified' || normalized === 'active') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
  if (normalized === 'expired' || normalized === 'rejected' || normalized === 'missing') return 'border-red-400/20 bg-red-500/10 text-red-200';
  return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
}

export function OrganizationDashboard({ activeTab = 'home', membership, profile, onSignOut }: Props) {
  const company = membership?.companies;
  const companyId = company?.id;
  const [members, setMembers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState('');

  useEffect(() => {
    if (!profile?.id || !companyId) return;
    let active = true;

    const loadOrganization = async () => {
      setLoading(true);
      setLoadMessage('');

      const [membershipResult, complianceResult] = await Promise.all([
        supabase
          .from('company_memberships')
          .select('id, role, status, profile_id, profiles:profile_id(id, full_name, phone, role, is_active)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: true }),
        fetchComplianceSummary(profile.id),
      ]);
      if (!active) return;

      const organizationMembers = membershipResult.data || [];
      setMembers(organizationMembers);
      if (complianceResult.data) setCompliance(complianceResult.data);

      const operatorIds = organizationMembers
        .map((entry: any) => entry.profiles)
        .filter((entry: any) => entry?.role === 'operator')
        .map((entry: any) => entry.id);

      if (operatorIds.length) {
        const vehicleResult = await supabase
          .from('vehicles')
          .select('id, operator_id, plate_number, type, capacity, status, is_available, last_ping_at')
          .in('operator_id', operatorIds)
          .order('created_at', { ascending: false });
        if (!active) return;
        setVehicles(vehicleResult.data || []);
        if (vehicleResult.error) setLoadMessage('Fleet records could not be loaded. Membership and compliance remain available.');
      } else {
        setVehicles([]);
      }

      if (membershipResult.error || complianceResult.error) {
        setLoadMessage('Some organisation records are temporarily unavailable. No placeholder figures are being shown.');
      }
      setLoading(false);
    };

    void loadOrganization();
    return () => {
      active = false;
    };
  }, [companyId, profile?.id]);

  const records = compliance?.records || [];
  const summary = compliance?.summary || {};
  const activeOperators = useMemo(
    () => members.filter((entry: any) => entry.profiles?.role === 'operator' && entry.profiles?.is_active !== false).length,
    [members],
  );
  const availableVehicles = vehicles.filter((vehicle: any) => vehicle.is_available).length;

  const header = (
    <header className="sticky top-0 z-50 border-b border-cyan-300/10 bg-[#07131b]/92 px-5 py-4 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
            <Building2 className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black text-white">{company?.name || 'Organisation workspace'}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.24em] text-cyan-200/65">Fleet owner console · {membership?.role || 'member'}</p>
          </div>
        </div>
        <button onClick={onSignOut} className="flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/60 hover:text-white">
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );

  if (activeTab === 'bookings') {
    return (
      <div className="min-h-screen bg-[#050d13] pb-28 text-white">
        {header}
        <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
          <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Fleet register</p><h1 className="mt-2 text-3xl font-black">People and vehicles</h1><p className="mt-2 text-sm text-white/45">Only records attached to this organisation are shown.</p></div>
          {loadMessage && <p role="status" className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">{loadMessage}</p>}
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-black">Team roster</h2><span className="text-xs text-white/35">{members.length} members</span></div>
              <div className="space-y-3">
                {members.map((entry: any) => <article key={entry.id} className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{entry.profiles?.full_name || 'Unnamed member'}</p><p className="mt-1 text-xs text-white/40">{entry.profiles?.phone || 'No contact line'} · platform role: {entry.profiles?.role || 'commuter'}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusStyle(entry.status)}`}>{entry.role}</span></div></article>)}
                {!loading && !members.length && <p className="py-10 text-center text-sm text-white/35">No additional organisation members yet.</p>}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-black">Vehicle register</h2><span className="text-xs text-white/35">{vehicles.length} vehicles</span></div>
              <div className="space-y-3">
                {vehicles.map((vehicle: any) => <article key={vehicle.id} className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{vehicle.plate_number || 'Plate pending'}</p><p className="mt-1 text-xs capitalize text-white/40">{vehicle.type || 'vehicle'} · capacity {vehicle.capacity || '—'}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusStyle(vehicle.is_available ? 'active' : vehicle.status)}`}>{vehicle.is_available ? 'available' : vehicle.status || 'offline'}</span></div></article>)}
                {!loading && !vehicles.length && <p className="py-10 text-center text-sm text-white/35">No approved operator vehicles are attached yet.</p>}
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="min-h-screen bg-[#050d13] pb-28 text-white">
        {header}
        <main className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
          <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Readiness ledger</p><h1 className="mt-2 text-3xl font-black">Compliance and follow-up</h1><p className="mt-2 text-sm text-white/45">Submission status is separate from AFAT verification. Pending evidence never appears as approved.</p></div>
          <section className="space-y-3">
            {records.map((record: any) => <article key={record.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{record.document_label || String(record.document_type || 'Compliance item').replace(/_/g, ' ')}</p><p className="mt-2 text-xs text-white/40">{record.notes || 'Evidence and AFAT review status will appear here.'}</p></div><span className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-wider ${statusStyle(record.status)}`}>{record.status || 'pending'}</span></div></article>)}
            {!loading && !records.length && <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm text-white/40">No compliance checklist has been issued yet.</div>}
          </section>
        </main>
      </div>
    );
  }

  if (activeTab === 'profile') {
    return (
      <div className="min-h-screen bg-[#050d13] pb-28 text-white">
        {header}
        <main className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
          <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Organisation identity</p><h1 className="mt-2 text-3xl font-black">Control without false authority</h1></div>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-5"><Building2 className="h-6 w-6 text-cyan-200" /><p className="mt-4 text-[10px] font-black uppercase tracking-widest text-cyan-100/60">Organisation</p><p className="mt-2 text-xl font-black">{company?.name || 'Fleet intake'}</p><p className="mt-2 text-xs text-white/50">Declared fleet size: {company?.fleet_size || 'not supplied'} · Contact: {company?.contact_person || profile?.full_name || 'not supplied'}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><ShieldCheck className="h-6 w-6 text-emerald-300" /><p className="mt-4 text-[10px] font-black uppercase tracking-widest text-white/40">Authority boundary</p><p className="mt-2 text-xl font-black capitalize">{membership?.role || 'member'}</p><p className="mt-2 text-xs text-white/50">This controls the organisation record. It does not grant AFAT Planner or Admin authority.</p></div>
          </section>
          <button onClick={onSignOut} className="min-h-12 w-full rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-xs font-black uppercase tracking-widest text-red-200">Sign out of organisation workspace</button>
        </main>
      </div>
    );
  }

  const readiness = Number(summary.score || 0);
  return (
    <div className="min-h-screen bg-[#050d13] pb-28 text-white">
      {header}
      <main className="mx-auto max-w-7xl space-y-7 p-5 sm:p-8">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/12 via-white/[0.04] to-transparent p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
            <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/70">Organisation command</p><h1 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">Move your fleet from intake to trusted service.</h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50">One clear view of people, vehicles and evidence. Platform staff authority remains separate from company ownership.</p></div>
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">Readiness score</p><p className="mt-2 text-5xl font-black text-cyan-200">{readiness}</p><p className="mt-1 text-xs text-white/40">Based on real compliance records</p></div>
          </div>
        </section>
        {loadMessage && <p role="status" className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">{loadMessage}</p>}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Team members', value: members.length, icon: Users, tone: 'text-blue-300' },
            { label: 'Active operators', value: activeOperators, icon: Truck, tone: 'text-emerald-300' },
            { label: 'Available vehicles', value: availableVehicles, icon: CheckCircle2, tone: 'text-cyan-300' },
            { label: 'Open compliance', value: Math.max(0, Number(summary.total || 0) - Number(summary.verified || 0)), icon: ClipboardCheck, tone: 'text-amber-300' },
          ].map((metric) => <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><metric.icon className={`h-5 w-5 ${metric.tone}`} /><p className="mt-5 text-3xl font-black">{loading ? '—' : metric.value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-white/35">{metric.label}</p></div>)}
        </section>
        <section className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 lg:col-span-2"><div className="flex items-center gap-3"><FileClock className="h-5 w-5 text-amber-300" /><div><h2 className="font-black">Next readiness actions</h2><p className="text-xs text-white/40">Derived from outstanding records</p></div></div><div className="mt-5 space-y-3">{records.filter((record: any) => record.status !== 'verified').slice(0, 4).map((record: any) => <div key={record.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 p-4"><div><p className="text-sm font-bold">{record.document_label || record.document_type}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/35">{record.status || 'pending'}</p></div><ChevronRight className="h-4 w-4 text-white/25" /></div>)}{!loading && !records.length && <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/8 p-4 text-sm text-emerald-100">No follow-up checklist is currently visible.</div>}</div></div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><AlertTriangle className="h-5 w-5 text-amber-300" /><h2 className="mt-4 font-black">Authority status</h2><p className="mt-2 text-sm leading-relaxed text-white/45">Organisation ownership is active for this workspace. Operator dispatch requires approved operators; AFAT planning and administration require separate staff invitations.</p><div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4 text-xs font-bold text-cyan-100">Membership: {membership?.status || 'active'} · {membership?.role || 'member'}</div></div>
        </section>
      </main>
    </div>
  );
}
