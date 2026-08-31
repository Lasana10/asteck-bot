import React, { useState, useEffect } from 'react';
import { Navigation2, Clock, X, MapPin, Phone, Car } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface Props {
  bookingId: string;
  operatorId: string;
  onClose: () => void;
}

export function LiveETATracker({ bookingId, operatorId, onClose }: Props) {
  const [operatorLocation, setOperatorLocation] = useState<{lat: number; lng: number} | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [operatorInfo, setOperatorInfo] = useState<any>(null);
  const [status, setStatus] = useState<'tracking' | 'arriving' | 'arrived'>('tracking');

  useEffect(() => {
    fetchOperatorInfo();

    // Subscribe to real-time location updates
    const channel = supabase
      .channel(`operator-track-${operatorId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'movement_logs',
        filter: `user_id=eq.${operatorId}`
      }, (payload: any) => {
        const track = payload.new;
        if (Number.isFinite(Number(track.latitude)) && Number.isFinite(Number(track.longitude))) {
            const lng = Number(track.longitude);
            const lat = Number(track.latitude);
            setOperatorLocation({ lat, lng });

            // Rough ETA: assume 30km/h avg in city
            const speed = track.speed || 30;
            const distance = calculateDistance(lat, lng);
            const eta = Math.max(1, Math.round((distance / speed) * 60));
            setEtaMinutes(eta);

            if (eta <= 2) setStatus('arriving');
            if (distance < 0.1) setStatus('arrived');
        }
      })
      .subscribe();

    // Also fetch latest known position
    fetchLatestPosition();

    return () => { supabase.removeChannel(channel); };
  }, [operatorId]);

  const fetchOperatorInfo = async () => {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('*, profiles!operator_id(full_name)')
      .eq('operator_id', operatorId)
      .single();
    if (vehicle) setOperatorInfo(vehicle);
  };

  const fetchLatestPosition = async () => {
    const { data } = await supabase
      .from('movement_logs')
      .select('*')
      .eq('user_id', operatorId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (Number.isFinite(Number(data?.latitude)) && Number.isFinite(Number(data?.longitude))) {
        const lng = Number(data.longitude);
        const lat = Number(data.latitude);
        setOperatorLocation({ lat, lng });
        const distance = calculateDistance(lat, lng);
        setEtaMinutes(Math.max(1, Math.round((distance / 30) * 60)));
    }
  };

  const calculateDistance = (lat: number, lng: number) => {
    // Haversine formula (simplified) — returns km
    const R = 6371;
    const myLat = 3.848; // Default: Yaoundé center
    const myLng = 11.502;
    const dLat = (lat - myLat) * Math.PI / 180;
    const dLng = (lng - myLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(myLat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-slate-900 border border-white/5 rounded-[40px] p-8 shadow-2xl shadow-black animate-in slide-in-from-bottom duration-500">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-500 hover:text-white p-2 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Status Header */}
        <div className="text-center mb-8">
          {status === 'tracking' && (
            <>
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-blue-500/20 animate-pulse">
                <Car className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-black uppercase italic text-blue-500">En Route</h3>
              <p className="text-slate-400 text-sm mt-1">Your operator is on the way</p>
            </>
          )}
          {status === 'arriving' && (
            <>
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-amber-500/20 animate-bounce">
                <Navigation2 className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-black uppercase italic text-amber-500">Almost There!</h3>
              <p className="text-slate-400 text-sm mt-1">Get ready to board</p>
            </>
          )}
          {status === 'arrived' && (
            <>
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-emerald-500/20">
                <MapPin className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-xl font-black uppercase italic text-emerald-500">Arrived!</h3>
              <p className="text-slate-400 text-sm mt-1">Your operator has arrived at the stop</p>
            </>
          )}
        </div>

        {/* ETA Display */}
        {etaMinutes !== null && status !== 'arrived' && (
          <div className="bg-slate-950/50 border border-white/5 rounded-[32px] p-6 text-center mb-6">
            <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-2">Estimated Arrival</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl font-black text-white">{etaMinutes}</span>
              <span className="text-lg font-bold text-slate-500">min</span>
            </div>
          </div>
        )}

        {/* Operator Info */}
        {operatorInfo && (
          <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20 font-black text-blue-500 text-sm">
                {operatorInfo.plate_number?.[0] || 'O'}
              </div>
              <div>
                <p className="font-bold text-sm">{operatorInfo.plate_number || 'Vehicle'}</p>
                <p className="text-[10px] text-slate-500 font-mono uppercase">{operatorInfo.type || 'Standard'} • {operatorInfo.capacity} seats</p>
              </div>
            </div>
            {operatorLocation && (
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-mono">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Live
                </p>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block ml-1" />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl text-sm transition-all"
          >
            Dismiss
          </button>
          <a
            href={`tel:+237`}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Phone className="w-4 h-4" /> Call Driver
          </a>
        </div>
      </div>
    </div>
  );
}
