import React, { useState, useEffect } from 'react';
import { Shield, Zap, Users, Star, TrendingUp, Trophy } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { AFATLogo } from '../shared/AFATLogo';

interface Props {
  operatorId: string;
}

interface DNAScores {
  safety: number;      // 0-100: Based on speed patterns
  reliability: number; // 0-100: Booking completion rate
  community: number;   // 0-100: Tontine participation + incident reports
  overall: number;     // Weighted average
}

export function DriverDNA({ operatorId }: Props) {
  const [scores, setScores] = useState<DNAScores>({ safety: 0, reliability: 0, community: 0, overall: 0 });
  const [loading, setLoading] = useState(true);
  const [totalRides, setTotalRides] = useState(0);

  useEffect(() => {
    calculateDNA();
  }, [operatorId]);

  const calculateDNA = async () => {
    setLoading(true);

    // 1. Safety Score: Analyze speed patterns from GPS tracks
    const { data: tracks } = await supabase
      .from('gps_tracks')
      .select('speed_kph')
      .eq('user_id', operatorId)
      .order('created_at', { ascending: false })
      .limit(100);

    let safetyScore = 85; // Default good score
    if (tracks && tracks.length > 0) {
      const avgSpeed = tracks.reduce((sum, t) => sum + (t.speed_kph || 0), 0) / tracks.length;
      const overspeeding = tracks.filter(t => (t.speed_kph || 0) > 80).length;
      const overspeedingRate = overspeeding / tracks.length;
      safetyScore = Math.max(30, Math.min(100, 100 - (overspeedingRate * 200) - (avgSpeed > 60 ? 15 : 0)));
    }

    // 2. Reliability Score: Booking completion rate
    const { data: completedBookings, count: completedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('operator_id', operatorId)
      .in('status', ['completed', 'confirmed']);

    const { count: totalBookings } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('operator_id', operatorId);

    const completed = completedCount || 0;
    const total = totalBookings || 1;
    setTotalRides(total);
    const reliabilityScore = Math.min(100, Math.round((completed / total) * 100));

    // 3. Community Score: Tontine participation
    const { count: tontineCount } = await supabase
      .from('tontine_members')
      .select('id', { count: 'exact' })
      .eq('user_id', operatorId);

    const communityScore = Math.min(100, 50 + (tontineCount || 0) * 25);

    // Overall: Weighted average
    const overall = Math.round(safetyScore * 0.4 + reliabilityScore * 0.35 + communityScore * 0.25);

    setScores({
      safety: Math.round(safetyScore),
      reliability: reliabilityScore,
      community: communityScore,
      overall
    });
    setLoading(false);
  };

  const getGrade = (score: number) => {
    if (score >= 90) return { label: 'ELITE', color: 'text-emerald-500', bg: 'bg-emerald-500' };
    if (score >= 75) return { label: 'STRONG', color: 'text-blue-500', bg: 'bg-blue-500' };
    if (score >= 50) return { label: 'GROWING', color: 'text-amber-500', bg: 'bg-amber-500' };
    return { label: 'ROOKIE', color: 'text-slate-500', bg: 'bg-slate-500' };
  };

  const grade = getGrade(scores.overall);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-1/3 mb-4" />
        <div className="h-20 bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 shadow-xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center shadow-lg">
            <AFATLogo className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tighter italic">Sentinel Score</h3>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest">{totalRides} nodes verified</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className={`${grade.color} font-black text-[10px] uppercase tracking-[0.2em] bg-white/5 px-3 py-1.5 rounded-full border border-white/10 mb-1`}>
            {grade.label}
          </div>
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            <Trophy className="w-2.5 h-2.5" /> Rank #12
          </div>
        </div>
      </div>

      {/* Overall Score Ring */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" strokeWidth="6" />
            <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6"
              strokeDasharray={`${(scores.overall / 100) * 239} 239`}
              strokeLinecap="round"
              className={`${grade.color} transition-all duration-1000`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black">{scores.overall}</span>
            <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest">Score</span>
          </div>
        </div>
      </div>

      {/* Individual Scores */}
      <div className="space-y-3">
        <ScoreBar icon={<Shield className="w-3.5 h-3.5" />} label="Safety" score={scores.safety} color="emerald" />
        <ScoreBar icon={<Zap className="w-3.5 h-3.5" />} label="Reliability" score={scores.reliability} color="blue" />
        <ScoreBar icon={<Users className="w-3.5 h-3.5" />} label="Community" score={scores.community} color="amber" />
      </div>
    </div>
  );
}

function ScoreBar({ icon, label, score, color }: { icon: React.ReactNode; label: string; score: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500'
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-slate-400 w-4">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-widest">{label}</span>
          <span className="text-[10px] font-black text-slate-300">{score}</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorMap[color]} rounded-full transition-all duration-1000`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}
