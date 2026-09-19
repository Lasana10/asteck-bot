import React, { useEffect, useState } from 'react';
import { AlertTriangle, Map, RefreshCw, Route, ScanSearch } from 'lucide-react';
import { fetchAtlasKnowledgeGaps } from '../../services/livingAtlasClient';

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xl font-black">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</p></div>;
}

export function AtlasLearningControl() {
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <section className="rounded-[1.5rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.08] to-slate-950/70 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300/75">Atlas learning control</p>
          <h2 className="mt-2 text-xl font-black">What AFAT still needs to learn</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/50">This queue combines weak confidence, stale road evidence, candidate geography, weak places and pickup failures. It is the starting point for targeted field missions.</p>
        </div>
        <button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/65 disabled:opacity-40" aria-label="Refresh Atlas learning queue"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
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
                  <div><p className="text-sm font-black capitalize">{String(candidate.feature_type).replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] uppercase text-white/35">{candidate.movement_mode || 'mixed mode'} · {candidate.evidence_count} observations</p></div>
                  <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2 py-1 text-[8px] font-black text-violet-100">{candidate.status}</span>
                </div>
              </article>
            ))}
            {!candidates.length && <p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-white/35">No candidate road or path is waiting for corroboration.</p>}
          </div>
        </div>
      </div>

      {notice && <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4" />{notice}</p>}
      <div className="mt-4 flex items-center gap-2 text-[10px] leading-5 text-white/35"><Map className="h-4 w-4" />AFAT keeps candidates separate from routable map truth until corroboration and review are strong enough.</div>
    </section>
  );
}
