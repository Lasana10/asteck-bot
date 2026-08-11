import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, ExternalLink, MapPinned, RefreshCw, XCircle } from 'lucide-react';
import {
  fetchAfatMapFoundation,
  fetchAfatMapSourceRecords,
  reviewAfatMapSourceRecord,
} from '../../supabaseClient';
import type { AfatMapSource, AfatMapSourceRecord } from '../../supabaseClient';

type FoundationResponse = {
  sources?: AfatMapSource[];
  recent_imports?: Array<{
    id: string;
    source_key: string;
    dataset_version: string;
    scope_label: string;
    status: string;
    input_count: number;
  }>;
};

export function MapFoundationPanel() {
  const [foundation, setFoundation] = useState<FoundationResponse>({});
  const [records, setRecords] = useState<AfatMapSourceRecord[]>([]);
  const [message, setMessage] = useState('Loading governed map sources…');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ record: AfatMapSourceRecord; decision: 'approve' | 'reject' } | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const load = useCallback(async () => {
    setMessage('Refreshing map-source truth states…');
    const [foundationResult, recordsResult] = await Promise.all([
      fetchAfatMapFoundation(),
      fetchAfatMapSourceRecords('candidate'),
    ]);
    if (foundationResult.error || recordsResult.error) {
      setMessage(foundationResult.error?.message || recordsResult.error?.message || 'Map foundation is unavailable.');
      return;
    }
    setFoundation(foundationResult.data || {});
    setRecords(recordsResult.data?.records || []);
    setMessage('External records remain candidates until an authorized human review.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async () => {
    if (!reviewTarget || reviewReason.trim().length < 8) {
      setMessage('An evidence reason of at least 8 characters is required.');
      return;
    }
    const { record, decision } = reviewTarget;
    setBusyId(record.id);
    const result = await reviewAfatMapSourceRecord(record.id, {
      decision,
      reason: reviewReason.trim(),
      canonicalName: record.canonical_name,
      city: 'yaounde',
    });
    setBusyId(null);
    if (result.error) {
      setMessage(`Review failed: ${result.error.message}`);
      return;
    }
    setMessage(result.data?.message || `Candidate ${decision === 'approve' ? 'approved' : 'rejected'}.`);
    setReviewTarget(null);
    setReviewReason('');
    await load();
  };

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.04] p-5" aria-labelledby="map-foundation-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300/70">Place intelligence foundation</p>
          <h3 id="map-foundation-title" className="mt-1 flex items-center gap-2 text-lg font-black text-white">
            <MapPinned className="h-5 w-5 text-sky-300" /> Governed map sources
          </h3>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/50">Overture, OSM, and Foursquare provide candidates. AFAT review, entrance evidence, and passage outcomes establish operational truth.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/60 transition hover:text-white" aria-label="Refresh map sources">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[10px] font-semibold text-white/55" role="status">{message}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(foundation.sources || []).map((source) => (
          <article key={source.source_key} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-white">{source.display_name}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/35">{source.license_expression} · {source.source_class}</p>
              </div>
              {source.homepage_url ? (
                <a href={source.homepage_url} target="_blank" rel="noreferrer" className="text-sky-300/70 hover:text-sky-200" aria-label={`Open ${source.display_name} source page`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wider">
              <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-200">{source.candidate_counts?.candidate || 0} candidates</span>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-200">{source.candidate_counts?.approved || 0} approved</span>
              <span className="rounded-full bg-red-400/10 px-2 py-1 text-red-200">{source.candidate_counts?.rejected || 0} rejected</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white"><Database className="h-4 w-4 text-sky-300" /> Candidate review queue</h4>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">AAL2 required</span>
        </div>
        {records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-white/40">No imported candidates are waiting. This does not mean external datasets have been loaded.</div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <div key={record.id} className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-white">{record.canonical_name}</p>
                  <p className="mt-1 text-[9px] font-semibold text-white/40">{record.source_key} · {record.dataset_version} · {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === record.id} onClick={() => { setReviewTarget({ record, decision: 'approve' }); setReviewReason(''); }} className="flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase text-emerald-200 disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
                  <button type="button" disabled={busyId === record.id} onClick={() => { setReviewTarget({ record, decision: 'reject' }); setReviewReason(''); }} className="flex items-center gap-1 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase text-red-200 disabled:opacity-40"><XCircle className="h-3.5 w-3.5" /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTarget ? (
        <form className="mt-4 rounded-2xl border border-sky-300/20 bg-slate-950/80 p-4" onSubmit={(event) => { event.preventDefault(); void submitReview(); }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-sky-300/70">{reviewTarget.decision} candidate</p>
              <p className="mt-1 text-sm font-black text-white">{reviewTarget.record.canonical_name}</p>
            </div>
            <button type="button" onClick={() => { setReviewTarget(null); setReviewReason(''); }} className="text-white/45 hover:text-white" aria-label="Cancel candidate review"><XCircle className="h-4 w-4" /></button>
          </div>
          <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-white/50" htmlFor="map-review-reason">Evidence and decision reason</label>
          <textarea id="map-review-reason" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} maxLength={1000} required className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white outline-none transition focus:border-sky-300/50" placeholder={reviewTarget.decision === 'approve' ? 'Describe the independent or field evidence that corroborates this place.' : 'Describe the conflict, duplication, privacy concern, or obsolete record.'} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[9px] text-white/35">This decision is audited. Approval does not verify an entrance or meeting point.</p>
            <button type="submit" disabled={busyId === reviewTarget.record.id || reviewReason.trim().length < 8} className="rounded-xl bg-sky-400 px-4 py-2 text-[9px] font-black uppercase text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Confirm {reviewTarget.decision}</button>
          </div>
        </form>
      ) : null}

      {(foundation.recent_imports || []).length > 0 ? (
        <p className="mt-4 text-[10px] text-white/40">Latest batch: {foundation.recent_imports?.[0]?.source_key} · {foundation.recent_imports?.[0]?.scope_label} · {foundation.recent_imports?.[0]?.status}</p>
      ) : null}
    </section>
  );
}
