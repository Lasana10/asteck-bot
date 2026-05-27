import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MapPin, Shield, Ticket, User } from 'lucide-react';
import { AFATLogo } from './AFATLogo';
import { fetchGuardianWatch } from '../../supabaseClient';

interface Props {
  token: string;
}

const statusTone: Record<string, string> = {
  pending: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
  confirmed: 'text-blue-300 border-blue-500/20 bg-blue-500/10',
  boarded: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10',
  completed: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
};

export function GuardianWatchPage({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [watchData, setWatchData] = useState<any>(null);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await fetchGuardianWatch(token);
      if (!active) return;
      setLoading(false);

      if (error) {
        setErrorText(error.message);
        return;
      }

      setWatchData(data?.watch || null);
      setErrorText('');
    };

    load();
    const interval = window.setInterval(load, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen sentinel-bg text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
            <AFATLogo className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-blue-300">Loading Guardian Watch</p>
        </div>
      </div>
    );
  }

  if (errorText || !watchData?.booking) {
    return (
      <div className="min-h-screen sentinel-bg text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[2rem] border border-red-500/20 bg-red-500/10 p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-red-300" />
          <h1 className="mb-2 text-2xl font-black uppercase tracking-tight">Guardian Link Unavailable</h1>
          <p className="text-sm text-red-100/80">{errorText || 'This trip watch link is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const booking = watchData.booking;
  const routeName = booking.route?.name || `${booking.route?.origin || 'Route'} -> ${booking.route?.destination || 'Destination'}`;
  const statusClass = statusTone[booking.status] || 'text-white border-white/10 bg-white/5';
  const paymentLabel = booking.payment_status === 'cash_due' ? 'Cash on boarding' : booking.payment_status;

  return (
    <div className="min-h-screen sentinel-bg text-white">
      <div className="mesh-gradient" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10">
        <header className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
            <AFATLogo className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">AFAT Guardian Watch</h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-300">Live trip status for family and trusted contacts</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Trip Monitor</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">{routeName}</h2>
              </div>
              <div className={`rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] ${statusClass}`}>
                {booking.status}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-white/60">
                  <User className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Passenger</p>
                </div>
                <p className="text-lg font-bold">{booking.passenger?.full_name || 'AFAT passenger'}</p>
                <p className="mt-1 text-sm text-white/60">{booking.passenger?.phone || 'Phone hidden'}</p>
              </div>

              <div className="rounded-3xl border border-white/5 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-white/60">
                  <Shield className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Operator</p>
                </div>
                <p className="text-lg font-bold">{booking.operator?.full_name || 'Assigned operator'}</p>
                <p className="mt-1 text-sm text-white/60">{booking.operator?.phone || 'Phone hidden'}</p>
              </div>

              <div className="rounded-3xl border border-white/5 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-white/60">
                  <Ticket className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Seat & Payment</p>
                </div>
                <p className="text-lg font-bold">Seat {booking.seat_label || 'n/a'}</p>
                <p className="mt-1 text-sm text-white/60">{paymentLabel}</p>
              </div>

              <div className="rounded-3xl border border-white/5 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-white/60">
                  <MapPin className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Departure Window</p>
                </div>
                <p className="text-lg font-bold">{booking.route?.departure_time || 'Pending schedule'}</p>
                <p className="mt-1 text-sm text-white/60">{booking.route?.origin || 'Origin'} {'->'} {booking.route?.destination || 'Destination'}</p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Trip Timeline</p>
              <div className="mt-5 space-y-4">
                {[
                  { icon: Clock3, label: 'Booked', active: true, note: new Date(booking.created_at).toLocaleString() },
                  { icon: CheckCircle2, label: 'Confirmed', active: ['confirmed', 'boarded', 'completed'].includes(booking.status), note: booking.payment_status === 'cash_due' ? 'Cash boarding enabled' : 'Payment confirmed' },
                  { icon: Shield, label: 'Boarded', active: ['boarded', 'completed'].includes(booking.status), note: 'Operator scan updates this state' },
                  { icon: CheckCircle2, label: 'Completed', active: booking.status === 'completed', note: booking.completed_at ? new Date(booking.completed_at).toLocaleString() : 'Awaiting trip completion' },
                ].map((item) => (
                  <div key={item.label} className="flex gap-3">
                    <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full border ${item.active ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/40'}`}>
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{item.label}</p>
                      <p className="text-xs text-white/60">{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-blue-500/20 bg-blue-500/10 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-200">AFAT Note</p>
              <p className="mt-3 text-sm text-blue-50/90">
                This watch page updates from the live booking state. It is designed for family follow-up, trust, and safer shared mobility.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
