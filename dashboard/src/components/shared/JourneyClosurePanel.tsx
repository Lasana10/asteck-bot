import { useEffect, useRef, useState } from 'react';
import { ClosurePatch, fetchJourneyClosure, JourneyClosure, saveJourneyClosure } from '../../services/dispatchClient';

export function JourneyClosurePanel({ assignmentId }: { assignmentId: string }) {
  const [closure, setClosure] = useState<JourneyClosure | null>(null);
  const [permissions, setPermissions] = useState({ feedback: false, dispute: false, confirm_cash: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [method, setMethod] = useState<ClosurePatch['payment_state']>('pending');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState('');
  const [rating, setRating] = useState('');
  const [dispute, setDispute] = useState('');
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const locked = useRef(false);
  const load = async () => {
    setLoading(true);
    const result = await fetchJourneyClosure(assignmentId);
    setLoading(false);
    if (result.error) { setNotice(result.error.message); return; }
    const row = result.data?.closure || null;
    setClosure(row);
    if (result.data) setPermissions(result.data.permissions);
    setMethod(['pending','cash_due','mobile_money_pending'].includes(row?.payment_state || '') ? row!.payment_state as ClosurePatch['payment_state'] : 'pending');
    setReference(row?.payment_reference || ''); setProof(row?.proof_reference || '');
    setRating(row?.rating ? String(row.rating) : ''); setDispute(row?.dispute_reason || '');
  };
  useEffect(() => { void load(); }, [assignmentId]);
  const save = async (patch: ClosurePatch) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    const signature = JSON.stringify({ assignmentId, version: closure?.state_version || 0, patch });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    const result = await saveJourneyClosure(assignmentId, closure?.state_version || 0, patch, pending.current.key);
    locked.current = false; setBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    pending.current = null;
    setClosure(result.data!.closure); setNotice('Saved. Your receipt number remains the same.');
  };
  const download = () => {
    if (!closure) return;
    const text = ['AFAT Journey Receipt', closure.receipt_number, `Journey: ${assignmentId}`, `Payment: ${closure.payment_state}`, `Verification: ${closure.payment_verification}`, 'Live payment provider: not connected', `Reference: ${closure.payment_reference || 'None'}`, `Rating: ${closure.rating || 'Not submitted'}`, `Dispute: ${closure.dispute_reason || 'None'}`, `Updated: ${closure.updated_at}`].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${closure.receipt_number}.txt`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const confirmed = closure?.payment_verification === 'cash_confirmed' || closure?.payment_verification === 'provider_confirmed';
  const input = 'mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm text-white';
  const button = 'min-h-11 rounded-lg border border-cyan-300/30 px-4 py-2 text-sm font-bold disabled:opacity-40';
  return <section className="mt-5 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-4" aria-label="Journey receipt and feedback">
    <h3 className="text-lg font-bold">Receipt, payment and feedback</h3>
    <p className="mt-2 break-all text-xs text-white/60">{closure?.receipt_number || 'Save to issue your journey receipt.'}</p>
    <p className="mt-2 text-sm text-amber-200">{closure?.payment_verification === 'cash_confirmed' ? 'Cash receipt confirmed by the operator.' : 'Payment is unverified. A reference or proof does not confirm settlement.'} Mobile money provider confirmation is not connected.</p>
    <button type="button" className={`${button} mt-3`} disabled={busy || loading} onClick={() => void load()}>Refresh receipt</button>
    {loading ? <p role="status" className="mt-3">Loading receipt…</p> : <>
      {!confirmed && <div className="mt-4 space-y-3">
        <label className="block text-sm">Payment method / status<select className={input} value={method} onChange={e => setMethod(e.target.value as ClosurePatch['payment_state'])}><option value="pending">Not yet reported</option><option value="cash_due">Cash due</option><option value="mobile_money_pending">Mobile money — verification pending</option></select></label>
        <label className="block text-sm">Payment reference<input className={input} maxLength={1000} value={reference} onChange={e => setReference(e.target.value)} /></label>
        <label className="block text-sm">Proof reference (optional)<input className={input} maxLength={1000} value={proof} onChange={e => setProof(e.target.value)} /></label>
        <button type="button" className={button} disabled={busy} onClick={() => void save({ payment_state: method, payment_reference: reference, proof_reference: proof })}>Save payment report</button>
        {permissions.confirm_cash && closure?.payment_state === 'cash_due' && <button type="button" className={`${button} ml-2`} disabled={busy} onClick={() => { if (window.confirm('Confirm that you actually received this journey’s cash payment?')) void save({ confirm_cash: true }); }}>I received the cash</button>}
      </div>}
      {permissions.feedback && <div className="mt-4"><label className="block text-sm">Rate your journey<select className={input} value={rating} onChange={e => setRating(e.target.value)}><option value="">Choose a rating</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label><button type="button" className={`${button} mt-2`} disabled={busy || !rating} onClick={() => void save({ rating: Number(rating) })}>Save rating</button></div>}
      {permissions.dispute && <div className="mt-4"><label className="block text-sm">Report a journey or payment problem<textarea className={input} maxLength={1000} value={dispute} onChange={e => setDispute(e.target.value)} /></label><button type="button" className={`${button} mt-2`} disabled={busy || dispute.trim().length < 4} onClick={() => void save({ dispute_reason: dispute.trim() })}>Record dispute</button></div>}
      {closure && <button type="button" className={`${button} mt-4`} onClick={download}>Download receipt</button>}
    </>}
    {notice && <p role="status" className="mt-3 text-sm text-cyan-100">{notice}</p>}
  </section>;
}
