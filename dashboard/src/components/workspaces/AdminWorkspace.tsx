import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, FileCheck, ShieldCheck, Users } from 'lucide-react';
import {
  fetchAccessApprovalInbox,
  fetchComplianceRadar,
  fetchLiveMapOps,
  fetchOpsReportCenter,
  fetchPaymentProviderReadiness,
  reviewAccessApplication,
} from '../../supabaseClient';
import { LiveFeed, MapPanel, Metric, Surface } from './WorkspacePrimitives';

type Props = {
  live: LiveFeed;
  onNavigate: (tab: 'home' | 'bookings' | 'notifications' | 'profile') => void;
  onChanged?: () => void;
};

export function AdminWorkspace({ live, onNavigate, onChanged }: Props) {
  const [applications, setApplications] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [payments, setPayments] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setNotice('');
    const [approvalRes, complianceRes, paymentRes, reportRes] = await Promise.all([
      fetchAccessApprovalInbox(),
      fetchComplianceRadar(),
      fetchPaymentProviderReadiness(),
      fetchOpsReportCenter(),
    ]);
    setApplications(approvalRes.data?.applications || []);
    setCompliance(complianceRes.data || null);
    setPayments(paymentRes.data || null);
    setReports(reportRes.data || null);
    const errors = [approvalRes.error, complianceRes.error, paymentRes.error, reportRes.error].filter(Boolean);
    if (errors.length) setNotice('Some governance services are temporarily unavailable; AFAT is not substituting placeholder values.');
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (application: any, decision: 'approved' | 'restricted' | 'needs_information' | 'rejected') => {
    setWorkingId(application.id);
    setNotice('');
    const roleKey = application.capability_key === 'operator'
      ? 'verified_operator'
      : application.capability_key === 'planner'
        ? 'afat_operational_planner'
        : application.capability_key === 'organization'
          ? 'organization_member'
          : null;
    const { error } = await reviewAccessApplication(application.id, {
      decision,
      role_key: roleKey,
      notes: decision === 'needs_information'
        ? 'Additional evidence is required before this capability can be activated.'
        : `AFAT governance decision: ${decision}.`,
      review_scope: decision === 'restricted' ? { mode: 'limited', reviewed_at: new Date().toISOString() } : {},
    });
    setWorkingId(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(`${application.capability_key} application marked ${decision}.`);
    await load();
    onChanged?.();
  };

  const overdue = compliance?.summary?.overdue ?? compliance?.overdue ?? 0;
  const reportCount = reports?.reports?.length ?? reports?.items?.length ?? 0;
  const paymentState = payments?.status || payments?.state || payments?.provider_status || 'Not configured';

  return <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
    <div className="space-y-5">
      <Surface className="bg-gradient-to-br from-rose-500/[0.13] to-transparent p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-300/70">Platform governance</p>
        <h1 className="mt-2 text-3xl font-black">Identity, authority and system integrity</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">Admin governs who may act, what is compliant and whether platform dependencies are ready. It does not replace Planner operational judgment.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Metric icon={Users} label="Access reviews" value={applications.length} />
          <Metric icon={FileCheck} label="Overdue compliance" value={overdue} />
          <Metric icon={AlertTriangle} label="Open reports" value={reportCount} />
          <Metric icon={CreditCard} label="Payment readiness" value={String(paymentState).replace(/_/g, ' ')} />
        </div>
        {notice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs font-semibold text-white/60">{notice}</p>}
      </Surface>

      <Surface className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-300">Capability approval inbox</p>
            <h2 className="mt-1 text-xl font-black">Elevated access awaiting decision</h2>
          </div>
          <span className="text-xs text-white/35">{loading ? 'Refreshing…' : `${applications.length} waiting`}</span>
        </div>
        <div className="mt-4 space-y-3">
          {applications.slice(0, 8).map((application: any) => {
            const person = application.profiles || {};
            const busy = workingId === application.id;
            return <article key={application.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black">{person.full_name || person.phone || 'AFAT member'}</p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-cyan-200">{application.capability_key} · {application.status}</p>
                  <p className="mt-2 text-xs text-white/45">{application.reason || 'No additional reason supplied.'}</p>
                </div>
                <ShieldCheck className="h-5 w-5 shrink-0 text-rose-200" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button disabled={busy} onClick={() => decide(application, 'approved')} className="rounded-lg bg-emerald-400 px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Approve</button>
                <button disabled={busy} onClick={() => decide(application, 'restricted')} className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-40">Limited</button>
                <button disabled={busy} onClick={() => decide(application, 'needs_information')} className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[9px] font-black uppercase text-amber-100 disabled:opacity-40">Need info</button>
                <button disabled={busy} onClick={() => decide(application, 'rejected')} className="rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-[9px] font-black uppercase text-red-100 disabled:opacity-40">Reject</button>
              </div>
            </article>;
          })}
          {!applications.length && !loading && <div className="rounded-xl border border-dashed border-white/15 p-7 text-center text-sm text-white/35">No elevated access application is waiting for review.</div>}
        </div>
        <button onClick={() => onNavigate('bookings')} className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Open governance queue</button>
      </Surface>
    </div>

    <div className="space-y-5">
      <div className="min-h-[520px]"><MapPanel role="admin" live={live} /></div>
      <Surface className="p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-black">Truth boundary active</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Governance panels surface only returned service data. Missing provider readiness, compliance evidence or reports remain visibly missing.</p>
          </div>
        </div>
      </Surface>
    </div>
  </div>;
}
