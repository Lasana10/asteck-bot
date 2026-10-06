import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Car,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Compass,
  MapPin,
  Navigation2,
  Package,
  Radio,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { PassagePlanner } from './PassagePlanner';
import { PassengerJourneyContinuity } from './PassengerJourneyContinuity';
import { DeliveryRequestPanel } from './DeliveryRequestPanel';
import { CommunityEvidencePanel } from './CommunityEvidencePanel';
import { NearbySupplyPanel } from './NearbySupplyPanel';
import { OfflineCityPackPanel } from './OfflineCityPackPanel';
import { MobilityPreferencesPanel } from './MobilityPreferencesPanel';
import { ActiveDispatchMap } from '../shared/ActiveDispatchMap';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';
type ToolkitPanel = 'travel' | 'city' | 'services' | null;

function signalCopy(count: number, singular: string, plural = `${singular}s`) {
  if (count === 0) return `No fresh ${plural}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function PassengerWorkspaceHome({
  profile,
  live,
  currentDispatch,
  onNavigate,
  onChanged,
}: {
  profile: any;
  live: RoleWorkspaceLiveFeed;
  currentDispatch: any | null;
  onNavigate: (tab: WorkspaceTab) => void;
  onChanged: () => void;
}) {
  const [toolkitPanel, setToolkitPanel] = useState<ToolkitPanel>(null);
  const handoffParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialDestination = handoffParams.get('destination') || '';
  const initialIntent = handoffParams.get('intent') || 'go';

  const cityPulse = useMemo(() => {
    const movement = live.tracks.length;
    const conditions = live.incidents.length;
    const meetingPoints = live.checkpoints.length;
    const activity = movement + conditions + meetingPoints;

    if (activity === 0) {
      return {
        headline: 'AFAT is ready to read this part of the city.',
        detail: 'No fresh community or movement signal is being shown as live truth right now.',
        tone: 'text-white/50',
      };
    }

    return {
      headline: 'The city is changing around you.',
      detail: `${signalCopy(movement, 'live movement signal')} · ${signalCopy(conditions, 'fresh condition')} · ${signalCopy(meetingPoints, 'known meeting point')}`,
      tone: 'text-cyan-100/75',
    };
  }, [live.checkpoints.length, live.incidents.length, live.tracks.length]);

  const togglePanel = (panel: Exclude<ToolkitPanel, null>) => {
    setToolkitPanel((current) => current === panel ? null : panel);
  };

  if (currentDispatch) {
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] p-5 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-100">
              <Radio className="h-3 w-3" /> Live journey
            </span>
            <span className="text-[10px] text-white/35">Pickup → movement → payment → closure</span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight sm:text-5xl">Your trip is now the interface.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50 sm:text-base">AFAT keeps the live route, meeting point, operator state and journey controls together until the movement is actually closed.</p>
        </section>
        <ActiveDispatchMap assignment={currentDispatch} role="commuter" incidents={live.incidents} liveTracks={live.tracks} />
        <PassengerJourneyContinuity assignment={currentDispatch} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.19),transparent_34%),radial-gradient(circle_at_92%_16%,rgba(59,130,246,0.12),transparent_26%),linear-gradient(140deg,rgba(15,23,42,0.98),rgba(2,6,23,1))] p-5 shadow-[0_24px_80px_rgba(2,6,23,.42)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-cyan-200/10" />
        <div className="pointer-events-none absolute -right-5 top-5 h-28 w-28 rounded-full border border-cyan-200/[0.07]" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100">
                <Compass className="h-3 w-3" /> AFAT Maps + Move
              </span>
              <span className="text-[10px] text-white/35">Find it · reach it · move when useful</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Where do you actually need to reach?</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50 sm:text-base">AFAT starts with the real place, entrance or meeting point—not with a booking form. It plans the practical movement first, then lets you execute only when the evidence supports it.</p>
          </div>

          <div className="min-w-0 rounded-[1.55rem] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl xl:w-[360px]">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-200/15 bg-cyan-300/10 text-cyan-100"><CircleDot className="h-4 w-4" /></span>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/35">City pulse</p>
                <p className="mt-0.5 text-sm font-black text-white">{cityPulse.headline}</p>
              </div>
            </div>
            <p className={`mt-3 text-[11px] leading-5 ${cityPulse.tone}`}>{cityPulse.detail}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/8 bg-slate-950/35 px-2 py-2.5"><MapPin className="mx-auto h-3.5 w-3.5 text-cyan-200"/><p className="mt-1.5 text-base font-black">{live.checkpoints.length}</p><p className="text-[7px] uppercase tracking-wide text-white/30">meeting</p></div>
              <div className="rounded-xl border border-white/8 bg-slate-950/35 px-2 py-2.5"><Car className="mx-auto h-3.5 w-3.5 text-emerald-200"/><p className="mt-1.5 text-base font-black">{live.tracks.length}</p><p className="text-[7px] uppercase tracking-wide text-white/30">movement</p></div>
              <div className="rounded-xl border border-white/8 bg-slate-950/35 px-2 py-2.5"><ShieldCheck className="mx-auto h-3.5 w-3.5 text-amber-200"/><p className="mt-1.5 text-base font-black">{live.incidents.length}</p><p className="text-[7px] uppercase tracking-wide text-white/30">conditions</p></div>
            </div>
          </div>
        </div>
      </section>

      <PassagePlanner
        profile={profile}
        initialDestination={initialDestination}
        initialIntent={initialIntent as any}
        onPassageCreated={() => {
          onChanged();
          onNavigate('bookings');
        }}
      />

      <NearbySupplyPanel />

      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/55 shadow-xl">
        <div className="grid md:grid-cols-3">
          <button type="button" onClick={() => togglePanel('travel')} className={`flex min-h-20 items-center justify-between gap-3 px-4 py-4 text-left transition ${toolkitPanel === 'travel' ? 'bg-cyan-400/[0.08]' : 'hover:bg-white/[0.035]'}`}>
            <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-100"><Settings2 className="h-4 w-4"/></span><span><span className="block text-xs font-black">Travel controls</span><span className="mt-1 block text-[9px] text-white/35">Preferences + offline city knowledge</span></span></span>
            {toolkitPanel === 'travel' ? <ChevronUp className="h-4 w-4 text-white/45"/> : <ChevronDown className="h-4 w-4 text-white/45"/>}
          </button>
          <button type="button" onClick={() => togglePanel('city')} className={`flex min-h-20 items-center justify-between gap-3 border-y border-white/8 px-4 py-4 text-left transition md:border-x md:border-y-0 ${toolkitPanel === 'city' ? 'bg-violet-400/[0.08]' : 'hover:bg-white/[0.035]'}`}>
            <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl border border-violet-300/15 bg-violet-400/10 text-violet-100"><Sparkles className="h-4 w-4"/></span><span><span className="block text-xs font-black">Improve the city</span><span className="mt-1 block text-[9px] text-white/35">Entrances, stops, fares and access evidence</span></span></span>
            {toolkitPanel === 'city' ? <ChevronUp className="h-4 w-4 text-white/45"/> : <ChevronDown className="h-4 w-4 text-white/45"/>}
          </button>
          <button type="button" onClick={() => togglePanel('services')} className={`flex min-h-20 items-center justify-between gap-3 px-4 py-4 text-left transition ${toolkitPanel === 'services' ? 'bg-emerald-400/[0.08]' : 'hover:bg-white/[0.035]'}`}>
            <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-400/10 text-emerald-100"><Package className="h-4 w-4"/></span><span><span className="block text-xs font-black">More movement</span><span className="mt-1 block text-[9px] text-white/35">Delivery and other governed requests</span></span></span>
            {toolkitPanel === 'services' ? <ChevronUp className="h-4 w-4 text-white/45"/> : <ChevronDown className="h-4 w-4 text-white/45"/>}
          </button>
        </div>

        {toolkitPanel && (
          <div className="border-t border-white/8 bg-slate-950/65 p-3 sm:p-4">
            {toolkitPanel === 'travel' && <div className="space-y-3"><MobilityPreferencesPanel /><OfflineCityPackPanel profile={profile} /></div>}
            {toolkitPanel === 'city' && <CommunityEvidencePanel profile={profile} />}
            {toolkitPanel === 'services' && <DeliveryRequestPanel profile={profile} onCreated={onChanged} />}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4">
          <Navigation2 className="h-4 w-4 text-cyan-200"/>
          <p className="mt-3 text-sm font-black">Navigate without booking</p>
          <p className="mt-1 text-xs leading-5 text-white/40">AFAT can simply be your movement intelligence. Transport supply remains optional.</p>
        </article>
        <article className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4">
          <Share2 className="h-4 w-4 text-violet-200"/>
          <p className="mt-3 text-sm font-black">Share a reachable place</p>
          <p className="mt-1 text-xs leading-5 text-white/40">The useful entrance or pickup point can matter more than the centre of a map pin.</p>
        </article>
        <article className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4">
          <WifiOff className="h-4 w-4 text-emerald-200"/>
          <p className="mt-3 text-sm font-black">Keep city knowledge offline</p>
          <p className="mt-1 text-xs leading-5 text-white/40">Stable place and access knowledge can remain useful even when fresh live conditions cannot load.</p>
        </article>
      </section>

      <button type="button" onClick={() => onNavigate('bookings')} className="group flex min-h-14 w-full items-center justify-between rounded-[1.4rem] border border-white/10 bg-white/[0.035] px-4 text-left transition hover:bg-white/[0.055]">
        <span><span className="block text-xs font-black">Already moving?</span><span className="mt-1 block text-[10px] text-white/35">Open active and recent journeys.</span></span>
        <ArrowRight className="h-4 w-4 text-white/45 transition group-hover:translate-x-0.5"/>
      </button>
    </div>
  );
}
