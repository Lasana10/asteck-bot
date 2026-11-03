import React from 'react';
import { AlertTriangle, CheckCircle2, Footprints, Route, ShieldCheck } from 'lucide-react';
import type { AfatMultimodalPlan, AfatReviewedTransfer, AfatReachabilityAssessment } from '../../services/mobilityEvidenceClient';
import { FieldEvidenceCapture } from './FieldEvidenceCapture';
import { TransitBoardingDirections } from './TransitBoardingDirections';

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
  transfer,
  destinationPoint,
  loading = false,
  limited = false,
  cityKey = 'cm-yaounde',
}: {
  assessment?: AfatReachabilityAssessment | null;
  multimodal?: AfatMultimodalPlan | null;
  transfer?: AfatReviewedTransfer | null;
  destinationPoint?: {latitude:number;longitude:number;name?:string|null} | null;
  loading?: boolean;
  limited?: boolean;
  cityKey?: string;
}) {
  if (!assessment && !multimodal && !transfer && !loading && !limited) return null;
  const reliability = Math.max(0, Math.min(100, Number(assessment?.reliability_score || 0)));
  const strong = assessment?.state === 'reachable_high_confidence';
  const connected = String(assessment?.state || '').startsWith('reachable');
  const chain = multimodal?.multimodal_chain;
  const directOptions = (multimodal?.direct_options || []).filter((option) =>
    option.type === 'direct' && ['walk','moto','car','minibus'].includes(option.mode) &&
    option.assessment && String(option.assessment.state || '').startsWith('reachable')
  );
  const evidencePlaceId = assessment?.place_id || multimodal?.place_id;
  const canContribute = Boolean(evidencePlaceId && (assessment?.missing_evidence?.length || multimodal?.multimodal_chain_status === 'insufficient_transit_evidence'));

  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.07] via-slate-950/70 to-emerald-400/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Can I really get there?</p>
          <div className="mt-2 flex items-center gap-2">
            {strong ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : connected ? <Route className="h-4 w-4 text-cyan-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
            <p className="text-sm font-black text-white">{loading ? 'Checking live reachability…' : assessment ? labelForState(assessment.state) : multimodal ? 'Transport observations available · access unconfirmed' : 'Live mobility assessment unavailable'}</p>
          </div>
        </div>
        {assessment && <div className="min-w-[74px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right"><p className="text-lg font-black text-white">{Math.round(reliability)}</p><p className="text-[8px] font-black uppercase text-white/35">reliability</p></div>}
      </div>

      {limited && !loading && <p role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[10px] leading-4 text-amber-100/85">Some current geographic or informal transport evidence could not be checked. Available observations remain advisory; missing information is not proof of access, service or safety.</p>}

      {assessment && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${reliability}%` }} /></div>}

      {assessment&&Number(assessment.reviewed_access_count||0)===0&&(assessment.access_points?.length||0)>0&&<p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.04] p-3 text-[10px] leading-4 text-amber-100/85">A local entrance has been recorded, but independent corroboration is still missing. It cannot by itself certify strong reachability.</p>}

      {!!assessment?.missing_evidence?.length && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {assessment.missing_evidence.slice(0, 4).map((item) => <div key={item} className="rounded-xl border border-amber-300/12 bg-amber-400/[0.05] px-3 py-2 text-[10px] font-semibold leading-4 text-amber-100/75">{missingLabel(item)}</div>)}
        </div>
      )}

      {assessment && assessment.active_disruptions ? <p className="mt-3 text-[10px] font-bold text-rose-200">{assessment.active_disruptions} active route disruption{assessment.active_disruptions === 1 ? '' : 's'} affect this assessment.</p> : null}

      {directOptions.length > 0 && (
        <section className="mt-4" aria-label="Assessed direct travel modes">
          <p className="text-[9px] font-black uppercase tracking-wider text-cyan-200">Direct route assessments</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {directOptions.map((option) => {
              const confidence = Math.max(0, Math.min(100, Number(option.assessment.reliability_score || 0)));
              const distance = Number(option.assessment.route_distance_m);
              return <div key={option.mode} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-black text-white">{option.mode === 'walk' ? 'Walk' : option.mode === 'moto' ? 'Motorbike' : option.mode === 'minibus' ? 'Minibus' : 'Car'}</p>
                <p className="mt-1 text-[10px] text-white/55">{labelForState(option.assessment.state)} · Reliability {Math.round(confidence)}/100</p>
                {option.assessment.route_distance_m != null && Number.isFinite(distance) && distance >= 0 && <p className="mt-1 text-[10px] text-cyan-100/75">{(distance / 1000).toFixed(1)} km assessed route</p>}
              </div>;
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-white/45">These are route reachability assessments, not confirmations of available vehicles, safe access or current fares.</p>
        </section>
      )}

      {chain ? (
        <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-400/[0.06] p-3">
          <div className="flex items-center gap-2"><Footprints className="h-4 w-4 text-violet-200"/><p className="text-[9px] font-black uppercase tracking-wider text-violet-200">Recently reviewed transit pattern</p></div>
          <p className="mt-2 text-xs font-black text-white">Walk → {chain.line?.name || chain.line?.mode || 'transit'} → Walk</p>
          <p className="mt-1 text-[10px] leading-4 text-amber-200/75">Reviewed route pattern only. Live service, boarding, timetable, road safety and current fare are not confirmed.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Reviewed multimodal journey legs">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-black uppercase text-violet-200">1 · Walk to boarding</p>
              <p className="mt-1 text-xs font-bold text-white">{Math.round(chain.boarding.walk_distance_m).toLocaleString()} m straight-line</p>
              <p className="mt-1 text-[10px] text-white/45">{chain.boarding.name || 'Reviewed boarding stop'}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-black uppercase text-violet-200">2 · Reviewed transit line</p>
              <p className="mt-1 text-xs font-bold text-white">{chain.line.name || chain.line.mode || 'Transit'}</p>
              <p className="mt-1 text-[10px] text-white/45">Stops {chain.boarding.stop_sequence} → {chain.alighting.stop_sequence}{chain.line.direction ? ` · ${chain.line.direction}` : ''}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-black uppercase text-violet-200">3 · Walk from alighting</p>
              <p className="mt-1 text-xs font-bold text-white">{Math.round(chain.alighting.walk_distance_m).toLocaleString()} m straight-line</p>
              <p className="mt-1 text-[10px] text-white/45">{chain.alighting.name || 'Reviewed alighting stop'}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-amber-200/75">Stop distances are straight-line estimates, not pedestrian path lengths; verify safe entrances and crossings locally. No live vehicle, departure or arrival time is guaranteed.</p>
          <TransitBoardingDirections latitude={chain.boarding.latitude} longitude={chain.boarding.longitude} stopName={chain.boarding.name} purpose="boarding"/>
          {destinationPoint && <TransitBoardingDirections latitude={destinationPoint.latitude} longitude={destinationPoint.longitude} stopName={destinationPoint.name||'selected arrival point'} purpose="arrival"/>}
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold text-white/55">
            {chain.observed_wait_seconds != null && <span>{Math.ceil(Number(chain.observed_wait_seconds) / 60)} min historical reviewed wait</span>}
            {chain.observed_transit_seconds != null && <span>{Math.ceil(Number(chain.observed_transit_seconds) / 60)} min historical reviewed transit</span>}
            {chain.observed_fare_xaf != null && <span>{Number(chain.observed_fare_xaf).toLocaleString()} XAF historical observed fare</span>}
          </div>
          <p className="mt-2 text-[9px] text-white/35">Evidence expires {new Date(chain.evidence_expires_at).toLocaleString()} · device observation time was reviewed but not independently clock-verified.</p>
        </div>
      ) : multimodal && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
          <p className="text-[10px] leading-4 text-white/45">{multimodal.reason}</p>
        </div>
      )}

      {transfer?.transfer && (
        <section className="mt-4 rounded-xl border border-violet-300/20 bg-violet-400/[0.06] p-3" aria-label="Reviewed two-line transit transfer">
          <p className="text-[9px] font-black uppercase tracking-wider text-violet-200">Reviewed connection · two transit lines</p>
          <p className="mt-2 text-xs font-bold text-white">
            Walk → {transfer.transfer.first_line.name} → transfer on foot → {transfer.transfer.second_line.name} → Walk
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-bold uppercase text-violet-200">First line</p>
              <p className="mt-1 text-xs text-white">{transfer.transfer.boarding.name} (stop {transfer.transfer.boarding.stop_sequence}) → {transfer.transfer.transfer_out.name} (stop {transfer.transfer.transfer_out.stop_sequence})</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-bold uppercase text-violet-200">Second line</p>
              <p className="mt-1 text-xs text-white">{transfer.transfer.transfer_in.name} (stop {transfer.transfer.transfer_in.stop_sequence}) → {transfer.transfer.alighting.name} (stop {transfer.transfer.alighting.stop_sequence})</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-amber-200/75">Transfer stops are approximately {Math.round(transfer.transfer.transfer_straight_m)} m apart in straight-line proximity. AFAT requires a mapped walking connection, but safe crossings, operating vehicles, departure times and fares are not confirmed.</p>
          <p className="mt-2 text-[9px] text-white/40">Oldest evidence expires {new Date(transfer.transfer.evidence_expires_at).toLocaleString()} · field observations independently reviewed</p>
          <TransitBoardingDirections latitude={transfer.transfer.boarding.latitude} longitude={transfer.transfer.boarding.longitude} stopName={transfer.transfer.boarding.name} purpose="boarding"/>
          <TransitBoardingDirections latitude={transfer.transfer.transfer_in.latitude} longitude={transfer.transfer.transfer_in.longitude} stopName={transfer.transfer.transfer_in.name} purpose="transfer"/>
          {destinationPoint && <TransitBoardingDirections latitude={destinationPoint.latitude} longitude={destinationPoint.longitude} stopName={destinationPoint.name||'selected arrival point'} purpose="arrival"/>}
        </section>
      )}

      {canContribute && evidencePlaceId && <FieldEvidenceCapture placeId={evidencePlaceId} placeName={assessment?.name} cityKey={cityKey} />}
    </div>
  );
}

export default ReachabilityInsightCard;
