import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, KeyRound, Receipt, Share2, ShieldAlert, ShieldCheck, Star, XCircle } from 'lucide-react';
import { createGuardianToken, createPickupCode, fetchJourneyClosure, transitionDispatch, updateJourneyClosure } from '../../supabaseClient';
import { JourneyFieldReportPanel } from '../shared/JourneyFieldReportPanel';
import { FarePaymentPanel } from '../shared/FarePaymentPanel';
import { EmergencySOS } from '../shared/EmergencySOS';

type Props = {
  assignment: any | null;
  onChanged: () => void;
};

const ACTIVE = new Set(['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency','disputed']);

function human(value?: string | null) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function PassengerJourneyContinuity({ assignment, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [pickupExpiry, setPickupExpiry] = useState('');
  const [closure, setClosure] = useState<any>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setNotice('');
    setPickupCode('');
    setPickupExpiry('');
    setClosure(null);
    if (!assignment?.id || !['completed','disputed'].includes(String(assignment.status))) return;
    fetchJourneyClosure(assignment.id).then(({ data }) => setClosure(data?.closure || null));
  }, [assignment?.id, assignment?.status]);

  if (!assignment) {
    return (
      <section className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-5">
        <p className="text-[9px] font-black uppercase tracking-widest text-blue-200">Journey continuity</p>
        <p className="mt-2 text-sm font-black text-white">No current dispatch</p>
        <p className="mt-1 text-xs leading-5 text-white/40">The map, place search and route planning remain available before any booking.</p>
      </section>
    );
  }

  const status = String(assignment.status || '').toLowerCase();
  const isActive = ACTIVE.has(status);
  const canCancel = ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified'].includes(status);
  const canDispute = ['in_journey','emergency'].includes(status);

  const cancel = async () => {
    setBusy(true); setNotice('');
    const { error } = await transitionDispatch(assignment.id, {
      expected_status: status,
      next_status: 'cancelled',
      reason: 'Passenger cancelled before journey completion',
      evidence: { source: 'passenger_workspace' },
    });
    setBusy(false);
    setNotice(error ? error.message : 'Journey request cancelled.');
    if (!error) onChanged();
  };

  const dispute = async () => {
    setBusy(true); setNotice('');
    const { error } = await transitionDispatch(assignment.id, {
      expected_status: status,
      next_status: 'disputed',
      reason: 'Passenger reported an active journey issue',
      evidence: { source: 'passenger_workspace' },
    });
    setBusy(false);
    setNotice(error ? error.message : 'Journey issue recorded for review.');
    if (!error) onChanged();
  };

  const generatePickupCode = async () => {
    setBusy(true); setNotice('');
    const { data, error } = await createPickupCode(assignment.id);
    setBusy(false);
    if (error) return setNotice(error.message);
    setPickupCode(data.pickup_code);
    setPickupExpiry(data.expires_at);
    setNotice('Show this code only to the assigned operator when you are together at pickup.');
  };

  const shareJourney = async () => {
    const bookingId = assignment?.booking_id;
    if (!bookingId) {
      setNotice('This dispatch does not yet have a shareable booking record.');
      return;
    }

    setShareBusy(true);
    setNotice('');
    const { data, error } = await createGuardianToken(bookingId, 180);
    setShareBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }

    const url = String(data?.watch_url || '').trim();
    if (!url) {
      setNotice('AFAT created the guardian token but no watch link was returned.');
      return;
    }

    setShareUrl(url);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'AFAT journey watch',
          text: 'Follow my AFAT journey status.',
          url,
        });
        setNotice('Guardian watch link shared.');
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setNotice('Guardian watch link copied. Send it to someone you trust.');
      } else {
        setNotice('Guardian watch link ready below.');
      }
    } catch {
      setNotice('Guardian watch link ready below.');
    }
  };

  const rate = async (rating: number) => {
    if (!closure) return;
    setBusy(true); setNotice('');
    const { data, error } = await updateJourneyClosure(assignment.id, {
      expected_version: Number(closure.state_version || 0),
      rating,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setClosure(data?.closure || closure);
    setNotice('Journey rating saved.');
  };

  return (
    <section className="rounded-2xl border border-blue-300/15 bg-blue-500/[0.055] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-blue-200">Journey continuity</p>
          <h3 className="mt-2 text-xl font-black text-white">{isActive ? 'Your active passage' : 'Most recent passage'}</h3>
          <p className="mt-1 text-xs text-white/40">Dispatch {String(assignment.id).slice(0, 8)} · {human(status)}</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${status === 'in_journey' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : status === 'emergency' || status === 'disputed' ? 'border-red-400/25 bg-red-400/10 text-red-100' : 'border-white/10 bg-white/5 text-white/55'}`}>{human(status)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4"><Clock3 className="h-4 w-4 text-blue-200" /><p className="mt-2 text-[9px] uppercase text-white/30">Current step</p><p className="mt-1 text-xs font-black">{human(status)}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4"><ShieldCheck className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-[9px] uppercase text-white/30">Truth source</p><p className="mt-1 text-xs font-black">Live dispatch record</p></div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.055] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-200" />
          <div className="flex-1">
            <p className="text-sm font-black text-white">Safety toolkit</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Use the tools for this exact journey: share a temporary watch link, verify pickup and send an authenticated SOS when needed.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={shareBusy || !assignment?.booking_id}
            onClick={() => void shareJourney()}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase text-white/70 disabled:opacity-40"
          >
            <Share2 className="mr-2 inline h-3.5 w-3.5" />
            {shareBusy ? 'Creating link…' : 'Share journey'}
          </button>
          {isActive && (
            <button
              type="button"
              onClick={() => setSosOpen(true)}
              className="min-h-11 rounded-xl border border-red-400/20 bg-red-400/10 px-4 text-[10px] font-black uppercase text-red-100"
            >
              <ShieldAlert className="mr-2 inline h-3.5 w-3.5" />
              Emergency SOS
            </button>
          )}
        </div>
        {shareUrl && (
          <div className="mt-3 break-all rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-cyan-100/70">
            {shareUrl}
          </div>
        )}
      </div>

      <div className="mt-4"><FarePaymentPanel mode="passenger" assignment={assignment} onChanged={onChanged} /></div>

      {status === 'arrived' && (
        <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4">
          <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-amber-200" /><div className="flex-1"><p className="text-sm font-black">Verify the correct pickup</p><p className="mt-1 text-xs leading-5 text-white/50">Generate a six-digit code only when the assigned operator is physically with you. AFAT stores only its hash.</p></div></div>
          {pickupCode ? <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-5 text-center"><p className="text-3xl font-black tracking-[0.35em] text-white">{pickupCode}</p><p className="mt-2 text-[9px] uppercase text-white/35">{pickupExpiry ? `Expires ${new Date(pickupExpiry).toLocaleTimeString()}` : 'Short-lived code'}</p></div> : <button disabled={busy} onClick={generatePickupCode} className="mt-4 min-h-12 w-full rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Generate pickup code</button>}
        </div>
      )}

      {status === 'pickup_verified' && <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-200" /><p className="text-xs font-bold text-emerald-50">Pickup identity verified. The assigned operator can now start the journey.</p></div>}
      {status === 'in_journey' && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-xs leading-5 text-emerald-50"><strong>Journey active.</strong> AFAT can resume this dispatch after a reload and real-device GPS samples queue when connectivity drops.</div>}
      {status === 'emergency' && <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-500/10 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-200" /><p className="text-xs leading-5 text-red-50">Emergency state is active for this journey. Journey completion should not erase its incident evidence.</p></div>}
      {['arrived','pickup_verified','in_journey','emergency','disputed','completed'].includes(status) && <div className="mt-4"><JourneyFieldReportPanel assignmentId={assignment.id} onSubmitted={onChanged} /></div>}

      {['completed','disputed'].includes(status) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-cyan-200" /><p className="text-xs font-black">Journey receipt</p></div>
          <p className="mt-3 text-xs text-white/45">Receipt: {closure?.receipt_number || 'Loading…'}</p>
          <p className="mt-1 text-xs text-white/45">Payment: {human(closure?.payment_state || 'pending')} · verification {human(closure?.payment_verification || 'unverified')}</p>
          {closure && <div className="mt-4"><p className="text-[9px] font-black uppercase tracking-widest text-white/30">Rate this journey</p><div className="mt-2 flex gap-2">{[1,2,3,4,5].map((value) => <button key={value} disabled={busy} onClick={() => rate(value)} aria-label={`Rate ${value} stars`} className={`flex h-10 w-10 items-center justify-center rounded-xl border ${Number(closure.rating) === value ? 'border-amber-300/40 bg-amber-300/15 text-amber-200' : 'border-white/10 bg-white/5 text-white/35'}`}><Star className="h-4 w-4" /></button>)}</div></div>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canCancel && <button disabled={busy} onClick={cancel} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase text-white/60 disabled:opacity-40"><XCircle className="mr-2 inline h-3.5 w-3.5" />Cancel request</button>}
        {canDispute && <button disabled={busy} onClick={dispute} className="min-h-11 rounded-xl border border-red-400/20 bg-red-400/10 px-4 text-[10px] font-black uppercase text-red-100 disabled:opacity-40">Report journey issue</button>}
      </div>
      {notice && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">{notice}</p>}
      {sosOpen && (
        <EmergencySOS
          userId={String(assignment.passenger_id || '')}
          userName="AFAT passenger"
          activeDispatchId={assignment.id}
          onClose={() => setSosOpen(false)}
        />
      )}
    </section>
  );
}
