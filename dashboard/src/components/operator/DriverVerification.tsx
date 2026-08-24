import React, { useState, useRef } from 'react';
import { Camera, ShieldCheck, CheckCircle2, Loader2, AlertTriangle, Upload } from 'lucide-react';
import { afatAuthHeaders, getApiBaseUrl, supabase } from '../../supabaseClient';

export function DriverVerification() {
  const [step, setStep] = useState(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep(2);
    setIsVerifying(true);

    try {
      // 1. Convert to Base64
      const base64 = await fileToBase64(file);

      const response = await fetch(`${getApiBaseUrl()}/api/ai/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
        body: JSON.stringify({
          image: base64,
          prompt: 'Extract the following from this Cameroonian ID or Driver License: 1) Is it a valid ID? 2) Name, 3) Document Number, 4) Expiration Date. Return ONLY JSON.'
        })
      });

      const data = await response.json();
      const rawText = typeof data.text === 'string' ? data.text : '';
      let analysis: any = { valid: false, error: 'No OCR details returned by the low-cost vision path.', raw: rawText };

      try {
        analysis = rawText ? JSON.parse(rawText) : analysis;
      } catch {
        if (rawText) {
          analysis = {
            valid: /valid|verified|license|identity/i.test(rawText),
            raw: rawText,
            error: /valid|verified|license|identity/i.test(rawText) ? undefined : 'Document needs manual review.'
          };
        }
      }

      setVerificationResult(analysis);
      
      // Update DB if valid
      if (analysis.valid) {
        const user = await supabase.auth.getUser();
        if (user.data.user) {
          await supabase.from('vehicles').update({ is_verified: true }).eq('owner_id', user.data.user.id);
        }
      }

      setStep(3);

    } catch (err) {
      console.error("Verification failed", err);
      setVerificationResult({ valid: false, error: "Analyse impossible. Veuillez réessayer avec une photo plus claire." });
      setStep(3);
    } finally {
      setIsVerifying(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="bg-slate-900 border border-white/5 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold mb-1">Know Your Driver (KYD)</h2>
          <p className="text-slate-400 text-sm">Vérification d'identité automatisée par Vision AI</p>
        </div>
        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
        </div>
      </div>

      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-800 -z-10">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}></div>
        </div>

        <div className="flex justify-between mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600' : 'bg-slate-800'} text-xs font-bold ring-4 ring-slate-900`}>1</div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600' : 'bg-slate-800 pointer-events-none'} text-xs font-bold ring-4 ring-slate-900`}>2</div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? (verificationResult?.valid ? 'bg-emerald-600' : 'bg-red-600') : 'bg-slate-800'} text-xs font-bold ring-4 ring-slate-900`}>3</div>
        </div>
      </div>

      {step === 1 && (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-bold mb-2">Prenez en photo votre CNI ou Permis</h3>
          <p className="text-xs text-slate-500 mb-6 max-w-xs mx-auto">
            La photo doit être claire, sans reflets. Les données sont analysées instantanément et ne sont pas stockées.
          </p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto transition-colors"
          >
            <Upload className="w-4 h-4" /> Scanner le Document
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <h3 className="font-bold mb-2">Analyse Vision AI en cours...</h3>
          <p className="text-xs text-slate-500">Extraction des données cryptographiques</p>
        </div>
      )}

      {step === 3 && verificationResult && (
        <div className="py-6">
          {verificationResult.valid !== false ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg mb-1">Identité Vérifiée</h3>
              <p className="text-sm text-slate-400 mb-6">Bienvenue dans le réseau AFAT, Chauffeur.</p>

              <div className="bg-slate-800/50 rounded-xl p-4 text-left max-w-sm mx-auto">
                <div className="flex justify-between border-b border-white/5 pb-2 mb-2">
                  <span className="text-xs text-slate-500">Nom</span>
                  <span className="text-xs font-bold text-white">{verificationResult.Name || verificationResult.name || 'Extrait'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Document No.</span>
                  <span className="text-xs font-bold text-white font-mono">{verificationResult.DocumentNumber || verificationResult.document_number || '***'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-bold text-lg mb-1">Vérification Échouée</h3>
              <p className="text-sm text-slate-400 mb-6">{verificationResult.error}</p>
              <button onClick={() => setStep(1)} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">
                Réessayer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
