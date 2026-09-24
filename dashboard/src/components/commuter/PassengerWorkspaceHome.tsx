import React from 'react';
import { ArrowRight, Car, MapPin, Navigation2, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { PassagePlanner } from './PassagePlanner';
import { PassengerJourneyContinuity } from './PassengerJourneyContinuity';
import { ActiveDispatchMap } from '../shared/ActiveDispatchMap';
import { ContextualConfirmation } from '../shared/ContextualConfirmation';
import type { RoleWorkspaceLiveFeed } from '../../hooks/useRoleWorkspaceData';

type WorkspaceTab = 'home' | 'bookings' | 'notifications' | 'profile';

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
  if (currentDispatch) {
    return (
      <div className="space-y-4">
        <section className="rounded-[1.8rem] border border-blue-300/15 bg-gradient-to-br from-blue-500/[0.14] via-slate-950/80 to-cyan-400/[0.05] p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100">Active movement</span><span className="text-[10px] text-white/35">Pickup → journey → payment → closure</span></div>
          <h1 className="mt-3 text-2xl font-black sm:text-3xl">Everything for this journey stays in one place.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Live map, meeting point, operator state and journey controls remain visible until you arrive.</p>
        </section>
        <ActiveDispatchMap assignment={currentDispatch} role="commuter" incidents={live.incidents} liveTracks={live.tracks} />
        <PassengerJourneyContinuity assignment={currentDispatch} onChanged={onChanged} />
        <ContextualConfirmation assignment={currentDispatch} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.8rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 shadow-2xl sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100">AFAT Maps + Move</span><span className="text-[10px] text-white/35">Find it · reach it · book if you want</span></div>
            <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight sm:text-5xl">Where are you going?</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50 sm:text-base">Search the place you actually mean. AFAT resolves the useful entrance, meeting point and connected mobility options before asking you to book anything.</p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"><MapPin className="mx-auto h-4 w-4 text-cyan-200"/><p className="mt-2 text-lg font-black">{live.checkpoints.length}</p><p className="text-[8px] uppercase tracking-wide text-white/30">meeting points</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"><Car className="mx-auto h-4 w-4 text-emerald-200"/><p className="mt-2 text-lg font-black">{live.tracks.length}</p><p className="text-[8px] uppercase tracking-wide text-white/30">live supply</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"><ShieldCheck className="mx-auto h-4 w-4 text-amber-200"/><p className="mt-2 text-lg font-black">{live.incidents.length}</p><p className="text-[8px] uppercase tracking-wide text-white/30">conditions</p></div>
          </div>
        </div>
      </section>

      <PassagePlanner
        profile={profile}
        onPassageCreated={() => {
          onChanged();
          onNavigate('bookings');
        }}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <Navigation2 className="h-4 w-4 text-cyan-200"/><p className="mt-3 text-sm font-black">Navigate without booking</p><p className="mt-1 text-xs leading-5 text-white/40">Use AFAT as the map. A transport request is optional.</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <Share2 className="h-4 w-4 text-violet-200"/><p className="mt-3 text-sm font-black">Share the place people can actually reach</p><p className="mt-1 text-xs leading-5 text-white/40">Entrances and meeting points matter more than a pin alone.</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <Sparkles className="h-4 w-4 text-emerald-200"/><p className="mt-3 text-sm font-black">Book when it adds value</p><p className="mt-1 text-xs leading-5 text-white/40">When supply is available, move from map intelligence into dispatch in one flow.</p>
        </article>
      </section>

      <button type="button" onClick={()=>onNavigate('bookings')} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-left">
        <span><span className="block text-xs font-black">Already moving?</span><span className="mt-1 block text-[10px] text-white/35">Open active and recent journeys.</span></span><ArrowRight className="h-4 w-4 text-white/45"/>
      </button>
    </div>
  );
}
