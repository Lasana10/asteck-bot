import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileCheck2, Gauge, Map,
  ShieldCheck, UserCheck, X,
} from 'lucide-react';
import { fetchMyAccessApplications, submitAccessApplication } from '../../supabaseClient';

interface Props {
  role: 'commuter' | 'operator' | 'admin' | 'planner';
  isVisible: boolean;
  onClose: () => void;
  profile?: {
    id?: string;
    subscription_tier?: string;
    vehicle_type?: string;
    role?: string;
    verification_status?: string;
    operator_application_status?: string;
    capabilities?: string[];
  };
}

type AccessApplication = {
  id: string;
  capability_key: string;
  status: string;
  reason?: string | null;
  review_notes?: string | null;
  submitted_at?: string | null;
  requested_scope?: Record<string, any>;
};

const ROLE_COPY = {
  commuter: {
    title: 'Passenger access is ready',
    body: 'Use AFAT immediately for the map, places, routes, safety context and your own journeys. No staff approval is required.',
    icon: Map,
    action: 'Open passenger workspace',
  },
  operator: {
    title: 'Operator capability',
    body: 'Operator access is activated only after identity, vehicle and operating evidence are reviewed. Your Passenger access remains available while review continues.',
    icon: Gauge,
    action: 'Open operator workspace',
  },
  planner: {
    title: 'Planner capability',
    body: 'Planner access is scoped operational authority, not a public sign-up role. AFAT records the requested purpose and activates the workspace only after review.',
    icon: ShieldCheck,
    action: 'Open planner workspace',
  },
  admin: {
    title: 'Administrator authority',
    body: 'Administrator access is internal and invitation-controlled. It is never granted through ordinary public onboarding.',
    icon: UserCheck,
    action: 'Open admin control',
  },
};

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'approved' || normalized === 'active') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';
  if (normalized === 'rejected' || normalized === 'suspended') return 'border-red-400/25 bg-red-400/10 text-red-100';
  if (normalized === 'needs_information' || normalized === 'restricted') return 'border-amber-400/25 bg-amber-400/10 text-amber-100';
  return 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100';
}

function humanStatus(status: string) {
  return String(status || 'not started').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function RoleOnboarding({ role, isVisible, onClose, profile }: Props) {
  const [applications, setApplications] = useState<AccessApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const meta = ROLE_COPY[role];
  const Icon = meta.icon;
  const capabilityActive = useMemo(() => {
    const capabilities = profile?.capabilities || [];
    if (role === 'commuter') return true;
    return capabilities.includes(role) || String(profile?.role || '').toLowerCase() === role;
  }, [profile, role]);

  const application = useMemo(
    () => applications.find((item) => item.capability_key === role),
    [applications, role],
  );

  useEffect(() => {
    if (!isVisible || role === 'commuter' || role === 'admin') return;
    let active = true;
    setLoading(true);
    fetchMyAccessApplications()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice(error.message);
        else setApplications(data?.applications || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isVisible, role]);

  if (!isVisible) return null;

  const requestCapability = async () => {
    if (role !== 'operator' && role !== 'planner') return;
    setSubmitting(true);
    setNotice('');
    const { data, error } = await submitAccessApplication({
      capability_key: role,
      reason: role === 'operator'
        ? 'Activate verified operator service capability.'
        : 'Request scoped AFAT operational planning capability.',
      requested_scope: role === 'planner'
        ? { city: 'cameroon', authority: 'operational_planning' }
        : { service: 'passenger_transport' },
      evidence_summary: {
        profile_verification_status: profile?.verification_status || 'unknown',
        vehicle_type: profile?.vehicle_type || null,
      },
    });
    setSubmitting(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    const next = data?.application;
    if (next) {
      setApplications((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setNotice(data?.resumed ? 'Your existing application is still active.' : 'Application submitted for AFAT review.');
    }
  };

  const status = capabilityActive
    ? 'approved'
    : application?.status
      || (role === 'operator' ? String(profile?.operator_application_status || '').toLowerCase() : 'not_started');

  const nextStep = capabilityActive
    ? 'Your approved capability is active. AFAT will open the role-native workspace.'
    : status === 'needs_information'
      ? application?.review_notes || 'AFAT needs additional evidence before activation.'
      : status === 'rejected'
        ? application?.review_notes || 'This request was not approved. Correct the stated issue before applying again.'
        : status === 'submitted' || status === 'under_review'
          ? 'No second account or repeated login is required. Continue using Passenger access while AFAT reviews this capability.'
          : role === 'admin'
            ? 'Admin authority must come from an internal invitation or founder-controlled assignment.'
            : 'Submit one capability request. AFAT will keep the application state visible until a decision is made.';

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-[#030611]/92 p-4 backdrop-blur-xl">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-2xl sm:p-8">
        <button onClick={onClose} aria-label="Close onboarding" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/45 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4 pr-12">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10">
            <Icon className="h-7 w-7 text-cyan-100" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/60">AFAT access state</p>
            <h2 className="mt-2 text-2xl font-black text-white">{meta.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">{meta.body}</p>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/30">Basic AFAT</p>
            <p className="mt-1 text-sm font-black text-white">Active</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <Clock3 className="h-4 w-4 text-cyan-300" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/30">Capability</p>
            <p className="mt-1 text-sm font-black text-white">{humanStatus(status)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <FileCheck2 className="h-4 w-4 text-amber-300" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/30">Identity</p>
            <p className="mt-1 text-sm font-black text-white">{humanStatus(profile?.verification_status || 'basic')}</p>
          </div>
        </div>

        <div className={`mt-5 rounded-xl border p-4 ${statusTone(status)}`}>
          <div className="flex items-start gap-3">
            {status === 'rejected' || status === 'suspended'
              ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              : <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest">Next action</p>
              <p className="mt-2 text-xs font-semibold leading-5 opacity-85">{nextStep}</p>
            </div>
          </div>
        </div>

        {notice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-xs font-semibold text-white/60">{notice}</p>}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {!capabilityActive && !application && (role === 'operator' || role === 'planner') && (
            <button
              onClick={requestCapability}
              disabled={submitting || loading}
              className="min-h-12 flex-1 rounded-xl bg-cyan-300 px-5 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : `Request ${role} capability`}
            </button>
          )}
          <button
            onClick={onClose}
            className="min-h-12 flex-1 rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-black uppercase tracking-wider text-white"
          >
            {capabilityActive ? meta.action : 'Continue with current access'}
          </button>
        </div>
      </div>
    </div>
  );
}
