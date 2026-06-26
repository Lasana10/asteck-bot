import React, { useState, useEffect } from 'react';
import { ShieldAlert, BarChart3, LogOut, Activity, Users, AlertCircle, TrendingUp, Radio, Route, CheckCircle, XCircle, Siren } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import {
  createDispatchAssignment,
  fetchComplianceRadar,
  fetchActiveDispatches,
  fetchDemandRadar,
  fetchOpsReportCenter,
  fetchSafetyScore,
  getCompanyMembership,
  supabase,
  updateOpsReportStatus
} from '../../supabaseClient';
import { INFRA_CONFIG } from '../../infra/config';
import { ExternalLink, Terminal, Database, Cpu } from 'lucide-react';
import { OperationsMissionControl } from '../shared/OperationsMissionControl';
import { AFATStrategicLayer } from '../shared/AFATStrategicLayer';

interface Props {
  onSignOut: () => void;
  activeTab?: string;
}

export function PlannerDashboard({ onSignOut, activeTab = 'home' }: Props) {
  const [stats, setStats] = useState({
    totalIncidents: 0,
    activeOperators: 0,
    gridPulses: 0,
    avgSeverity: 0,
    companies: 0,
  });
  const [incidents, setIncidents] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [companyContext, setCompanyContext] = useState<any>(null);
  const [reportCenter, setReportCenter] = useState<any>(null);
  const [safetyScore, setSafetyScore] = useState<any>(null);
  const [demandRadar, setDemandRadar] = useState<any>(null);
  const [complianceRadar, setComplianceRadar] = useState<any>(null);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [opsMessage, setOpsMessage] = useState('');
  const [dispatchForm, setDispatchForm] = useState({
    operator_id: '',
    vehicle_id: '',
    origin: 'Yaounde Grid',
    destination: 'Priority sector',
    priority: 'high',
    notes: 'Planner manual dispatch coordination.',
  });
  const [isDispatching, setIsDispatching] = useState(false);

  useEffect(() => {
    fetchIntelligence();
    const interval = setInterval(fetchIntelligence, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchIntelligence = async () => {
    // 1. Fetch Incidents
    const { data: incidentData } = await supabase.from('incidents').select('*').neq('status', 'false');
    if (incidentData) {
       setIncidents(incidentData);
       const avgSev = incidentData.reduce((acc, curr) => acc + curr.severity, 0) / (incidentData.length || 1);
       setStats(prev => ({ ...prev, totalIncidents: incidentData.length, avgSeverity: Number(avgSev.toFixed(1)) || 0 }));
    }

    // 2. Fetch Active Operators
    const { count: operatorCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('is_available', true);
    const { count: companyCount } = await supabase.from('companies').select('*', { count: 'exact', head: true });
    
    // 3. Fetch Grid Pulses (GPS Tracks in last 5 mins)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: trackData, count: pulseCount } = await supabase
      .from('gps_tracks')
      .select('*', { count: 'exact' })
      .gt('created_at', fiveMinsAgo);
    
    if (trackData) {
      setTracks(trackData.map((t: any) => ({
        latitude: parseFloat(t.location.match(/\((.*) (.*)\)/)[2]),
        longitude: parseFloat(t.location.match(/\((.*) (.*)\)/)[1])
      })));
    }
    
    setStats(prev => ({ 
      ...prev, 
      activeOperators: operatorCount || 0,
      gridPulses: pulseCount || 0,
      companies: companyCount || 0
    }));

    const [reportRes, safetyRes, demandRes, dispatchRes, complianceRes] = await Promise.all([
      fetchOpsReportCenter(),
      fetchSafetyScore(3.866, 11.514, 8),
      fetchDemandRadar(),
      fetchActiveDispatches(),
      fetchComplianceRadar(),
    ]);

    if (reportRes.data) setReportCenter(reportRes.data);
    if (safetyRes.data) setSafetyScore(safetyRes.data);
    if (demandRes.data) setDemandRadar(demandRes.data);
    if (dispatchRes.data?.dispatches) setDispatches(dispatchRes.data.dispatches);
    if (complianceRes.data) setComplianceRadar(complianceRes.data);
  };

  const handleReportAction = async (id: string, status: 'verified' | 'resolved' | 'dismissed') => {
    const profileId = localStorage.getItem('afat_user_id') || undefined;
    const { error } = await updateOpsReportStatus(id, status, profileId);
    setOpsMessage(error ? error.message : `Report marked ${status}.`);
    fetchIntelligence();
  };

  const handleQuickDispatch = async () => {
    const firstVehicle = demandRadar?.vehicles?.[0];
    const firstRoute = demandRadar?.routes?.[0];
    const { error } = await createDispatchAssignment({
      operator_id: firstVehicle?.operator_id,
      vehicle_id: firstVehicle?.id,
      booking_id: firstRoute?.id,
      route_id: firstRoute?.route_id,
      origin: firstRoute?.routes?.origin || 'Yaounde Grid',
      destination: firstRoute?.routes?.destination || 'High-demand sector',
      priority: demandRadar?.summary?.recommendation === 'add_supply' ? 'high' : 'normal',
      notes: 'Auto-created from planner demand radar.',
    });
    setOpsMessage(error ? error.message : 'Dispatch assigned from demand radar.');
    fetchIntelligence();
  };

  const handleDispatchField = (key: string, value: string) => {
    setDispatchForm((prev) => ({ ...prev, [key]: value }));
  };

  const openPlannerOrchestrator = (prompt: string, intro: string) => {
    window.dispatchEvent(new CustomEvent('afat:open-copilot', { detail: { prompt, intro } }));
  };

  const jumpToSection = (sectionId: string, message: string) => {
    setOpsMessage(message);
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const createManualDispatch = async () => {
    if (!dispatchForm.operator_id.trim() && !dispatchForm.vehicle_id.trim()) {
      setOpsMessage('Add an operator or vehicle id for manual dispatch.');
      return;
    }

    setIsDispatching(true);
    const dispatcherId = localStorage.getItem('afat_user_id') || undefined;
    const { error } = await createDispatchAssignment({
      operator_id: dispatchForm.operator_id.trim() || undefined,
      vehicle_id: dispatchForm.vehicle_id.trim() || undefined,
      dispatcher_id: dispatcherId,
      origin: dispatchForm.origin.trim(),
      destination: dispatchForm.destination.trim(),
      priority: dispatchForm.priority,
      notes: dispatchForm.notes.trim(),
    });
    setIsDispatching(false);
    setOpsMessage(error ? error.message : 'Manual dispatch queued from planner workbench.');
    if (!error) {
      setDispatchForm((prev) => ({ ...prev, operator_id: '', vehicle_id: '' }));
      fetchIntelligence();
    }
  };

  useEffect(() => {
    const profileId = localStorage.getItem('afat_user_id');
    if (!profileId) return;
    getCompanyMembership(profileId).then(({ data }) => setCompanyContext(data || null));
  }, []);

  useEffect(() => {
    const tabTargets: Record<string, { id: string; message: string }> = {
      home: { id: 'planner-live-map', message: 'Planner map opened. This is the operating view for heat, reports, and GPS tracks.' },
      bookings: { id: 'planner-report-center', message: 'Report Center opened from planner navigation.' },
      notifications: { id: 'planner-report-center', message: 'Alert signals opened from planner navigation.' },
      profile: { id: 'planner-compliance-radar', message: 'Planner profile context is tied to company and compliance readiness.' },
    };
    const target = tabTargets[activeTab];
    if (!target) return;
    window.requestAnimationFrame(() => {
      document.getElementById(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setOpsMessage(target.message);
    });
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 leading-none">AFAT</h1>
            <p className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest mt-1">Planning Grid</p>
          </div>
        </div>
        <button onClick={onSignOut} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm bg-slate-800 px-4 py-2 rounded-full transition-colors border border-slate-700">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </header>

      <div className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
              <h2 className="text-3xl font-bold tracking-tight">AFAT Planning Grid</h2>
              <p className="text-slate-500 mt-1">Live movement, safety, dispatch pressure, and infrastructure readiness for your jurisdiction.</p>
           </div>
           <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-tighter">
              <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-2">
                 <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping"></div>
                 Network: Optimal
              </span>
           </div>
        </div>

        <OperationsMissionControl
          role="planner"
          city="yaounde"
          onAction={(action) => {
            if (action === 'dispatch') handleQuickDispatch();
            if (action === 'report') jumpToSection('planner-report-center', 'Report Center opened. Verify, resolve, or dismiss field signals from here.');
            if (action === 'compliance') jumpToSection('planner-compliance-radar', 'Compliance Radar opened. Review permits, expiry pressure, and onboarding readiness.');
            if (action === 'onboard') jumpToSection('planner-compliance-radar', 'Onboarding readiness is tied to company context and compliance records here.');
          }}
        />

        <AFATStrategicLayer
          role="planner"
          liveVehicles={stats.activeOperators}
          liveIncidents={stats.totalIncidents}
          onAction={(action) => {
            if (action === 'dispatch') handleQuickDispatch();
            if (action === 'report') jumpToSection('planner-report-center', 'Report Center opened from the strategy layer.');
            if (action === 'compliance') jumpToSection('planner-compliance-radar', 'Compliance radar is active here.');
            if (action === 'onboard') jumpToSection('planner-compliance-radar', 'Company and agency onboarding package is visible in compliance radar.');
            if (action === 'map') jumpToSection('planner-live-map', 'Jurisdiction heatmap opened. Live reports and GPS tracks feed this map.');
          }}
        />

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           {[
             { label: 'Active Hazards', val: stats.totalIncidents, icon: AlertCircle, color: 'text-red-500' },
             { label: 'Live Fleets', val: stats.activeOperators, icon: Users, color: 'text-blue-500' },
             { label: 'Grid Pulses', val: stats.gridPulses, icon: TrendingUp, color: 'text-purple-500' },
             { label: 'Companies', val: stats.companies, icon: Users, color: 'text-cyan-500' }
           ].map((m, i) => (
             <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl group hover:border-slate-700 transition-colors">
                <m.icon className={`w-5 h-5 ${m.color} mb-4`} />
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">{m.label}</p>
                <p className="text-2xl font-bold">{m.val}</p>
             </div>
           ))}
        </div>

        {companyContext?.companies && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-2">Company Context</p>
            <h3 className="text-xl font-bold">{companyContext.companies.name}</h3>
            <p className="text-sm text-slate-400 mt-1">
              Fleet size: {companyContext.companies.fleet_size || 'n/a'} · Membership: {companyContext.role}
            </p>
          </div>
        )}

        {/* Intelligence Map Section */}
        <div className="grid lg:grid-cols-3 gap-8">
           <div id="planner-live-map" className="lg:col-span-2 h-[500px] scroll-mt-24">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                 <Activity className="w-5 h-5 text-purple-500" />
                 AFAT Territory Map
              </h3>
              <InteractiveMap incidents={incidents} tracks={tracks} role="planner" />
           </div>

           <div className="space-y-6">
              <h3 className="font-bold text-lg flex items-center gap-2">
                 <BarChart3 className="w-5 h-5 text-purple-500" />
                 Signal Stream
              </h3>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-[440px] overflow-y-auto space-y-4">
                 {incidents.slice(0, 10).map((inc, i) => (
                   <div key={i} className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl animate-fade-up">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-[10px] font-mono text-slate-500">{new Date(inc.created_at).toLocaleTimeString()}</span>
                         <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded border ${
                            inc.severity > 3 ? 'text-red-400 border-red-500/20 bg-red-500/5' : 'text-amber-400 border-amber-500/20 bg-amber-500/5'
                         }`}>
                            LVL {inc.severity}
                         </span>
                      </div>
                      <p className="text-xs font-bold capitalize">{inc.type.replace('_', ' ')}</p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{inc.address || 'Location Verified'}</p>
                   </div>
                 ))}
                 {incidents.length === 0 && <p className="text-center text-slate-700 font-mono text-xs py-20">No data streams detected.</p>}
              </div>
           </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div id="planner-dispatch-workbench" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:col-span-2 scroll-mt-24">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Route className="w-5 h-5 text-cyan-400" />
                Planner Workbench
              </h3>
              <button
                onClick={() => openPlannerOrchestrator(
                  'Summarize the highest-value dispatch, safety, and compliance actions for Yaounde right now.',
                  'AFAT orchestrator opened from the planner workbench.'
                )}
                className="text-[10px] font-black uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-3 py-2 rounded-xl"
              >
                Open orchestrator
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={dispatchForm.operator_id}
                onChange={(e) => handleDispatchField('operator_id', e.target.value)}
                placeholder="Operator ID"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <input
                value={dispatchForm.vehicle_id}
                onChange={(e) => handleDispatchField('vehicle_id', e.target.value)}
                placeholder="Vehicle ID"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <input
                value={dispatchForm.origin}
                onChange={(e) => handleDispatchField('origin', e.target.value)}
                placeholder="Origin"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <input
                value={dispatchForm.destination}
                onChange={(e) => handleDispatchField('destination', e.target.value)}
                placeholder="Destination"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <select
                value={dispatchForm.priority}
                onChange={(e) => handleDispatchField('priority', e.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <button
                onClick={createManualDispatch}
                disabled={isDispatching}
                className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98] disabled:opacity-50"
              >
                {isDispatching ? 'Dispatching...' : 'Create manual dispatch'}
              </button>
            </div>
            <textarea
              value={dispatchForm.notes}
              onChange={(e) => handleDispatchField('notes', e.target.value)}
              placeholder="Planner notes"
              className="mt-3 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            {opsMessage && <p className="mt-4 text-[11px] text-cyan-300">{opsMessage}</p>}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
                Safety Score
              </h3>
              <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${
                safetyScore?.level === 'stable' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                safetyScore?.level === 'caution' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                'text-red-400 border-red-500/20 bg-red-500/10'
              }`}>
                {safetyScore?.level || 'syncing'}
              </span>
            </div>
            <p className="text-5xl font-black tracking-tighter">{safetyScore?.score || reportCenter?.summary?.safety_score || 100}</p>
            <p className="text-xs text-slate-500 mt-2">Nearby incidents: {safetyScore?.incident_count || 0} · Severe: {safetyScore?.severe_count || 0}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-400" />
                Demand Radar
              </h3>
              <button onClick={handleQuickDispatch} className="text-[10px] font-black uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-xl">
                Assign
              </button>
            </div>
            <p className="text-3xl font-black">{demandRadar?.summary?.pressure ?? 0}</p>
            <p className="text-xs text-slate-500 mt-2">
              {demandRadar?.summary?.booking_count || 0} bookings · {demandRadar?.summary?.active_vehicles || 0} live vehicles · {demandRadar?.summary?.recommendation || 'balanced'}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-5">
              <Route className="w-5 h-5 text-purple-400" />
              Dispatch Queue
            </h3>
            <p className="text-3xl font-black">{dispatches.length}</p>
            <p className="text-xs text-slate-500 mt-2">Queued, assigned, en-route and arrival jobs.</p>
          </div>
        </div>

        <div id="planner-compliance-radar" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 scroll-mt-24">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              Compliance Radar
            </h3>
            <span className="text-xs text-slate-500">{complianceRadar?.summary?.total || 0} tracked records</span>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Score</p>
              <p className="text-3xl font-black mt-1">{complianceRadar?.summary?.score ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Verified</p>
              <p className="text-3xl font-black mt-1 text-emerald-400">{complianceRadar?.summary?.verified ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Due Soon</p>
              <p className="text-3xl font-black mt-1 text-amber-400">{complianceRadar?.summary?.due_soon ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Overdue</p>
              <p className="text-3xl font-black mt-1 text-red-400">{complianceRadar?.summary?.overdue ?? 0}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
            {Object.entries(complianceRadar?.by_role || {}).map(([role, count]) => (
              <span key={role} className="px-3 py-1 rounded-full border border-slate-700 bg-slate-950/60 text-slate-300">
                {role}: {String(count)}
              </span>
            ))}
          </div>
        </div>

        <div id="planner-report-center" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 scroll-mt-24">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Siren className="w-5 h-5 text-red-400" />
              Report Center
            </h3>
            <span className="text-xs text-slate-500">{reportCenter?.summary?.active || incidents.length} active signals</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {(reportCenter?.reports || incidents).slice(0, 6).map((report: any) => (
              <div key={report.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-white">{String(report.type || 'incident').replace('_', ' ')}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{report.description || report.address || 'Verified location signal'}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                    Number(report.severity || 0) >= 4 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    LVL {report.severity || 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button title="Verify report" onClick={() => handleReportAction(report.id, 'verified')} className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4" />
                    Verify
                  </button>
                  <button title="Resolve report" onClick={() => handleReportAction(report.id, 'resolved')} className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-400 border border-blue-500/20">
                    <Activity className="w-4 h-4" />
                    Resolve
                  </button>
                  <button title="Dismiss report" onClick={() => handleReportAction(report.id, 'dismissed')} className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 border border-red-500/20">
                    <XCircle className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AFAT Operations Bridges */}
        <div className="bg-slate-900/50 border border-white/5 rounded-[40px] p-8 mt-12">
            <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-xl font-bold flex items-center gap-2">
                       <Terminal className="w-5 h-5 text-blue-500" />
                       AFAT Operations Bridges
                   </h3>
                   <p className="text-sm text-slate-500 mt-1">Operator telemetry, infrastructure insight, and automation relays that support the AFAT control layer.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Fleet telemetry bridge */}
                <a href={INFRA_CONFIG.traccar.dashboard} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><Activity className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Fleet Telemetry Bridge</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Live vehicle movement and dispatch feed</p>
                </a>

                {/* Planning observatory */}
                <a href={INFRA_CONFIG.grafana.url} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500"><BarChart3 className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Planning Observatory</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Heatmaps, pressure trends, and system health</p>
                </a>

                {/* Automation relay */}
                <a href={INFRA_CONFIG.n8n.url} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500"><Cpu className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-purple-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Automation Relay</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Workflows, alerts, and response automation</p>
                </a>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-600">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2"><Database className="w-3 h-3" /> Supabase: {INFRA_CONFIG.supabase.dashboard.split('/').pop()}</span>
                    <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Movement Relay: ACTIVE</span>
                </div>
                <span>v2.4.0-STABLE</span>
            </div>
        </div>

      </div>
    </div>
  );
}
