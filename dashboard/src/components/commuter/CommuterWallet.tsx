import React, { useState, useEffect } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, CreditCard, Smartphone, Plus, History, Shield, Zap, X, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface Props {
  userId: string;
  userName: string;
  trustTier: string; // 'bronze' | 'silver' | 'gold' | 'diamond'
  onClose?: () => void;
}

export function CommuterWallet({ userId, userName, trustTier, onClose }: Props) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [creditLimit, setCreditLimit] = useState(0);
  const [creditUsed, setCreditUsed] = useState(0);

  useEffect(() => {
    fetchWallet();
    calculateCreditLimit();
  }, [userId]);

  const fetchWallet = async () => {
    const { data } = await supabase
      .from('commuter_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (data) {
      setBalance(data.balance_xaf || 0);
    }

    // Fetch transactions
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (txns) setTransactions(txns);
  };

  const calculateCreditLimit = () => {
    // Credit limits based on tier
    const limits: Record<string, number> = {
      bronze: 0,       // No credit
      silver: 500,     // 500 XAF
      gold: 2000,      // 2,000 XAF
      diamond: 5000    // 5,000 XAF
    };
    setCreditLimit(limits[trustTier] || 0);
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseInt(depositAmount) < 100) return;
    setLoading(true);

    const amount = parseInt(depositAmount);

    // Simulate MoMo deposit (in production: real API call)
    await supabase.from('commuter_wallets').upsert({
      user_id: userId,
      balance_xaf: balance + amount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'deposit',
      amount_xaf: amount,
      method: 'mobile_money',
      description: 'Dépôt Mobile Money'
    });

    setBalance(prev => prev + amount);
    setDepositAmount('');
    setShowDeposit(false);
    setLoading(false);
    fetchWallet();
  };

  const handleUseCredit = async () => {
    if (creditLimit === 0) return;
    setLoading(true);

    const creditAmount = Math.min(500, creditLimit - creditUsed);

    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'credit',
      amount_xaf: creditAmount,
      method: 'micro_credit',
      description: `Micro-crédit activé (${trustTier.toUpperCase()})`
    });

    setBalance(prev => prev + creditAmount);
    setCreditUsed(prev => prev + creditAmount);
    setShowCredit(false);
    setLoading(false);
  };

  const tierColors: Record<string, string> = {
    bronze: 'from-[#8B4513] to-[#3E1F08]',
    silver: 'from-[#c6c6cd] to-[#45464d]',
    gold: 'from-[#f59e0b] to-[#784d05]',
    diamond: 'from-[#b7c4ff] to-[#001148]'
  };

  const tierLabel: Record<string, string> = {
    bronze: '🥉 Bronze', silver: '🥈 Argent', gold: '🥇 Or', diamond: '💎 Diamant'
  };

  return (
    <div className="glass-panel ghost-border rounded-3xl overflow-hidden shadow-ambient-float">
      {/* Wallet Card Header */}
      <div className={`bg-gradient-to-br ${tierColors[trustTier] || tierColors.bronze} p-8 relative overflow-hidden`}>
        <div className="absolute top-2 right-2 opacity-10 text-7xl font-black">₣</div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-white/80" />
              <span className="text-white/60 text-[10px] uppercase font-mono tracking-[0.2em]">Mon Portefeuille</span>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider bg-white/10 px-2 py-1 rounded-full text-white/80">
              {tierLabel[trustTier]}
            </span>
          </div>
          <p className="text-[40px] font-display font-medium text-white tracking-tight leading-none mt-2">{balance.toLocaleString()} <span className="text-2xl font-sans opacity-60">XAF</span></p>
          {creditLimit > 0 && (
            <p className="text-[11px] text-white/70 mt-3 font-mono">
              <Shield className="w-3 h-3 inline mr-1" />
              CRÉDIT DISPONIBLE: {(creditLimit - creditUsed).toLocaleString()} XAF
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-5 grid grid-cols-2 gap-4">
        <button
          onClick={() => setShowDeposit(true)}
          className="bg-green/10 ghost-border text-green font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-green/20 transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] active:scale-95"
        >
          <Plus className="w-5 h-5" /> Déposer
        </button>
        {creditLimit > 0 ? (
          <button
            onClick={() => setShowCredit(true)}
            className="bg-primary/10 ghost-border text-primary font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-all shadow-neon-primary active:scale-95"
          >
            <CreditCard className="w-5 h-5" /> Pay Later
          </button>
        ) : (
          <div className="bg-surface/50 border border-outline-variant text-on-surface-variant font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 opacity-50 cursor-not-allowed">
            <CreditCard className="w-5 h-5" /> Pay Later
            <span className="text-[9px] font-mono tracking-widest leading-none bg-surface-container px-2 py-1 rounded-sm">ARGENT+</span>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="p-4 border-t border-white/5 animate-in slide-in-from-top duration-300">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" /> Dépôt Mobile Money
          </h4>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[500, 1000, 2000].map(amt => (
              <button
                key={amt}
                onClick={() => setDepositAmount(String(amt))}
                className={`py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  depositAmount === String(amt)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {amt.toLocaleString()} XAF
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Montant personnalisé..."
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 mb-3 font-mono"
          />
          <button
            onClick={handleDeposit}
            disabled={loading || !depositAmount || parseInt(depositAmount) < 100}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            Confirmer le dépôt
          </button>
        </div>
      )}

      {/* Credit Modal */}
      {showCredit && creditLimit > 0 && (
        <div className="p-4 border-t border-white/5 animate-in slide-in-from-top duration-300">
          <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" /> Micro-Crédit Instant
          </h4>
          <p className="text-[11px] text-slate-500 mb-4">
            Voyagez maintenant, payez au prochain dépôt. Disponible pour les membres {tierLabel[trustTier]}.
          </p>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-4 text-center">
            <p className="text-3xl font-black text-blue-400">{Math.min(500, creditLimit - creditUsed).toLocaleString()} XAF</p>
            <p className="text-[9px] text-blue-400/60 font-mono uppercase tracking-widest mt-1">Crédit disponible</p>
          </div>
          <button
            onClick={handleUseCredit}
            disabled={loading || creditUsed >= creditLimit}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Activer le crédit
          </button>
        </div>
      )}

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="p-4 border-t border-white/5">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" /> Transactions
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {transactions.map((tx, i) => (
              <div key={i} className="flex items-center justify-between bg-surface/50 px-4 py-3 rounded-2xl ghost-border hover:bg-surface transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    tx.type === 'deposit' ? 'bg-green/10 text-green' :
                    tx.type === 'credit' ? 'bg-primary/10 text-primary' :
                    'bg-error/10 text-error'
                  }`}>
                    {tx.type === 'deposit' ? <ArrowDownRight className="w-5 h-5 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> :
                     tx.type === 'credit' ? <CreditCard className="w-5 h-5 drop-shadow-[0_0_8px_rgba(183,196,255,0.5)]" /> :
                     <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-on-surface">{tx.description || tx.type}</p>
                    <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
                <span className={`font-display font-medium text-sm ${
                  tx.type === 'deposit' || tx.type === 'credit' ? 'text-green' : 'text-error'
                }`}>
                  {tx.type === 'deposit' || tx.type === 'credit' ? '+' : '-'}{tx.amount_xaf?.toLocaleString()} <span className="text-[10px] font-sans">XAF</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
