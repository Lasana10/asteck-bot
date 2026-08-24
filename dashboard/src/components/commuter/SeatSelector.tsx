import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Clock, Lock, Zap, Loader2 } from 'lucide-react';
import { fetchPublishedDepartures, supabase } from '../../supabaseClient';

interface SeatData {
  id: string;
  row: number;
  col: number;
  status: 'available' | 'booked' | 'locked' | 'selected';
  label: string;
}

interface Props {
  departure: {
    id: string;
    route_name: string;
    origin: string;
    destination: string;
    price_xaf: number;
    total_seats: number;
    booked_seats: number;
    vehicle_type: string;
    operator_name: string;
    plate_number: string;
    departure_time: string;
    occupied_seats?: string[];
  };
  onBack: () => void;
  onConfirmSeat: (seatId: string) => void;
}

// Visual Blueprint Definitions for standard vehicle chassis
const BLUEPRINTS: Record<string, { rows: number; cols: number; visualStructure: string[]; driverPos: {r: number, c: number} }> = {
  moto: {
    rows: 2, cols: 1, driverPos: { r: 0, c: 0 },
    visualStructure: ['D', '1']
  },
  taxi: {
    rows: 2, cols: 3, driverPos: { r: 0, c: 0 },
    visualStructure: ['D _ 1', '2 3 4']
  },
  minibus: {
    rows: 4, cols: 4, driverPos: { r: 0, c: 0 },
    visualStructure: ['D _ 1 2', '3 4 5 6', '7 8 9 10', '11 12 13 14']
  },
  bus: {
    rows: 8, cols: 5, driverPos: { r: 0, c: 0 },
    visualStructure: [
      'D _ _ 1 2', 
      '3 4 _ 5 6', 
      '7 8 _ 9 10', 
      '11 12 _ 13 14', 
      '15 16 _ 17 18', 
      '19 20 _ 21 22',
      '23 24 _ 25 26',
      '27 28 29 30 31'
    ]
  }
};

function generateBlueprint(type: string, bookedLabels: string[]): { seats: SeatData[], layoutRows: any[], maxCols: number } {
  const seats: SeatData[] = [];
  const bookedSet = new Set(bookedLabels);
  const bp = BLUEPRINTS[type] || BLUEPRINTS['minibus'];
  
  const layoutRows = bp.visualStructure.map((rowStr, rIdx) => {
    const chars = rowStr.split(' ');
    return chars.map((char, cIdx) => {
      if (char === '_') return { type: 'aisle', key: `aisle-${rIdx}-${cIdx}` };
      if (char === 'D') return { type: 'driver', key: `driver-${rIdx}` };
      
      const labelStr = `${char}`;
      const isBooked = bookedSet.has(labelStr);
      
      const seatData: SeatData = {
        id: `seat-${rIdx}-${cIdx}`,
        row: rIdx,
        col: cIdx,
        status: isBooked ? 'booked' : 'available',
        label: labelStr,
      };
      seats.push(seatData);
      return { type: 'seat', data: seatData, key: seatData.id };
    });
  });

  return { seats, layoutRows, maxCols: bp.cols };
}

export function SeatSelector({ departure, onBack, onConfirmSeat }: Props) {
  const [seats, setSeats] = useState<SeatData[]>([]);
  const [layoutRows, setLayoutRows] = useState<any[]>([]);
  const [maxCols, setMaxCols] = useState(4);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [lockTimer, setLockTimer] = useState(480); // 8 minutes in seconds

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOccupancy();
    
    const channel = supabase
      .channel(`seats-${departure.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `route_id=eq.${departure.id}` }, () => {
        fetchOccupancy();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [departure]);

  const fetchOccupancy = async () => {
    setLoading(true);
    const { data } = await fetchPublishedDepartures();
    const current = data?.departures?.find((item: any) => item.id === departure.id);
    const bookedLabels = (current?.occupied_seats || departure.occupied_seats || []) as string[];
    const layout = generateBlueprint(departure.vehicle_type, bookedLabels);
    setSeats(layout.seats);
    setLayoutRows(layout.layoutRows);
    setMaxCols(layout.maxCols);
    setLoading(false);
  };

  // Countdown timer for seat lock
  useEffect(() => {
    if (!selectedSeat) return;
    const interval = setInterval(() => {
      setLockTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setSelectedSeat(null);
          setSeats(s => s.map(seat => seat.status === 'selected' ? { ...seat, status: 'available' } : seat));
          return 480;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedSeat]);

  const handleSeatTap = (seatId: string) => {
    setSeats(prev => prev.map(s => {
      if (s.id === seatId && s.status === 'available') return { ...s, status: 'selected' };
      if (s.id !== seatId && s.status === 'selected') return { ...s, status: 'available' };
      return s;
    }));
    setSelectedSeat(seatId);
    setLockTimer(480);
  };

  const getTimeUntil = (isoTime: string) => {
    const mins = Math.round((new Date(isoTime).getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'Maintenant';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h${mins % 60}`;
  };

  const seatColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-slate-800 border-white/10 hover:bg-blue-600/20 hover:border-blue-500/50 cursor-pointer';
      case 'booked': return 'bg-red-500/10 border-red-500/20 cursor-not-allowed';
      case 'selected': return 'bg-blue-600 border-blue-400 ring-2 ring-blue-500/50 cursor-pointer';
      case 'locked': return 'bg-amber-500/10 border-amber-500/20 cursor-not-allowed';
      default: return 'bg-slate-800 border-white/5';
    }
  };

  const cols = seats.length > 0 ? Math.max(...seats.map(s => s.col)) + 1 : 4;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-extrabold text-lg tracking-tight">Choix de Place</h1>
            <p className="text-[11px] text-slate-400">{departure.origin} → {departure.destination} · Départ {getTimeUntil(departure.departure_time)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black">{departure.price_xaf}<span className="text-xs text-slate-500 ml-1">FCFA</span></p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-6">
        {/* Vehicle Info */}
        <div className="w-full max-w-sm bg-slate-900/50 border border-white/5 rounded-2xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{departure.vehicle_type === 'moto' ? '🏍️' : departure.vehicle_type === 'taxi' ? '🚕' : departure.vehicle_type === 'minibus' ? '🚐' : '🚌'}</span>
            <div>
              <p className="font-bold text-sm">{departure.operator_name}</p>
              <p className="text-[10px] text-slate-500 font-mono">{departure.plate_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-bold">
            <Clock className="w-4 h-4" /> {getTimeUntil(departure.departure_time)}
          </div>
        </div>

        {/* Vehicle Layout Visualization */}
        <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-8 mb-8 relative">
          {/* Blueprint Layout Engine */}

          {loading ? (
             <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                <p className="text-sm font-mono text-slate-500 uppercase tracking-widest">Scanning Grid...</p>
             </div>
          ) : (
             <div className="flex flex-col items-center gap-3">
               {layoutRows.map((rowItems, rIdx) => (
                 <div key={`row-${rIdx}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1fr))` }}>
                   {rowItems.map((item: any, cIdx: number) => {
                     if (item.type === 'aisle') {
                       return <div key={item.key} className="w-14 h-14" />;
                     }
                     if (item.type === 'driver') {
                       return (
                         <div key={item.key} className="w-14 h-14 rounded-xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center opacity-70">
                           <span className="text-xl">🧑‍✈️</span>
                         </div>
                       );
                     }
                     const seat = item.data as SeatData;
                     return (
                       <button
                         key={seat.id}
                         onClick={() => seat.status === 'available' || seat.status === 'selected' ? handleSeatTap(seat.id) : null}
                         disabled={seat.status === 'booked' || seat.status === 'locked'}
                         className={`w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${seatColor(seat.status)}`}
                       >
                         {seat.status === 'selected' ? (
                           <Check className="w-5 h-5 text-white" />
                         ) : seat.status === 'booked' ? (
                           <Lock className="w-4 h-4 text-red-400/60" />
                         ) : (
                           <span className="text-xs font-bold text-slate-400">{seat.label}</span>
                         )}
                       </button>
                     );
                   })}
                 </div>
               ))}
             </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mb-8 text-[11px] text-slate-500">
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-slate-800 border border-white/10 rounded"></div> Libre</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-blue-600 border border-blue-400 rounded"></div> Votre choix</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-500/10 border border-red-500/20 rounded"></div> Occupé</div>
        </div>

        {/* Lock Timer */}
        {selectedSeat && (
          <div className="w-full max-w-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
            <span className="text-xs text-amber-500 font-bold">Place réservée pour:</span>
            <span className="text-sm font-mono font-black text-amber-400">
              {Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={() => selectedSeat && onConfirmSeat(selectedSeat)}
          disabled={!selectedSeat}
          className={`w-full max-w-sm py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${
            selectedSeat 
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-600/30 active:scale-[0.98]' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          <Zap className="w-6 h-6" />
          {selectedSeat ? `CONFIRMER · ${departure.price_xaf} FCFA` : 'Sélectionner une place'}
        </button>
      </main>
    </div>
  );
}
