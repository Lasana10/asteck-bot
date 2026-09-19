import React from 'react';
import { AlertTriangle, Building2, CheckCircle2, FileCheck2, Landmark, ShieldCheck, UserCircle } from 'lucide-react';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { FieldReportTriageList } from './FieldReportTriageList';
import { OperationalHealthPanel } from './OperationalHealthPanel';
import { DispatchWorkspace } from './DispatchWorkspace';

type Role = 'organization' | 'government' | 'admin';
type Tab = 'bookings' | 'notifications' | 'profile';

const COPY: Record<Role, { label: string; accent: string; queue: string; notices: string; boundary: string; icon: React.ElementType }> = {
  organization: { label: 'Organisation', accent: 'text-cyan-300', queue: 'People and fleet', notices: 'Compliance readiness', boundary: 'Operate only members and assets belonging to this organisation.', icon: Building2 },
  government: { label: 'Public Partner', accent: 'text-teal-300', queue: 'Evidence register', notices: 'Response room', boundary: 'Access remains scoped to the approved public mandate and jurisdiction.', icon: Landmark },
  admin: { label: 'Admin', accent: 'text-rose-300', queue: 'Authority queue', notices: 'Integrity exceptions', boundary: 'Admin governs identity, roles and platform integrity; Planner retains operational intervention decisions.', icon: ShieldCheck },
};

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function State({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-cyan-200" /><p className="mt-3 text-lg font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

export function InstitutionalWorkspaceTabs({
  role,
  activeTab,
  profile,
  membership,
  live,
  operations,
  onSignOut,
  onChanged,
}: {
  role: Role;
  activeTab: Tab;
  profile: any;
  membership: any;
  live: RoleWorkspaceLiveFeed;
  operations: any;
  onSignOut: () => void;
  onChanged?: () => void;
}) {
  const copy = COPY[role];
  const Icon = copy.icon;
  const identity = role === 'organization' ? membership?.companies : role === 'government' ? membership?.partner : profile;
  const adminReports = operations?.reports?.reports || [];
  const fieldReports = operations?.fieldReports || [];
  const compliance = operations?.compliance?.summary || {};
  const queueItems = role === 'admin'
    ? adminReports
    : role === 'government'
      ? live.incidents
      : live.tracks;
  const noticeItems = role === 'admin'
    ? [...adminReports, ...(operations?.compliance?.records || [])]
    : live.incidents;

  if (activeTab === 'profile') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Surface className="p-6">
          <Icon className={`h-6 w-6 ${copy.accent}`} />
          <p className={`mt-4 text-[10px] font-black uppercase tracking-widest ${copy.accent}`}>{copy.label} record</p>
          <h1 className="mt-2 text-3xl font-black">{identity?.name || identity?.full_name || profile?.email || copy.label}</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={UserCircle} label="Identity" value={identity?.status || membership?.status || profile?.verification_status || 'active'} />
            <State icon={ShieldCheck} label="Boundary" value={copy.label} />
          </div>
          <button onClick={onSignOut} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-sm font-black uppercase tracking-wider">Access boundary</h2>
          <p className="mt-4 text-sm leading-7 text-white/50">{copy.boundary}</p>
        </Surface>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
        <Surface className="p-6">
          <p className={`text-[10px] font-black uppercase tracking-widest ${copy.accent}`}>{copy.notices}</p>
          <h1 className="mt-2 text-3xl font-black">{role === 'admin' ? 'Platform integrity that needs action' : role === 'government' ? 'Conditions inside the public mandate' : 'Readiness and operating exceptions'}</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={AlertTriangle} label="Exceptions" value={noticeItems.length} />
            <State icon={FileCheck2} label="Overdue" value={role === 'admin' ? compliance.overdue || 0 : live.incidents.length} />
          </div>
        </Surface>
        <Surface className="p-5">
          <div className="space-y-3">
            {noticeItems.slice(0, 15).map((item: any, index: number) => (
              <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black">{item.title || item.name || item.type || item.status || `${copy.label} exception`}</p>
                <p className="mt-1 text-xs text-white/40">{item.description || item.reason || item.status || 'AFAT operational evidence'}</p>
              </article>
            ))}
            {!noticeItems.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No {copy.notices.toLowerCase()} item requires attention.</p>}
          </div>
          {role === 'admin' && <>
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-amber-200">Operational health</p>
              <OperationalHealthPanel health={operations?.health} />
            </div>
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-amber-200">Journey field evidence</p>
              <FieldReportTriageList reports={fieldReports} onChanged={onChanged} />
            </div>
          </>}
        </Surface>
      </div>
    );
  }

  if (activeTab === 'bookings' && role === 'admin') {
    return (
      <div className="space-y-5">
        <Surface className="p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Dispatch oversight</p>
          <h1 className="mt-2 text-3xl font-black">Govern operational exceptions without replacing Planner authority</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">Admin can inspect and resolve system-level dispatch integrity issues while every action remains auditable.</p>
        </Surface>
        <DispatchWorkspace role="admin" profile={profile} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
      <Surface className="p-6">
        <p className={`text-[10px] font-black uppercase tracking-widest ${copy.accent}`}>{copy.queue}</p>
        <h1 className="mt-2 text-3xl font-black">{role === 'admin' ? 'Identity and platform authority' : role === 'government' ? 'Mandate-scoped mobility evidence' : 'Owned operational resources'}</h1>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <State icon={Icon} label="Queue records" value={queueItems.length} />
          <State icon={CheckCircle2} label="Live conditions" value={live.incidents.length} />
        </div>
      </Surface>
      <Surface className="p-5">
        <div className="space-y-3">
          {queueItems.slice(0, 15).map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black">{item.title || item.name || item.type || item.status || `${copy.label} record`}</p>
              <p className="mt-1 text-xs text-white/40">{item.description || item.status || item.plate_number || 'Current AFAT record'}</p>
            </article>
          ))}
          {!queueItems.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No current {copy.queue.toLowerCase()} record is available.</p>}
        </div>
      </Surface>
    </div>
  );
}
