import React, { useEffect, useState } from 'react';
import { BadgeCent, CheckCircle2, RefreshCw, Smartphone, XCircle } from 'lucide-react';
import {
  decideFareQuote,
  fetchBookingStatus,
  fetchFareQuote,
  proposeFareQuote,
  reconcileBookingPayment,
  startBookingMobilePayment,
} from '../../supabaseClient';

function human(value?: string | null) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function FarePaymentPanel({
  mode,
  assignment,
  defaultPhone,
  onChanged,
}: {
  mode: 'passenger' | 'operator';
  assignment: any;
  defaultPhone?: string | null;
  onChanged?: () => void;
}) {
  const [quote, setQuote] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [rationale, setRationale] = useState('');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [network, setNetwork] = useState<'mtn_momo' | 'orange_money'>('mtn_momo');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    if (!assignment?.id) return;
    const [quoteResult, bookingResult] = await Promise.all([
      fetchFareQuote(assignment.id),
      assignment.booking_id ? fetchBookingStatus(assignment.booking_id) : Promise.resolve({ data: null, error: null }),
    ]);
    if (quoteResult.data) setQuote(quoteResult.data.quote || null);
    if (bookingResult.data) setBooking(bookingResult.data.booking || null);
  };

  useEffect(() => {
    setNotice('');
    setAmount('');
    setRationale('');
    void refresh();
  }, [assignment?.id, assignment?.booking_id]);

  const propose = async () => {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 50) {
      setNotice('Enter a valid integer fare in XAF.');
      return;
    }
    setBusy(true);
    setNotice('');
    const { data, error } = await proposeFareQuote(assignment.id, {
      amount_xaf: parsed,
      fare_source: 'operator_quote',
      rationale: rationale.trim() || undefined,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setQuote(data?.quote || null);
    setAmount('');
    setRationale('');
    setNotice('Fare sent to the Passenger for acceptance.');
    onChanged?.();
  };

  const decide = async (decision: 'accepted' | 'rejected') => {
    setBusy(true);
    setNotice('');
    const { data, error } = await decideFareQuote(assignment.id, decision);
    setBusy(false);
    if (error) return setNotice(error.message);
    setQuote(data?.quote || quote);
    setNotice(decision === 'accepted' ? 'Fare accepted. Mobile-money payment is now available.' : 'Fare rejected. The Operator can propose another fare.');
    await refresh();
    onChanged?.();
  };

  const pay = async () => {
    if (!assignment?.booking_id) return setNotice('Booking reference is missing.');
    if (phone.replace(/\D/g, '').length < 9) return setNotice('Enter the mobile-money phone number.');
    setBusy(true);
    setNotice('');
    const { data, error } = await startBookingMobilePayment({
      bookingId: assignment.booking_id,
      phone,
      mobileNetwork: network,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice(data?.message || 'Payment request sent. Approve it on your phone, then refresh status.');
    await refresh();
  };

  const reconcile = async () => {
    if (!assignment?.booking_id) return;
    setBusy(true);
    setNotice('');
    const { data, error } = await reconcileBookingPayment(assignment.booking_id);
    setBusy(false);
    if (error) return setNotice(error.message);
    setBooking(data?.booking || booking);
    setNotice(data?.settled
      ? 'PawaPay confirms this payment. AFAT settlement and receipt truth are updated.'
      : `PawaPay status: ${human(data?.provider_status)}.`);
    onChanged?.();
  };

  if (!assignment?.id || !assignment?.booking_id) return null;

  const status = String(assignment.status || '').toLowerCase();
  const canQuote = mode === 'operator' && ['accepted','assigned','en_route','arrived'].includes(status);
  const quoteStatus = String(quote?.status || '').toLowerCase();
  const paymentStatus = String(booking?.payment_status || '').toLowerCase();
  const providerPaid = ['paid','paid_momo'].includes(paymentStatus);

  return (
    <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/[0.055] p-4">
      <div className="flex items-start gap-3">
        <BadgeCent className="mt-0.5 h-5 w-5 text-cyan-200" />
        <div>
          <p className="text-sm font-black">Fare and payment truth</p>
          <p className="mt-1 text-xs leading-5 text-white/45">AFAT shows where the fare came from and treats payment as settled only after cash confirmation or provider confirmation.</p>
        </div>
      </div>

      {quote && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xl font-black">{Number(quote.amount_xaf || 0).toLocaleString()} XAF</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase text-white/50">{human(quote.status)}</span>
          </div>
          <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-cyan-200">Source: {human(quote.fare_source)}</p>
          {quote.rationale && <p className="mt-2 text-xs text-white/45">{quote.rationale}</p>}
          {quote.expires_at && quoteStatus === 'proposed' && <p className="mt-2 text-[9px] text-white/30">Valid until {new Date(quote.expires_at).toLocaleTimeString()}</p>}
        </div>
      )}

      {mode === 'operator' && canQuote && quoteStatus !== 'accepted' && (
        <div className="mt-4 space-y-3">
          <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Fare in XAF" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm font-black outline-none" />
          <input value={rationale} onChange={(event) => setRationale(event.target.value.slice(0, 1000))} placeholder="Fare basis / explanation (optional)" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-xs outline-none" />
          <button disabled={busy || !amount} onClick={propose} className="min-h-11 w-full rounded-xl bg-cyan-300 text-xs font-black text-slate-950 disabled:opacity-40">Send fare to Passenger</button>
        </div>
      )}

      {mode === 'passenger' && quoteStatus === 'proposed' && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => decide('accepted')} className="min-h-11 rounded-xl bg-emerald-400 text-xs font-black text-slate-950 disabled:opacity-40"><CheckCircle2 className="mr-2 inline h-4 w-4" />Accept fare</button>
          <button disabled={busy} onClick={() => decide('rejected')} className="min-h-11 rounded-xl border border-red-400/20 bg-red-400/10 text-xs font-black text-red-100 disabled:opacity-40"><XCircle className="mr-2 inline h-4 w-4" />Reject</button>
        </div>
      )}

      {mode === 'passenger' && quoteStatus === 'accepted' && !providerPaid && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_0.7fr]">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3">
              <Smartphone className="h-4 w-4 text-cyan-200" />
              <input value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 20))} placeholder="2376…" className="w-full bg-transparent text-xs font-bold outline-none" />
            </label>
            <select value={network} onChange={(event) => setNetwork(event.target.value as any)} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold outline-none">
              <option value="mtn_momo">MTN MoMo</option>
              <option value="orange_money">Orange Money</option>
            </select>
          </div>
          {paymentStatus !== 'collection_pending' && <button disabled={busy} onClick={pay} className="min-h-11 w-full rounded-xl bg-cyan-300 text-xs font-black text-slate-950 disabled:opacity-40">Request mobile-money payment</button>}
          {paymentStatus === 'collection_pending' && <button disabled={busy} onClick={reconcile} className="min-h-11 w-full rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-xs font-black text-cyan-100 disabled:opacity-40"><RefreshCw className="mr-2 inline h-4 w-4" />Check PawaPay status</button>}
        </div>
      )}

      {providerPaid && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs font-bold text-emerald-50"><CheckCircle2 className="mr-2 inline h-4 w-4" />Provider-confirmed mobile-money payment.</div>}

      {notice && <p role="status" className="mt-3 text-xs leading-5 text-white/55">{notice}</p>}
    </div>
  );
}
