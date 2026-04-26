import React, { useState, useEffect } from 'react';
import { ViewToggle } from '../shared/ViewToggle';
import { InteractiveMap } from '../shared/InteractiveMap';
import { ShieldAlert, LogOut, Database, Megaphone, Target, Settings, Users, ArrowUpRight, Plus, AlertCircle, Activity, MapPin, Download, CheckCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { RevenueDashboard } from './RevenueDashboard';
import { AFATLogo } from '../shared/AFATLogo';
import { mapOfflineService } from '../../services/MapOfflineService';

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

  const fetchAdminData = async () => {
    // 1. Fetch Users
    const { data: userData } = await supabase.from('profiles').select('*').limit(5);
    if (userData) setProfiles(userData);

    // 2. Fetch Campaigns
    const { data: campData } = await supabase.from('collection_campaigns').select('*');
    if (campData) setCampaigns(campData);

    // Fetch Directives
    const { data: dirData } = await supabase.from('sentinel_directives').select('*').eq('status', 'pending_admin').order('created_at', { ascending: false });
    if (dirData) setPendingDirectives(dirData);

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
    alert('Universal Broadcast Sent!');
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

    return (
    <div className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500 pt-24">
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
                 <button className="text-xs bg-slate-800 hover:bg-slate-700 font-bold px-4 py-2 rounded-xl transition-all border border-slate-700">
                    Export DB
                 </button>
              </div>
              <div className="p-4 space-y-2">
                 {profiles.map((p, i) => (
                   <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-800/50 rounded-2xl transition-all border border-transparent hover:border-slate-800">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-500 border border-slate-700">
                            {p.username?.[0].toUpperCase() || 'U'}
                         </div>
                         <div>
                            <p className="font-bold text-sm">{p.username}</p>
                            <p className="text-[10px] font-mono text-slate-600 uppercase">{p.role}</p>
                         </div>
                      </div>
                      <button className="text-slate-500 hover:text-white p-2">
                         <ArrowUpRight className="w-4 h-4" />
                      </button>
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
                     <div className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex flex-col justify-center items-center text-center">
                        <Download className="w-6 h-6 text-blue-400 mb-2" />
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Global Patch</p>
                        <p className="text-[8px] text-blue-300/60 font-bold">Push MBTiles v2.1 to all nodes</p>
                     </div>
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
    </div>
  );
}

