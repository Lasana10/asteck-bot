import React from 'react';
import { Bell, CheckCircle2, MapPin, Route, ShieldCheck, UserCircle } from 'lucide-react';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type Tab = 'bookings' | 'notifications' | 'profile';

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function State({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Icon className="h-4 w-4 text-blue-200" /><p className="mt-3 text-lg font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p></div>;
}

export function PassengerWorkspaceTabs({
  activeTab,
  profile,
  live,
  operations,
  onSignOut,
}: {
  activeTab: Tab;
  profile: any;
  live: RoleWorkspaceLiveFeed;
  operations: any;
  onSignOut: () => void;
}) {
  const dispatches = operations?.participantDispatches || [];

  if (activeTab === 'profile') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Passenger identity</p>
          <h1 className="mt-2 text-3xl font-black">{profile?.full_name || 'AFAT passenger'}</h1>
          <p className="mt-2 text-sm text-white/45">Passenger identity and mobility preferences stay separate from elevated capabilities.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <State icon={UserCircle} label="Identity" value={profile?.verification_status || 'basic'} />
            <State icon={ShieldCheck} label="Access" value="Passenger" />
          </div>
          <button onClick={onSignOut} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Sign out securely</button>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-sm font-black uppercase tracking-wider">Passenger boundary</h2>
          <p className="mt-4 text-sm leading-7 text-white/50">Requesting Operator or Planner access does not remove Passenger access. Approved capabilities are added to the same identity and can be switched without a second account.</p>
        </Surface>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
        <Surface className="p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Journey safety</p>
          <h1 className="mt-2 text-3xl font-black">Conditions that affect your movement</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <State icon={Bell} label="Active notices" value={live.incidents.length} />
            <State icon={MapPin} label="Meeting points" value={live.checkpoints.length} />
          </div>
        </Surface>
        <Surface className="p-5">
          <div className="space-y-3">
            {live.incidents.slice(0, 12).map((item: any, index: number) => (
              <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black">{item.name || item.type || 'Movement condition'}</p>
                <p className="mt-1 text-xs text-white/40">{item.description || item.status || 'AFAT movement evidence'}</p>
              </article>
            ))}
            {!live.incidents.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No route-relevant safety notice is active.</p>}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
      <Surface className="p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">My journeys</p>
        <h1 className="mt-2 text-3xl font-black">One passenger timeline</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">Request, dispatch, pickup, journey, closure and receipt stay attached to the same real movement record.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <State icon={Route} label="Journey records" value={dispatches.length} />
          <State icon={MapPin} label="Visible meeting points" value={live.checkpoints.length} />
        </div>
      </Surface>
      <Surface className="p-5">
        <div className="space-y-3">
          {dispatches.slice(0, 12).map((item: any, index: number) => (
            <article key={item.id || index} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-blue-300" />
                <div>
                  <p className="text-sm font-black">{item.status ? String(item.status).replace(/_/g, ' ') : 'Journey record'}</p>
                  <p className="mt-1 text-xs text-white/40">Dispatch {String(item.id || '').slice(0, 8) || 'pending'} · booking {String(item.booking_id || '').slice(0, 8) || 'pending'}</p>
                </div>
              </div>
            </article>
          ))}
          {!dispatches.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No journey exists yet. Create a passage from Home to start.</p>}
        </div>
      </Surface>
    </div>
  );
}
