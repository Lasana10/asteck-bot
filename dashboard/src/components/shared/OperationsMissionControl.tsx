import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  FileCheck,
  Map,
  RefreshCw,
  Route,
  Shield,
  Users,
  Zap
} from 'lucide-react';
import {
  getApiBaseUrl,
  fetchComplianceRadar,
  fetchLiveMapOps,
  fetchPaymentProviderReadiness
} from '../../supabaseClient';
import { calculateOperationalReadiness } from '../../utils/productionTruth';

type Role = 'commuter' | 'operator' | 'planner' | 'admin';
type Action = 'book' | 'report' | 'drive' | 'compliance' | 'dispatch' | 'onboard';

interface Props {
  role: Role;
  profile?: any;
  city?: string;
  compact?: boolean;
  onAction?: (action: Action) => void;
}

type ApiStatus = 'checking' | 'live' | 'limited' | 'offline';

const CITY_OPTIONS = [
  { id: 'cameroon', label: 'Cameroon' },
  { id: 'yaounde', label: 'Yaounde' },
  { id: 'douala', label: 'Douala' }
];

const ROLE_INTENT: Record<Role, { title: string; brief: string; actionLabel: string; action: Action }> = {
  commuter: {
    title: 'Safe passage now',
    brief: 'Book, scan, report, and receive route guidance from the same live network.',
    actionLabel: 'Find route',
    action: 'book'
  },
  operator: {
    title: 'Driver operating lane',
    brief: 'Go online, receive demand guidance, scan tickets, and protect earnings.',
    actionLabel: 'Start drive',
    action: 'drive'
  },
  planner: {
    title: 'City intelligence desk',
    brief: 'Turn reports, demand, dispatch, and compliance into one action queue.',
    actionLabel: 'Review dispatch',
    action: 'dispatch'
  },
  admin: {
    title: 'Platform command',
    brief: 'Control onboarding, compliance, broadcasts, and investor-readiness from truth data.',
    actionLabel: 'Check compliance',
    action: 'compliance'
  }
};

function statusClasses(status: ApiStatus) {
  if (status === 'live') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (status === 'limited') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  if (status === 'offline') return 'border-red-500/25 bg-red-500/10 text-red-300';
  return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
}

export function OperationsMissionControl({ role, profile, city, compact = false, onAction }: Props) {
  const [selectedCity, setSelectedCity] = useState(city || profile?.preferred_city || 'cameroon');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('Syncing');
  const [ops, setOps] = useState<any>(null);
  const [payments, setPayments] = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);

  const roleIntent = ROLE_INTENT[role] || ROLE_INTENT.commuter;
  const liveVehicles = ops?.vehicles?.length || 0;
  const liveIncidents = ops?.incidents?.length || 0;
  const liveCheckpoints = ops?.checkpoints?.length || 0;
  const complianceScore = compliance?.summary?.score ?? null;
  const paymentMode = payments?.mode || 'unknown';
  const paymentLive = paymentMode === 'live';

  const readiness = useMemo(() => {
    const checks = [
      apiStatus === 'live',
      Boolean(ops),
      paymentLive,
      role === 'commuter' || role === 'operator' || complianceScore !== null
    ];
    return calculateOperationalReadiness(checks);
  }, [apiStatus, ops, paymentLive, paymentMode, role, complianceScore]);

  const refresh = async () => {
    setIsRefreshing(true);
    setApiStatus('checking');

    const [healthRes, mapRes, paymentRes, complianceRes] = await Promise.allSettled([
      fetch(`${getApiBaseUrl()}/health`).then((res) => res.ok),
      fetchLiveMapOps(selectedCity),
      fetchPaymentProviderReadiness(),
      role === 'planner' || role === 'admin' ? fetchComplianceRadar() : Promise.resolve({ data: null, error: null })
    ]);

    setApiStatus(healthRes.status === 'fulfilled' && healthRes.value ? 'live' : 'offline');

    if (mapRes.status === 'fulfilled' && mapRes.value.data) {
      setOps(mapRes.value.data);
    }

    if (paymentRes.status === 'fulfilled' && paymentRes.value.data) {
      setPayments(paymentRes.value.data);
    }

    if (complianceRes.status === 'fulfilled' && complianceRes.value.data) {
      setCompliance(complianceRes.value.data);
    }

    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIsRefreshing(false);
  };

  useEffect(() => {
    refresh();
  }, [selectedCity, role]);

  const signals = [
    {
      label: 'API',
      value: apiStatus === 'live' ? 'Live' : apiStatus === 'checking' ? 'Syncing' : 'Offline',
      icon: Activity,
      status: apiStatus
    },
    {
      label: 'Map feed',
      value: `${liveVehicles} nodes / ${liveIncidents} alerts / ${liveCheckpoints} checkpoints`,
      icon: Map,
      status: ops ? 'live' : 'limited'
    },
    {
      label: 'Payments',
      value: paymentLive ? 'Live' : paymentMode === 'stub' ? 'Stub mode' : 'Checking',
      icon: CreditCard,
      status: paymentLive ? 'live' : paymentMode === 'stub' ? 'limited' : 'checking'
    },
    {
      label: 'Compliance',
      value: complianceScore === null ? (role === 'planner' || role === 'admin' ? 'Syncing' : 'Role ready') : `${complianceScore}% score`,
      icon: FileCheck,
      status: complianceScore === null ? 'limited' : complianceScore >= 80 ? 'live' : 'limited'
    }
  ];

  const actions = role === 'commuter'
    ? [
        { id: 'book', label: 'Book', icon: Route },
        { id: 'report', label: 'Report', icon: AlertTriangle },
        { id: 'onboard', label: 'Verify', icon: Shield }
      ]
    : role === 'operator'
      ? [
          { id: 'drive', label: 'Drive', icon: Zap },
          { id: 'report', label: 'Report', icon: AlertTriangle },
          { id: 'compliance', label: 'Docs', icon: FileCheck }
        ]
      : [
          { id: 'dispatch', label: 'Dispatch', icon: Route },
          { id: 'compliance', label: 'Compliance', icon: FileCheck },
          { id: 'onboard', label: 'Onboarding', icon: Users }
        ];

  const launchOrchestrator = () => {
    const rolePrompt: Record<Role, { prompt: string; intro: string }> = {
      commuter: {
        prompt: 'Help me choose the safest and fastest route right now.',
        intro: 'AFAT orchestrator is ready to combine route guidance, payment readiness, and safety signals for this commuter view.'
      },
      operator: {
        prompt: 'Summarize demand, risk, and the best operating move for this shift.',
        intro: 'AFAT orchestrator is ready to combine driver demand, map signals, and earnings context for this operator lane.'
      },
      planner: {
        prompt: 'Give me the highest-priority dispatch and compliance actions now.',
        intro: 'AFAT orchestrator is ready to combine incidents, dispatch flow, and compliance radar for this city desk.'
      },
      admin: {
        prompt: 'Summarize platform risk, compliance pressure, payments, and the next rollout action.',
        intro: 'AFAT orchestrator is ready to combine platform signals, payment readiness, compliance state, and rollout pressure.'
      }
    };

    window.dispatchEvent(new CustomEvent('afat:open-copilot', { detail: rolePrompt[role] }));
  };

  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1.2fr_1.5fr_0.9fr] lg:items-stretch">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusClasses(apiStatus)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {apiStatus === 'live' ? 'Backend live' : apiStatus === 'offline' ? 'Backend offline' : 'Checking'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Updated {lastUpdated}</span>
            </div>
            <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{roleIntent.title}</h2>
            <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-white/45">{roleIntent.brief}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {CITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedCity(option.id)}
                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  selectedCity === option.id
                    ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                    : 'border-white/10 bg-white/5 text-white/40 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div key={signal.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Icon className="h-4 w-4 text-blue-300/80" />
                  <CheckCircle className={`h-3.5 w-3.5 ${signal.status === 'live' ? 'text-emerald-400' : signal.status === 'offline' ? 'text-red-400' : 'text-amber-400'}`} />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">{signal.label}</p>
                <p className="mt-1 text-sm font-black text-white">{signal.value}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-500/15 bg-blue-500/5 p-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200/50">Readiness</p>
              <button
                onClick={refresh}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/50 transition hover:text-white"
                aria-label="Refresh AFAT status"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${readiness >= 80 ? 'bg-emerald-400' : readiness >= 55 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${readiness}%` }}
              />
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-white">{readiness}%</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => onAction?.(action.id as Action)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-slate-950/60 text-[9px] font-black uppercase tracking-widest text-white/60 transition hover:border-blue-400/40 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onAction?.(roleIntent.action)}
            className="w-full rounded-2xl bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98]"
          >
            {roleIntent.actionLabel}
          </button>

          <button
            onClick={launchOrchestrator}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:border-blue-400/40 hover:text-white"
          >
            Open AI Orchestrator
          </button>
        </div>
      </div>
    </section>
  );
}
