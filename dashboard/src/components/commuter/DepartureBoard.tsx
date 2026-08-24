import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Users, ChevronRight, Search, Filter, ArrowLeft, RefreshCw } from 'lucide-react';
import { fetchPublishedDepartures, supabase } from '../../supabaseClient';

interface Departure {
  id: string;
  vehicle_id: string;
  route_name: string;
  origin: string;
  destination: string;
  departure_time: string;
  price_xaf: number;
  total_seats: number;
  booked_seats: number;
  vehicle_type: string;
  operator_id: string;
  operator_name: string;
  plate_number: string;
  rating: number;
  occupied_seats?: string[];
}

interface Props {
  onBack: () => void;
  onSelectDeparture: (departure: Departure) => void;
}

export function DepartureBoard({ onBack, onSelectDeparture }: Props) {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [feedHealthy, setFeedHealthy] = useState(true);

  useEffect(() => {
    fetchDepartures();
    
    // Real-time updates on bookings table changes
    const channel = supabase
      .channel('departures-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchDepartures();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDepartures = async () => {
    setLoading(true);
    setFeedHealthy(true);
    
    const { data, error: routesError } = await fetchPublishedDepartures();

    if (routesError) {
      console.error('[AFAT] Failed to load departures', routesError);
      setFeedHealthy(false);
      setDepartures([]);
      setLoading(false);
      return;
    }

    if (data?.departures?.length) {
      setDepartures(data.departures);
    } else {
      setDepartures([]);
    }
    setLoading(false);
  };

  const vehicleEmoji: Record<string, string> = { moto: '🏍️', taxi: '🚕', minibus: '🚐', bus: '🚌' };

  const filtered = departures.filter(d => {
    const matchSearch = !searchQuery || 
      d.origin.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || d.vehicle_type === filterType;
    return matchSearch && matchType;
  });

  const getTimeUntil = (isoTime: string) => {
    const mins = Math.round((new Date(isoTime).getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'Maintenant';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h${mins % 60}`;
  };

  const getAvailability = (total: number, booked: number) => {
    const available = total - booked;
    if (available <= 0) return { text: 'Complet', color: 'text-red-500 bg-red-500/10' };
    if (available <= 2) return { text: `${available} place${available > 1 ? 's' : ''}`, color: 'text-amber-500 bg-amber-500/10' };
    return { text: `${available} places`, color: 'text-emerald-500 bg-emerald-500/10' };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight">Tableau des Départs</h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Temps réel · Yaoundé</p>
          </div>
          <button onClick={fetchDepartures} className="ml-auto p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Chercher une destination..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 ring-blue-500/50 transition-all"
            />
          </div>
        </div>

        {/* Vehicle Type Filters */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'moto', label: '🏍️ Moto' },
            { key: 'taxi', label: '🚕 Taxi' },
            { key: 'minibus', label: '🚐 Minibus' },
            { key: 'bus', label: '🚌 Bus' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                filterType === f.key 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* Departure List */}
      <div className="flex-1 p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-bold">{feedHealthy ? 'Aucun départ vérifié pour le moment' : 'Flux de départ indisponible'}</p>
            <p className="text-sm mt-1">
              {feedHealthy
                ? 'AFAT affichera ici les trajets dès que des opérateurs publient des départs actifs.'
                : 'Le tableau ne fabrique pas de départs. Revenez après synchronisation du backend.'}
            </p>
          </div>
        ) : (
          filtered.map(departure => {
            const availability = getAvailability(departure.total_seats, departure.booked_seats);
            const availableSeats = departure.total_seats - departure.booked_seats;
            
            return (
              <button
                key={departure.id}
                onClick={() => availableSeats > 0 && onSelectDeparture(departure)}
                disabled={availableSeats <= 0}
                className={`w-full bg-slate-900/50 border border-white/5 rounded-2xl p-5 text-left transition-all ${
                  availableSeats > 0 ? 'hover:bg-slate-800/50 hover:border-white/10 active:scale-[0.99]' : 'opacity-50'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{vehicleEmoji[departure.vehicle_type] || '🚗'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{departure.origin}</span>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                        <span className="font-bold text-blue-400">{departure.destination}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {departure.operator_name} · {departure.plate_number} · {departure.rating}★
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-white">{departure.price_xaf}<span className="text-xs text-slate-500 ml-1">FCFA</span></p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="font-bold text-blue-400">{getTimeUntil(departure.departure_time)}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${availability.color}`}>
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-bold text-xs">{availability.text}</span>
                    </div>
                  </div>
                  {availableSeats > 0 && (
                    <div className="flex items-center gap-1 text-blue-400 text-xs font-bold">
                      Réserver <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
