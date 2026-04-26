import React, { useState, useEffect } from 'react';
import { Star, Gift, TrendingUp, Zap, Award, Users, AlertTriangle, Clock, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface Props {
  userId: string;
  userName: string;
  onClose?: () => void;
}

interface PointsData {
  total: number;
  history: { action: string; points: number; date: string }[];
}

export function PointsSystem({ userId, userName, onClose }: Props) {
  const [points, setPoints] = useState<PointsData>({ total: 0, history: [] });
  const [showRedeem, setShowRedeem] = useState(false);

  useEffect(() => {
    fetchPoints();
  }, [userId]);

  const fetchPoints = async () => {
    // Try to fetch from user_points table
    const { data } = await supabase
      .from('user_points')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const total = data.reduce((sum, entry) => sum + (entry.points || 0), 0);
      setPoints({
        total,
        history: data.map(d => ({
          action: d.action || 'Bonus',
          points: d.points || 0,
          date: new Date(d.created_at).toLocaleDateString('fr-FR')
        }))
      });
    } else {
      // Initialize with welcome bonus
      setPoints({
        total: 50,
        history: [{ action: 'Bonus de bienvenue', points: 50, date: new Date().toLocaleDateString('fr-FR') }]
      });
    }
  };

  const getTier = (total: number) => {
    if (total >= 500) return { name: 'DIAMANT', color: 'text-cyan-400', bg: 'from-cyan-600 to-blue-700', icon: '💎' };
    if (total >= 200) return { name: 'OR', color: 'text-amber-400', bg: 'from-amber-600 to-orange-700', icon: '🥇' };
    if (total >= 50) return { name: 'ARGENT', color: 'text-slate-300', bg: 'from-slate-500 to-slate-700', icon: '🥈' };
    return { name: 'BRONZE', color: 'text-orange-400', bg: 'from-orange-700 to-red-800', icon: '🥉' };
  };

  const tier = getTier(points.total);
  const nextTier = points.total < 50 ? 50 : points.total < 200 ? 200 : points.total < 500 ? 500 : 1000;
  const progress = Math.min(100, (points.total / nextTier) * 100);

  return (
    <div className="bg-slate-900 border border-white/5 rounded-3xl overflow-hidden shadow-xl shadow-black/20 relative">
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white z-20">
          <X className="w-5 h-5" />
        </button>
      )}
      {/* Points Header */}
      <div className={`bg-gradient-to-r ${tier.bg} p-6 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 opacity-10 text-8xl font-black">{tier.icon}</div>
        <div className="relative z-10">
          <p className="text-white/60 text-[10px] uppercase font-mono tracking-[0.2em] mb-1">AFAT Sentinel Points</p>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-black text-white">{points.total.toLocaleString()}</span>
            <span className={`text-xs font-black uppercase tracking-widest ${tier.color} bg-black/20 px-3 py-1 rounded-full`}>
              {tier.name}
            </span>
          </div>
        </div>
        {/* Progress to next tier */}
        <div className="mt-4">
          <div className="flex justify-between text-[9px] text-white/40 font-mono uppercase mb-1">
            <span>{points.total} pts</span>
            <span>{nextTier} pts</span>
          </div>
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Earn Points Guide */}
      <div className="p-6 space-y-4">
        <h4 className="font-bold text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" /> Comment gagner des points
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <EarnCard icon={<AlertTriangle className="w-4 h-4" />} action="Signaler un incident" points={10} />
          <EarnCard icon={<Users className="w-4 h-4" />} action="Parrainer un ami" points={50} />
          <EarnCard icon={<Clock className="w-4 h-4" />} action="Voyager hors-pointe" points={5} />
          <EarnCard icon={<Star className="w-4 h-4" />} action="Évaluer un trajet" points={3} />
        </div>

        {/* Redeem Section */}
        <button
          onClick={() => setShowRedeem(!showRedeem)}
          className="w-full bg-slate-950/50 border border-white/5 hover:border-amber-500/30 rounded-2xl p-4 flex items-center justify-between transition-all group"
        >
          <div className="flex items-center gap-3">
            <Gift className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">Échanger mes points</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">100 pts = 200 XAF</span>
        </button>

        {showRedeem && (
          <div className="bg-slate-950/50 border border-amber-500/20 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top duration-300">
            <RedeemOption label="Réduction 200 XAF" cost={100} available={points.total >= 100} />
            <RedeemOption label="Réduction 500 XAF" cost={250} available={points.total >= 250} />
            <RedeemOption label="Trajet Gratuit" cost={500} available={points.total >= 500} />
          </div>
        )}

        {/* Recent History */}
        {points.history.length > 0 && (
          <div>
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Historique récent
            </h4>
            <div className="space-y-2">
              {points.history.slice(0, 5).map((entry, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-950/30 px-4 py-2.5 rounded-xl border border-white/5">
                  <div>
                    <p className="text-sm font-medium">{entry.action}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{entry.date}</p>
                  </div>
                  <span className="text-emerald-500 font-black text-sm">+{entry.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EarnCard({ icon, action, points }: { icon: React.ReactNode; action: string; points: number }) {
  return (
    <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-3 text-center">
      <div className="text-slate-400 flex justify-center mb-2">{icon}</div>
      <p className="text-[10px] text-slate-400 font-medium mb-1">{action}</p>
      <p className="text-amber-500 font-black text-sm">+{points} pts</p>
    </div>
  );
}

function RedeemOption({ label, cost, available }: { label: string; cost: number; available: boolean }) {
  return (
    <button
      disabled={!available}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
        available
          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 active:scale-95'
          : 'bg-slate-800/30 border border-white/5 text-slate-600 cursor-not-allowed'
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px]">{cost} pts</span>
    </button>
  );
}
