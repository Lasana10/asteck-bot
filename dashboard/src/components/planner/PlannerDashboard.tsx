import React, { useState, useEffect } from 'react';
import { ShieldAlert, BarChart3, LogOut, Activity, Users, AlertCircle, TrendingUp, Radio, Route, CheckCircle, XCircle, Siren } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import {
  createDispatchAssignment,
  fetchComplianceRadar,
  fetchActiveDispatches,
  fetchDemandRadar,
  fetchOpsReportCenter,
  fetchPassageIntents,
  fetchSafetyScore,
  getCompanyMembership,
  sendOpsNotification,
  supabase,
  updatePassageIntentStatus,
  updateOpsReportStatus
} from '../../supabaseClient';
import { Terminal, Database, Cpu } from 'lucide-react';

interface Props {
  onSignOut: () => void;
}

export function PlannerDashboard({ onSignOut }: Props) {
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
  const [passageQueue, setPassageQueue] = useState<any[]>([]);
  const [opsMessage, setOpsMessage] = useState('');
  const [missionInFlight, setMissionInFlight] = useState<string | null>(null);

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

    const [reportRes, safetyRes, demandRes, dispatchRes, complianceRes, passageRes] = await Promise.all([
      fetchOpsReportCenter(),
      fetchSafetyScore(3.866, 11.514, 8),
      fetchDemandRadar(),
      fetchActiveDispatches(),
      fetchComplianceRadar(),
      fetchPassageIntents({ open: true }),
    ]);

    if (reportRes.data) setReportCenter(reportRes.data);
    if (safetyRes.data) setSafetyScore(safetyRes.data);
    if (demandRes.data) setDemandRadar(demandRes.data);
    if (dispatchRes.data?.dispatches) setDispatches(dispatchRes.data.dispatches);
    if (complianceRes.data) setComplianceRadar(complianceRes.data);
    if (passageRes.data?.passages) setPassageQueue(passageRes.data.passages);
  };

  const markPassageForRecovery = async (passageId: string) => {
    const { error } = await updatePassageIntentStatus(passageId, { status: 'recovery' });
    setOpsMessage(error ? error.message : 'Passage moved into recovery review.');
    fetchIntelligence();
  };

  const notifyOperatorsForPassage = async (passage: any) => {
    if (!passage?.id) return;
    setMissionInFlight(passage.id);
    const { error, data } = await sendOpsNotification({
      role: 'operator',
      city: 'yaounde',
      channels: ['in_app'],
      type: 'passage_match_request',
      reference_id: passage.id,
      title: 'AFAT passage needs an operator',
      body: `${passage.origin_text || 'Origin to confirm'} -> ${passage.destination_text || 'destination'} | Meeting point: ${passage.afat_meeting_points?.name || passage.meeting_point_name || 'pending'} | Confidence: ${passage.place_confidence ?? 'pending'}%`,
    });
    setMissionInFlight(null);
    setOpsMessage(error ? error.message : `Operator alert sent to ${data?.recipient_count || 0} eligible profiles.`);
  };

  const launchFieldMission = async (targetRole: 'commuter' | 'operator' | 'checkpoint') => {
    setMissionInFlight(targetRole);
    const city = 'yaounde';
    const missionCopy: Record<typeof targetRole, { title: string; body: string }> = {
      commuter: {
        title: 'AFAT field mission: validate a pickup point',
        body: 'When you pass a known landmark today, submit whether the entrance is reachable by car, moto, and walking. Add the local name people actually use.',
      },
      operator: {
        title: 'AFAT operator mission: report route truth',
        body: 'During your next route, report blocked roads, safe stopping points, and failed pickup locations. Your signal improves AFAT meeting-point confidence.',
      },
      checkpoint: {
        title: 'AFAT checkpoint mission: confirm local access',
        body: 'Confirm landmark names, nearby entrances, and whether passengers can safely wait there. Mark contradictions for operations review.',
      },
    };
    const recipientRole = targetRole === 'checkpoint' ? 'planner' : targetRole;

    const { error, data } = await sendOpsNotification({
      role: recipientRole,
      city,
      channels: ['in_app'],
      type: 'map_collection_mission',
      title: missionCopy[targetRole].title,
      body: missionCopy[targetRole].body,
    });

    setMissionInFlight(null);
    setOpsMessage(error ? error.message : `Field mission sent to ${data?.recipient_count || 0} ${targetRole === 'checkpoint' ? 'planner/steward' : targetRole} profiles in ${city}.`);
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
    const openPassage = passageQueue.find((passage) => !['assigned', 'driver_acknowledged', 'driver_arrived'].includes(String(passage.status || '').toLowerCase()));

    if (!firstVehicle?.operator_id && !firstVehicle?.id) {
      setOpsMessage('Dispatch blocked: no live operator or vehicle is available. Send an operator field mission or wait for live fleet telemetry.');
      return;
    }

    if (!firstRoute?.id && !openPassage?.id) {
      setOpsMessage('Dispatch blocked: no booking or active passage intent is waiting for assignment.');
      return;
    }

    if (openPassage?.id && firstVehicle?.operator_id) {
      const { error } = await updatePassageIntentStatus(openPassage.id, {
        status: 'assigned',
        operator_id: firstVehicle.operator_id,
      });
      if (error) {
        setOpsMessage(error.message);
        return;
      }
      setOpsMessage(`Passage assigned to operator ${String(firstVehicle.operator_id).slice(0, 8)}. The operator can now acknowledge the shared meeting point.`);
      fetchIntelligence();
      return;
    }

    const { error } = await createDispatchAssignment({
      operator_id: firstVehicle?.operator_id,
      vehicle_id: firstVehicle?.id,
      booking_id: firstRoute?.id || openPassage?.booking_id || null,
      route_id: firstRoute?.route_id,
      origin: firstRoute?.routes?.origin || openPassage?.origin_text || 'Yaounde Grid',
      destination: firstRoute?.routes?.destination || openPassage?.destination_text || 'High-demand sector',
      priority: demandRadar?.summary?.recommendation === 'add_supply' ? 'high' : 'normal',
      notes: openPassage?.id
        ? `Created from planner demand radar for passage ${openPassage.id}.`
        : 'Created from planner demand radar.',
      pickup_lat: openPassage?.meeting_point?.latitude || openPassage?.pickup_lat || null,
      pickup_lng: openPassage?.meeting_point?.longitude || openPassage?.pickup_lng || null,
    });
    setOpsMessage(error ? error.message : 'Dispatch assigned from demand radar.');
    fetchIntelligence();
  };

  useEffect(() => {
    const profileId = localStorage.getItem('afat_user_id');
    if (!profileId) return;
    getCompanyMembership(profileId).then(({ data }) => setCompanyContext(data || null));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 leading-none">AFAT</h1>
            <p className="text-[10px] font-mono text-purple-400 uppercase tracking-widest mt-1">City Planner Terminal</p>
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
              <h2 className="text-3xl font-bold tracking-tight">Mobility Intelligence</h2>
              <p className="text-slate-500 mt-1">Real-time infrastructure health and movement analytics for Yaoundé.</p>
           </div>
           <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-tighter">
              <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-2">
                 <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping"></div>
                 Network: Optimal
              </span>
           </div>
        </div>

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
           <div className="lg:col-span-2 h-[500px]">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                 <Activity className="w-5 h-5 text-purple-500" />
                 Jurisdiction Heatmap
              </h3>
              <InteractiveMap incidents={incidents} tracks={tracks} role="admin" />
           </div>

           <div className="space-y-6">
              <h3 className="font-bold text-lg flex items-center gap-2">
                 <BarChart3 className="w-5 h-5 text-purple-500" />
                 Analytics Stream
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
            {opsMessage && <p className="text-[11px] text-blue-300 mt-4">{opsMessage}</p>}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
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

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
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
                  <button onClick={() => handleReportAction(report.id, 'verified')} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleReportAction(report.id, 'resolved')} className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Activity className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleReportAction(report.id, 'dismissed')} className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-400" />
                Live Passage Queue
              </h3>
              <p className="text-xs text-slate-500 mt-1">Requests needing matching, pickup coordination, or recovery.</p>
            </div>
            <span className="text-xs text-blue-300">{passageQueue.length} active</span>
          </div>
          <div className="grid lg:grid-cols-2 gap-3">
            {passageQueue.slice(0, 8).map((passage) => (
              <div key={passage.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-white">{passage.origin_text || 'Origin to confirm'} → {passage.destination_text}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{passage.afat_meeting_points?.name || passage.meeting_point?.name || passage.meeting_point_name || 'Meeting point pending'}</p>
                  </div>
                  <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-blue-500/10 text-blue-300">{String(passage.status || 'requested').replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center justify-between mt-4 text-[10px] text-slate-500">
                  <span>Place confidence: {passage.place_confidence ?? '—'}%</span>
                  <span>{passage.arrival_target ? new Date(passage.arrival_target).toLocaleString() : 'Flexible arrival'}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => notifyOperatorsForPassage(passage)} disabled={missionInFlight === passage.id} className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-[9px] font-black uppercase text-blue-300 disabled:opacity-50">
                    Alert operators
                  </button>
                  <button onClick={() => markPassageForRecovery(passage.id)} className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[9px] font-black uppercase text-amber-300">
                    Start recovery review
                  </button>
                </div>
              </div>
            ))}
            {passageQueue.length === 0 && <p className="text-sm text-slate-600 py-8">No active passage intents yet. Passenger requests will appear here when created.</p>}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                Field Mapping Missions
              </h3>
              <p className="text-xs text-slate-500 mt-1">Send targeted collection work to people already moving through the city.</p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Yaounde pilot</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <button onClick={() => launchFieldMission('commuter')} disabled={missionInFlight === 'commuter'} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-left transition-all hover:bg-emerald-400/15 disabled:opacity-50">
              <p className="text-xs font-black uppercase text-white">Commuter validation</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Ask riders to confirm landmark names, entrances, and reachable waiting points.</p>
            </button>
            <button onClick={() => launchFieldMission('operator')} disabled={missionInFlight === 'operator'} className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-left transition-all hover:bg-blue-400/15 disabled:opacity-50">
              <p className="text-xs font-black uppercase text-white">Operator route truth</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Ask drivers to report road access, blocked corridors, and safe stop points.</p>
            </button>
            <button onClick={() => launchFieldMission('checkpoint')} disabled={missionInFlight === 'checkpoint'} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-left transition-all hover:bg-amber-400/15 disabled:opacity-50">
              <p className="text-xs font-black uppercase text-white">Checkpoint confirmation</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Ask local stewards to confirm contradictions before AFAT raises confidence.</p>
            </button>
          </div>
        </div>

        {/* Infrastructure Control - Supporting Tools */}
        <div className="bg-slate-900/50 border border-white/5 rounded-[40px] p-8 mt-12">
            <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-xl font-bold flex items-center gap-2">
                       <Terminal className="w-5 h-5 text-blue-500" />
                       AFAT Operations Backbone
                   </h3>
                   <p className="text-sm text-slate-500 mt-1">Fleet visibility, safety intelligence, and dispatch automation owned from one planner surface.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button onClick={() => setOpsMessage('Fleet telemetry opened inside AFAT: review live vehicles, route traces, and operator readiness from the dispatch queue.')} className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group text-left">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><Activity className="w-6 h-6" /></div>
                        <Activity className="w-4 h-4 text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Fleet Telemetry</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Live vehicles, route traces, and operator readiness</p>
                </button>

                <button onClick={() => setOpsMessage('Safety analytics opened inside AFAT: combine incidents, failed pickups, demand heat, and recovery risk before dispatching.')} className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group text-left">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500"><BarChart3 className="w-6 h-6" /></div>
                        <BarChart3 className="w-4 h-4 text-slate-700 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Safety Analytics</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Demand heat, disruption risk, and service reliability</p>
                </button>

                <button onClick={() => setOpsMessage('Automation rules opened inside AFAT: prepare alerts, callback handling, review queues, and recovery workflows.')} className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group text-left">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500"><Cpu className="w-6 h-6" /></div>
                        <Cpu className="w-4 h-4 text-slate-700 group-hover:text-purple-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Workflow Automation</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Alerts, reviews, callbacks, and recovery flows</p>
                </button>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-600">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2"><Database className="w-3 h-3" /> Data Core: CONNECTED</span>
                    <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Telemetry Bridge: ACTIVE</span>
                </div>
                <span>v2.4.0-STABLE</span>
            </div>
        </div>

      </div>
    </div>
  );
}
