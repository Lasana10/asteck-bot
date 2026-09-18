import React, { useState } from 'react';
import { AlertTriangle, LocateFixed, Send } from 'lucide-react';
import { submitFieldReport, supabase } from '../../supabaseClient';
import { enqueueFieldReport, flushFieldReports, pendingFieldReports } from '../../services/fieldReportQueue';

type ReportType =
  | 'road_obstruction'
  | 'crash'
  | 'unsafe_pickup'
  | 'security_concern'
  | 'vehicle_issue'
  | 'service_problem'
  | 'route_issue'
  | 'medical'
  | 'other';

const TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'road_obstruction', label: 'Road obstruction' },
  { value: 'crash', label: 'Crash / collision' },
  { value: 'unsafe_pickup', label: 'Unsafe pickup point' },
  { value: 'security_concern', label: 'Security concern' },
  { value: 'vehicle_issue', label: 'Vehicle issue' },
  { value: 'service_problem', label: 'Service problem' },
  { value: 'route_issue', label: 'Route issue' },
  { value: 'medical', label: 'Medical issue' },
  { value: 'other', label: 'Other' },
];

export function JourneyFieldReportPanel({
  assignmentId,
  compact = false,
  onSubmitted,
}: {
  assignmentId: string;
  compact?: boolean;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType>('road_obstruction');
  const [severity, setSeverity] = useState(2);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy_m: number | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  React.useEffect(() => {
    let active = true;

    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || !active) return;

      setPendingCount(pendingFieldReports(userId, assignmentId));
      if (navigator.onLine) {
        await flushFieldReports(userId);
        if (active) setPendingCount(pendingFieldReports(userId, assignmentId));
      }
    };

    void sync();
    const onlineHandler = () => { void sync(); };
    window.addEventListener('online', onlineHandler);
    return () => {
      active = false;
      window.removeEventListener('online', onlineHandler);
    };
  }, [assignmentId]);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setNotice('This device does not expose geolocation. You can still submit without a location.');
      return;
    }

    setLocating(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
        setLocating(false);
        setNotice(`Location captured with about ${Math.round(position.coords.accuracy || 0)} m accuracy.`);
      },
      () => {
        setLocating(false);
        setLocation(null);
        setNotice('Location permission was not available. AFAT will not invent a location; you may submit without one.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  };

  const submit = async () => {
    setBusy(true);
    setNotice('');

    const mutationId = crypto.randomUUID();
    const payload = {
      report_type: type,
      severity,
      description: description.trim() || undefined,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy_m: location?.accuracy_m ?? null,
      recorded_at: new Date().toISOString(),
      mutation_id: mutationId,
    } as const;

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id || '';

    if (!navigator.onLine) {
      try {
        enqueueFieldReport(userId, assignmentId, payload);
        setPendingCount(pendingFieldReports(userId, assignmentId));
        setNotice('No connection. AFAT saved this report on the device and will retry it when connectivity returns.');
        setDescription('');
        setOpen(false);
      } catch (queueError: any) {
        setNotice(queueError?.message || 'This report could not be queued safely.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const { error } = await submitFieldReport(assignmentId, payload);
    if (error) {
      try {
        enqueueFieldReport(userId, assignmentId, payload);
        setPendingCount(pendingFieldReports(userId, assignmentId));
        setNotice('AFAT could not reach the service. The report was queued safely for automatic retry.');
        setDescription('');
        setOpen(false);
      } catch {
        setNotice(error.message);
      }
      setBusy(false);
      return;
    }

    setBusy(false);
    setNotice('Field report recorded with its current journey context.');
    setDescription('');
    setOpen(false);
    onSubmitted?.();
  };

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`rounded-xl border border-amber-300/20 bg-amber-300/10 font-black text-amber-100 ${compact ? 'min-h-10 px-3 text-[9px] uppercase' : 'min-h-11 px-4 text-[10px] uppercase'}`}
        >
          <AlertTriangle className="mr-2 inline h-3.5 w-3.5" />
          Report what is happening
        </button>
        {pendingCount > 0 && (
          <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-cyan-200">
            {pendingCount} report{pendingCount === 1 ? '' : 's'} waiting to sync
          </p>
        )}
        {notice && <p className="mt-2 text-xs leading-5 text-white/55">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-200">Journey field report</p>
          <p className="mt-1 text-xs leading-5 text-white/50">Record a real condition during this movement. AFAT keeps the timestamp, reporter and location accuracy when available.</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs font-black text-white/40">Close</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[9px] font-black uppercase tracking-wider text-white/35">
          Type
          <select value={type} onChange={(event) => setType(event.target.value as ReportType)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white outline-none">
            {TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="text-[9px] font-black uppercase tracking-wider text-white/35">
          Severity
          <select value={severity} onChange={(event) => setSeverity(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white outline-none">
            {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
          </select>
        </label>
      </div>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
        placeholder="What is happening?"
        className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white outline-none placeholder:text-white/25"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={locating} onClick={captureLocation} className="min-h-10 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-40">
          <LocateFixed className="mr-2 inline h-3.5 w-3.5" />
          {locating ? 'Locating…' : location ? 'Refresh location' : 'Attach current location'}
        </button>
        <button disabled={busy} onClick={submit} className="min-h-10 rounded-xl bg-amber-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">
          <Send className="mr-2 inline h-3.5 w-3.5" />
          {busy ? 'Submitting…' : 'Submit report'}
        </button>
      </div>

      {pendingCount > 0 && (
        <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-cyan-200">
          {pendingCount} report{pendingCount === 1 ? '' : 's'} waiting to sync
        </p>
      )}
      {notice && <p className="mt-3 text-xs leading-5 text-white/55">{notice}</p>}
    </div>
  );
}
