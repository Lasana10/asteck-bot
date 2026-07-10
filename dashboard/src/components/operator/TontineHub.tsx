import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, Calendar, ArrowRight, X, Wallet, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { Tontine, TontineMember } from '../../types';

interface Props {
  userId: string;
  onClose: () => void;
}

export function TontineHub({ userId, onClose }: Props) {
  const [tontines, setTontines] = useState<any[]>([]);
  const [discoverableTontines, setDiscoverableTontines] = useState<any[]>([]);
  const [selectedTontine, setSelectedTontine] = useState<any | null>(null);
  const [members, setMembers] = useState<TontineMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [contributionMessage, setContributionMessage] = useState('');
  const [joiningTontineId, setJoiningTontineId] = useState<string | null>(null);

  useEffect(() => {
    fetchTontines();
  }, []);

  const fetchTontines = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tontine_members')
      .select('*, tontines(*)')
      .eq('user_id', userId);
    
    if (!error && data) {
      setTontines(data.map(d => d.tontines));
    }

    const joinedIds = !error && data ? data.map((entry) => entry.tontine_id) : [];
    const discoverQuery = supabase
      .from('tontines')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6);

    const { data: available, error: discoverError } = joinedIds.length
      ? await discoverQuery.not('id', 'in', `(${joinedIds.join(',')})`)
      : await discoverQuery;

    if (!discoverError && available) {
      setDiscoverableTontines(available);
    } else {
      setDiscoverableTontines([]);
    }

    setLoading(false);
  };

  const fetchMembers = async (tontineId: string) => {
    const { data, error } = await supabase
      .from('tontine_members')
      .select('*')
      .eq('tontine_id', tontineId)
      .order('payout_order', { ascending: true });
    
    if (!error && data) setMembers(data);
  };

  const handleSelect = (t: any) => {
    setSelectedTontine(t);
    setContributionMessage('');
    fetchMembers(t.id);
  };

  const joinTontine = async (tontine: any) => {
    setDiscoveryMessage('');
    setJoiningTontineId(tontine.id);

    const { count, error: countError } = await supabase
      .from('tontine_members')
      .select('*', { count: 'exact', head: true })
      .eq('tontine_id', tontine.id);

    if (countError) {
      setJoiningTontineId(null);
      setDiscoveryMessage(`Unable to prepare membership for ${tontine.name}: ${countError.message}`);
      return;
    }

    const { error } = await supabase
      .from('tontine_members')
      .insert({
        tontine_id: tontine.id,
        user_id: userId,
        payout_order: (count || 0) + 1,
        has_received_payout: false,
        total_contributed: 0,
      });

    setJoiningTontineId(null);

    if (error) {
      setDiscoveryMessage(`Join request failed for ${tontine.name}: ${error.message}`);
      return;
    }

    setDiscoveryMessage(`${tontine.name} joined successfully. Your payout slot has been added to the rotation queue.`);
    fetchTontines();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[2000] p-6">
      <div className="bg-slate-900 border border-white/5 w-full max-w-2xl rounded-[40px] p-8 relative shadow-2xl flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-500 p-2"><X /></button>
        
        <div className="mb-8">
          <h3 className="text-3xl font-black italic tracking-tighter flex items-center gap-3">
            <Users className="text-blue-500 w-8 h-8" /> AFAT SENTINEL TONTINE
          </h3>
          <p className="text-slate-500 text-sm mt-1">Coopérative d'épargne intelligente pour les Sentinels AFAT.</p>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : selectedTontine ? (
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
             <button onClick={() => setSelectedTontine(null)} className="text-blue-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
                <ArrowRight className="w-3 h-3 rotate-180" /> Back to My Groups
             </button>

             <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-3xl shadow-xl shadow-blue-500/20">
                <div className="flex justify-between items-start mb-6">
                   <div>
                      <h4 className="text-xl font-bold">{selectedTontine.name}</h4>
                      <p className="text-blue-200 text-xs font-mono uppercase mt-1">Active Cycle • {selectedTontine.frequency}</p>
                   </div>
                   <ShieldCheck className="text-white/50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white/10 p-4 rounded-2xl">
                      <p className="text-[10px] text-blue-100 uppercase font-mono mb-1">Total Pot</p>
                      <p className="text-2xl font-bold">{selectedTontine.total_pot.toLocaleString()}F</p>
                   </div>
                   <div className="bg-white/10 p-4 rounded-2xl">
                      <p className="text-[10px] text-blue-100 uppercase font-mono mb-1">Your Contribution</p>
                      <p className="text-2xl font-bold">{selectedTontine.contribution_amount.toLocaleString()}F</p>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h5 className="font-bold text-sm uppercase tracking-widest text-slate-400">Rotation Queue</h5>
                <div className="space-y-2">
                   {members.map((m, i) => (
                      <div key={m.id} className={`p-4 rounded-2xl border ${m.user_id === userId ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-950/50 border-white/5'} flex items-center justify-between`}>
                         <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                               {m.payout_order}
                            </div>
                            <div>
                               <p className="font-bold text-sm">{m.user_id === userId ? 'You (Self)' : `Member ${m.user_id.substring(0,4)}`}</p>
                               <p className="text-[10px] text-slate-500 uppercase font-mono">Status: {m.has_received_payout ? 'Paid' : 'Waiting'}</p>
                            </div>
                         </div>
                         {m.has_received_payout && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                      </div>
                   ))}
                </div>
             </div>

             {contributionMessage && (
               <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs font-semibold text-blue-100">
                 {contributionMessage}
               </div>
             )}

             <button
                onClick={() => setContributionMessage('Contribution workflow is attached to the AFAT wallet and payment provider layer. This group is live-read from Supabase; contribution posting still needs a dedicated transaction endpoint before we mark it live.')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 uppercase tracking-widest text-sm mt-4"
             >
                Contribute Now
             </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {tontines.map(t => (
              <div 
                key={t.id} 
                onClick={() => handleSelect(t)}
                className="bg-slate-950/50 border border-white/5 p-6 rounded-3xl cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/5 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                      <TrendingUp className="text-blue-500 w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{t.name}</h4>
                      <p className="text-xs text-slate-500 font-mono uppercase mt-1">{t.frequency} Contribution</p>
                    </div>
                  </div>
                  <ArrowRight className="text-slate-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-white/5">
                   <div className="flex items-center gap-2">
                      <Wallet className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-400">{t.contribution_amount.toLocaleString()}F</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-blue-500" />
                      <span className="text-[10px] font-bold text-slate-400">Next: {new Date(t.next_payout_date).toLocaleDateString()}</span>
                   </div>
                </div>
              </div>
            ))}
            {tontines.length === 0 && (
              <div className="text-center py-20 bg-slate-950/30 border border-dashed border-white/5 rounded-[40px]">
                 <Users className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                 <p className="text-slate-600 font-mono text-sm uppercase">Aucun groupe actif détecté pour votre Node.</p>
                 {discoveryMessage && (
                   <p className="mx-auto mt-4 max-w-sm rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs font-semibold text-blue-200">
                     {discoveryMessage}
                   </p>
                 )}
                 {!discoverableTontines.length ? (
                   <button 
                     onClick={() => setDiscoveryMessage('No open tontines are available right now. Create or seed one from AFAT operations to begin cooperative participation.')}
                     className="mt-6 text-blue-500 font-bold text-xs uppercase tracking-widest border border-blue-500/20 px-6 py-3 rounded-xl hover:bg-blue-500/5 transition-all outline-none"
                   >
                     Check Open Tontines
                   </button>
                 ) : (
                   <div className="mt-6 space-y-3 text-left">
                     <p className="text-[10px] font-black uppercase tracking-widest text-blue-300/70 text-center">Open tontines</p>
                     {discoverableTontines.map((t) => (
                       <div key={t.id} className="rounded-2xl border border-white/8 bg-slate-900/70 p-4">
                         <div className="flex items-start justify-between gap-4">
                           <div>
                             <p className="text-sm font-black text-white">{t.name}</p>
                             <p className="mt-1 text-[10px] font-mono uppercase text-slate-500">
                               {t.frequency} · {Number(t.contribution_amount || 0).toLocaleString()}F
                             </p>
                           </div>
                           <button
                             onClick={() => joinTontine(t)}
                             disabled={joiningTontineId === t.id}
                             className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-200 disabled:opacity-50"
                           >
                             {joiningTontineId === t.id ? 'Joining...' : 'Join'}
                           </button>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
