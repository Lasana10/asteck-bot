import React, { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, Check, Loader2, Shield } from 'lucide-react';
import { fetchPaymentProviderReadiness, finalizeBookingPayment } from '../../supabaseClient';

interface Props {
  amount: number;
  operatorName: string;
  routeName: string;
  seatLabel: string;
  onBack: () => void;
  onPaymentComplete: (method: string, transactionId: string) => void;
  bookingId?: string;
}

export function PaymentSheet({ amount, operatorName, routeName, seatLabel, onBack, onPaymentComplete, bookingId }: Props) {
  const [selectedMethod, setSelectedMethod] = useState<'mtn_momo' | 'orange_money' | 'cash' | null>(null);
  const [phone, setPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [providerReadiness, setProviderReadiness] = useState<any>(null);

  useEffect(() => {
    fetchPaymentProviderReadiness().then(({ data }) => {
      if (data) setProviderReadiness(data);
    });
  }, []);

  const commission = Math.round(amount * 0.08); // 8% platform commission
  const driverReceives = amount - commission;
  const readinessMode = providerReadiness?.mode || 'unknown';
  const livePawaPay = Boolean(providerReadiness?.ready?.pawapay);
  const securityBadge = livePawaPay
    ? 'Securise via PawaPay'
    : readinessMode === 'live_or_hybrid'
      ? 'Mode hybride mobile money'
      : 'Mode operationnel local + ledger';

  const handlePay = async () => {
    if (!selectedMethod || !bookingId) {
      setErrorText('Reservation introuvable. Veuillez recommencer la procedure.');
      return;
    }

    setProcessing(true);
    setErrorText('');

    const txId = selectedMethod === 'cash'
      ? `CASH-${Date.now().toString(36).toUpperCase()}`
      : `TX-${Date.now().toString(36).toUpperCase()}`;

    try {
      if (selectedMethod !== 'cash') {
        const apiBaseUrl = import.meta.env.VITE_API_URL ||
          (window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')
            ? 'https://asteck-bot.onrender.com'
            : 'http://localhost:3000');

        const response = await fetch(`${apiBaseUrl}/api/payment/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            phone,
            booking_id: bookingId,
            provider: selectedMethod,
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || result.message || 'Le paiement mobile money a echoue.');
        }
      }

      const { data: finalizeData, error } = await finalizeBookingPayment(bookingId, selectedMethod, txId);
      if (error || !finalizeData?.success) {
        throw new Error(error?.message || 'Impossible de finaliser le paiement.');
      }

      setProcessing(false);
      setCompleted(true);

      setTimeout(() => {
        onPaymentComplete(selectedMethod, finalizeData.transaction_id || txId);
      }, 1500);
    } catch (err: any) {
      console.error('[AFAT] Payment finalization failed:', err);
      setProcessing(false);
      setErrorText(err.message || 'Impossible de finaliser le paiement.');
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <Check className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-black mb-2">Paiement Réussi!</h2>
        <p className="text-slate-400 text-center">Votre billet QR est prêt</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight">Paiement</h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Sécurisé · Chiffré</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {/* Order Summary */}
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-400">Trajet</span>
            <span className="font-bold text-sm">{routeName}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-400">Place</span>
            <span className="font-bold text-sm">{seatLabel}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-400">Chauffeur</span>
            <span className="font-bold text-sm">{operatorName}</span>
          </div>
          <div className="h-px bg-white/5 my-4"></div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-black">Total</span>
            <span className="text-2xl font-black text-blue-400">{amount}<span className="text-sm ml-1">FCFA</span></span>
          </div>
        </div>

        {/* Payment Methods */}
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[2px] mb-4">Méthode de paiement</h3>

        {errorText && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorText}
          </div>
        )}
        
        <div className="space-y-3 mb-6">
          {/* MTN MoMo */}
          <button
            onClick={() => setSelectedMethod('mtn_momo')}
            className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
              selectedMethod === 'mtn_momo' ? 'border-yellow-500 bg-yellow-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'
            }`}
          >
            <div className="w-12 h-12 bg-yellow-500 rounded-xl flex items-center justify-center text-black font-black text-sm">MTN</div>
            <div className="flex-1 text-left">
              <p className="font-bold">MTN Mobile Money</p>
              <p className="text-xs text-slate-400">Paiement direct via STK Push</p>
            </div>
            {selectedMethod === 'mtn_momo' && <Check className="w-5 h-5 text-yellow-500" />}
          </button>

          {/* Orange Money */}
          <button
            onClick={() => setSelectedMethod('orange_money')}
            className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
              selectedMethod === 'orange_money' ? 'border-orange-500 bg-orange-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'
            }`}
          >
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-sm">OM</div>
            <div className="flex-1 text-left">
              <p className="font-bold">Orange Money</p>
              <p className="text-xs text-slate-400">Paiement direct via #150#</p>
            </div>
            {selectedMethod === 'orange_money' && <Check className="w-5 h-5 text-orange-500" />}
          </button>

          {/* Cash */}
          <button
            onClick={() => setSelectedMethod('cash')}
            className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
              selectedMethod === 'cash' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'
            }`}
          >
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-lg">💵</div>
            <div className="flex-1 text-left">
              <p className="font-bold">Espèces</p>
              <p className="text-xs text-slate-400">Payer au chauffeur à l'embarquement</p>
            </div>
            {selectedMethod === 'cash' && <Check className="w-5 h-5 text-emerald-500" />}
          </button>
        </div>

        {/* Phone Input for Mobile Money */}
        {(selectedMethod === 'mtn_momo' || selectedMethod === 'orange_money') && (
          <div className="mb-6">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-[2px] mb-3">Numéro de téléphone</label>
            <div className="flex bg-slate-800/50 rounded-xl overflow-hidden border border-white/5 focus-within:ring-2 ring-blue-500/50">
              <span className="flex items-center justify-center px-4 text-slate-400 font-mono text-sm border-r border-white/5">+237</span>
              <input
                type="tel"
                placeholder="6XX XXX XXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="flex-1 bg-transparent px-4 py-4 text-white placeholder-slate-600 focus:outline-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1"></div>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 mb-4 text-slate-500">
          <Shield className="w-4 h-4" />
          <span className="text-[10px] font-mono uppercase tracking-widest">{securityBadge}</span>
        </div>

        {/* Pay Button */}
        <button
          onClick={handlePay}
          disabled={!selectedMethod || processing || (selectedMethod !== 'cash' && phone.length < 8)}
          className={`w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${
            selectedMethod && !processing
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-600/30 active:scale-[0.98]'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {processing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Traitement en cours...
            </>
          ) : (
            <>
              <CreditCard className="w-6 h-6" />
              PAYER {amount} FCFA
            </>
          )}
        </button>
      </main>
    </div>
  );
}
