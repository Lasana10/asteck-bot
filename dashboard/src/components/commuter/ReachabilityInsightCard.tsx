import React from 'react';
import { AlertTriangle, CheckCircle2, Footprints, Route, ShieldCheck } from 'lucide-react';
import type { AfatMultimodalPlan, AfatReachabilityAssessment } from '../../services/mobilityEvidenceClient';
import { FieldEvidenceCapture } from './FieldEvidenceCapture';

function labelForState(state?: string | null) {
  if (state === 'reachable_high_confidence') return 'Strong reachability';
  if (state === 'reachable_with_uncertainty') return 'Reachable · still learning';
  if (state === 'destination_known_origin_needed') return 'Confirm your start';
  if (state === 'not_confirmed') return 'Route not confirmed';
  return 'Assessing reachability';
}

function missingLabel(value: string) {
  const labels: Record<string, string> = {
    verified_access_or_entrance: 'Exact entrance still needs verification',
    trusted_eta_profile: 'ETA still needs real journey evidence',
    connected_route: 'Connected road path still missing',
  };
  return labels[value] || value.replace(/_/g, ' ');
}

export function ReachabilityInsightCard({
  assessment,
  multimodal,
  loading = false,
}: {
  assessment?: AfatReachabilityAssessment | null;
  multimodal?: AfatMultimodalPlan | null;
  loading?: boolean;
}) {
  if (!assessment && !multimodal && !loading) return null;
  const reliability = Math.max(0, Math.min(100, Number(assessment?.reliability_score || 0)));
  const strong = assessment?.state === 'reachable_high_confidence';
  const connected = String(assessment?.state || '').startsWith('reachable');
  const chain = multimodal?.multimodal_chain;
  const canContribute = Boolean(assessment?.place_id && (assessment?.missing_evidence?.length || multimodal?.multimodal_chain_status === 'insufficient_transit_evidence'));

  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.07] via-slate-950/70 to-emerald-400/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Can I really get there?</p>
          <div className="mt-2 flex items-center gap-2">
            {strong ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : connected ? <Route className="h-4 w-4 text-cyan-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
            <p className="text-sm font-black text-white">{loading ? 'Checking live reachability…' : labelForState(assessment?.state)}</p>
          </div>
        </div>
        {assessment && <div className="min-w-[74px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right"><p className="text-lg font-black text-white">{Math.round(reliability)}</p><p className="text-[8px] font-black uppercase text-white/35">reliability</p></div>}
      </div>

      {assessment && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${reliability}%` }} /></div>}

      {!!assessment?.missing_evidence?.length && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {assessment.missing_evidence.slice(0, 4).map((item) => <div key={item} className="rounded-xl border border-amber-300/12 bg-amber-400/[0.05] px-3 py-2 text-[10px] font-semibold leading-4 text-amber-100/75">{missingLabel(item)}</div>)}
        </div>
      )}

      {assessment && assessment.active_disruptions ? <p className="mt-3 text-[10px] font-bold text-rose-200">{assessment.active_disruptions} active route disruption{assessment.active_disruptions === 1 ? '' : 's'} affect this assessment.</p> : null}

      {chain ? (
        <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-400/[0.06] p-3">
          <div className="flex items-center gap-2"><Footprints className="h-4 w-4 text-violet-200"/><p className="text-[9px] font-black uppercase tracking-wider text-violet-200">Observed multimodal option</p></div>
          <p className="mt-2 text-xs font-black text-white">Walk → {chain.line?.name || chain.line?.mode || 'transit'} → Walk</p>
          <p className="mt-1 text-[10px] leading-4 text-white/45">Board at {chain.boarding?.name || 'observed stop'} · leave at {chain.alighting?.name || 'observed stop'}.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold text-white/55">
            {chain.observed_wait_seconds != null && <span>{Math.ceil(Number(chain.observed_wait_seconds) / 60)} min observed wait</span>}
            {chain.observed_transit_seconds != null && <span>{Math.ceil(Number(chain.observed_transit_seconds) / 60)} min observed transit</span>}
            {chain.observed_fare_xaf != null && <span>{Number(chain.observed_fare_xaf).toLocaleString()} XAF observed fare</span>}
          </div>
        </div>
      ) : multimodal && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
          <p className="text-[10px] leading-4 text-white/45">{multimodal.reason}</p>
        </div>
      )}

      {canContribute && assessment?.place_id && <FieldEvidenceCapture placeId={assessment.place_id} placeName={assessment.name} />}
    </div>
  );
}

export default ReachabilityInsightCard;
