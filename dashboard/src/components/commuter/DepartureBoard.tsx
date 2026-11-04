import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Users, ChevronRight, Search, Filter, ArrowLeft, RefreshCw } from 'lucide-react';
import { fetchPublishedDepartures, supabase } from '../../supabaseClient';
import {selectRealDepartures} from '../../services/departureSearch';
import {UnmetDepartureDemand} from './UnmetDepartureDemand';

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
  rating: number | null;
  occupied_seats?: string[];
  available_seats?: number;
  inventory_note?: string;
}

interface Props {
  onBack: () => void;
  onSelectDeparture: (departure: Departure) => void;
}

export function DepartureBoard({ onBack, onSelectDeparture }: Props) {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [originQuery,setOriginQuery]=useState('');
  const [destinationQuery,setDestinationQuery]=useState('');
  const [travelDate,setTravelDate]=useState('');
  const [maxFare,setMaxFare]=useState('');
  const [seatsNeeded,setSeatsNeeded]=useState(1);
  const [loading, setLoading] = useState(true);
  const [feedHealthy, setFeedHealthy] = useState(true);
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);


  // Search constraints are applied before the server page limit, never just
  // to the first 50 results. Additional pages never imply verified seats.
  useEffect(()=>{
    setPage(0);
    setDepartures([]);
    setHasMore(false);
  },[originQuery,destinationQuery,travelDate,maxFare]);
  useEffect(()=>{
    let alive=true;
    setLoading(true);setFeedHealthy(true);
    const refresh=async()=>{
      const {data,error}=await fetchPublishedDepartures({
        page,origin:originQuery,destination:destinationQuery,
        date:travelDate,maxFareXaf:maxFare,
      });
      if(!alive)return;
      setLoading(false);
      if(error||!data||data.success!==true||!Array.isArray(data.departures)||
         typeof data.has_more!=='boolean'||data.search_exhausted!==!data.has_more||
         data.availability_is_provisional!==true||data.page!==page){
        setFeedHealthy(false);setHasMore(false);
        if(page===0)setDepartures([]);
        return;
      }
      setHasMore(data.has_more);
      const rows=(Array.isArray(data.departures)?data.departures:[]) as Departure[];
      setDepartures(current=>{
        if(page===0)return rows;
        const known=new Set(current.map(row=>row.id));
        return [...current,...rows.filter(row=>!known.has(row.id))];
      });
    };
    void refresh();
    const channel=supabase.channel('departures-live-'+page)
      .on('postgres_changes',{event:'*',schema:'public',table:'bookings'},()=>{
        if(alive)void refresh();
      }).subscribe();
    return()=>{alive=false;supabase.removeChannel(channel);};
  },[page,originQuery,destinationQuery,travelDate,maxFare,refreshKey]);

  const vehicleEmoji: Record<string, string> = { moto: '🏍️', taxi: '🚕', minibus: '🚐', bus: '🚌' };

  const filtered=feedHealthy?selectRealDepartures(departures,{
    origin:originQuery,destination:destinationQuery,date:travelDate,
    maximumFareXaf:maxFare,minimumSeats:seatsNeeded,vehicleType:filterType,query:searchQuery,
  }):[];
  const filterActive=Boolean(originQuery||destinationQuery||travelDate||maxFare||
    seatsNeeded>1||filterType!=='all'||searchQuery);

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
            <h1 className="font-extrabold text-lg tracking-tight">Départs publiés</h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Offres réelles · Cameroun</p>
          </div>
          <button onClick={()=>{setPage(0);setRefreshKey(value=>value+1);}} className="ml-auto p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
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

        <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Verified departure search constraints">
          <label className="text-[10px] text-slate-400">Departure city
            <input value={originQuery} onChange={e=>setOriginQuery(e.target.value)} maxLength={90}
              placeholder="e.g. Yaoundé" className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"/>
          </label>
          <label className="text-[10px] text-slate-400">Destination city
            <input value={destinationQuery} onChange={e=>setDestinationQuery(e.target.value)} maxLength={90}
              placeholder="e.g. Douala" className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"/>
          </label>
          <label className="text-[10px] text-slate-400">Travel date · Cameroon
            <input type="date" value={travelDate} onChange={e=>setTravelDate(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"/>
          </label>
          <label className="text-[10px] text-slate-400">Maximum fare · XAF
            <input type="number" min="1" step="1" inputMode="numeric" value={maxFare}
              onChange={e=>setMaxFare(e.target.value)} placeholder="Any fare"
              className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"/>
          </label>
          <label className="text-[10px] text-slate-400">Seats required
            <input type="number" min="1" max="50" step="1" value={seatsNeeded}
              onChange={e=>setSeatsNeeded(Math.max(1,Math.min(50,Math.floor(Number(e.target.value)||1))))}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"/>
          </label>
          <div className="flex items-end">
            <button type="button" onClick={()=>{setOriginQuery('');setDestinationQuery('');setTravelDate('');setMaxFare('');setSeatsNeeded(1);setFilterType('all');setSearchQuery('');}}
              disabled={!filterActive} className="min-h-11 w-full rounded-xl border border-white/15 px-3 text-xs text-white/75 disabled:opacity-35">
              Clear search filters
            </button>
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
        {!feedHealthy&&!loading&&<div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          Departure search could not be verified. Previously loaded results may be outdated; no unmet-demand conclusion can be made.
          <button type="button" onClick={()=>setRefreshKey(value=>value+1)}
            className="ml-3 rounded-lg border border-amber-300/40 px-3 py-2 font-bold">Retry search</button>
        </div>}
        {feedHealthy&&hasMore&&page>=100&&<p role="status" className="rounded-xl border border-amber-400/30 p-3 text-xs text-amber-100">
          Search page limit reached. Additional departures may exist; refine your filters. Do not treat these results as exhaustive.
        </p>}
        {hasMore&&<p role="status" className="text-[10px] text-cyan-100/60">Showing verified departures from loaded pages only. More future departures remain; this is not an exhaustive demand search.</p>}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-bold">{feedHealthy ? 'Aucun départ vérifié pour le moment' : 'Flux de départ indisponible'}</p>
            <p className="text-sm mt-1">
              {feedHealthy && hasMore
                ? 'No matching verified departure in loaded pages yet. Load more results before reporting unmet demand.'
                : feedHealthy && filterActive
                ? 'No verified future departure matches the requested cities, local date, fare and seat count. Clear filters or try another date.'
                : feedHealthy
                ? 'AFAT affichera ici les trajets dès que des opérateurs publient des départs actifs.'
                : 'Le tableau ne fabrique pas de départs. Revenez après synchronisation du backend.'}
            </p>
            {feedHealthy&&!hasMore&&originQuery.trim()&&destinationQuery.trim()&&(
              <UnmetDepartureDemand key={[originQuery,destinationQuery,travelDate,seatsNeeded,maxFare].join('|')} origin={originQuery} destination={destinationQuery}
                travelDate={travelDate} minimumSeats={seatsNeeded} maximumFareXaf={maxFare}/>
            )}
          </div>
        ) : (
          filtered.map(departure => {
            const availability = getAvailability(departure.total_seats, departure.booked_seats);
            const availableSeats = departure.available_seats ?? (departure.total_seats - departure.booked_seats);
            
            return (
              <button
                key={departure.id}
                onClick={() => availableSeats >= seatsNeeded && onSelectDeparture(departure)}
                disabled={availableSeats < seatsNeeded}
                className={`w-full bg-slate-900/50 border border-white/5 rounded-2xl p-5 text-left transition-all ${
                  availableSeats >= seatsNeeded ? 'hover:bg-slate-800/50 hover:border-white/10 active:scale-[0.99]' : 'opacity-50'
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
                        {departure.operator_name} · {departure.plate_number || 'Véhicule identifié'} · {typeof departure.rating === 'number' ? `${departure.rating.toFixed(1)}★` : 'Pas encore noté'}
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
                  {availableSeats >= seatsNeeded && (
                    <div className="flex items-center gap-1 text-blue-400 text-xs font-bold">
                      Réserver <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[10px] text-slate-400">Places indicatives · disponibilité confirmée uniquement après réservation de siège sécurisée.</p>
              </button>
            );
          })
        )}
        {feedHealthy&&hasMore&&<button type="button" disabled={loading||page>=100}
          onClick={()=>setPage(value=>value+1)}
          className="min-h-12 w-full rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 disabled:opacity-40">
          {loading?'Loading verified departures…':'Load more real departures'}
        </button>}
      </div>
    </div>
  );
}
