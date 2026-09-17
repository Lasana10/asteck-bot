import React from 'react';
import { AlertTriangle, Car, CheckCircle2, Radio, ShieldCheck, UserCircle } from 'lucide-react';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

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
}: {
  activeTab: Tab;
  profile: any;
  live: RoleWorkspaceLiveFeed;
  missions: any[];
  operations: any;
  onSignOut: () => void;
}) {
  const dispatches = operations?.participantDispatches || [];

  if (activeTab === 'profile') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Operator authority</p>
          <h1 className="mt-2 text-3xl font-black">{profile?.full_name || 'AFAT operator'}</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={UserCircle} label="Identity" value={profile?.verification_status || 'pending'} />
            <State icon={ShieldCheck} label="Operator status" value={profile?.operator_application_status || 'not approved'} />
          </div>
          <button onClick={onSignOut} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-sm font-black uppercase tracking-wider">Service boundary</h2>
          <p className="mt-4 text-sm leading-7 text-white/50">Going online requires approved Operator authority and a usable vehicle. A mission cannot be accepted while another active dispatch is still open.</p>
        </Surface>
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
    <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
      <Surface className="p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Mission control</p>
        <h1 className="mt-2 text-3xl font-black">Verified work only</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">Open demand and accepted dispatches are separate queues so an Operator can see what is available versus what is already committed.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <State icon={Radio} label="Open requests" value={missions.length} />
          <State icon={Car} label="My dispatches" value={dispatches.length} />
        </div>
      </Surface>
      <Surface className="p-5">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Current dispatches</p>
        <div className="mt-3 space-y-3">
          {dispatches.slice(0, 10).map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                <div>
                  <p className="text-sm font-black">{String(item.status || 'dispatch').replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-white/40">{String(item.id || '').slice(0, 8)} · vehicle {String(item.vehicle_id || '').slice(0, 8) || 'pending'}</p>
                </div>
              </div>
            </article>
          ))}
          {!dispatches.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No verified mission is assigned to this Operator.</p>}
        </div>

        <p className="mt-6 text-[9px] font-black uppercase tracking-widest text-white/35">Eligible demand</p>
        <div className="mt-3 space-y-3">
          {missions.slice(0, 10).map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-emerald-300/10 bg-emerald-400/[0.04] p-4">
              <p className="text-sm font-black">{item.destination_text || 'Destination pending'}</p>
              <p className="mt-1 text-xs text-white/40">{item.origin_text || 'Origin pending'} · {String(item.status || 'requested').replace(/_/g, ' ')}</p>
            </article>
          ))}
          {!missions.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No verified open request is eligible right now.</p>}
        </div>
      </Surface>
    </div>
  );
}
