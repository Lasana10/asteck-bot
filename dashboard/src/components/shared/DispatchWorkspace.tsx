import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Clock3, FileClock, Gauge, MapPin,
  Navigation2, RefreshCw, Route, ShieldCheck, Truck, UserCheck, XCircle,
} from 'lucide-react';
import {
  DispatchAssignment, DispatchCandidate, DispatchEvent, fetchAuthoritativeDispatches,
  fetchDispatchCandidates, fetchDispatchDetail, transitionDispatch,
} from '../../services/dispatchClient';

type DispatchRole = 'commuter' | 'operator' | 'planner' | 'admin';
type Props = { role: DispatchRole; profile: any; onChanged?: () => void };
type Action = { status: string; label: string; tone: 'primary' | 'danger' | 'warning' | 'neutral'; needsReason?: boolean };

const STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting for dispatch', offered: 'Offer sent', accepted: 'Offer accepted', assigned: 'Assigned',
  en_route: 'Operator approaching', arrived: 'Operator arrived', pickup_verified: 'Pickup verified',
  in_journey: 'Journey in progress', completed: 'Completed', cancelled: 'Cancelled', declined: 'Declined',
  expired: 'Offer expired', reassigned: 'Reassignment required', no_show: 'No show', emergency: 'Emergency', disputed: 'Disputed',
};
const STATUS_ORDER = ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','completed'];

function actionsFor(role: DispatchRole, assignment: DispatchAssignment): Action[] {
  const status = String(assignment.status || '').toLowerCase();
  if (role === 'commuter') {
    if (['queued','offered','accepted','assigned','en_route','arrived','pickup_verified'].includes(status)) return [{ status: 'cancelled', label: 'Cancel journey', tone: 'danger', needsReason: true }];
    if (['in_journey','emergency'].includes(status)) return [{ status: 'disputed', label: 'Report journey dispute', tone: 'warning', needsReason: true }];
    return [];
  }
  if (role === 'operator') {
    if (status === 'offered') return [{ status: 'accepted', label: 'Accept mission', tone: 'primary' }, { status: 'declined', label: 'Decline', tone: 'neutral', needsReason: true }];
    if (['accepted','assigned'].includes(status)) return [{ status: 'en_route', label: 'Start approach', tone: 'primary' }];
    if (status === 'en_route') return [{ status: 'arrived', label: 'Arrived at pickup', tone: 'primary' }, { status: 'emergency', label: 'Emergency', tone: 'danger', needsReason: true }];
    if (status === 'arrived') return [{ status: 'pickup_verified', label: 'Verify pickup', tone: 'primary' }, { status: 'no_show', label: 'Passenger no-show', tone: 'warning', needsReason: true }, { status: 'emergency', label: 'Emergency', tone: 'danger', needsReason: true }];
    if (status === 'pickup_verified') return [{ status: 'in_journey', label: 'Start journey', tone: 'primary' }, { status: 'emergency', label: 'Emergency', tone: 'danger', needsReason: true }];
    if (status === 'in_journey') return [{ status: 'completed', label: 'Complete journey', tone: 'primary' }, { status: 'emergency', label: 'Emergency', tone: 'danger', needsReason: true }, { status: 'disputed', label: 'Flag dispute', tone: 'warning', needsReason: true }];
    if (status === 'emergency') return [{ status: 'in_journey', label: 'Resume journey', tone: 'primary', needsReason: true }, { status: 'completed', label: 'Close as completed', tone: 'neutral', needsReason: true }, { status: 'disputed', label: 'Open dispute', tone: 'warning', needsReason: true }];
    return [];
  }
  if (status === 'queued') return [{ status: 'offered', label: 'Offer assignment', tone: 'primary' }, { status: 'assigned', label: 'Assign directly', tone: 'neutral', needsReason: true }, { status: 'cancelled', label: 'Cancel', tone: 'danger', needsReason: true }];
  if (status === 'offered') return [{ status: 'expired', label: 'Expire offer', tone: 'warning', needsReason: true }, { status: 'cancelled', label: 'Cancel', tone: 'danger', needsReason: true }];
  if (status === 'accepted') return [{ status: 'assigned', label: 'Confirm assignment', tone: 'primary' }, { status: 'reassigned', label: 'Reassign', tone: 'warning', needsReason: true }, { status: 'cancelled', label: 'Cancel', tone: 'danger', needsReason: true }];
  if (['assigned','en_route','arrived'].includes(status)) return [{ status: 'reassigned', label: 'Reassign', tone: 'warning', needsReason: true }, { status: 'cancelled', label: 'Cancel', tone: 'danger', needsReason: true }];
  if (status === 'reassigned') return [{ status: 'offered', label: 'Send new offer', tone: 'primary' }, { status: 'assigned', label: 'Assign replacement', tone: 'neutral', needsReason: true }, { status: 'cancelled', label: 'Cancel', tone: 'danger', needsReason: true }];
  if (status === 'emergency') return [{ status: 'in_journey', label: 'Resume service', tone: 'primary', needsReason: true }, { status: 'completed', label: 'Close completed', tone: 'neutral', needsReason: true }, { status: 'cancelled', label: 'Terminate journey', tone: 'danger', needsReason: true }, { status: 'disputed', label: 'Open dispute', tone: 'warning', needsReason: true }];
  if (status === 'disputed') return [{ status: 'completed', label: 'Resolve completed', tone: 'primary', needsReason: true }, { status: 'cancelled', label: 'Resolve cancelled', tone: 'danger', needsReason: true }];
  return [];
}

function mutationKey(assignment: DispatchAssignment, nextStatus: string) {
  return `dispatch:${assignment.id}:v${assignment.state_version ?? 0}:${nextStatus}`;
}
function toneClass(tone: Action['tone']) {
  if (tone === 'primary') return 'bg-cyan-400 text-slate-950 border-cyan-300/30';
  if (tone === 'danger') return 'bg-red-500/10 text-red-200 border-red-400/25';
  if (tone === 'warning') return 'bg-amber-500/10 text-amber-100 border-amber-400/25';
  return 'bg-white/5 text-white border-white/10';
}
function DispatchProgress({ status }: { status: string }) {
  const index = STATUS_ORDER.indexOf(status);
  return <div className="grid grid-cols-5 gap-1" aria-label={`Dispatch status ${STATUS_LABEL[status] || status}`}>
    {['Request','Match','Pickup','Journey','Complete'].map((label, step) => {
      const thresholds = [0, 2, 5, 7, 8];
      const active = index >= thresholds[step] && index >= 0;
      return <div key={label} className={`rounded-lg border px-2 py-2 ${active ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-black/20'}`}><div className={`h-1 rounded-full ${active ? 'bg-cyan-300' : 'bg-white/10'}`} /><p className={`mt-2 text-[8px] font-black uppercase ${active ? 'text-cyan-100' : 'text-white/25'}`}>{label}</p></div>;
    })}
  </div>;
}

export function DispatchWorkspace({ role, profile, onChanged }: Props) {
  const [dispatches, setDispatches] = useState<DispatchAssignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<DispatchEvent[]>([]);
  const [candidates, setCandidates] = useState<DispatchCandidate[]>([]);
  const [rankingNote, setRankingNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const selected = useMemo(() => dispatches.find((item) => item.id === selectedId) || dispatches[0] || null, [dispatches, selectedId]);
  const actions = selected ? actionsFor(role, selected) : [];
  const canRank = role === 'planner' || role === 'admin';

  const refresh = async () => {
    setLoading(true);
    const result = await fetchAuthoritativeDispatches({ limit: 50 });
    setLoading(false);
    if (result.error) { setNotice(result.error.message); setDispatches([]); return; }
    const next = result.data?.dispatches || [];
    setDispatches(next);
    if (next.length && (!selectedId || !next.some((item) => item.id === selectedId))) setSelectedId(next[0].id);
    if (!next.length) { setSelectedId(null); setEvents([]); setCandidates([]); }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    const result = await fetchDispatchDetail(id);
    setDetailLoading(false);
    if (result.error) { setNotice(result.error.message); return; }
    if (result.data?.assignment) {
      setDispatches((current) => current.map((item) => item.id === id ? result.data!.assignment : item));
      setEvents(result.data.events || []);
    }
  };

  const loadCandidates = async (id: string) => {
    if (!canRank) return;
    setRankingLoading(true);
    setRankingNote('');
    const result = await fetchDispatchCandidates(id);
    setRankingLoading(false);
    if (result.error) { setCandidates([]); setRankingNote(result.error.message); return; }
    setCandidates(result.data?.candidates || []);
    const contract = result.data?.scoring_contract;
    setRankingNote(contract?.route_eta_used ? 'Route ETA included.' : 'No route ETA invented: ranking uses straight-line distance until the AFAT Mobility Graph is ready.');
  };

  useEffect(() => { void refresh(); }, [role, profile?.id]);
  useEffect(() => {
    if (!selected?.id) return;
    void loadDetail(selected.id);
    if (canRank) void loadCandidates(selected.id);
  }, [selected?.id, canRank]);

  const runAction = async (action: Action) => {
    if (!selected) return;
    if (action.needsReason && reason.trim().length < 4) { setNotice('Add a short reason before this accountable dispatch action.'); return; }
    setBusyAction(action.status);
    setNotice('');
    const result = await transitionDispatch({ assignmentId: selected.id, expectedStatus: selected.status, nextStatus: action.status, reason: reason.trim() || undefined, idempotencyKey: mutationKey(selected, action.status), evidence: { source: 'afat_dispatch_workspace', workspace_role: role, client_state_version: selected.state_version ?? 0 } });
    setBusyAction(null);
    if (result.error) { setNotice(result.error.message); return; }
    setReason('');
    setNotice(`${action.label} recorded. AFAT preserved the transition and evidence ledger.`);
    await refresh();
    await loadDetail(selected.id);
    if (canRank) await loadCandidates(selected.id);
    onChanged?.();
  };

  return <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/70">Authoritative dispatch</p><h2 className="mt-1 text-xl font-black">{role === 'operator' ? 'My missions' : role === 'commuter' ? 'My active journeys' : 'Live dispatch board'}</h2></div><button type="button" onClick={() => void refresh()} disabled={loading} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 disabled:opacity-40" aria-label="Refresh dispatches"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
      <div className="mt-4 space-y-2">{dispatches.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === item.id ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{item.origin || 'Origin pending'} → {item.destination || 'Destination pending'}</p><p className="mt-1 text-[10px] text-white/40">Updated {item.updated_at ? new Date(item.updated_at).toLocaleString() : 'time unavailable'}</p></div><span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase text-white/60">{STATUS_LABEL[item.status] || item.status}</span></div></button>)}{!loading && !dispatches.length && <div className="rounded-xl border border-dashed border-white/15 p-8 text-center"><Route className="mx-auto h-6 w-6 text-white/25" /><p className="mt-3 text-sm font-bold text-white/45">No active dispatch is assigned to this workspace.</p><p className="mt-1 text-xs text-white/30">AFAT shows only server-authorized dispatch records for this identity.</p></div>}</div>
    </section>

    <section className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/[0.06] to-transparent p-5 sm:p-6">
      {!selected ? <div className="flex min-h-72 items-center justify-center text-center"><div><Navigation2 className="mx-auto h-8 w-8 text-white/20" /><p className="mt-3 text-sm text-white/40">Select an active dispatch to inspect its live state and evidence.</p></div></div> : <>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/70">Dispatch {selected.id.slice(0, 8)}</p><h2 className="mt-2 text-2xl font-black">{STATUS_LABEL[selected.status] || selected.status}</h2><p className="mt-1 text-sm text-white/45">{selected.origin || 'Origin pending'} → {selected.destination || 'Destination pending'}</p></div><div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right"><p className="text-[8px] font-black uppercase text-white/30">State version</p><p className="mt-1 text-xl font-black">{selected.state_version ?? 0}</p></div></div>
        <div className="mt-5"><DispatchProgress status={selected.status} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/10 bg-black/20 p-4"><MapPin className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-[8px] font-black uppercase text-white/30">Pickup</p><p className="mt-1 text-xs font-bold">{selected.pickup_lat != null && selected.pickup_lng != null ? `${Number(selected.pickup_lat).toFixed(4)}, ${Number(selected.pickup_lng).toFixed(4)}` : 'Coordinates pending'}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><Truck className="h-4 w-4 text-blue-300" /><p className="mt-2 text-[8px] font-black uppercase text-white/30">Operator</p><p className="mt-1 text-xs font-bold">{selected.operator_id ? `…${selected.operator_id.slice(-8)}` : 'Not assigned'}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><ShieldCheck className="h-4 w-4 text-cyan-300" /><p className="mt-2 text-[8px] font-black uppercase text-white/30">Stored score</p><p className="mt-1 text-xs font-bold">{selected.dispatch_score != null ? selected.dispatch_score : 'Not yet persisted'}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><FileClock className="h-4 w-4 text-amber-300" /><p className="mt-2 text-[8px] font-black uppercase text-white/30">Evidence events</p><p className="mt-1 text-xs font-bold">{events.length}</p></div></div>

        {canRank && <div className="mt-5 rounded-xl border border-violet-300/15 bg-violet-500/[0.05] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-violet-200">Explainable candidate ranking</p><p className="mt-1 text-xs text-white/40">Eligible supply only; evidence and missing signals remain visible.</p></div><button type="button" onClick={() => void loadCandidates(selected.id)} disabled={rankingLoading} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase text-white/60 disabled:opacity-40">{rankingLoading ? 'Ranking…' : 'Re-rank'}</button></div><div className="mt-3 space-y-2">{candidates.slice(0, 5).map((candidate, index) => <article key={candidate.vehicle_id} className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-sm font-black">#{index + 1}</div><div><p className="text-xs font-black">{candidate.vehicle_type || 'Vehicle'} · …{candidate.vehicle_id.slice(-6)}</p><p className="mt-1 text-[9px] text-white/35">{candidate.straight_line_distance_km} km straight-line · telemetry {candidate.telemetry_age_minutes == null ? 'unknown' : `${candidate.telemetry_age_minutes} min old`}</p></div></div><div className="text-right"><p className="text-xl font-black text-violet-200">{candidate.score}</p><p className="text-[8px] uppercase text-white/30">score / 100</p></div></div><div className="mt-3 grid grid-cols-4 gap-1">{Object.entries(candidate.factors).slice(0, 8).map(([key, value]) => <div key={key} className="rounded-md border border-white/5 bg-white/[0.025] p-2"><p className="text-[8px] uppercase text-white/25">{key.replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] font-black">{Number(value).toFixed(1)}</p></div>)}</div>{candidate.evidence.signal_missing.length > 0 && <p className="mt-2 text-[9px] text-amber-200/70">Missing: {candidate.evidence.signal_missing.join(', ')}</p>}</article>)}{!rankingLoading && !candidates.length && <p className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-white/35">No eligible ranked vehicle returned for this pickup yet.</p>}</div>{rankingNote && <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-white/40"><Gauge className="mt-0.5 h-3 w-3 shrink-0 text-violet-200" />{rankingNote}</p>}</div>}

        {actions.length > 0 && <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[9px] font-black uppercase tracking-wider text-white/35">Allowed next actions for {role}</p>{actions.some((action) => action.needsReason) && <label className="mt-3 block"><span className="text-[9px] font-bold text-white/40">Reason for accountable exceptions, cancellations or overrides</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 p-3 text-xs text-white outline-none placeholder:text-white/20" placeholder="State the operational reason when required." /></label>}<div className="mt-3 flex flex-wrap gap-2">{actions.map((action) => <button key={action.status} type="button" disabled={Boolean(busyAction)} onClick={() => void runAction(action)} className={`min-h-11 rounded-lg border px-4 text-[10px] font-black uppercase tracking-wide disabled:opacity-40 ${toneClass(action.tone)}`}>{busyAction === action.status ? 'Recording…' : action.label}</button>)}</div></div>}

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-wider text-white/35">Evidence timeline</p>{detailLoading && <Clock3 className="h-4 w-4 animate-spin text-cyan-200" />}</div><div className="mt-3 space-y-3">{events.map((event, index) => <div key={event.id} className="flex gap-3"><div className="flex flex-col items-center"><div className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-500/10"><CheckCircle2 className="h-3 w-3 text-cyan-200" /></div>{index < events.length - 1 && <div className="h-full w-px bg-white/10" />}</div><div className="pb-3"><p className="text-xs font-black">{STATUS_LABEL[event.from_status || ''] || event.from_status || 'Created'} <ArrowRight className="mx-1 inline h-3 w-3 text-white/25" /> {STATUS_LABEL[event.to_status] || event.to_status}</p><p className="mt-1 text-[10px] text-white/35">{new Date(event.created_at).toLocaleString()}{event.reason ? ` · ${event.reason}` : ''}</p></div></div>)}{!events.length && !detailLoading && <p className="py-4 text-xs text-white/35">No transition event has been recorded yet for this dispatch.</p>}</div></div>
        {notice && <div role="status" className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-xs font-bold ${/failed|expired|error|blocked|stale/i.test(notice) ? 'border-red-400/20 bg-red-500/10 text-red-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'}`}>{/failed|expired|error|blocked|stale/i.test(notice) ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <UserCheck className="mt-0.5 h-4 w-4 shrink-0" />}{notice}</div>}
      </>}
    </section>
  </div>;
}

export default DispatchWorkspace;
