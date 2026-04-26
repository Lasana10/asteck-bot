import React, { useEffect, useState } from 'react';
import { Activity, Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface CityStatus {
  zone: string;
  level: 'calm' | 'moderate' | 'dense' | 'critical';
}

interface RecentEvent {
  id: string;
  type: string;
  address: string;
  status: string;
  timestamp: string;
}

const LEVEL_CONFIG = {
  calm:     { color: '#22c55e', bg: 'from-emerald-500/10 to-emerald-500/5', label: 'Calme',    emoji: '🟢' },
  moderate: { color: '#f59e0b', bg: 'from-amber-500/10 to-amber-500/5',     label: 'Modéré',   emoji: '🟡' },
  dense:    { color: '#f97316', bg: 'from-orange-500/10 to-orange-500/5',    label: 'Dense',    emoji: '🟠' },
  critical: { color: '#ef4444', bg: 'from-red-500/10 to-red-500/5',         label: 'Critique',  emoji: '🔴' },
};

export function CityPulse() {
  const [cityStatuses, setCityStatuses] = useState<CityStatus[]>([
    { zone: 'Yaoundé Centre', level: 'calm' },
    { zone: 'Douala Akwa',   level: 'calm' },
  ]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [stats, setStats] = useState({ total: 0, verified: 0, pending: 0 });

  // Fetch live data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      // Get recent incidents
      const { data: incidents } = await supabase
        .from('incidents')
        .select('id, type, address, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (incidents) {
        setRecentEvents(incidents.map(i => ({
          id: i.id,
          type: i.type,
          address: i.address || 'Localisation inconnue',
          status: i.status,
          timestamp: i.created_at
        })));

        // Calculate stats from all active incidents
        const { count: totalCount } = await supabase
          .from('incidents')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

        const { count: verifiedCount } = await supabase
          .from('incidents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'verified')
          .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

        const total = totalCount || 0;
        const verified = verifiedCount || 0;

        setStats({ total, verified, pending: total - verified });

        // Determine city status based on active incident density
        const activeCount = total;
        setCityStatuses([
          { zone: 'Yaoundé Centre', level: activeCount > 10 ? 'critical' : activeCount > 5 ? 'dense' : activeCount > 2 ? 'moderate' : 'calm' },
          { zone: 'Douala Akwa',    level: activeCount > 8 ? 'dense' : activeCount > 3 ? 'moderate' : 'calm' },
        ]);
      }
    };

    fetchData();

    // Real-time subscription
    const channel = supabase
      .channel('city-pulse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => fetchData())
      .subscribe();

    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="w-3 h-3 text-emerald-400" />;
      case 'pending':  return <Clock className="w-3 h-3 text-amber-400" />;
      case 'false':    return <AlertTriangle className="w-3 h-3 text-red-400" />;
      default:         return <Activity className="w-3 h-3 text-slate-400" />;
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `il y a ${diffMin}min`;
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden w-80">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-indigo-600/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/15 rounded-xl flex items-center justify-center relative">
            <Activity className="w-4 h-4 text-blue-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse border-2 border-slate-900"></div>
          </div>
          <div>
            <h3 className="font-black text-sm text-white">City Pulse</h3>
            <p className="text-[9px] text-slate-400 font-mono uppercase tracking-widest">Pouls Urbain · En Direct</p>
          </div>
        </div>
      </div>

      {/* City Status Zones */}
      <div className="px-4 py-3 space-y-2">
        {cityStatuses.map((city, i) => {
          const config = LEVEL_CONFIG[city.level];
          return (
            <div key={i} className={`flex items-center justify-between bg-gradient-to-r ${config.bg} rounded-2xl px-4 py-2.5 border border-white/5`}>
              <div className="flex items-center gap-2.5">
                <span className="text-sm">{config.emoji}</span>
                <span className="text-xs font-bold text-white">{city.zone}</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: config.color }}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats Bar */}
      <div className="px-4 py-2 flex items-center justify-around border-t border-b border-white/5 bg-white/[0.02]">
        <div className="text-center">
          <p className="text-base font-black text-white">{stats.total}</p>
          <p className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">Signalements</p>
        </div>
        <div className="w-px h-8 bg-white/10"></div>
        <div className="text-center">
          <p className="text-base font-black text-emerald-400">{stats.verified}</p>
          <p className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">Vérifiés</p>
        </div>
        <div className="w-px h-8 bg-white/10"></div>
        <div className="text-center">
          <p className="text-base font-black text-amber-400">{stats.pending}</p>
          <p className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">En attente</p>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="px-4 py-3 space-y-2 max-h-40 overflow-y-auto">
        <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest flex items-center gap-1.5">
          <Shield className="w-3 h-3" /> Activité Récente
        </p>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-slate-600 italic py-2">Aucune activité récente.</p>
        ) : (
          recentEvents.map(event => (
            <div key={event.id} className="flex items-start gap-2.5 py-1.5">
              {getStatusIcon(event.status)}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-300 leading-tight truncate">
                  <span className="font-bold capitalize">{event.type.replace('_', ' ')}</span>
                  {event.address && <span className="text-slate-500"> · {event.address}</span>}
                </p>
                <p className="text-[9px] text-slate-600 mt-0.5">{formatTime(event.timestamp)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
