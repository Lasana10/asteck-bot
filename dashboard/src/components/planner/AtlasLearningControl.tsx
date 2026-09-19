import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Map, RefreshCw, Route, ScanSearch, Send, ShieldCheck, XCircle } from 'lucide-react';
import {
  createAtlasMappingMission,
  fetchAtlasKnowledgeGaps,
  reviewAtlasCandidate,
  promoteTrustedAtlasCandidate,
} from '../../services/livingAtlasClient';

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div>;
}

export function AtlasLearningControl() {
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    const { data: result, error } = await fetchAtlasKnowledgeGaps(30);
    setBusy(false);
    if (error) {
      setNotice(error.message || 'Atlas learning view is unavailable.');
      return;
    }
    setData(result);
    setNotice('');
  };

  useEffect(() => { void load(); }, []);

  const summary = data?.summary || {};
  const edges = data?.edges || [];
  const candidates = data?.candidates || [];

  const review = async (candidateId: string, decision: 'corroborate' | 'trust' | 'reject') => {
    setActingId(candidateId);
    const { data: result, error } = await reviewAtlasCandidate(candidateId, decision);
    setActingId(null);
    if (error) {
      setNotice(error.message || 'Candidate review failed.');
      return;
    }
    setNotice(result?.status === 'trusted'
      ? 'Candidate marked trusted. It is still not routable until an explicit Atlas promotion is performed.'
      : `Candidate marked ${result?.status || decision}.`);
    await load();
  };

  const promote = async (candidateId: string) => {
    setActingId(candidateId);
    const { data: result, error } = await promoteTrustedAtlasCandidate(candidateId);
    setActingId(null);
    if (error) {
      setNotice(error.message || 'Candidate promotion failed.');
      return;
    }
    setNotice(`Trusted geography promoted into the routable Atlas as ${result?.evidence_status || 'corroborated'} evidence.`);
    await load();
  };

  const createMission = async () => {
    const edge = edges[0];
    if (!edge) {
      setNotice('No priority road gap is available for a new mission.');
      return;
    }
    setBusy(true);
    const { data: result, error } = await createAtlasMappingMission({
      title: `Verify ${edge.name || 'priority road'}`,
      description: `Collect fresh movement and field evidence for ${edge.name || 'this road'}. Current reason: ${String(edge.reason || 'needs corroboration').replace(/_/g, ' ')}. Current Atlas confidence: ${edge.confidence ?? 'unknown'}%.`,
      rewardPointsPerKm: 10,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message || 'Could not create mapping mission.');
      return;
    }
    setNotice(`Mapping mission created: ${result?.id || 'active'}.`);
  };

  return (
    <section className="rounded-[1.5rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.08] to-slate-950/70 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300/75">Atlas learning control</p>
          <h2 className="mt-2 text-xl font-black">What AFAT still needs to learn</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/50">Weak roads, stale evidence, candidate geography, weak places and failed pickup points become targeted learning work instead of disappearing inside reports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={createMission} disabled={busy || !edges.length} className="flex min-h-10 items-center gap-2 rounded-xl bg-violet-500 px-3 text-[9px] font-black uppercase disabled:opacity-35"><Send className="h-3.5 w-3.5" />Create mission</button>
          <button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/65 disabled:opacity-40" aria-label="Refresh Atlas learning queue"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Metric label="Low confidence roads" value={summary.low_confidence_edges ?? '—'} />
        <Metric label="Stale roads" value={summary.stale_edges ?? '—'} />
        <Metric label="Candidate features" value={summary.candidate_features ?? '—'} />
        <Metric label="Weak places" value={summary.weak_places ?? '—'} />
        <Metric label="Pickup failures" value={summary.pickup_failures ?? '—'} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2"><Route className="h-4 w-4 text-cyan-200" /><p className="text-[9px] font-black uppercase tracking-widest text-white/45">Priority road gaps</p></div>
          <div className="space-y-2">
            {edges.slice(0, 8).map((edge: any) => (
              <article key={edge.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-black">{edge.name}</p><p className="mt-1 text-[10px] uppercase text-white/35">{String(edge.reason || 'needs review').replace(/_/g, ' ')}</p></div>
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-1 text-[8px] font-black text-cyan-100">{edge.confidence}%</span>
                </div>
              </article>
            ))}
            {!edges.length && <p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No priority road gap is currently visible.</p>}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2"><ScanSearch className="h-4 w-4 text-violet-200" /><p className="text-[9px] font-black uppercase tracking-widest text-white/45">Candidate geography</p></div>
          <div className="space-y-2">
            {candidates.slice(0, 8).map((candidate: any) => (
              <article key={candidate.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-black capitalize">{String(candidate.feature_type).replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] uppercase text-white/35">{candidate.movement_mode || 'mixed mode'} · {candidate.evidence_count} observations · {candidate.confidence}%</p></div>
                  <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2 py-1 text-[8px] font-black text-violet-100">{candidate.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button onClick={() => review(candidate.id, 'corroborate')} disabled={actingId === candidate.id} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-[8px] font-black uppercase text-cyan-100 disabled:opacity-35"><CheckCircle2 className="h-3 w-3" />Corroborate</button>
                  <button onClick={() => review(candidate.id, 'trust')} disabled={actingId === candidate.id} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-[8px] font-black uppercase text-emerald-100 disabled:opacity-35"><ShieldCheck className="h-3 w-3" />Trust</button>
                  <button onClick={() => review(candidate.id, 'reject')} disabled={actingId === candidate.id} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-400/10 text-[8px] font-black uppercase text-rose-100 disabled:opacity-35"><XCircle className="h-3 w-3" />Reject</button>
                  {candidate.status === 'trusted' && <button onClick={() => promote(candidate.id)} disabled={actingId === candidate.id} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-emerald-200/20 bg-emerald-300 text-[8px] font-black uppercase text-slate-950 disabled:opacity-35"><Map className="h-3 w-3" />Promote</button>}
                </div>
              </article>
            ))}
            {!candidates.length && <p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No candidate road or path is waiting for corroboration.</p>}
          </div>
        </div>
      </div>

      {notice && <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4" />{notice}</p>}
      <div className="mt-4 flex items-center gap-2 text-[10px] leading-5 text-white/35"><Map className="h-4 w-4" />Trusted candidates remain separate from routable Atlas truth until an explicit promotion step links them into canonical geography.</div>
    </section>
  );
}
