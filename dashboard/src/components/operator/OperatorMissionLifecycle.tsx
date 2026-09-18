import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Receipt, Route, ShieldCheck, Wallet } from 'lucide-react';
import { fetchJourneyClosure, transitionDispatch, updateJourneyClosure, verifyPickupCode } from '../../supabaseClient';
import { telemetry } from '../../services/telemetryService';
import { JourneyFieldReportPanel } from '../shared/JourneyFieldReportPanel';
import { FarePaymentPanel } from '../shared/FarePaymentPanel';

type Props = {
  assignment: any | null;
  onChanged: () => void;
};

function human(value?: string | null) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function OperatorMissionLifecycle({ assignment, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [closure, setClosure] = useState<any>(null);

  useEffect(() => {
    setNotice('');
    setPickupCode('');
    setClosure(null);
    if (!assignment?.id) return;
    const status = String(assignment.status || '').toLowerCase();
    if (['in_journey','emergency'].includes(status)) telemetry.setActiveDispatchAssignment(assignment.id);
    if (['completed','cancelled'].includes(status)) telemetry.clearActiveDispatchAssignment();
    if (['completed','disputed'].includes(status)) {
      fetchJourneyClosure(assignment.id).then(({ data }) => setClosure(data?.closure || null));
    }
  }, [assignment?.id, assignment?.status]);

  if (!assignment) {
    return <section className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Mission lifecycle</p><p className="mt-2 text-sm font-black text-white">No assigned dispatch</p><p className="mt-1 text-xs leading-5 text-white/40">Stay online for eligible verified demand. The map remains useful before a mission exists.</p></section>;
  }

  const status = String(assignment.status || '').toLowerCase();

  const advance = async (nextStatus: string, reason: string) => {
    setBusy(true); setNotice('');
    const { error } = await transitionDispatch(assignment.id, {
      expected_status: status,
      next_status: nextStatus,
      reason,
      evidence: { source: 'operator_workspace' },
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    if (nextStatus === 'in_journey') telemetry.setActiveDispatchAssignment(assignment.id);
    if (['completed','cancelled'].includes(nextStatus)) telemetry.clearActiveDispatchAssignment();
    setNotice(`Mission advanced to ${human(nextStatus)}.`);
    onChanged();
  };

  const verify = async () => {
    setBusy(true); setNotice('');
    const { error } = await verifyPickupCode(assignment.id, pickupCode);
    setBusy(false);
    if (error) return setNotice(error.message);
    setPickupCode('');
    setNotice('Passenger pickup verified.');
    onChanged();
  };

  const setCashDue = async () => {
    if (!closure) return;
    setBusy(true); setNotice('');
    const { data, error } = await updateJourneyClosure(assignment.id, {
      expected_version: Number(closure.state_version || 0),
      payment_state: 'cash_due',
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setClosure(data?.closure || closure);
    setNotice('Cash due recorded. Confirm only after cash is actually received.');
  };

  const confirmCash = async () => {
    if (!closure) return;
    setBusy(true); setNotice('');
    const { data, error } = await updateJourneyClosure(assignment.id, {
      expected_version: Number(closure.state_version || 0),
      confirm_cash: true,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setClosure(data?.closure || closure);
    setNotice('Cash receipt confirmed and recorded.');
  };

  return (
    <section className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.055] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Authoritative mission</p><h3 className="mt-2 text-xl font-black">Dispatch {String(assignment.id).slice(0, 8)}</h3><p className="mt-1 text-xs text-white/40">{human(status)}</p></div><span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-black uppercase text-emerald-100">{human(status)}</span></div>

      <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-black/20 p-4"><Route className="h-4 w-4 text-emerald-200" /><p className="mt-2 text-[9px] uppercase text-white/30">Mission state</p><p className="mt-1 text-xs font-black">{human(status)}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><ShieldCheck className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-[9px] uppercase text-white/30">Authority</p><p className="mt-1 text-xs font-black">Assigned operator</p></div></div>

      <div className="mt-4"><FarePaymentPanel mode="operator" assignment={assignment} onChanged={onChanged} /></div>

      {['accepted','assigned'].includes(status) && <button disabled={busy} onClick={() => advance('en_route','Operator departing for verified pickup')} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Navigate to pickup</button>}
      {status === 'en_route' && <button disabled={busy} onClick={() => advance('arrived','Operator arrived at pickup point')} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40">I am at the pickup point</button>}
      {status === 'arrived' && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-amber-200" /><div><p className="text-sm font-black">Passenger verification required</p><p className="mt-1 text-xs leading-5 text-white/50">Ask the passenger for the six-digit AFAT code. Do not start the journey without it.</p></div></div><input inputMode="numeric" maxLength={6} value={pickupCode} onChange={(event) => setPickupCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code" className="mt-4 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-center text-xl font-black tracking-[0.3em] outline-none" /><button disabled={busy || pickupCode.length !== 6} onClick={verify} className="mt-3 min-h-12 w-full rounded-xl bg-amber-300 text-xs font-black text-slate-950 disabled:opacity-40">Verify passenger pickup</button></div>}
      {status === 'pickup_verified' && <button disabled={busy} onClick={() => advance('in_journey','Verified passenger journey started')} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40"><CheckCircle2 className="mr-2 inline h-4 w-4" />Start journey</button>}
      {status === 'in_journey' && <div className="mt-4 space-y-2"><div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-xs leading-5 text-emerald-50"><strong>Journey active.</strong> Real-device GPS is attached to this dispatch and resumes after reload when the assignment is still active.</div><button disabled={busy} onClick={() => advance('completed','Operator completed passenger journey')} className="min-h-12 w-full rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Complete journey</button><button disabled={busy} onClick={() => advance('emergency','Operator activated journey emergency state')} className="min-h-11 w-full rounded-xl border border-red-400/20 bg-red-400/10 text-xs font-black text-red-100 disabled:opacity-40"><AlertTriangle className="mr-2 inline h-4 w-4" />Emergency</button></div>}
      {status === 'emergency' && <div className="mt-4 space-y-2"><div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-xs leading-5 text-red-50">Emergency evidence is preserved. Resume only when it is safe to continue.</div><button disabled={busy} onClick={() => advance('in_journey','Operator resumed journey after emergency')} className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 text-xs font-black">Resume journey</button></div>}
      {['arrived','pickup_verified','in_journey','emergency','disputed','completed'].includes(status) && <div className="mt-4"><JourneyFieldReportPanel assignmentId={assignment.id} compact onSubmitted={onChanged} /></div>}

      {['completed','disputed'].includes(status) && <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-cyan-200" /><p className="text-xs font-black">Receipt and settlement evidence</p></div><p className="mt-3 text-xs text-white/45">Receipt: {closure?.receipt_number || 'Loading…'}</p><p className="mt-1 text-xs text-white/45">Payment: {human(closure?.payment_state || 'pending')} · {human(closure?.payment_verification || 'unverified')}</p>{closure && closure.payment_verification === 'unverified' && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || closure.payment_state === 'cash_due'} onClick={setCashDue} className="min-h-11 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 text-[10px] font-black uppercase text-amber-100 disabled:opacity-40"><Wallet className="mr-2 inline h-3.5 w-3.5" />Cash due</button>{closure.payment_state === 'cash_due' && <button disabled={busy} onClick={confirmCash} className="min-h-11 rounded-xl bg-emerald-400 px-4 text-[10px] font-black uppercase text-slate-950 disabled:opacity-40">Confirm cash received</button>}</div>}</div>}

      {notice && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
    </section>
  );
}
