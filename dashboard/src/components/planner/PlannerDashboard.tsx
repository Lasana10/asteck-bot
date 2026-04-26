import React, { useState, useEffect } from 'react';
import { ShieldAlert, BarChart3, LogOut, Activity, Users, AlertCircle, TrendingUp } from 'lucide-react';
import { InteractiveMap } from '../shared/InteractiveMap';
import { supabase } from '../../supabaseClient';
import { INFRA_CONFIG } from '../../infra/config';
import { ExternalLink, Terminal, Database, Cpu } from 'lucide-react';

interface Props {
  onSignOut: () => void;
}

export function PlannerDashboard({ onSignOut }: Props) {
  const [stats, setStats] = useState({
    totalIncidents: 0,
    activeOperators: 0,
    gridPulses: 0,
    avgSeverity: 0,
  });
  const [incidents, setIncidents] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);

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
      gridPulses: pulseCount || 0
    }));
  };

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
             { label: 'Network Health', val: '98%', icon: Activity, color: 'text-emerald-500' }
           ].map((m, i) => (
             <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl group hover:border-slate-700 transition-colors">
                <m.icon className={`w-5 h-5 ${m.color} mb-4`} />
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">{m.label}</p>
                <p className="text-2xl font-bold">{m.val}</p>
             </div>
           ))}
        </div>

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

        {/* Infrastructure Control - Supporting Tools */}
        <div className="bg-slate-900/50 border border-white/5 rounded-[40px] p-8 mt-12">
            <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-xl font-bold flex items-center gap-2">
                       <Terminal className="w-5 h-5 text-blue-500" />
                       Infrastructure Control
                   </h3>
                   <p className="text-sm text-slate-500 mt-1">Direct access to scaling and monitoring engines.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Traccar */}
                <a href={INFRA_CONFIG.traccar.dashboard} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><Activity className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Traccar GPS</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Real-time Fleet Telemetry</p>
                </a>

                {/* Grafana */}
                <a href={INFRA_CONFIG.grafana.url} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500"><BarChart3 className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">Grafana Analytics</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Heatmaps & Safety Trends</p>
                </a>

                {/* n8n */}
                <a href={INFRA_CONFIG.n8n.url} target="_blank" rel="noreferrer" className="bg-slate-950 border border-white/5 p-6 rounded-3xl hover:border-slate-700 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500"><Cpu className="w-6 h-6" /></div>
                        <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-purple-500 transition-colors" />
                    </div>
                    <h4 className="font-bold mb-1">n8n Automator</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Webhook Orchestration</p>
                </a>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-600">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2"><Database className="w-3 h-3" /> Supabase: {INFRA_CONFIG.supabase.dashboard.split('/').pop()}</span>
                    <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> GPS Bridge: ACTIVE</span>
                </div>
                <span>v2.4.0-STABLE</span>
            </div>
        </div>

      </div>
    </div>
  );
}
