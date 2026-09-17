import React, { useState } from 'react';
import { ArrowRight, Car, MapPin, Search, ShieldCheck } from 'lucide-react';
import { createPassageIntent } from '../../supabaseClient';
import { PassagePlanner } from '../commuter/PassagePlanner';
import { PassengerJourneyContinuity } from '../commuter/PassengerJourneyContinuity';
import { LiveFeed, MapPanel, Metric, Surface } from './WorkspacePrimitives';

type Props = {
  profile: any;
  live: LiveFeed;
  currentDispatch: any | null;
  onNavigate: (tab: 'home' | 'bookings' | 'notifications' | 'profile') => void;
  onChanged: () => void;
};

export function PassengerWorkspace({ profile, live, currentDispatch, onNavigate, onChanged }: Props) {
  const [origin, setOrigin] = useState(profile?.preferred_zone || 'My current location');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async (event: React.FormEvent) => {
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
    setNotice(`Passage ${String(data?.passage?.id || data?.id || '').slice(0, 8) || 'request'} is live. AFAT is resolving verified service and a safe meeting point.`);
    onChanged();
  };

  return <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
    <div className="space-y-5">
      <PassengerJourneyContinuity assignment={currentDispatch} onChanged={onChanged} />
      <Surface className="overflow-hidden bg-gradient-to-br from-blue-500/[0.14] via-cyan-400/[0.045] to-transparent p-6 sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-300/70">Passenger mission</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Where are you going?</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">Start with a real destination. AFAT reveals only service, fare and ETA evidence that actually exists.</p>
        <form onSubmit={submit} className="mt-7 space-y-3">
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4">
            <MapPin className="h-4 w-4 text-emerald-300" />
            <input value={origin} onChange={e => setOrigin(e.target.value)} className="w-full bg-transparent text-sm font-bold outline-none" />
          </label>
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4">
            <Search className="h-4 w-4 text-blue-300" />
            <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination or landmark" className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-white/25" />
          </label>
          <button disabled={!destination.trim() || submitting || !profile?.id} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-400 px-5 text-sm font-black disabled:opacity-40">
            {submitting ? 'Creating passage…' : 'Plan safe passage'} <ArrowRight className="h-4 w-4" />
          </button>
        </form>
        {notice && <p className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-xs font-bold text-white/65">{notice}</p>}
        <button onClick={() => onNavigate('bookings')} className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Open journey timeline</button>
      </Surface>
      <Surface className="p-5">
        <div className="grid grid-cols-3 gap-3">
          <Metric icon={MapPin} label="Meeting points" value={live.checkpoints.length} />
          <Metric icon={Car} label="Visible supply" value={live.tracks.length} />
          <Metric icon={ShieldCheck} label="Conditions" value={live.incidents.length} />
        </div>
      </Surface>
    </div>
    <div className="space-y-5">
      <PassagePlanner profile={profile} originText={origin} initialDestination={destination} onPassageCreated={() => onNavigate('bookings')} />
      <div className="min-h-[430px]"><MapPanel role="commuter" live={live} /></div>
    </div>
  </div>;
}
