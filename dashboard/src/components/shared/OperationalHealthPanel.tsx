import React from 'react';
import { Activity, AlertTriangle, Car, Clock3, CreditCard, Navigation2, ShieldCheck } from 'lucide-react';

function Tile({ icon: Icon, label, value, tone = 'text-white' }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <Icon className={`h-4 w-4 ${tone}`} />
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/30">{label}</p>
    </div>
  );
}

export function OperationalHealthPanel({ health }: { health: any }) {
  if (!health) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-5 text-sm text-white/35">
        Operational health is not available yet.
      </div>
    );
  }

  const summary = health.summary || {};
  const healthy = Boolean(summary.healthy);

  return (
    <section className={`rounded-2xl border p-5 ${healthy ? 'border-emerald-300/20 bg-emerald-400/[0.06]' : 'border-amber-300/20 bg-amber-400/[0.06]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Operational health</p>
          <h3 className="mt-2 text-xl font-black text-white">{healthy ? 'Core mobility loop is healthy' : 'AFAT has operational exceptions'}</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Generated {health.generated_at ? new Date(health.generated_at).toLocaleTimeString() : 'now'} from dispatch, payment, journey evidence, field reports and supply telemetry.
          </p>
        </div>
        {healthy
          ? <ShieldCheck className="h-6 w-6 text-emerald-200" />
          : <AlertTriangle className="h-6 w-6 text-amber-200" />}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={Clock3} label="Stuck dispatches" value={summary.stuck_dispatches || 0} tone="text-amber-200" />
        <Tile icon={CreditCard} label="Stale payments" value={summary.stale_payments || 0} tone="text-cyan-200" />
        <Tile icon={Navigation2} label="Journeys no recent GPS" value={summary.journeys_without_recent_evidence || 0} tone="text-red-200" />
        <Tile icon={Activity} label="Field reports waiting" value={summary.unreviewed_field_reports || 0} tone="text-violet-200" />
        <Tile icon={Car} label="Stale available vehicles" value={summary.stale_available_vehicles || 0} tone="text-orange-200" />
      </div>

      {!healthy && (
        <div className="mt-4 grid gap-2 text-xs text-white/55 sm:grid-cols-2">
          {(health.journeys_without_recent_evidence || []).slice(0, 4).map((journey: any) => (
            <div key={journey.id} className="rounded-xl border border-red-400/15 bg-red-400/[0.05] p-3">
              Journey {String(journey.id || '').slice(0, 8)} has no recent movement evidence.
            </div>
          ))}
          {(health.stuck_dispatches || []).slice(0, 4).map((dispatch: any) => (
            <div key={dispatch.id} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3">
              Dispatch {String(dispatch.id || '').slice(0, 8)} remains {String(dispatch.status || '').replace(/_/g, ' ')}.
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
