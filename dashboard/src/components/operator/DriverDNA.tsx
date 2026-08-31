import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Shield, Users, Zap } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { AFATLogo } from '../shared/AFATLogo';

interface Props {
  operatorId: string;
}

interface EvidenceState {
  safety: number | null;
  reliability: number | null;
  community: number | null;
  overall: number | null;
  gpsSamples: number;
  completedTrips: number;
  totalTrips: number;
  ratings: number;
  communitySignals: number;
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  blockers: string[];
}

export function DriverDNA({ operatorId }: Props) {
  const [evidence, setEvidence] = useState<EvidenceState>({
    safety: null,
    reliability: null,
    community: null,
    overall: null,
    gpsSamples: 0,
    completedTrips: 0,
    totalTrips: 0,
    ratings: 0,
    communitySignals: 0,
    confidence: 'insufficient',
    blockers: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateDNA();
  }, [operatorId]);

  const calculateDNA = async () => {
    setLoading(true);

    const { data: tracks } = await supabase
      .from('movement_logs')
      .select('speed')
      .eq('user_id', operatorId)
      .order('timestamp', { ascending: false })
      .limit(100);

    let safetyScore: number | null = null;
    const gpsSamples = tracks?.length || 0;
    if (gpsSamples >= 20) {
      const avgSpeed = tracks.reduce((sum, t) => sum + (t.speed || 0), 0) / tracks.length;
      const overspeeding = tracks.filter(t => (t.speed || 0) > 80).length;
      const overspeedingRate = overspeeding / tracks.length;
      safetyScore = Math.max(30, Math.min(100, 100 - (overspeedingRate * 200) - (avgSpeed > 60 ? 15 : 0)));
    }

    const { count: completedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('operator_id', operatorId)
      .eq('status', 'completed');

    const { count: totalBookings } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('operator_id', operatorId);

    const completed = completedCount || 0;
    const total = totalBookings || 0;
    const reliabilityScore = total >= 10 ? Math.min(100, Math.round((completed / total) * 100)) : null;

    const { count: ratingsCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('operator_id', operatorId)
      .not('rating', 'is', null);

    const { count: tontineCount } = await supabase
      .from('tontine_members')
      .select('id', { count: 'exact' })
      .eq('user_id', operatorId);

    const communitySignals = tontineCount || 0;
    const communityScore = communitySignals >= 3 ? Math.min(100, 50 + communitySignals * 10) : null;
    const blockers = [
      gpsSamples < 20 ? `${20 - gpsSamples} more telemetry samples` : '',
      total < 10 ? `${10 - total} more trips` : '',
      (ratingsCount || 0) < 3 ? `${3 - (ratingsCount || 0)} more passenger ratings` : '',
      communitySignals < 3 ? `${3 - communitySignals} more community confirmations` : '',
    ].filter(Boolean);

    const components = [safetyScore, reliabilityScore, communityScore].filter((score): score is number => score !== null);
    const overall = blockers.length === 0 && components.length === 3
      ? Math.round(safetyScore! * 0.4 + reliabilityScore! * 0.35 + communityScore! * 0.25)
      : null;
    const confidence: EvidenceState['confidence'] =
      overall === null ? 'insufficient' : completed >= 50 && gpsSamples >= 80 ? 'high' : completed >= 25 && gpsSamples >= 50 ? 'medium' : 'low';

    setEvidence({
      safety: safetyScore === null ? null : Math.round(safetyScore),
      reliability: reliabilityScore,
      community: communityScore,
      overall,
      gpsSamples,
      completedTrips: completed,
      totalTrips: total,
      ratings: ratingsCount || 0,
      communitySignals,
      confidence,
      blockers,
    });
    setLoading(false);
  };

  const getGrade = (score: number | null) => {
    if (score === null) return { label: 'INSUFFICIENT EVIDENCE', color: 'text-amber-300', bg: 'bg-amber-500' };
    if (score >= 90) return { label: 'ELITE', color: 'text-emerald-500', bg: 'bg-emerald-500' };
    if (score >= 75) return { label: 'STRONG', color: 'text-blue-500', bg: 'bg-blue-500' };
    if (score >= 50) return { label: 'GROWING', color: 'text-amber-500', bg: 'bg-amber-500' };
    return { label: 'ROOKIE', color: 'text-slate-500', bg: 'bg-slate-500' };
  };

  const grade = getGrade(evidence.overall);

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
            <h3 className="font-black text-sm uppercase tracking-tighter italic">Driver DNA Evidence</h3>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest">{evidence.completedTrips} completed trips verified</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className={`${grade.color} font-black text-[10px] uppercase tracking-[0.2em] bg-white/5 px-3 py-1.5 rounded-full border border-white/10 mb-1`}>
            {grade.label}
          </div>
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            {evidence.overall === null ? <AlertTriangle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
            {evidence.confidence} confidence
          </div>
        </div>
      </div>

      {/* Overall Score Ring */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" strokeWidth="6" />
            <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6"
              strokeDasharray={`${((evidence.overall || 0) / 100) * 239} 239`}
              strokeLinecap="round"
              className={`${grade.color} transition-all duration-1000`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black">{evidence.overall ?? '--'}</span>
            <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest">{evidence.overall === null ? 'Pending' : 'Score'}</span>
          </div>
        </div>
      </div>

      {evidence.blockers.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-200">Insufficient verified evidence</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-50/70">
            AFAT will not publish a Driver DNA score until enough trip, telemetry, rating, and community evidence is verified.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-1">
            {evidence.blockers.map((blocker) => (
              <span key={blocker} className="text-[10px] font-bold uppercase tracking-wider text-amber-100/70">{blocker}</span>
            ))}
          </div>
        </div>
      )}

      {/* Individual Scores */}
      <div className="space-y-3">
        <ScoreBar icon={<Shield className="w-3.5 h-3.5" />} label="Safety" score={evidence.safety} color="emerald" />
        <ScoreBar icon={<Zap className="w-3.5 h-3.5" />} label="Reliability" score={evidence.reliability} color="blue" />
        <ScoreBar icon={<Users className="w-3.5 h-3.5" />} label="Community" score={evidence.community} color="amber" />
      </div>
    </div>
  );
}

function ScoreBar({ icon, label, score, color }: { icon: React.ReactNode; label: string; score: number | null; color: string }) {
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
          <span className="text-[10px] font-black text-slate-300">{score ?? 'pending'}</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorMap[color]} rounded-full transition-all duration-1000`}
            style={{ width: `${score || 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
