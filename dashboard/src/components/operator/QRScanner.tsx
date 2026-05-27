import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { verifyBoarding, verifyBoardingToken } from '../../supabaseClient';

interface Props {
  operatorId: string;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
}

export function QRScanner({ operatorId, onClose, onSuccess }: Props) {
  const [scanResult, setScanResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    async function onScanSuccess(decodedText: string) {
      scanner.clear();
      try {
        const data = JSON.parse(decodedText);
        if (data.t && data.s) {
          setScanResult(data);
          handleSecureVerify(data);
        } else if (data.bid) {
          setScanResult(data);
          handleVerify(data.bid);
        } else {
          setError("Invalid QR Code: No Booking ID found.");
        }
      } catch (err) {
        setError("Invalid QR Code format.");
      }
    }

    function onScanFailure(error: any) {
      // Ignore scan failures (usually means no QR in frame)
    }

    scanner.render(onScanSuccess, onScanFailure);

    return () => {
      scanner.clear().catch(console.error);
    };
  }, []);

  const handleVerify = async (bookingId: string) => {
    setIsVerifying(true);
    setError(null);
    
    const success = await verifyBoarding(bookingId, operatorId);
    
    if (success) {
      setIsVerifying(false);
      onSuccess(bookingId);
    } else {
      setIsVerifying(false);
      setError("Verification Failed: Booking not found, unpaid, or wrong operator.");
    }
  };

  const handleSecureVerify = async (ticket: any) => {
    setIsVerifying(true);
    setError(null);

    const { data, error } = await verifyBoardingToken(ticket, operatorId);

    if (!error && data?.success) {
      setIsVerifying(false);
      onSuccess(data.booking_id);
    } else {
      setIsVerifying(false);
      setError(error?.message || 'Secure verification failed.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center z-[3000] p-6">
      <div className="bg-slate-900 border border-white/5 w-full max-w-sm rounded-[40px] p-8 relative shadow-2xl flex flex-col items-center">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <h3 className="text-2xl font-black italic tracking-tighter uppercase mb-2">Ticket Scanner</h3>
          <p className="text-slate-500 text-[10px] font-mono uppercase tracking-widest">Verify Boarding Security</p>
        </div>

        {!scanResult && !error && (
          <div id="reader" className="w-full rounded-2xl overflow-hidden border border-white/10 bg-black/40 mb-6"></div>
        )}

        {isVerifying && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="font-bold">Verifying Intelligence...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-red-400 font-bold mb-4">{error}</p>
            <button 
              onClick={() => { setScanResult(null); setError(null); window.location.reload(); }} 
              className="bg-slate-800 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
            >
              Retry Scan
            </button>
          </div>
        )}

        {!isVerifying && !error && (
            <p className="text-slate-400 text-xs text-center px-4 leading-relaxed">
              Align the passenger's digital ticket within the frame to verify payment and authorize boarding.
            </p>
        )}
      </div>
    </div>
  );
}
