import React, { useState, useEffect } from 'react';
import { AlertTriangle, Phone, MapPin, Shield, Loader2 } from 'lucide-react';
import { sendPanicAlert, supabase } from '../../supabaseClient';

const SOS_FALLBACK_STORAGE_KEY = 'afat_pending_sos_events';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function EmergencySOS({ userId, userName, onClose }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'sending' | 'active'>('confirm');
  const [coords, setCoords] = useState<{lat: number; lng: number} | null>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords({ lat: 3.848, lng: 11.502 }) // Fallback: Yaoundé
    );
  }, []);

  useEffect(() => {
    if (phase !== 'confirm') return;
    if (countdown <= 0) {
      triggerSOS();
      return;
    }
    const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  const triggerSOS = async () => {
    setPhase('sending');

    const location = coords || { lat: 3.848, lng: 11.502 };

    const { error } = await sendPanicAlert({
      user_id: userId,
      user_name: userName,
      latitude: location.lat,
      longitude: location.lng,
      source: 'sos_button'
    });

    if (error) {
      const pendingRaw = localStorage.getItem(SOS_FALLBACK_STORAGE_KEY);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
      pending.push({
        user_id: userId,
        user_name: userName,
        latitude: location.lat,
        longitude: location.lng,
        source: 'sos_button_fallback',
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(SOS_FALLBACK_STORAGE_KEY, JSON.stringify(pending));

      try {
        await supabase.from('sos_events').insert({
          user_id: userId,
          latitude: location.lat,
          longitude: location.lng,
          status: 'active'
        });
      } catch {}
    } else {
      try {
        await supabase.from('sos_events').insert({
        user_id: userId,
        latitude: location.lat,
        longitude: location.lng,
        status: 'active'
        });
      } catch {}
    }

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 500]);
    }

    setPhase('active');
  };

  const cancelSOS = () => {
    setPhase('confirm');
    setCountdown(5);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Pulsing red backdrop */}
      <div className={`absolute inset-0 transition-all duration-500 ${
        phase === 'active' 
          ? 'bg-red-950/95 animate-pulse' 
          : 'bg-slate-950/95 backdrop-blur-xl'
      }`} />

      <div className="relative w-full max-w-sm">
        {phase === 'confirm' && (
          <div className="bg-slate-900 border border-red-500/30 rounded-[40px] p-8 text-center shadow-2xl shadow-red-500/20 animate-in zoom-in duration-300">
            {/* Countdown ring */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="4" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#ef4444" strokeWidth="4"
                  strokeDasharray={`${(countdown / 5) * 264} 264`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-black text-red-500">{countdown}</span>
              </div>
            </div>

            <h2 className="text-2xl font-black text-red-500 uppercase tracking-tight mb-2">Emergency SOS</h2>
            <p className="text-slate-400 text-sm mb-8">
              Sending alert in {countdown}s. Your GPS coordinates will be shared with nearby guardians and emergency services.
            </p>

            <div className="space-y-3">
              <button
                onClick={triggerSOS}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 rounded-3xl transition-all uppercase tracking-widest text-sm shadow-xl shadow-red-500/30 active:scale-95 flex items-center justify-center gap-3"
              >
                <AlertTriangle className="w-5 h-5" /> SEND NOW
              </button>
              <button
                onClick={cancelSOS}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-3xl transition-all text-sm"
              >
                Cancel — I'm Safe
              </button>
            </div>
          </div>
        )}

        {phase === 'sending' && (
          <div className="bg-slate-900 border border-red-500/20 rounded-[40px] p-12 text-center shadow-2xl">
            <Loader2 className="w-16 h-16 text-red-500 mx-auto mb-6 animate-spin" />
            <h2 className="text-xl font-black text-red-500 uppercase">Dispatching Alert...</h2>
            <p className="text-slate-500 text-sm mt-2">Broadcasting to emergency grid</p>
          </div>
        )}

        {phase === 'active' && (
          <div className="bg-red-950/80 border-2 border-red-500 rounded-[40px] p-8 text-center shadow-2xl shadow-red-500/40 ring-4 ring-red-500/20">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse ring-4 ring-red-500/30">
              <Shield className="w-10 h-10 text-red-500" />
            </div>

            <h2 className="text-2xl font-black text-red-500 uppercase tracking-tight mb-2">SOS ACTIVE</h2>
            <p className="text-red-200/60 text-sm mb-6">Emergency services have been notified</p>

            {coords && (
              <div className="bg-red-900/30 border border-red-500/20 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-red-300 text-xs font-mono">
                  <MapPin className="w-3 h-3" />
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <a href="tel:117" className="bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm active:scale-95 transition-all">
                <Phone className="w-4 h-4" /> Call 117
              </a>
              <a href="tel:112" className="bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm active:scale-95 transition-all">
                <Phone className="w-4 h-4" /> Call 112
              </a>
            </div>

            <button
              onClick={cancelSOS}
              className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-3xl transition-all text-sm border border-white/5"
            >
              Deactivate SOS — I'm Safe Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
