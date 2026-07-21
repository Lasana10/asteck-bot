import React, { useState, useEffect } from 'react';
import { ViewToggle } from '../shared/ViewToggle';
import { InteractiveMap } from '../shared/InteractiveMap';
import { ShieldAlert, LogOut, Database, Megaphone, Target, Settings, Users, ArrowUpRight, Plus, AlertCircle, Activity, MapPin, Download, CheckCircle, CreditCard, FileCheck, Globe2, GraduationCap, HandHeart, Landmark, X, Sparkles } from 'lucide-react';
import { createDispatchAssignment, enrollCheckpoint, fetchComplianceRadar, fetchLiveMapOps, fetchPaymentProviderReadiness, getApiBaseUrl, reviewMapSignal, sendOpsNotification, setApiBaseOverride, supabase, updateComplianceStatus, updateOperatorLifecycle } from '../../supabaseClient';
import { RevenueDashboard } from './RevenueDashboard';
import { AFATLogo } from '../shared/AFATLogo';
import { mapOfflineService } from '../../services/MapOfflineService';
import { OperationsMissionControl } from '../shared/OperationsMissionControl';
import { AFATStrategicLayer } from '../shared/AFATStrategicLayer';

interface Props {
  onSignOut: () => void;
  activeTab?: string;
}

export function AdminControlPanel({ onSignOut, activeTab = 'home' }: Props) {
  const [uiMode, setUiMode] = useState<'map' | 'grid'>('grid');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ totalUsers: 0, activeCampaigns: 0, pendingIncidents: 0 });
  const [incidents, setIncidents] = useState<any[]>([]);
  const [pendingDirectives, setPendingDirectives] = useState<any[]>([]);
  const [overrideMessage, setOverrideMessage] = useState('');
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [paymentReadiness, setPaymentReadiness] = useState<any>(null);
  const [complianceRadar, setComplianceRadar] = useState<any>(null);
  const [liveMapOps, setLiveMapOps] = useState<any>(null);
  const [commandFeedback, setCommandFeedback] = useState<string>('');
  const [fieldDesk, setFieldDesk] = useState({
    checkpoint_name: '',
    city: 'yaounde',
    zone_label: '',
    latitude: '3.8480',
    longitude: '11.5021',
    checkpoint_type: 'community',
    notes: '',
    targetRole: 'operator',
    targetSpecialization: 'taxi',
  });
  const [dispatchDesk, setDispatchDesk] = useState({
    operator_id: '',
    vehicle_id: '',
    origin: 'Yaounde command grid',
    destination: 'Priority service sector',
    priority: 'high',
    notes: 'Admin-directed dispatch activation.',
  });
  const [isSavingFieldDesk, setIsSavingFieldDesk] = useState(false);
  const [isSavingDispatchDesk, setIsSavingDispatchDesk] = useState(false);
  const [backendTarget, setBackendTarget] = useState(getApiBaseUrl());
  const [networkStats, setNetworkStats] = useState({
    totalPacks: 1240,
    activeNodes: 856,
    regions: [
      { id: 'yaounde', name: 'Yaoundé Core', nodes: 420, health: 98 },
      { id: 'douala', name: 'Douala Port', nodes: 310, health: 95 },
      { id: 'garoua', name: 'Garoua North', nodes: 126, health: 92 }
    ]
  });

  useEffect(() => {
    fetchAdminData();
    fetchIncidents();
    
    const channel = supabase
      .channel('admin-directives')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sentinel_directives', filter: 'status=eq.pending_admin' }, () => {
        fetchAdminData(); // Refresh on new draft
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const tabTargets: Record<string, { view?: 'map' | 'grid'; openDesk?: boolean; message: string }> = {
      home: { view: 'grid', message: 'Admin Command Center opened.' },
      bookings: { view: 'grid', message: 'Revenue analytics opened from admin navigation.' },
      notifications: { view: 'map', message: 'Admin alert map opened from navigation.' },
      profile: { view: 'grid', openDesk: true, message: 'Admin Intelligence Desk opened for profile, compliance, payment, and rollout follow-through.' },
    };
    const target = tabTargets[activeTab];
    if (!target) return;
    if (target.view) setUiMode(target.view);
    if (target.openDesk) setIsIntelligenceOpen(true);
    setCommandFeedback(target.message);
  }, [activeTab]);

  const fetchAdminData = async () => {
    // 1. Fetch Users
    const { data: userData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(25);
    if (userData) setProfiles(userData);

    // 2. Fetch Campaigns
    const { data: campData } = await supabase.from('collection_campaigns').select('*');
    if (campData) setCampaigns(campData);

    // Fetch Directives
    const { data: dirData } = await supabase.from('sentinel_directives').select('*').eq('status', 'pending_admin').order('created_at', { ascending: false });
    if (dirData) setPendingDirectives(dirData);

    const [paymentRes, complianceRes, liveMapRes] = await Promise.allSettled([
      fetchPaymentProviderReadiness(),
      fetchComplianceRadar(),
      fetchLiveMapOps('cameroon')
    ]);
    if (paymentRes.status === 'fulfilled' && paymentRes.value.data) setPaymentReadiness(paymentRes.value.data);
    if (complianceRes.status === 'fulfilled' && complianceRes.value.data) setComplianceRadar(complianceRes.value.data);
    if (liveMapRes.status === 'fulfilled' && liveMapRes.value.data) setLiveMapOps(liveMapRes.value.data);

    // 3. Fetch Metrics
    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: incCount } = await supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    setMetrics({
      totalUsers: userCount || 0,
      activeCampaigns: campData?.length || 0,
      pendingIncidents: incCount || 0
    });
  };

  const fetchIncidents = async () => {
    const { data } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
    if (data) setIncidents(data);
  };

  const handleApproveDirective = async (id: string) => {
    await supabase.from('sentinel_directives').update({ status: 'broadcasted' }).eq('id', id);
    fetchAdminData();
  };

  const handleDiscardDirective = async (id: string) => {
    await supabase.from('sentinel_directives').update({ status: 'rejected' }).eq('id', id);
    fetchAdminData();
  };

  const handleManualOverride = async () => {
    if (!overrideMessage.trim()) return;
    await supabase.from('sentinel_directives').insert([{
      source: 'ADMIN_OVERRIDE',
      basis: 'Central Command Action',
      directive: overrideMessage,
      tier: 2,
      status: 'broadcasted',
      target_role: 'all'
    }]);
    setOverrideMessage('');
    setCommandFeedback('Universal broadcast saved to Sentinel directives and marked broadcasted.');
  };

  const launchCampaign = async () => {
    await supabase.from('collection_campaigns').insert([{
      title: 'AFAT Evening Peak Intel',
      description: 'Collecting high-res movement data during 5PM-8PM rush.',
      reward_points: 100,
      is_active: true
    }]);
    fetchAdminData();
  };

  const launchOrchestrator = (prompt: string, intro: string) => {
    window.dispatchEvent(new CustomEvent('afat:open-copilot', { detail: { prompt, intro } }));
  };

  const openComplianceDesk = () => {
    setIsIntelligenceOpen(true);
    setCommandFeedback('Compliance desk opened with permit, payment, and rollout follow-up.');
  };

  const handleComplianceAction = async (recordId: string, status: string, notes?: string) => {
    setCommandFeedback(`Updating compliance record to ${status}...`);
    const { error } = await updateComplianceStatus(recordId, status, notes);
    if (error) {
      setCommandFeedback(`Compliance update failed: ${error.message}`);
      return;
    }
    setCommandFeedback(`Compliance record marked ${status}.`);
    fetchAdminData();
  };

  const handleOperatorLifecycle = async (
    operatorId: string,
    status: 'APPLICATION_STARTED' | 'DOCUMENTS_PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED',
    notes?: string,
  ) => {
    setCommandFeedback(`Updating operator lifecycle to ${status}...`);
    const { error } = await updateOperatorLifecycle(operatorId, { status, notes });
    if (error) {
      setCommandFeedback(`Operator lifecycle update failed: ${error.message}`);
      return;
    }
    setCommandFeedback(`Operator lifecycle updated to ${status}.`);
    fetchAdminData();
  };

  const handleRouteSignalReview = async (signal: any, status: 'queued' | 'validated' | 'dismissed' | 'published') => {
    if (!signal?.id) {
      setCommandFeedback('Route signal has no movement id and cannot be reviewed yet.');
      return;
    }

    const rewardPoints = status === 'validated' ? 25 : status === 'published' ? 40 : 0;
    const { error } = await reviewMapSignal({
      movement_log_id: signal.id,
      status,
      confidence_score: status === 'dismissed' ? 20 : status === 'published' ? 90 : status === 'validated' ? 80 : 55,
      reward_points: rewardPoints,
      decision_notes: `Admin ${status} route-truth signal from ${signal.city || 'field zone'}.`,
    });

    if (error) {
      setCommandFeedback(`Route signal review failed: ${error.message}`);
      return;
    }

    setCommandFeedback(`Route signal marked ${status}${rewardPoints ? ` and ${rewardPoints} trust points queued` : ''}.`);
    fetchAdminData();
  };

  const copyPaymentCallback = async () => {
    const callbackUrl = paymentReadiness?.callback_url;
    if (!callbackUrl) {
      setCommandFeedback('Payment callback URL is not available yet.');
      return;
    }
    await navigator.clipboard?.writeText(callbackUrl);
    setCommandFeedback(`Callback copied: ${callbackUrl}`);
  };

  const exportNetworkSnapshot = async () => {
    const snapshot = JSON.stringify({
      generated_at: new Date().toISOString(),
      metrics,
      compliance: complianceRadar?.summary || null,
      payments: paymentReadiness || null,
      regions: networkStats.regions
    }, null, 2);
    await navigator.clipboard?.writeText(snapshot);
    setCommandFeedback('Network snapshot copied to clipboard for investor or ops review.');
  };

  const stageOverride = (message: string, feedback: string) => {
    setOverrideMessage(message);
    setCommandFeedback(feedback);
  };

  const createAdminDirective = async (params: {
    directive: string;
    targetRole?: string;
    source?: string;
    basis?: string;
    tier?: number;
    metadata?: Record<string, any>;
  }) => {
    const payload = {
      source: params.source || 'admin_command_matrix',
      basis: params.basis || 'admin_workflow',
      directive: params.directive,
      tier: params.tier || 2,
      target_role: params.targetRole || 'all',
      status: 'pending_admin',
      metadata: params.metadata || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('sentinel_directives')
      .insert(payload)
      .select()
      .single();

    return { data, error };
  };

  const toggleIngestion = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ data_ingest_allowed: !currentStatus })
      .eq('id', userId);
    
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, data_ingest_allowed: !currentStatus } : p));
      setCommandFeedback(`Ingestion status updated successfully.`);
    } else {
      setCommandFeedback(`Failed to update ingestion status: ${error.message}`);
    }
  };

  const handleFieldDeskChange = (key: string, value: string) => {
    setFieldDesk((prev) => ({ ...prev, [key]: value }));
  };

  const submitFieldDesk = async () => {
    if (!fieldDesk.checkpoint_name.trim() || !fieldDesk.city.trim()) {
      setCommandFeedback('Checkpoint name and city are required for map construction.');
      return;
    }

    setIsSavingFieldDesk(true);
    const profileId = localStorage.getItem('afat_local_user_id') || localStorage.getItem('afat_user_id') || undefined;
    const { data, error } = await enrollCheckpoint({
      profile_id: profileId,
      checkpoint_name: fieldDesk.checkpoint_name.trim(),
      city: fieldDesk.city.trim(),
      zone_label: fieldDesk.zone_label.trim() || undefined,
      latitude: Number(fieldDesk.latitude),
      longitude: Number(fieldDesk.longitude),
      checkpoint_type: fieldDesk.checkpoint_type,
      notes: fieldDesk.notes.trim() || undefined,
    });

    setIsSavingFieldDesk(false);

    if (error) {
      setCommandFeedback(`Checkpoint registration failed: ${error.message}`);
      return;
    }

    setCommandFeedback(`Checkpoint ${data?.checkpoint?.name || fieldDesk.checkpoint_name} registered and captain enrollment created.`);
    setFieldDesk((prev) => ({
      ...prev,
      checkpoint_name: '',
      zone_label: '',
      notes: '',
    }));
    fetchAdminData();
  };

  const notifyFieldCrew = async () => {
    const targetCount = profiles.filter((profile) => profile.role === fieldDesk.targetRole).length;
    const cityLabel = fieldDesk.city.charAt(0).toUpperCase() + fieldDesk.city.slice(1);
    const noticeBody = `AFAT map construction notice: ${fieldDesk.targetRole} ${fieldDesk.targetSpecialization} partners in ${cityLabel} should report route changes, hazards, pickup pressure, and checkpoint conditions around ${fieldDesk.zone_label || fieldDesk.checkpoint_name || 'the assigned zone'}.`;
    stageOverride(
      noticeBody,
      `Dispatching field notice to ${fieldDesk.targetRole} partners in ${cityLabel}...`
    );

    const { data, error } = await sendOpsNotification({
      role: fieldDesk.targetRole,
      city: fieldDesk.city,
      channels: ['in_app', 'whatsapp', 'telegram'],
      title: `AFAT field build notice · ${cityLabel}`,
      body: noticeBody,
      type: 'map_build_notice',
    });

    if (error) {
      setCommandFeedback(`Field notice failed: ${error.message}`);
      return;
    }

    setCommandFeedback(
      `Field notice sent to ${data?.recipient_count ?? targetCount} ${fieldDesk.targetRole} records with in-app delivery and channel fan-out where linked.`
    );
  };

  const handleDispatchDeskChange = (key: string, value: string) => {
    setDispatchDesk((prev) => ({ ...prev, [key]: value }));
  };

  const submitDispatchDesk = async () => {
    if (!dispatchDesk.operator_id.trim() && !dispatchDesk.vehicle_id.trim()) {
      setCommandFeedback('Add an operator id or vehicle id before dispatching from admin.');
      return;
    }

    setIsSavingDispatchDesk(true);
    const dispatcherId = localStorage.getItem('afat_user_id') || undefined;
    const { error } = await createDispatchAssignment({
      operator_id: dispatchDesk.operator_id.trim() || undefined,
      vehicle_id: dispatchDesk.vehicle_id.trim() || undefined,
      dispatcher_id: dispatcherId,
      origin: dispatchDesk.origin.trim(),
      destination: dispatchDesk.destination.trim(),
      priority: dispatchDesk.priority,
      notes: dispatchDesk.notes.trim(),
    });
    setIsSavingDispatchDesk(false);

    if (error) {
      setCommandFeedback(`Admin dispatch failed: ${error.message}`);
      return;
    }

    setCommandFeedback('Admin dispatch assignment created successfully.');
    setDispatchDesk((prev) => ({ ...prev, operator_id: '', vehicle_id: '' }));
    fetchAdminData();
  };

  const switchBackendTarget = (target: 'render' | 'local') => {
    const nextUrl = target === 'render' ? 'https://asteck-bot.onrender.com' : 'http://localhost:3000';
    setApiBaseOverride(nextUrl);
    setBackendTarget(nextUrl);
    setCommandFeedback(`Backend target set to ${nextUrl}. Refresh the page to make every API call use this target.`);
  };

  const renderMapView = () => (
     <div className="flex-1 relative h-full animate-in zoom-in duration-500 rounded-[32px] overflow-hidden ghost-border m-4 mt-20 shadow-2xl">
       <InteractiveMap 
         incidents={incidents} 
         showInformal={true}
         role="admin"
       />
       <div className="absolute top-6 left-6 z-[500] flex flex-col gap-3">
          <div className="glass-panel ghost-border p-4 rounded-3xl shadow-ambient-float">
             <h3 className="text-xs font-bold text-error uppercase tracking-widest mb-2 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" /> System Heartbeat
             </h3>
             <div className="space-y-2">
                <div className="flex justify-between gap-8">
                   <span className="text-[10px] text-on-surface-variant font-bold uppercase">Nodes Active</span>
                   <span className="text-[10px] text-on-surface font-mono">{metrics.totalUsers}</span>
                </div>
                <div className="flex justify-between gap-8">
                   <span className="text-[10px] text-on-surface-variant font-bold uppercase">Threat Level</span>
                   <span className="text-[10px] text-green font-mono">NOMINAL</span>
                </div>
             </div>
          </div>
       </div>
    </div>
  );

  const renderGridUI = () => {
    // Revenue tab for admin
    if (activeTab === 'bookings') return <RevenueDashboard />;

    const adminCommands = [
      {
        label: 'Licensing and permits',
        status: 'in progress',
        icon: Landmark,
        signal: `${complianceRadar?.summary?.total || 0} compliance records`,
        note: 'Move operator documents toward renewal packages, expiry checks, and regulator-ready queues.',
        action: 'Open compliance',
        onClick: openComplianceDesk
      },
      {
        label: 'Payment callbacks',
        status: paymentReadiness?.mode === 'live' ? 'live' : 'needs deploy',
        icon: CreditCard,
        signal: paymentReadiness?.callback_url || 'callback URL not loaded',
        note: 'PawaPay deposits, payouts, and refunds should point to the same webhook until provider-specific routing is needed.',
        action: 'Copy callback',
        onClick: copyPaymentCallback
      },
      {
        label: 'Map quality desk',
        status: 'in progress',
        icon: MapPin,
        signal: `${networkStats.activeNodes} nodes / ${networkStats.regions.length} regions`,
        note: 'Review checkpoints, downloaded packs, field reports, and weak coverage zones before city rollout.',
        action: 'Open field desk',
        onClick: openComplianceDesk
      },
      {
        label: 'Regional rollout',
        status: 'planned',
        icon: Globe2,
        signal: 'city replication pack',
        note: 'Repeatable bundle for onboarding, dispatch, compliance, reporting, and local geodata by region.',
        action: 'Launch campaign',
        onClick: async () => {
          await launchCampaign();
          setCommandFeedback('Regional rollout campaign created for fresh field intelligence collection.');
        }
      },
      {
        label: 'Academy and badge',
        status: 'in progress',
        icon: GraduationCap,
        signal: 'driver/operator certification',
        note: 'Training, AFAT certification badges, and priority placement for high-trust operators.',
        action: 'Queue academy',
        onClick: async () => {
          const { error } = await createAdminDirective({
            directive: 'AFAT Academy activation: prepare certified driver, operator, and fleet readiness workflow with badge, quality checks, and follow-up queue.',
            targetRole: 'planner',
            basis: 'academy_activation',
            metadata: { workflow: 'academy_and_badge' },
          });
          setCommandFeedback(error ? `Academy queue failed: ${error.message}` : 'Academy activation directive saved for admin/planner follow-through.');
          if (!error) fetchAdminData();
        }
      },
      {
        label: 'Emergency logistics',
        status: 'in progress',
        icon: HandHeart,
        signal: 'humanitarian mode',
        note: 'Disaster response, NGO transport, evacuation coordination, and medical supply routing.',
        action: 'Prepare alert',
        onClick: async () => {
          const { error } = await createAdminDirective({
            directive: 'Emergency logistics mode: verify incident, identify safe corridors, and coordinate approved transport partners for evacuation or humanitarian supply movement.',
            targetRole: 'all',
            basis: 'emergency_logistics',
            tier: 1,
            metadata: { workflow: 'humanitarian_mode' },
          });
          setCommandFeedback(error ? `Emergency logistics directive failed: ${error.message}` : 'Emergency logistics directive saved and ready for command review.');
          if (!error) fetchAdminData();
        }
      }
    ];

    return (
    <div className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500 pt-24">
        <OperationsMissionControl
          role="admin"
          city="cameroon"
          onAction={(action) => {
            if (action === 'dispatch') setUiMode('map');
            if (action === 'compliance') setIsIntelligenceOpen(true);
            if (action === 'onboard') launchCampaign();
          }}
        />

        <AFATStrategicLayer
          role="admin"
          liveVehicles={networkStats.activeNodes}
          liveIncidents={metrics.pendingIncidents}
          onAction={(action) => {
            if (action === 'dispatch' || action === 'map') setUiMode('map');
            if (action === 'compliance') setIsIntelligenceOpen(true);
            if (action === 'onboard') launchCampaign();
          }}
        />

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-2xl">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Admin command matrix</p>
              <h2 className="mt-1 text-xl font-black uppercase italic tracking-tight text-white">Special access must control the ecosystem, not just observe it</h2>
            </div>
            <button
              onClick={fetchAdminData}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/60 transition hover:text-white"
            >
              Refresh command data
            </button>
          </div>

          {commandFeedback && (
            <div className="mb-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-[11px] font-semibold text-blue-100">
              {commandFeedback}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {adminCommands.map((command) => {
              const Icon = command.icon;
              const live = command.status === 'live';
              const active = command.status === 'in progress';
              return (
                <div key={command.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <Icon className="h-5 w-5 text-blue-300" />
                    <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${
                      live
                        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                        : active
                          ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                          : 'border-white/10 bg-white/[0.03] text-white/45'
                    }`}>
                      {command.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-tight text-white">{command.label}</p>
                  <p className="mt-1 break-words text-[10px] font-bold leading-relaxed text-blue-100/65">{command.signal}</p>
                  <p className="mt-2 text-[10px] font-semibold leading-relaxed text-white/40">{command.note}</p>
                  <button
                    onClick={command.onClick}
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-[9px] font-black uppercase tracking-widest text-white/60 transition hover:border-blue-300/40 hover:text-white"
                  >
                    {command.action}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="glass-panel ghost-border p-8 rounded-[32px] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-outline-variant group-hover:text-primary/20 transition-colors">
                 <Users className="w-16 h-16" />
              </div>
              <p className="text-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1">Total Network Nodes</p>
              <h3 className="text-4xl font-display font-bold text-on-surface">{metrics.totalUsers}</h3>
              <div className="flex items-center gap-2 text-green text-xs mt-4">
                 <ArrowUpRight className="w-3 h-3" />
                 <span>+12 today</span>
              </div>
           </div>

           <div className="glass-panel ghost-border p-8 rounded-[32px] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-outline-variant group-hover:text-amber/20 transition-colors">
                 <Target className="w-16 h-16" />
              </div>
              <p className="text-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1">Active Collection Campaigns</p>
              <h3 className="text-4xl font-display font-bold text-on-surface">{metrics.activeCampaigns}</h3>
              <div className="flex items-center gap-2 text-on-surface-variant text-xs mt-4">
                 <span>Running in 4 Districts</span>
              </div>
           </div>

           <div className="glass-panel ghost-border p-8 rounded-[32px] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-outline-variant group-hover:text-error/20 transition-colors">
                 <Megaphone className="w-16 h-16" />
              </div>
              <p className="text-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1">Pending Intelligence</p>
              <h3 className="text-4xl font-display font-bold text-on-surface">{metrics.pendingIncidents}</h3>
              <div className="flex items-center gap-2 text-error text-xs mt-4">
                 <AlertCircle className="w-3 h-3" />
                 <span>Verification Required</span>
              </div>
           </div>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
           
           <div className="bg-slate-900 border border-slate-800 rounded-[32px] overflow-hidden">
              <div className="p-8 border-b border-slate-800 flex items-center justify-between">
                 <h3 className="font-bold text-xl flex items-center gap-3">
                    <Database className="w-5 h-5 text-red-500" />
                    Network Profiles
                 </h3>
                 <button
                    onClick={exportNetworkSnapshot}
                    className="text-xs bg-slate-800 hover:bg-slate-700 font-bold px-4 py-2 rounded-xl transition-all border border-slate-700"
                 >
                    Export DB
                 </button>
              </div>
              <div className="p-4 space-y-2">
                 {profiles.map((p, i) => (
                   <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-800/50 rounded-2xl transition-all border border-transparent hover:border-slate-800">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-500 border border-slate-700">
                            {(p.full_name || p.username || 'U')[0].toUpperCase()}
                         </div>
                         <div>
                            <p className="font-bold text-sm">{p.full_name || p.username || p.phone}</p>
                            <p className="text-[9px] font-mono text-slate-500 uppercase">{p.role} {p.phone ? `(${p.phone})` : ''}</p>
                            {p.role === 'operator' && (
                              <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-amber-300/80">
                                {p.operator_application_status || (p.is_active ? 'APPROVED' : 'UNDER_REVIEW')}
                              </p>
                            )}
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.role === 'operator' && (
                          <>
                            <button
                              onClick={() => handleOperatorLifecycle(p.id, 'APPROVED', 'Approved from AFAT admin command center.')}
                              className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/25"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleOperatorLifecycle(p.id, 'UNDER_REVIEW', 'Moved back to AFAT review queue for final checks.')}
                              className="rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-amber-200 transition hover:bg-amber-500/25"
                            >
                              Review
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => toggleIngestion(p.id, !!p.data_ingest_allowed)}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition ${
                            p.data_ingest_allowed
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-950 text-slate-500 border border-white/5'
                          }`}
                        >
                          {p.data_ingest_allowed ? '🔴 Live Ingest: Active' : '⚪ Mock Ingest'}
                        </button>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="space-y-8">
              {/* AI Tactical Decision Grid */}
              <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-5">
                    <ShieldAlert className="w-48 h-48" />
                 </div>
                 <div className="relative z-10">
                    <h3 className="font-bold text-xl mb-2 flex items-center gap-2 text-amber-500">
                       <Activity className="w-5 h-5" /> Decision Inbox (Tier 2)
                    </h3>
                    <p className="text-slate-400 text-xs mb-6 max-w-sm">AI proposals requiring human approval before grid broadcast.</p>
                    
                    {pendingDirectives.length === 0 ? (
                       <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 flex items-center justify-center text-slate-500 text-sm font-bold h-32">
                         No Pending Proposals
                       </div>
                    ) : (
                       <div className="space-y-4">
                         {pendingDirectives.map(dir => (
                            <div key={dir.id} className="bg-slate-950/50 border border-amber-500/20 p-5 rounded-2xl group animate-in slide-in-from-right relative">
                               <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">{dir.source}</span>
                                  <span className="text-[10px] text-slate-500">Target: {dir.target_role.toUpperCase()}</span>
                               </div>
                               <h4 className="font-bold text-sm text-white mb-1 leading-snug">{dir.directive}</h4>
                               <p className="text-[10px] text-slate-500 line-clamp-2 italic">Basis: {dir.basis}</p>
                               <div className="flex gap-2 mt-4 relative z-20">
                                  <button onClick={() => handleApproveDirective(dir.id)} className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/50 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                                     <CheckCircle className="w-4 h-4" /> APPROVE
                                  </button>
                                  <button onClick={() => handleDiscardDirective(dir.id)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 py-2 px-4 rounded-xl text-xs font-bold transition-all border border-slate-700">
                                     DISCARD
                                  </button>
                               </div>
                            </div>
                         ))}
                       </div>
                    )}
                 </div>
              </div>

              {/* Universal Broadcast Override */}
              <div className="bg-gradient-to-br from-red-600 to-red-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl shadow-red-500/20">
                 <div className="relative z-10 flex flex-col h-full">
                    <h3 className="text-2xl font-bold mb-2">Universal Broadcast</h3>
                    <p className="text-red-100/70 text-sm mb-4 max-w-xs">Push urgent warnings directly to all active users instantly, overriding AI logic.</p>
                    <textarea 
                       value={overrideMessage}
                       onChange={e => setOverrideMessage(e.target.value)}
                       placeholder="Enter emergency directive..."
                       className="w-full bg-black/20 focus:bg-black/40 border border-white/20 rounded-xl p-4 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 ring-white/50 resize-none h-24 mb-4 font-mono"
                    />
                    <button 
                       onClick={handleManualOverride}
                       disabled={!overrideMessage.trim()}
                       className="bg-white text-red-600 font-bold px-8 py-3 rounded-2xl hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-xl shadow-black/20 disabled:cursor-not-allowed mt-auto"
                    >
                       SEND OVERRIDE
                    </button>
                 </div>
                 <div className="absolute -bottom-10 -right-10 opacity-10 transform rotate-12 pointer-events-none">
                    <Megaphone className="w-48 h-48" />
                 </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-8">
                 <div className="flex items-center justify-between mb-8">
                    <h3 className="font-bold text-xl">Collection Engine</h3>
                    <button onClick={launchCampaign} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-all"><Plus className="w-5 h-5" /></button>
                 </div>
                 <div className="space-y-4">
                    {campaigns.map((c, i) => (
                      <div key={i} className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl group">
                         <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">ACTIVE</span>
                            <span className="text-xs font-bold text-slate-300">+{c.reward_points} Pts</span>
                         </div>
                         <h4 className="font-bold text-sm mb-1">{c.title}</h4>
                         <p className="text-[10px] text-slate-500 line-clamp-2">{c.description}</p>
                      </div>
                    ))}
                 </div>
              </div>
 
               {/* Sentinel Network Intelligence (New Administrator Benefit) */}
               <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-8">
                   <div className="flex items-center justify-between mb-8">
                      <h3 className="font-bold text-xl flex items-center gap-3">
                         <Activity className="w-5 h-5 text-blue-400" />
                         Network Intel Grid
                      </h3>
                      <div className="flex flex-col items-end">
                         <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-400/10 px-3 py-1.5 rounded-lg border border-blue-400/20">Sync Active</span>
                         <span className="text-[8px] text-white/40 font-bold mt-1 uppercase">Global Storage: 1.8 TB / 5 TB</span>
                      </div>
                   </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     {networkStats.regions.map(r => (
                        <div key={r.id} className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl">
                           <div className="flex justify-between mb-3">
                              <span className="text-xs font-black text-white italic">{r.name}</span>
                              <span className="text-[10px] text-green-400 font-bold">{r.health}% Health</span>
                           </div>
                           <div className="flex items-end justify-between">
                              <div>
                                 <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Sync Nodes</p>
                                 <p className="text-xl font-black text-white">{r.nodes}</p>
                              </div>
                              <CheckCircle className="w-4 h-4 text-blue-500/50" />
                           </div>
                        </div>
                     ))}
                    <button
                        onClick={() => {
                          setIsIntelligenceOpen(true);
                          setCommandFeedback('Global patch review opened in Intelligence Desk. Confirm offline packs and city rollout before pushing to nodes.');
                        }}
                        className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex flex-col justify-center items-center text-center transition hover:bg-blue-600/15"
                     >
                        <Download className="w-6 h-6 text-blue-400 mb-2" />
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Global Patch</p>
                        <p className="text-[8px] text-blue-300/60 font-bold">Push MBTiles v2.1 to all nodes</p>
                     </button>
                  </div>
               </div>
            </div>
        </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col h-screen overflow-hidden">
      <header className="glass-panel ghost-border border-b px-6 py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-[3000]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-xl">
            <AFATLogo className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="font-black text-2xl text-white italic tracking-tighter uppercase leading-none">AFAT</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Sentinel Command Center</p>
          </div>
        </div>
        
        <ViewToggle mode={uiMode} onToggle={setUiMode} />

        <div className="flex items-center gap-4">
           <button onClick={onSignOut} className="text-error hover:text-on-surface flex items-center gap-2 text-sm bg-error/10 px-4 py-2 rounded-full transition-colors ghost-border font-bold">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Terminate</span>
           </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
         {uiMode === 'map' ? renderMapView() : renderGridUI()}
      </main>

      {isIntelligenceOpen && (
        <div className="fixed inset-0 z-[3500] bg-slate-950/80 backdrop-blur-xl p-4 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300/60">Intelligence desk</p>
                <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tight text-white">Compliance, payments, rollout, and orchestrator</h2>
                <p className="mt-2 max-w-2xl text-sm text-white/45">This is the admin follow-through layer for the buttons that should not feel decorative.</p>
              </div>
              <button onClick={() => setIsIntelligenceOpen(false)} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/60 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 gap-4 overflow-y-auto p-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Compliance pressure</h3>
                    <FileCheck className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Tracked</p>
                      <p className="mt-1 text-2xl font-black text-white">{complianceRadar?.summary?.total || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Verified</p>
                      <p className="mt-1 text-2xl font-black text-emerald-300">{complianceRadar?.summary?.verified || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Due soon</p>
                      <p className="mt-1 text-2xl font-black text-amber-300">{complianceRadar?.summary?.due_soon || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Overdue</p>
                      <p className="mt-1 text-2xl font-black text-red-300">{complianceRadar?.summary?.overdue || 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(complianceRadar?.records || []).slice(0, 5).map((record: any) => (
                      <div key={record.id} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-tight text-white">
                              {record.document_type || record.requirement_key || 'Compliance record'}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">
                              {record.profile_name || record.owner_name || record.profile_id || 'Unassigned'} · {record.status || 'pending'}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white/50">
                            {record.due_at ? 'dated' : 'queue'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleComplianceAction(record.id, 'verified', 'Verified from admin intelligence desk.')}
                            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-500/15"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => handleComplianceAction(record.id, 'needs_followup', 'Needs operator follow-up from admin intelligence desk.')}
                            className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-500/15"
                          >
                            Follow up
                          </button>
                          <button
                            onClick={() => handleComplianceAction(record.id, 'rejected', 'Rejected from admin intelligence desk pending corrected document.')}
                            className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-200 transition hover:bg-red-500/15"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                    {!(complianceRadar?.records || []).length && (
                      <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4 text-xs font-semibold text-white/45">
                        No compliance records loaded yet. New operator and company registrations will feed this queue.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Payment control</h3>
                    <CreditCard className="h-5 w-5 text-cyan-300" />
                  </div>
                  <p className="text-xs font-semibold text-white/55">Mode: {paymentReadiness?.mode || 'unknown'}</p>
                  <p className="mt-2 break-words text-[11px] font-mono text-cyan-100/70">{paymentReadiness?.callback_url || 'Callback not loaded'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={copyPaymentCallback} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white">Copy callback</button>
                    <button onClick={() => launchOrchestrator('Review payment readiness, callback truth, and the next deployment action.', 'AFAT orchestrator opened from the payment control desk.')} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white">Open orchestrator</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Backend target</h3>
                    <Database className="h-5 w-5 text-blue-300" />
                  </div>
                  <p className="break-words text-[11px] font-mono text-blue-100/70">{backendTarget}</p>
                  <p className="mt-2 text-xs text-white/45">Local frontend on `127.0.0.1` defaults to local API unless you explicitly force Render here.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => switchBackendTarget('render')} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white">Use Render</button>
                    <button onClick={() => switchBackendTarget('local')} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white">Use local backend</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-white">Map construction field</h3>
                      <p className="mt-1 text-xs text-white/45">Admin-only registration for chosen drivers, checkpoint stewards, and data-growth zones.</p>
                    </div>
                    <MapPin className="h-5 w-5 text-cyan-300" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={fieldDesk.checkpoint_name}
                      onChange={(e) => handleFieldDeskChange('checkpoint_name', e.target.value)}
                      placeholder="Checkpoint or zone name"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <input
                      value={fieldDesk.zone_label}
                      onChange={(e) => handleFieldDeskChange('zone_label', e.target.value)}
                      placeholder="Zone label"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <select
                      value={fieldDesk.city}
                      onChange={(e) => handleFieldDeskChange('city', e.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white focus:outline-none"
                    >
                      <option value="yaounde">Yaounde</option>
                      <option value="douala">Douala</option>
                      <option value="garoua">Garoua</option>
                      <option value="cameroon">Cameroon</option>
                    </select>
                    <select
                      value={fieldDesk.checkpoint_type}
                      onChange={(e) => handleFieldDeskChange('checkpoint_type', e.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white focus:outline-none"
                    >
                      <option value="community">Community</option>
                      <option value="terminal">Terminal</option>
                      <option value="market">Market</option>
                      <option value="agency">Agency</option>
                      <option value="safety">Safety</option>
                      <option value="authority">Authority</option>
                    </select>
                    <input
                      value={fieldDesk.latitude}
                      onChange={(e) => handleFieldDeskChange('latitude', e.target.value)}
                      placeholder="Latitude"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <input
                      value={fieldDesk.longitude}
                      onChange={(e) => handleFieldDeskChange('longitude', e.target.value)}
                      placeholder="Longitude"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                  </div>

                  <textarea
                    value={fieldDesk.notes}
                    onChange={(e) => handleFieldDeskChange('notes', e.target.value)}
                    placeholder="What should this zone collect: hazards, route gaps, fare pressure, pickup heat, checkpoint behavior..."
                    className="mt-3 min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                  />

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <select
                      value={fieldDesk.targetRole}
                      onChange={(e) => handleFieldDeskChange('targetRole', e.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white focus:outline-none"
                    >
                      <option value="operator">Operators</option>
                      <option value="planner">Planners</option>
                      <option value="commuter">Commuters</option>
                      <option value="admin">Admins</option>
                    </select>
                    <input
                      value={fieldDesk.targetSpecialization}
                      onChange={(e) => handleFieldDeskChange('targetSpecialization', e.target.value)}
                      placeholder="Taxi, bike, minibus, dispatch steward..."
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={submitFieldDesk}
                      disabled={isSavingFieldDesk}
                      className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {isSavingFieldDesk ? 'Registering...' : 'Register field zone'}
                    </button>
                    <button
                      onClick={notifyFieldCrew}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white"
                    >
                      Prepare field notice
                    </button>
                    <button
                      onClick={() => launchOrchestrator('Design the best data registration play for this new map construction zone and the chosen driver audience.', 'AFAT orchestrator opened from the map construction field desk.')}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white"
                    >
                      Ask orchestrator
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-white">Dispatch workbench</h3>
                      <p className="mt-1 text-xs text-white/45">Admin can push a direct assignment for operator or vehicle lanes even before customer-side traffic is live.</p>
                    </div>
                    <Activity className="h-5 w-5 text-amber-300" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={dispatchDesk.operator_id}
                      onChange={(e) => handleDispatchDeskChange('operator_id', e.target.value)}
                      placeholder="Operator id"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <input
                      value={dispatchDesk.vehicle_id}
                      onChange={(e) => handleDispatchDeskChange('vehicle_id', e.target.value)}
                      placeholder="Vehicle id"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <input
                      value={dispatchDesk.origin}
                      onChange={(e) => handleDispatchDeskChange('origin', e.target.value)}
                      placeholder="Origin"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <input
                      value={dispatchDesk.destination}
                      onChange={(e) => handleDispatchDeskChange('destination', e.target.value)}
                      placeholder="Destination"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <select
                      value={dispatchDesk.priority}
                      onChange={(e) => handleDispatchDeskChange('priority', e.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="emergency">Emergency</option>
                    </select>
                    <input
                      value={dispatchDesk.notes}
                      onChange={(e) => handleDispatchDeskChange('notes', e.target.value)}
                      placeholder="Dispatch notes"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={submitDispatchDesk}
                      disabled={isSavingDispatchDesk}
                      className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {isSavingDispatchDesk ? 'Assigning...' : 'Create dispatch'}
                    </button>
                    <button
                      onClick={() => launchOrchestrator('Review this admin dispatch request and recommend whether it should go to operator, vehicle, or service queue next.', 'AFAT orchestrator opened from the admin dispatch workbench.')}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white"
                    >
                      Ask orchestrator
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-blue-500/10 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">AI orchestrator</h3>
                    <Sparkles className="h-5 w-5 text-blue-200" />
                  </div>
                  <p className="text-sm font-semibold text-white/75">Strategy, guidance, and field analysis can now be opened directly from admin instead of hiding as a floating chat.</p>
                  <div className="mt-4 space-y-2">
                    <button onClick={() => launchOrchestrator('Summarize the platform state and tell me the next admin action to take.', 'AFAT orchestrator is now attached to the admin command center.')} className="w-full rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98]">Platform summary</button>
                    <button onClick={() => launchOrchestrator('Which incidents, compliance issues, and payment risks need action first?', 'AFAT orchestrator is now reviewing incidents, compliance, and payment risks together.')} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:text-white">Risk priorities</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Route-truth signals</h3>
                    <MapPin className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="space-y-3">
                    {(liveMapOps?.campaign_signals || []).slice(0, 5).map((signal: any, index: number) => (
                      <div key={signal.id || index} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight text-white">
                              {signal.signal_type || 'field signal'}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">
                              {signal.city || 'city'} · {signal.publish_channel || 'ops'} · {signal.signal_age_seconds ? `${signal.signal_age_seconds}s ago` : 'fresh'}
                            </p>
                          </div>
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-cyan-100">
                            {signal.review_status || 'new'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleRouteSignalReview(signal, 'queued')}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/60 transition hover:text-white"
                          >
                            Queue
                          </button>
                          <button
                            onClick={() => handleRouteSignalReview(signal, 'validated')}
                            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-500/15"
                          >
                            Validate
                          </button>
                          <button
                            onClick={() => handleRouteSignalReview(signal, 'dismissed')}
                            className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-200 transition hover:bg-red-500/15"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={() => handleRouteSignalReview(signal, 'published')}
                            className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-500/15"
                          >
                            Publish
                          </button>
                        </div>
                      </div>
                    ))}
                    {!(liveMapOps?.campaign_signals || []).length && (
                      <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4 text-xs font-semibold text-white/45">
                        No campaign signals yet. Commuter data missions and checkpoint reports will appear here after publication.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Rollout actions</h3>
                  <div className="mt-4 space-y-3 text-[11px] text-white/55">
                    <p>Move permit renewal from passive records to action queues with expiry reminders.</p>
                    <p>Deploy live payment readiness only after callback truth and Render env parity are confirmed together.</p>
                    <p>Use campaigns and checkpoint stewards to deepen city data before selling the map as the moat.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

