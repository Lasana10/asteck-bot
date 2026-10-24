import React, { useEffect, useRef, useState } from 'react';
import {paymentPhaseFromBooking,type PaymentPhase} from '../../services/paymentRecovery';
import { ArrowLeft, CreditCard, Check, Loader2, Shield } from 'lucide-react';
import { fetchBookingStatus, fetchPaymentProviderReadiness, finalizeBookingPayment, startBookingMobilePayment, reconcileBookingPayment } from '../../supabaseClient';

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
  const [pendingTransactionId, setPendingTransactionId] = useState('');
  const [serverPhase,setServerPhase]=useState<PaymentPhase|'checking'>('checking');
  const completionDelivered=useRef(false);

  const deliverConfirmed=(method:string,transactionId:string)=>{
    if(completionDelivered.current)return;
    completionDelivered.current=true;
    setCompleted(true);
    setProcessing(false);
    onPaymentComplete(method,transactionId);
  };
  const applyServerBooking=(booking:any)=>{
    const state=paymentPhaseFromBooking(booking);
    setServerPhase(state.phase);
    setPendingTransactionId(state.phase==='pending'?state.transactionId:'');
    if(state.phase==='paid'){
      if(!state.transactionId){setErrorText('Payment confirmed but no server transaction reference is available. Contact AFAT support.');return state;}
      deliverConfirmed(selectedMethod||'mobile_money',state.transactionId);
    }
    if(state.phase==='cash_due')deliverConfirmed('cash',state.transactionId);
    return state;
  };
  const refreshBooking=async()=>{
    if(!bookingId)return;
    const {data,error}=await fetchBookingStatus(bookingId);
    if(error||!data?.booking){setServerPhase('unknown');setErrorText('Booking status could not be verified. No additional payment will be started.');return;}
    applyServerBooking(data.booking);
  };
  useEffect(()=>{
    let active=true;
    completionDelivered.current=false;
    setServerPhase('checking');
    setPendingTransactionId('');
    if(bookingId)void fetchBookingStatus(bookingId).then(({data,error})=>{
      if(!active)return;
      if(error||!data?.booking){setServerPhase('unknown');setErrorText('Booking payment state is unavailable. Check status before any new payment.');return;}
      applyServerBooking(data.booking);
    });
    return()=>{active=false;};
  },[bookingId]);


  useEffect(() => {
    fetchPaymentProviderReadiness().then(({ data }) => {
      if (data) setProviderReadiness(data);
    });
  }, []);

  const readinessMode = providerReadiness?.mode || 'unknown';
  const livePawaPay = Boolean(providerReadiness?.ready?.pawapay);
  const securityBadge = livePawaPay
    ? 'Confirmation fournisseur PawaPay requise'
    : readinessMode === 'live_or_hybrid'
      ? 'Confirmation fournisseur requise'
      : 'Mode local + registre de paiement';

  const handlePay=async()=>{
    if(!selectedMethod||!bookingId||processing||serverPhase!=='ready')return;
    setProcessing(true);setErrorText('');
    try{
      // Confirm server transaction state *before* creating any provider request.
      const {data:latest,error:lookupError}=await fetchBookingStatus(bookingId);
      if(lookupError||!latest?.booking)throw new Error('Unable to confirm booking before collecting money.');
      const guard=paymentPhaseFromBooking(latest.booking);
      if(guard.phase!=='ready'){
        applyServerBooking(latest.booking);
        setErrorText('The booking payment state changed. No new collection request was created.');
        setProcessing(false);return;
      }
      setServerPhase('checking');
      if(selectedMethod!=='cash'){
        const {data:checkout,error:checkoutError}=await startBookingMobilePayment({
          bookingId,phone,mobileNetwork:selectedMethod,
        });
        if(checkoutError||!checkout?.transactionId)
          throw new Error(checkoutError?.message||'Payment collection initiation could not be confirmed.');
        setPendingTransactionId(checkout.transactionId);
        setServerPhase('pending');
        await checkPendingPayment(checkout.transactionId,true);
        return;
      }
      const {data:finalizeData,error}=await finalizeBookingPayment(bookingId,'cash');
      if(error||!finalizeData?.success)throw new Error(error?.message||'Cash payment selection not confirmed.');
      await refreshBooking();
    }catch(err:any){
      // An upstream timeout may occur AFTER the provider request was reserved.
      // Never turn an uncertain response into permission to charge again.
      const {data}=await fetchBookingStatus(bookingId);
      if(data?.booking){
        const state=applyServerBooking(data.booking);
        if(state.phase!=='ready'){setErrorText('Payment status is being reconciled; do not pay twice.');setProcessing(false);return;}
      }else setServerPhase('unknown');
      setErrorText(err?.message||'The payment could not be verified.');
    }finally{setProcessing(false);}
  };

  const checkPendingPayment=async(transactionId:string,keepPolling=false)=>{
    if(!bookingId)return;
    setProcessing(true);setErrorText('');
    if(!keepPolling){
      // Explicit provider-side reconciliation can repair a missing webhook.
      // Only a booking marked paid by the server can issue a ticket.
      await reconcileBookingPayment(bookingId);
    }
    const attempts=keepPolling?30:1;
    for(let attempt=0;attempt<attempts;attempt++){
      const {data,error}=await fetchBookingStatus(bookingId);
      if(!error&&data?.booking){
        const result=paymentPhaseFromBooking(data.booking);
        if(result.phase==='paid'||result.phase==='cash_due'){
          applyServerBooking(data.booking);setProcessing(false);return;
        }
        if(result.phase==='ready'||result.phase==='blocked'){
          setServerPhase(result.phase);
          setPendingTransactionId('');
          setErrorText(result.phase==='ready'?'The provider attempt ended without payment. You may select a new method.':'This booking is no longer payable.');
          setProcessing(false);return;
        }
        setServerPhase('pending');
        if(result.transactionId)setPendingTransactionId(result.transactionId);
      }
      if(attempt<attempts-1)await new Promise(resolve=>window.setTimeout(resolve,2000));
    }
    setProcessing(false);
    setErrorText('Payment is still awaiting confirmed provider settlement. Do not initiate a second collection. You can recheck this booking later.');
  };

  if (completed) {
    const isCash = selectedMethod === 'cash';
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-black mb-2">{isCash ? 'Paiement en espèces choisi' : 'Paiement confirmé'}</h2>
        <p className="max-w-sm text-slate-400 text-center">{isCash ? 'Le montant reste dû au chauffeur jusqu’à confirmation de la collecte. AFAT ne le compte pas encore comme payé.' : 'Le fournisseur a confirmé le paiement. Votre réservation peut continuer.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight">Paiement</h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Statut validé côté serveur</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4"><span className="text-sm text-slate-400">Trajet</span><span className="font-bold text-sm">{routeName}</span></div>
          <div className="flex items-center justify-between mb-4"><span className="text-sm text-slate-400">Place</span><span className="font-bold text-sm">{seatLabel}</span></div>
          <div className="flex items-center justify-between mb-4"><span className="text-sm text-slate-400">Chauffeur</span><span className="font-bold text-sm">{operatorName}</span></div>
          <div className="h-px bg-white/5 my-4" />
          <div className="flex items-center justify-between"><span className="text-lg font-black">Total</span><span className="text-2xl font-black text-blue-400">{amount}<span className="text-sm ml-1">FCFA</span></span></div>
        </div>

        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[2px] mb-4">Méthode de paiement</h3>

        {errorText && <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

        {serverPhase==='pending' && (
          <div className="mb-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-4 text-sm text-blue-100">
            <p className="font-black">Confirmation du fournisseur en attente</p>
            <p className="mt-1 text-xs text-blue-100/70">{pendingTransactionId?`Référence: ${pendingTransactionId}`:'Server collection pending · reference being resolved'}</p>
            <button type="button" disabled={processing} onClick={() => void checkPendingPayment(pendingTransactionId)} className="mt-3 rounded-xl border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-xs font-black uppercase tracking-widest">Vérifier le paiement</button>
          </div>
        )}

        {serverPhase==='unknown'&&<button type="button" disabled={processing} onClick={()=>void refreshBooking()} className="mb-4 w-full rounded-xl border border-amber-300/20 p-3 text-xs text-amber-100">Verify booking status before another collection</button>}
        <div className="space-y-3 mb-6">
          <button onClick={() => setSelectedMethod('mtn_momo')} className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${selectedMethod === 'mtn_momo' ? 'border-yellow-500 bg-yellow-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'}`}>
            <div className="w-12 h-12 bg-yellow-500 rounded-xl flex items-center justify-center text-black font-black text-sm">MTN</div>
            <div className="flex-1 text-left"><p className="font-bold">MTN Mobile Money</p><p className="text-xs text-slate-400">Demande envoyée au fournisseur configuré; AFAT attend sa confirmation.</p></div>
            {selectedMethod === 'mtn_momo' && <Check className="w-5 h-5 text-yellow-500" />}
          </button>

          <button onClick={() => setSelectedMethod('orange_money')} className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${selectedMethod === 'orange_money' ? 'border-orange-500 bg-orange-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'}`}>
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-sm">OM</div>
            <div className="flex-1 text-left"><p className="font-bold">Orange Money</p><p className="text-xs text-slate-400">Demande envoyée au fournisseur configuré; AFAT attend sa confirmation.</p></div>
            {selectedMethod === 'orange_money' && <Check className="w-5 h-5 text-orange-500" />}
          </button>

          <button onClick={() => setSelectedMethod('cash')} className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${selectedMethod === 'cash' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-slate-900/50 hover:border-white/10'}`}>
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-lg">💵</div>
            <div className="flex-1 text-left"><p className="font-bold">Espèces</p><p className="text-xs text-slate-400">Le paiement reste dû jusqu’à confirmation de collecte par le workflow opérateur.</p></div>
            {selectedMethod === 'cash' && <Check className="w-5 h-5 text-emerald-500" />}
          </button>
        </div>

        {(selectedMethod === 'mtn_momo' || selectedMethod === 'orange_money') && (
          <div className="mb-6">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-[2px] mb-3">Numéro de téléphone</label>
            <div className="flex bg-slate-800/50 rounded-xl overflow-hidden border border-white/5 focus-within:ring-2 ring-blue-500/50">
              <span className="flex items-center justify-center px-4 text-slate-400 font-mono text-sm border-r border-white/5">+237</span>
              <input type="tel" placeholder="6XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} className="flex-1 bg-transparent px-4 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
            </div>
          </div>
        )}

        <div className="flex-1" />
        <div className="flex items-center justify-center gap-2 mb-4 text-slate-500"><Shield className="w-4 h-4" /><span className="text-[10px] font-mono uppercase tracking-widest">{securityBadge}</span></div>

        <button onClick={handlePay} disabled={!selectedMethod || processing || serverPhase!=='ready' || (selectedMethod !== 'cash' && phone.length < 8)} className={`w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${selectedMethod && !processing ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-600/30 active:scale-[0.98]' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
          {processing ? <><Loader2 className="w-6 h-6 animate-spin" />Traitement en cours...</> : <><CreditCard className="w-6 h-6" />{selectedMethod === 'cash' ? `CONFIRMER ESPÈCES · ${amount} FCFA` : `PAYER ${amount} FCFA`}</>}
        </button>
      </main>
    </div>
  );
}
