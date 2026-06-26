import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, CreditCard, ShieldCheck, Zap } from 'lucide-react';
import { getApiBaseUrl, supabase } from '../../supabaseClient';

interface ScanAndPayHubProps {
  onClose: () => void;
  onPaymentSuccess: (amount: number, operatorName: string) => void;
}

export const ScanAndPayHub: React.FC<ScanAndPayHubProps> = ({ onClose, onPaymentSuccess }) => {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [operator, setOperator] = useState<any>(null);
  const [amount, setAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'scanning' | 'paying'>('scanning');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (step === 'scanning') {
      const scanner = new Html5QrcodeScanner(
        "qr-reader", 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        setScanResult(decodedText);
        scanner.clear();
        processScan(decodedText);
      }, (error) => {
        // quiet errors for better UI
      });

      return () => {
        scanner.clear().catch(err => console.warn('Scanner clear error:', err));
      };
    }
  }, [step]);

  const processScan = async (url: string) => {
    try {
      // Parse operator ID from URL (e.g., https://app.asteck.cm/pay?operator=123)
      const urlObj = new URL(url);
      const opId = urlObj.searchParams.get('operator');
      const presetAmount = urlObj.searchParams.get('amount');
      
      if (opId) {
        setStatusMessage('');
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', opId)
          .single();
          
        if (data) {
          setOperator(data);
          if (presetAmount) setAmount(presetAmount);
          setStep('paying');
        } else {
          setStatusMessage('Opérateur non reconnu dans le réseau AFAT. Vérifiez le QR ou demandez au chauffeur de régénérer son code.');
          setStep('scanning');
        }
      }
    } catch (err) {
      console.error('QR Parse Error:', err);
      setStatusMessage('Code QR invalide. AFAT attend un lien de paiement signé avec un opérateur vérifié.');
      setStep('scanning');
    }
  };

  const handlePayment = async () => {
    if (!amount || isProcessing || !operator) return;
    setIsProcessing(true);
    setStatusMessage('');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const phone = user?.phone || user?.user_metadata?.phone;

      if (!phone) {
        setStatusMessage('Numéro de téléphone introuvable. Reconnectez-vous pour sécuriser le paiement Mobile Money.');
        setIsProcessing(false);
        return;
      }

      const response = await fetch(`${getApiBaseUrl()}/api/payment/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          phone,
          operatorId: operator.id,
          description: `Ride with ${operator.full_name}`
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        onPaymentSuccess(Number(amount), operator.full_name || 'Chauffeur');
        onClose();
      } else {
        setStatusMessage(`Paiement non confirmé: ${result.message || 'erreur inconnue'}. Aucun trajet ne sera validé sans confirmation.`);
      }
    } catch (err: any) {
      console.error('Payment Error:', err);
      setStatusMessage('Erreur réseau pendant le paiement. Réessayez ou passez par le guichet AFAT si la connexion est instable.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex flex-col p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400 w-6 h-6 fill-yellow-400" />
            Paiement Express
          </h2>
          <p className="text-slate-400 text-sm">QR Code • NFC • Magic Detection</p>
        </div>
        <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all">
          <X size={24} />
        </button>
      </div>

      {step === 'scanning' ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-sm aspect-square bg-slate-900 rounded-[40px] border-2 border-slate-800 overflow-hidden relative shadow-2xl">
            <div id="qr-reader" className="w-full h-full"></div>
            <div className="absolute inset-0 pointer-events-none border-[40px] border-slate-950/40"></div>
          </div>
          <p className="mt-8 text-slate-300 text-center font-medium px-8">
            Scannez le code QR sur le tableau de bord du véhicule (Moto, Taxi ou Bus)
          </p>
          {statusMessage && (
            <div className="mt-5 max-w-sm rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-center text-xs font-semibold text-amber-100">
              {statusMessage}
            </div>
          )}
          
          <div className="mt-12 flex gap-4 w-full max-w-xs">
            <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col items-center">
               <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center mb-2">
                  <CreditCard className="w-5 h-5 text-blue-500" />
               </div>
               <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">NFC Tag</span>
            </div>
            <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col items-center scale-110 border-blue-500/50 shadow-lg shadow-blue-500/10">
               <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center mb-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
               </div>
               <span className="text-[10px] text-yellow-500 uppercase font-bold tracking-tighter">QR Scan</span>
            </div>
            <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col items-center opacity-40">
               <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
               </div>
               <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Nearby</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col max-w-sm mx-auto w-full pt-12 animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] shadow-2xl relative overflow-hidden text-center mb-8">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-400"></div>
            
            <div className="w-20 h-20 bg-blue-600 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-3xl font-bold border-4 border-slate-800 shadow-xl">
              {operator?.full_name?.substring(0,1).toUpperCase()}
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-1">{operator?.full_name}</h3>
            <p className="text-slate-500 text-sm font-mono uppercase tracking-widest mb-8">Verified Operator</p>
            
            <div className="relative mb-6">
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl py-6 text-center text-4xl font-bold text-white focus:border-blue-500 transition-all outline-none"
                autoFocus
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-bold text-xl">XAF</span>
            </div>
            
            <p className="text-slate-400 text-xs px-4">
              Le paiement sera effectué de votre compte Mobile Money vers le portefeuille AFAT du chauffeur.
            </p>
            {statusMessage && (
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-100">
                {statusMessage}
              </div>
            )}
          </div>

          <button 
            onClick={handlePayment}
            disabled={!amount || isProcessing}
            className={`w-full py-5 rounded-[24px] font-bold text-xl flex items-center justify-center gap-3 shadow-2xl transition-all ${
              isProcessing 
                ? 'bg-slate-800 text-slate-500' 
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-blue-500/20'
            }`}
          >
            {isProcessing ? (
              <div className="w-6 h-6 border-4 border-slate-600 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <ShieldCheck />
                Confirmer & Payer
              </>
            )}
          </button>
          
          <button 
            onClick={() => setStep('scanning')}
            className="w-full mt-4 py-4 text-slate-500 hover:text-slate-300 font-semibold transition-colors"
          >
            Annuler et Ressayer
          </button>
        </div>
      )}

      <div className="mt-auto py-8 text-center">
        <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em]">AFAT Sentinel High Fidelity Payments</p>
      </div>
    </div>
  );
};
