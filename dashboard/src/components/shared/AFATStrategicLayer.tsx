import React, { useMemo } from 'react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Car,
  ClipboardCheck,
  Cloud,
  Database,
  FileCheck,
  Map,
  PackageCheck,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  WifiOff,
} from 'lucide-react';
import { mapOfflineService } from '../../services/MapOfflineService';

type Role = 'commuter' | 'operator' | 'planner' | 'admin';

interface Props {
  role: Role;
  profile?: any;
  liveVehicles?: number;
  liveIncidents?: number;
  liveCheckpoints?: number;
  onAction?: (action: 'book' | 'report' | 'drive' | 'compliance' | 'dispatch' | 'onboard' | 'map') => void;
}

const ROLE_HEADLINES: Record<Role, { title: string; brief: string }> = {
  commuter: {
    title: 'One passage layer',
    brief: 'Booking, reports, guardian safety, payments, and route guidance stay in one commuter flow.',
  },
  operator: {
    title: 'Operator operating system',
    brief: 'Drivers, taxis, bikes, delivery nodes, and agencies see compliance, demand, income, and map readiness together.',
  },
  planner: {
    title: 'City operations desk',
    brief: 'Dispatch, safety, demand, compliance, and human verification are visible as one city control surface.',
  },
  admin: {
    title: 'Infrastructure command',
    brief: 'AFAT registration, compliance packages, map data, AI guidance, and expansion readiness are tracked from one place.',
  },
};

const SERVICE_LANES = [
  { label: 'Commuters', icon: Users, note: 'booking, SOS, guardian watch' },
  { label: 'Drivers', icon: Car, note: 'taxi, bike, minibus, bus' },
  { label: 'Companies', icon: Building2, note: 'fleets, agencies, unions' },
  { label: 'Delivery', icon: Truck, note: 'cargo, errands, business dispatch' },
  { label: 'Special service', icon: BriefcaseBusiness, note: 'reserved and assigned movement' },
  { label: 'Compliance', icon: FileCheck, note: 'documents, expiry, review' },
];

const SYSTEM_PILLARS = [
  { label: 'Owned geodata', icon: Database, note: 'local OSM-style packs first, live overlays second' },
  { label: 'AI guidance', icon: Sparkles, note: 'route, demand, report, and driver assistance' },
  { label: 'Human verification', icon: ClipboardCheck, note: 'cross-checking where trust matters' },
  { label: 'Offline resilience', icon: WifiOff, note: 'weak internet should not break the mission' },
];

export function AFATStrategicLayer({ role, profile, liveVehicles = 0, liveIncidents = 0, liveCheckpoints = 0, onAction }: Props) {
  const headline = ROLE_HEADLINES[role] || ROLE_HEADLINES.commuter;
  const packs = mapOfflineService.getCatalog();
  const readyPacks = packs.filter((pack) => pack.status === 'ready');
  const plannedPacks = packs.filter((pack) => pack.status !== 'ready');

  const roleActions = useMemo(() => {
    if (role === 'commuter') {
      return [
        { id: 'book' as const, label: 'Book', icon: Route },
        { id: 'report' as const, label: 'Report', icon: Radio },
        { id: 'onboard' as const, label: 'Verify', icon: ShieldCheck },
      ];
    }
    if (role === 'operator') {
      return [
        { id: 'drive' as const, label: 'Drive', icon: Route },
        { id: 'compliance' as const, label: 'Docs', icon: BadgeCheck },
        { id: 'map' as const, label: 'Map packs', icon: Map },
      ];
    }
    return [
      { id: 'dispatch' as const, label: 'Dispatch', icon: Route },
      { id: 'compliance' as const, label: 'Compliance', icon: FileCheck },
      { id: 'onboard' as const, label: 'Onboard', icon: PackageCheck },
    ];
  }, [role]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-2xl">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1.35fr_0.9fr]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-200">
              <Cloud className="h-3.5 w-3.5" />
              AFAT OS upgrade visible
            </div>
            <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{headline.title}</h2>
            <p className="mt-2 max-w-md text-xs font-medium leading-relaxed text-white/50">{headline.brief}</p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Live nodes</p>
              <p className="mt-1 text-2xl font-black text-blue-200">{liveVehicles}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Alerts</p>
              <p className="mt-1 text-2xl font-black text-amber-200">{liveIncidents}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Checkpoints</p>
              <p className="mt-1 text-2xl font-black text-cyan-200">{liveCheckpoints}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Profile</p>
              <p className="mt-1 truncate text-sm font-black text-white">{profile?.role || role}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_LANES.map((lane) => {
            const Icon = lane.icon;
            return (
              <div key={lane.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <Icon className="mb-3 h-4 w-4 text-blue-300" />
                <p className="text-[11px] font-black uppercase tracking-tight text-white">{lane.label}</p>
                <p className="mt-1 text-[10px] font-semibold leading-relaxed text-white/40">{lane.note}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-200/60">Map foundation</p>
              <Map className="h-4 w-4 text-cyan-300" />
            </div>
            <p className="text-sm font-black text-white">{readyPacks.length} ready packs</p>
            <p className="mt-1 text-[10px] font-semibold text-white/40">{plannedPacks.length} planned city pack{plannedPacks.length === 1 ? '' : 's'}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {packs.map((pack) => (
                <span
                  key={pack.id}
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                    pack.status === 'ready'
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {pack.id}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SYSTEM_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.label} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                  <Icon className="mb-2 h-3.5 w-3.5 text-white/55" />
                  <p className="text-[9px] font-black uppercase tracking-tight text-white/75">{pillar.label}</p>
                  <p className="mt-1 text-[9px] font-medium leading-snug text-white/35">{pillar.note}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {roleActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => onAction?.(action.id)}
                  className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] text-[9px] font-black uppercase tracking-widest text-white/55 transition hover:border-blue-300/40 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
