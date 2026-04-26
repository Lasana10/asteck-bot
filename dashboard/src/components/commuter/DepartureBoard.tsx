import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Users, ChevronRight, Search, Filter, ArrowLeft, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

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
    
    // Query routes with operator info
    const { data: routes } = await supabase
      .from('routes')
      .select(`
        id, name, origin, destination, price_per_seat, vehicle_type, departure_time,
        capacity, operator_id,
        profiles:operator_id ( full_name )
      `)
      .eq('is_active', true)
      .limit(20);

    if (routes && routes.length > 0) {
      // Fetch booked seats for these routes to calculate availability
      const routeIds = routes.map((r: any) => r.id);
      const { data: bookings } = await supabase
        .from('bookings')
        .select('route_id')
        .in('route_id', routeIds)
        .in('status', ['pending', 'confirmed', 'completed']);

      const mapped: Departure[] = routes.map((r: any) => {
        const routeBookings = bookings?.filter((b: any) => b.route_id === r.id).length || 0;
        return {
          id: r.id,
          vehicle_id: r.id, // Using route id as surrogate if no vehicle link
          route_name: r.name,
          origin: r.origin,
          destination: r.destination,
          departure_time: r.departure_time,
          price_xaf: r.price_per_seat,
          total_seats: r.capacity || 4,
          booked_seats: routeBookings,
          vehicle_type: r.vehicle_type || 'taxi',
          operator_id: r.operator_id,
          operator_name: r.profiles?.full_name || 'Chauffeur',
          plate_number: 'CE XXXX', // Plate number could be added to routes or linked vehicles
          rating: 4.5,
        };
      });
      setDepartures(mapped);
    } else {
      // Demo fallback data
      setDepartures([
        { id: '1', vehicle_id: 'v1', route_name: 'Nlongkak → Mvog-Mbi', origin: 'Nlongkak', destination: 'Mvog-Mbi', departure_time: new Date(Date.now() + 5 * 60000).toISOString(), price_xaf: 250, total_seats: 4, booked_seats: 2, vehicle_type: 'taxi', operator_id: 'demo-op-1', operator_name: 'Jean-Pierre', plate_number: 'CE 1234 AB', rating: 4.8 },
        { id: '2', vehicle_id: 'v2', route_name: 'Bastos → Melen', origin: 'Bastos', destination: 'Melen', departure_time: new Date(Date.now() + 12 * 60000).toISOString(), price_xaf: 200, total_seats: 2, booked_seats: 0, vehicle_type: 'moto', operator_id: 'demo-op-2', operator_name: 'Ibrahim', plate_number: 'CE 5678 CD', rating: 4.5 },
        { id: '3', vehicle_id: 'v3', route_name: 'Essos → Biyem-Assi', origin: 'Essos', destination: 'Biyem-Assi', departure_time: new Date(Date.now() + 20 * 60000).toISOString(), price_xaf: 300, total_seats: 15, booked_seats: 8, vehicle_type: 'minibus', operator_id: 'demo-op-3', operator_name: 'Paul', plate_number: 'LT 9012 EF', rating: 4.9 },
        { id: '4', vehicle_id: 'v4', route_name: 'Mokolo → Obili', origin: 'Mokolo', destination: 'Obili', departure_time: new Date(Date.now() + 8 * 60000).toISOString(), price_xaf: 200, total_seats: 4, booked_seats: 3, vehicle_type: 'taxi', operator_id: 'demo-op-4', operator_name: 'Amadou', plate_number: 'CE 3456 GH', rating: 4.2 },
        { id: '5', vehicle_id: 'v5', route_name: 'Nkoldongo → Mimboman', origin: 'Nkoldongo', destination: 'Mimboman', departure_time: new Date(Date.now() + 30 * 60000).toISOString(), price_xaf: 150, total_seats: 2, booked_seats: 1, vehicle_type: 'moto', operator_id: 'demo-op-5', operator_name: 'Serge', plate_number: 'CE 7890 IJ', rating: 4.6 },
        { id: '6', vehicle_id: 'v6', route_name: 'Tsinga → Ngousso', origin: 'Tsinga', destination: 'Ngousso', departure_time: new Date(Date.now() + 45 * 60000).toISOString(), price_xaf: 500, total_seats: 30, booked_seats: 12, vehicle_type: 'bus', operator_id: 'demo-op-6', operator_name: 'Transport Express', plate_number: 'LT 1122 KL', rating: 4.7 },
      ]);
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
            <p className="font-bold">Aucun départ trouvé</p>
            <p className="text-sm mt-1">Essayez une autre destination</p>
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
