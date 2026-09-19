import React from 'react';
import { AlertTriangle, Car, ShieldCheck, UserCircle } from 'lucide-react';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';
import { DispatchWorkspace } from '../shared/DispatchWorkspace';
import { AtlasContributionPanel } from '../shared/AtlasContributionPanel';

type Tab = 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function State({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-emerald-200" /><p className="mt-3 text-lg font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

export function OperatorWorkspaceTabs({
  activeTab,
  profile,
  live,
  missions,
  operations,
  onSignOut,
  onChanged,
}: {
  activeTab: Tab;
  profile: any;
  live: RoleWorkspaceLiveFeed;
  missions: any[];
  operations: any;
  onSignOut: () => void;
  onChanged?: () => void;
}) {
  if (activeTab === 'profile') {
    return (
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
          <Surface className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Operator identity</p>
            <h1 className="mt-2 text-3xl font-black">{profile?.full_name || 'AFAT operator'}</h1>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <State icon={UserCircle} label="Identity" value={profile?.verification_status || 'pending'} />
              <State icon={ShieldCheck} label="Operator status" value={profile?.operator_application_status || 'not approved'} />
            </div>
            <button onClick={onSignOut} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button>
          </Surface>
          <Surface className="p-6">
            <h2 className="text-sm font-black uppercase tracking-wider">Service access</h2>
            <p className="mt-4 text-sm leading-7 text-white/50">Going online requires approved Operator access and a usable vehicle. Mapping contribution is separate: you can help AFAT learn the city even while doing normal non-AFAT work.</p>
          </Surface>
        </div>
        <AtlasContributionPanel defaultMode="taxi" />
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Service alerts</p>
          <h1 className="mt-2 text-3xl font-black">Conditions connected to active work</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={AlertTriangle} label="Conditions" value={live.incidents.length} />
            <State icon={Car} label="Network supply" value={live.tracks.length} />
          </div>
        </Surface>
        <Surface className="p-5">
          <div className="space-y-3">
            {live.incidents.slice(0, 12).map((item: any, index: number) => (
              <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black">{item.name || item.type || 'Operating condition'}</p>
                <p className="mt-1 text-xs text-white/40">{item.description || item.status || 'AFAT operating evidence'}</p>
              </article>
            ))}
            {!live.incidents.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No operator alert requires attention.</p>}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Surface className="p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Missions</p>
        <h1 className="mt-2 text-3xl font-black">Committed work</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">Offers, acceptance, approach, arrival, secure pickup, live journey and closure are operated here. New eligible work remains on Home.</p>
      </Surface>
      <DispatchWorkspace role="operator" profile={profile} onChanged={onChanged} />
    </div>
  );
}
