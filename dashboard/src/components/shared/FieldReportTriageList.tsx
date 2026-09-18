import React, { useState } from 'react';
import { CheckCircle2, MapPin, ShieldAlert, XCircle } from 'lucide-react';
import { reviewFieldReport } from '../../supabaseClient';

function human(value?: string | null) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function FieldReportTriageList({
  reports,
  onChanged,
}: {
  reports: any[];
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const decide = async (report: any, status: 'triaged' | 'verified' | 'rejected' | 'resolved') => {
    setBusyId(report.id);
    setNotice('');
    const { error } = await reviewFieldReport(report.id, {
      status,
      resolution_notes: status === 'verified'
        ? 'Verified from AFAT operations triage.'
        : status === 'resolved'
          ? 'Resolved from AFAT operations triage.'
          : status === 'rejected'
            ? 'Rejected during AFAT operations review.'
            : 'Accepted into AFAT operations triage.',
    });
    setBusyId(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(`Field report marked ${human(status)}.`);
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      {reports.slice(0, 30).map((report: any) => {
        const profile = report.profiles || {};
        const dispatch = report.dispatch_assignments || {};
        const hasLocation = Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude));
        return (
          <article key={report.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black">{human(report.report_type)}</p>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[8px] font-black uppercase text-amber-100">
                    Severity {report.severity}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase text-white/45">
                    {human(report.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/50">{report.description || 'No description supplied.'}</p>
                <p className="mt-2 text-[9px] text-white/30">
                  {profile.full_name || human(report.reporter_workspace)} · dispatch {String(dispatch.id || report.dispatch_assignment_id || '').slice(0, 8)} · {new Date(report.recorded_at).toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-white/35">
                  {hasLocation
                    ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Location attached · {Math.round(Number(report.accuracy_m || 0)) || 'unknown'} m accuracy</span>
                    : <span>No location attached</span>}
                </div>
              </div>
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-200" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button disabled={busyId === report.id} onClick={() => decide(report, 'triaged')} className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-40">Triage</button>
              <button disabled={busyId === report.id} onClick={() => decide(report, 'verified')} className="rounded-xl bg-emerald-400 px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40"><CheckCircle2 className="mr-1 inline h-3 w-3" />Verify</button>
              <button disabled={busyId === report.id} onClick={() => decide(report, 'resolved')} className="rounded-xl border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-[9px] font-black uppercase text-violet-100 disabled:opacity-40">Resolve</button>
              <button disabled={busyId === report.id} onClick={() => decide(report, 'rejected')} className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[9px] font-black uppercase text-red-100 disabled:opacity-40"><XCircle className="mr-1 inline h-3 w-3" />Reject</button>
            </div>
          </article>
        );
      })}
      {!reports.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/35">No journey field report is waiting for operational review.</p>}
      {notice && <p role="status" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">{notice}</p>}
    </div>
  );
}
