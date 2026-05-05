import React, { useState, useEffect } from 'react';
import { DollarSign, MessageCircle, Check, X, ArrowRight, User, ShieldCheck, TrendingUp, ChevronRight, Zap, Activity } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface Props {
  initialPrice: number;
  role: 'commuter' | 'operator';
  bookingId?: string;
  onAccept: (price: number) => void;
  onReject: () => void;
  onCounter: (price: number) => void;
  otherPartyName: string;
}

export function NegotiationPanel({ initialPrice, role, bookingId, onAccept, onReject, onCounter, otherPartyName }: Props) {
  const [proposedPrice, setProposedPrice] = useState<number>(initialPrice);
  const [negotiationHistory, setNegotiationHistory] = useState<any[]>([]);
  const [isCountering, setIsCountering] = useState(false);
  const [lastBid, setLastBid] = useState<any>(null);

  useEffect(() => {
    if (bookingId) {
      fetchHistory();
      const channel = supabase
        .channel(`negotiation:${bookingId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'negotiations', 
          filter: `booking_id=eq.${bookingId}` 
        }, () => {
          fetchHistory();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [bookingId]);

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('negotiations')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    
    if (data && data.length > 0) {
      setNegotiationHistory(data);
      const last = data[data.length - 1];
      setLastBid(last);
      setProposedPrice(last.price);
    }
  };

  const handleSuggest = (modifier: number) => {
    setProposedPrice(prev => Math.max(0, prev + modifier));
  };

  const quickPicks = [-100, -50, +50, +100];

  return (
    <div className="bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-6 shadow-2xl animate-in slide-in-from-bottom duration-500 overflow-hidden relative group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-black text-white text-[16px] uppercase italic tracking-tighter">Market Negotiation</h3>
            <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mt-0.5">With {otherPartyName}</p>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
           <span className="text-[10px] font-mono text-white/50">SECURE LINK</span>
        </div>
      </div>

      {/* Price Display */}
      <div className="bg-black/40 border border-white/10 rounded-3xl p-8 mb-4 text-center relative overflow-hidden group/price">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover/price:opacity-100 transition-opacity" />
        <p className="text-[10px] text-white/30 uppercase font-black tracking-[0.3em] mb-4">Proposed Fare</p>
        <div className="flex items-center justify-center gap-4">
          <span className="text-5xl font-black text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">{proposedPrice.toLocaleString()}</span>
          <span className="text-xl font-black text-white/20 uppercase">XAF</span>
        </div>
        
        {lastBid && lastBid.role !== role && (
          <div className="mt-4 inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-full">
            <Zap className="w-3 h-3 text-blue-400 animate-pulse" />
            <span className="text-[10px] font-black text-blue-400 uppercase">New Offer Received</span>
          </div>
        )}
      </div>

      {/* Market Insight Widget */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Market Pulse</p>
            <p className="text-[11px] text-white font-bold italic">Avg. 250 XAF on this route</p>
          </div>
        </div>
        <div className="text-right">
           <p className="text-[10px] text-emerald-400 font-black uppercase tracking-tighter">High Demand</p>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        {/* Adjustment Taps */}
        <div className="grid grid-cols-4 gap-2">
          {quickPicks.map(val => (
            <button
              key={val}
              onClick={() => handleSuggest(val)}
              className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-3 text-[11px] font-black text-white/60 transition-all active:scale-90"
            >
              {val > 0 ? `+${val}` : val}
            </button>
          ))}
        </div>

        {/* Rapid Choice Row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
           {[200, 250, 300, 500].map(price => (
             <button 
               key={price}
               onClick={() => setProposedPrice(price)}
               className={`shrink-0 px-4 py-2 rounded-xl border text-[10px] font-black transition-all ${proposedPrice === price ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40'}`}
             >
               {price} XAF
             </button>
           ))}
        </div>

        {/* Main Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onAccept(proposedPrice)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/20 uppercase tracking-widest text-[11px]"
          >
            <Check className="w-4 h-4" /> Accept Offer
          </button>
          <button
            onClick={() => onCounter(proposedPrice)}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20 uppercase tracking-widest text-[11px]"
          >
            <ArrowRight className="w-4 h-4" /> Counter Bid
          </button>
        </div>

        <button
          onClick={onReject}
          className="w-full text-white/30 hover:text-red-400 font-black text-[10px] uppercase tracking-[0.3em] py-2 transition-colors"
        >
          Cancel Negotiation
        </button>
      </div>

      {/* History Sidebar/List (Simplified) */}
      {negotiationHistory.length > 0 && (
        <div className="mt-8 pt-8 border-t border-white/5">
          <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-4">Market History</p>
          <div className="space-y-3">
            {negotiationHistory.slice(-3).map((h, i) => (
              <div key={i} className="flex items-center justify-between opacity-50 text-[10px] font-bold italic">
                <span className="text-white/40">{h.role === role ? 'You' : otherPartyName}</span>
                <span className="text-white">{h.price} XAF</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
