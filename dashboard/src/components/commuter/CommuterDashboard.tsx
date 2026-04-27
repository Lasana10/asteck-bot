import React, { useState, useEffect } from 'react';
import {
  Navigation2, Wallet, AlertTriangle, Headphones, Radio, QrCode,
  Mic, Trophy, Bell, Ticket, X, Send, Clock, ChevronRight,
  Shield, Zap, MessageCircle, Star, TrendingUp, MapPin,
  Settings, Download, Database, Info, Layers, Activity, CheckCircle, Fingerprint,
  MoreVertical, Briefcase, Layout, Box, Navigation, User, Map as MapIcon, Phone
} from 'lucide-react';
import { AFATLogo } from '../shared/AFATLogo';
import { InteractiveMap } from '../shared/InteractiveMap';
import { VoiceReporter } from '../shared/VoiceReporter';
import { ScanAndPayHub } from './ScanAndPayHub';
import { DepartureBoard } from './DepartureBoard';
import { SeatSelector } from './SeatSelector';
import { PaymentSheet } from './PaymentSheet';
import { TicketView } from './TicketView';
import { supabase } from '../../supabaseClient';
import { mapOfflineService } from '../../services/MapOfflineService';
import { EmergencySOS } from '../shared/EmergencySOS';
import { CommuterWallet } from './CommuterWallet';
import { ConciergeHelp } from '../shared/ConciergeHelp';
import { PointsSystem } from '../shared/PointsSystem';
import { SentinelIDCard } from '../shared/SentinelIDCard';
import { IntelligenceEngine } from '../../core/SentinelIntelligence';

interface Props {
  onSignOut: () => void;
  profile: any;
  activeTab?: 'home' | 'book' | 'bookings' | 'notifications' | 'profile';
  isGuest?: boolean;
}

type ViewState = 'home' | 'departures' | 'seats' | 'waiting' | 'payment' | 'ticket' | 'alerts';

export function CommuterDashboard({ onSignOut, profile, activeTab = 'home', isGuest = false }: Props) {
  const [view, setView] = useState<ViewState>('home');
  const [incidents, setIncidents] = useState<any[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isVoiceReporterOpen, setIsVoiceReporterOpen] = useState(false);
  const [isScanHubOpen, setIsScanHubOpen] = useState(false);
  const [newIncident, setNewIncident] = useState({ type: 'accident', description: '', severity: 3 });
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [offlineMaps, setOfflineMaps] = useState<Record<string, boolean>>({
    yaounde: localStorage.getItem('afat_offline_yaounde') === 'true',
    douala: localStorage.getItem('afat_offline_douala') === 'true',
    cameroon: localStorage.getItem('afat_offline_cameroon') === 'true'
  });
  const [mapMode, setMapMode] = useState<'standard' | 'satellite' | 'hybrid' | 'intel'>('standard');
  const [showInformalRoutes, setShowInformalRoutes] = useState(false);
  const [isIDSOpen, setIsIDSOpen] = useState(false);
  const [storageStats, setStorageStats] = useState(mapOfflineService.getStorageUsage());
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [hybridStream, setHybridStream] = useState(true);
  const [aiSentiment, setAiSentiment] = useState<string>('');

  const handleSOS = () => {
    if (isGuest) { alert('Please sign in to use SOS.'); return; }
    setIsSOSActive(true);
  };

  const handleCloudOffload = async () => {
    setIsCloudSyncing(true);
    await mapOfflineService.offloadIntelligenceToDatabase();
    setTimeout(() => {
      setIsCloudSyncing(false);
      setStorageStats(mapOfflineService.getStorageUsage());
    }, 1500);
  };

  // Booking flow state
  const [selectedDeparture, setSelectedDeparture] = useState<any>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [activeVehicles, setActiveVehicles] = useState<any[]>([]);

  useEffect(() => {
    const fetchSentiment = async () => {
      const language = profile?.language || 'fr';
      const sentiment = await IntelligenceEngine.predict('Yaoundé Sector 4', language);
      setAiSentiment(sentiment);
    };
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 120000); 
    return () => clearInterval(interval);
  }, [profile?.language]);

  useEffect(() => {
    fetchIncidents();
    fetchVehicles();

    const incidentChannel = supabase
      .channel('public:incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        fetchIncidents();
      })
      .subscribe();

    const vehicleChannel = supabase
      .channel('public:vehicles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
        fetchVehicles();
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(incidentChannel); 
      supabase.removeChannel(vehicleChannel);
    };
  }, []);

  const fetchIncidents = async () => {
    const { data } = await supabase.from('incidents').select('*').neq('status', 'false').order('created_at', { ascending: false });
    if (data) setIncidents(data);
  };

  const fetchVehicles = async () => {
    const { data } = await supabase.from('vehicles').select('*').eq('is_available', true);
    if (data) setActiveVehicles(data);
  };

  const handleDownloadMap = async (regionId: 'yaounde' | 'douala' | 'cameroon') => {
    if (offlineMaps[regionId]) return;
    setDownloadProgress(p => ({ ...p, [regionId]: 0 }));
    try {
      if (regionId === 'cameroon') {
        await mapOfflineService.downloadFullCameroon((progress) => {
          setDownloadProgress(p => ({ ...p, [regionId]: progress }));
        });
      } else {
        await mapOfflineService.downloadRegion(regionId);
        setDownloadProgress(p => ({ ...p, [regionId]: 100 }));
      }
      setOfflineMaps(p => ({ ...p, [regionId]: true }));
      localStorage.setItem(`afat_offline_${regionId}`, 'true');
    } catch (err) {
      console.error("Map download failed:", err);
    } finally {
      setTimeout(() => {
        setDownloadProgress(p => {
          const next = { ...p };
          delete next[regionId];
          return next;
        });
      }, 2000);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = 3.848 + (Math.random() - 0.5) * 0.05;
    const lng = 11.502 + (Math.random() - 0.5) * 0.05;
    const payload = {
      reporter_id: profile?.id, reporter_username: profile?.username || 'Citizen',
      type: newIncident.type, description: newIncident.description,
      latitude: lat, longitude: lng, location: `POINT(${lng} ${lat})`,
      severity: newIncident.severity, source: 'app',
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    };
    const { error } = await supabase.from('incidents').insert([payload]);
    if (!error) { setIsReportModalOpen(false); setNewIncident({ type: 'accident', description: '', severity: 3 }); }
  };

  // Booking flow handlers
  const handleDepartureSelect = (departure: any) => { setSelectedDeparture(departure); setView('seats'); };
  const handleSeatSelect = (seatId: string) => { setSelectedSeatId(seatId); setView('payment'); };
  const handleBookingConfirm = (result: any) => { setBookingResult(result); setCurrentBookingId(result?.booking?.id); setView('ticket'); };

  // Sub-views
  if (view === 'departures') return <DepartureBoard onSelectDeparture={handleDepartureSelect} onBack={() => setView('home')} />;
  if (view === 'seats' && selectedDeparture) return <SeatSelector departure={selectedDeparture} onConfirmSeat={handleSeatSelect} onBack={() => setView('departures')} />;
  if (view === 'payment' && selectedDeparture && selectedSeatId) {
    return (
      <PaymentSheet 
        amount={selectedDeparture.price_xaf} 
        operatorName={selectedDeparture.operator_name} 
        routeName={selectedDeparture.route_name} 
        seatLabel={selectedSeatId.split('-').pop() || '1'} 
        onPaymentComplete={(method, txId) => handleBookingConfirm({ id: `BK-${Date.now()}`, transactionId: txId, origin: selectedDeparture.origin, destination: selectedDeparture.destination, seatLabel: selectedSeatId.split('-').pop(), price: selectedDeparture.price_xaf, operatorName: selectedDeparture.operator_name, departureTime: selectedDeparture.departure_time, routeName: selectedDeparture.route_name })} 
        onBack={() => setView('seats')} 
      />
    );
  }
  if (view === 'ticket' && bookingResult) return <TicketView booking={bookingResult} onBack={() => setView('home')} />;

  const renderHome = () => (
    <div className="flex flex-col min-h-screen bg-slate-900">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="px-6 pt-12 pb-6 flex items-center justify-between z-[5000] relative bg-slate-900/80 backdrop-blur-xl border-b border-white/10 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/30 to-indigo-700/30 border border-white/20 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.2)] relative group overflow-hidden">
            <div className="absolute inset-0 bg-blue-400/20 opacity-50 animate-pulse" />
            <AFATLogo className="w-7 h-7 text-white relative z-10" />
          </div>
          <div>
            <h1 className="font-black text-white text-[18px] tracking-tighter uppercase italic leading-none drop-shadow-md">AFAT<span className="text-blue-500">OS</span></h1>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.4em] mt-1.5 italic text-glow-blue opacity-80">Intelligent Safe Passage</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Intelligence Pulse Indicator */}
          <div className="hidden sm:flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
             <div className="flex flex-col items-end">
                <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Gemma 4 Pulse</p>
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-tight">Nominal</p>
             </div>
             <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          </div>

          <button onClick={() => setIsVoiceReporterOpen(true)} className="w-11 h-11 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90 relative group">
            <div className="absolute inset-0 bg-blue-500/20 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity animate-pulse" />
            <Mic className="w-5 h-5 relative z-10 text-blue-400" />
          </button>

          <button onClick={() => {}} className="w-11 h-11 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90 relative group">
            <div className="absolute inset-0 bg-blue-500/20 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity animate-pulse" />
            <Bell className="w-5 h-5 relative z-10" />
            {incidents.length > 0 && <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_12px_#ef4444] border-2 border-slate-900 z-20"></span>}
          </button>
        </div>
      </header>

      {/* ── Intelligence Feed Ticker ─────────────────────── */}
      <div className="px-5 py-2 z-[4500] relative overflow-hidden">
         <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl py-2.5 px-4 flex items-center gap-4 overflow-hidden relative group">
            <div className="flex items-center gap-2 shrink-0">
               <Radio className="w-3 h-3 text-blue-400 animate-pulse" />
               <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest italic">Live Feed:</span>
            </div>
            <div className="flex-1 overflow-hidden whitespace-nowrap">
               <div className="inline-block animate-marquee hover:pause-marquee cursor-default">
                  <span className="text-[10px] font-bold text-white/70 italic tracking-tight mr-12">🛰️ Satellite link established via Starlink • Signal: 98%</span>
                  <span className="text-[10px] font-bold text-white/70 italic tracking-tight mr-12">🤖 AFAT Intelligence: Scanning for road hazards...</span>
                  <span className="text-[10px] font-bold text-white/70 italic tracking-tight mr-12">🚕 Node 442 verified at Carrefour Bastos • Status: Punctual</span>
                  <span className="text-[10px] font-bold text-white/70 italic tracking-tight mr-12">🛡️ Sentinel Protocols: ACTIVE. All citizens safely tracked.</span>
               </div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none" />
         </div>
      </div>

      {/* ── USSD Promotion Banner ──────────────────────────── */}
      <div className="px-5 pb-4 z-[4000] relative mt-2">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.15)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-emerald-400/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex flex-shrink-0 items-center justify-center border border-emerald-500/30">
              <Phone className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-[13px] font-black text-white uppercase tracking-tight italic leading-tight">No Internet? No Problem.</h3>
              <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5">Dial *121# for AFAT Intelligence</p>
            </div>
          </div>
          <div className="relative z-10 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
            FREE DIAL
          </div>
        </div>
      </div>

      {/* ── From/To Search Bar ──────────────────────────── */}
      <div className="px-5 pb-6 z-[4000] relative">
        <div className="bg-slate-800 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="flex items-center gap-4 px-7 py-5 border-b border-white/10 group">
            <div className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_15px_#60a5fa] group-hover:scale-125 transition-transform" />
            <input
              type="text"
              value={searchFrom}
              onChange={e => setSearchFrom(e.target.value)}
              placeholder="Source Station..."
              className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none font-black italic tracking-tight"
            />
          </div>
          <div className="flex items-center gap-4 px-7 py-5">
            <MapPin className="w-5 h-5 text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]" />
            <input
              type="text"
              value={searchTo}
              onChange={e => setSearchTo(e.target.value)}
              placeholder="Destination..."
              className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none font-black italic tracking-tight"
            />
            <button
              onClick={() => setView('departures')}
              className="bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-black px-7 py-3 rounded-2xl uppercase tracking-[0.2em] transition-all active:scale-95 shadow-[0_0_25px_rgba(37,99,235,0.5)] italic"
            >
              LOCATE
            </button>
          </div>
        </div>
      </div>

      {/* ── Dynamic Intel Map Section ──────────────────────── */}
      <div className={`mx-5 rounded-[2.5rem] overflow-hidden border relative shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-700 ${profile?.subscription_tier === 'guardian' ? 'border-blue-500/40 shadow-blue-500/20' : 'border-white/10'}`} style={{height: '300px'}}>
        <InteractiveMap 
          incidents={incidents} 
          tracks={activeVehicles} 
          showInformal={showInformalRoutes}
          role="commuter"
        />
        
        {/* Floating HUD Cards (Image 1 Style) */}
        <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-none">
           <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl animate-in slide-in-from-left duration-500 pointer-events-auto">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Network Status</p>
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                 <p className="font-black text-white text-[10px] italic tracking-tight uppercase">Nodes Synchronized</p>
              </div>
           </div>
           
           <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl animate-in slide-in-from-left duration-700 delay-100 pointer-events-auto">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Grid Intelligence</p>
              <div className="flex items-center justify-between gap-6">
                 <div className="flex -space-x-2">
                    {[1,2,3].map(i => (
                       <div key={i} className="w-5 h-5 rounded-full border-2 border-[#080c14] bg-blue-500/20 flex items-center justify-center overflow-hidden">
                          <AFATLogo className="w-3 h-3 text-blue-400" />
                       </div>
                    ))}
                 </div>
                 <p className="font-black text-blue-400 text-[10px] italic">{activeVehicles.length} ACTIVE</p>
              </div>
           </div>
        </div>

        {/* Dynamic Threat Level (Right Side) */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-none">
           <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl animate-in slide-in-from-right duration-500 pointer-events-auto text-right">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Grid Security</p>
              <p className="font-black text-emerald-400 text-[10px] italic uppercase">LEVEL: STABLE</p>
           </div>
        </div>

        {/* Action button to open settings on the map */}
        <button 
          onClick={() => setIsIntelligenceOpen(true)}
          className="absolute bottom-6 right-6 z-[1000] bg-white text-slate-950 p-4 rounded-2xl shadow-[0_15px_35px_rgba(255,255,255,0.3)] hover:scale-105 transition-all active:scale-95 group border border-white/50"
        >
          <Layers className="w-5 h-5 group-hover:rotate-12 transition-transform" />
        </button>
      </div>

      {/* ── PERSONALIZED INTELLIGENCE GUIDE ────────────────── */}
      <div className="px-5 pt-4">
        <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-[2rem] p-5 shadow-2xl">
          {/* Guide Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Navigation className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-[12px] font-black text-white uppercase tracking-tight">Your Route Intelligence</p>
                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Personalized • Live</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
              <span className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest">Scanning</span>
            </div>
          </div>

          {/* Active Route Incidents */}
          {incidents.length > 0 && (
            <div className="mb-4">
              <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Nearby Alerts</p>
              <div className="space-y-2 max-h-[120px] overflow-y-auto no-scrollbar">
                {incidents.slice(0, 3).map((inc: any) => {
                  const typeLabels: Record<string, string> = {
                    accident: '💥 Accident', road_awareness: '🛡️ Vigilance', traffic_jam: '🚗 Embouteillage',
                    flooding: '🌊 Inondation', road_damage: '🕳️ Route Endom.', hazard: '⚠️ Danger',
                    roadblock: '🚫 Barrage', sos: '🆘 SOS', other: '📍 Signal',
                    road_works: '🚧 Travaux', protest: '📢 Manifestation'
                  };
                  const sevColors = ['', 'text-emerald-400', 'text-blue-400', 'text-amber-400', 'text-orange-400', 'text-red-400'];
                  return (
                    <div key={inc.id} className="flex items-center gap-3 bg-white/3 border border-white/5 rounded-xl p-3 group hover:bg-white/5 transition-colors">
                      <span className="text-[13px] shrink-0">{typeLabels[inc.type]?.split(' ')[0] || '📍'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-white truncate">{typeLabels[inc.type]?.split(' ').slice(1).join(' ') || inc.type}</p>
                        <p className="text-[9px] text-white/30 truncate">{inc.description || inc.address || 'Signalé par le réseau'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-[10px] font-black ${sevColors[inc.severity] || sevColors[3]}`}>{inc.severity}/5</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optimal Sentinel Recommendation */}
          {activeVehicles.length > 0 && (
            <div className="mb-3">
              <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Recommended Sentinel</p>
              <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-500/25 shrink-0">
                  <span className="text-lg">🚕</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-black text-white">{activeVehicles[0]?.plate_number || 'CE 1234 AB'}</span>
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Verified</span>
                  </div>
                  <p className="text-[9px] text-white/40 font-bold mt-0.5">
                    ★ {activeVehicles[0]?.rating || 4.8} • ETA ~5 min • Nearest Node
                  </p>
                </div>
                <button
                  onClick={() => setView('departures')}
                  className="bg-blue-600 text-white text-[9px] font-black px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-blue-500 transition-all active:scale-95 shrink-0"
                >
                  Book
                </button>
              </div>
            </div>
          )}

          {/* Route Conditions Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
              <p className="text-[8px] text-white/20 font-black uppercase">Traffic</p>
              <p className={`text-[12px] font-black ${incidents.filter(i => i.type === 'traffic_jam').length > 2 ? 'text-red-400' : 'text-emerald-400'} uppercase`}>
                {incidents.filter(i => i.type === 'traffic_jam').length > 2 ? 'Dense' : 'Fluide'}
              </p>
            </div>
            <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
              <p className="text-[8px] text-white/20 font-black uppercase">Safety</p>
              <p className={`text-[12px] font-black ${incidents.filter(i => i.severity >= 4).length > 1 ? 'text-amber-400' : 'text-emerald-400'} uppercase`}>
                {incidents.filter(i => i.severity >= 4).length > 1 ? 'Alert' : 'Stable'}
              </p>
            </div>
            <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
              <p className="text-[8px] text-white/20 font-black uppercase">Nodes</p>
              <p className="text-[12px] font-black text-blue-400">{activeVehicles.length} actifs</p>
            </div>
          </div>

          {/* AI Sentiment Analysis */}
          {aiSentiment && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-3 h-3 text-blue-400 animate-pulse" />
                <p className="text-[8px] text-blue-400 font-black uppercase tracking-widest">AFAT Live Analysis</p>
              </div>
              <p className="text-[11px] font-medium text-white/70 italic leading-relaxed">
                "{aiSentiment}"
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Live Stats Strip ─────────────────────────────── */}
      <div className="px-5 py-3 flex items-center gap-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 bg-white/4 border border-white/6 px-3 py-2 rounded-xl shrink-0">
          <TrendingUp className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[11px] font-bold text-white/70">Safety Score</span>
          <span className="text-[11px] font-black text-green-400">92%</span>
        </div>
        <div className="flex items-center gap-2 bg-white/4 border border-white/6 px-3 py-2 rounded-xl shrink-0">
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-bold text-white/70">Trust</span>
          <span className="text-[11px] font-black text-amber-400">{profile?.trust_points || 0} pts</span>
        </div>
        <div className="flex items-center gap-2 bg-white/4 border border-white/6 px-3 py-2 rounded-xl shrink-0">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold text-white/70">Verified Sentinels</span>
          <span className="text-[11px] font-black text-blue-400">{activeVehicles.length} nearby</span>
        </div>
        {profile?.subscription_tier === 'guardian' && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-black text-amber-400">Sentinel Active</span>
          </div>
        )}
      </div>

      {/* ── Greeting + Actions ───────────────────────────── */}
      <div className="px-5 pt-2 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white leading-tight flex items-center gap-2">
            Bonjour, <span className="text-blue-400">{profile?.username || profile?.full_name || 'Voyageur'}</span>
            {profile?.subscription_tier === 'guardian' && (
              <span className="text-[8px] uppercase tracking-widest bg-gradient-to-r from-amber-400 to-yellow-600 text-black font-black px-1.5 py-0.5 rounded-sm shadow-[0_0_10px_rgba(245,158,11,0.5)]">Guardian</span>
            )}
          </h2>
          <p className="text-[12px] text-white/40 font-medium mt-0.5">Votre hub d'opérations quotidiennes.</p>
        </div>
      </div>

      {/* ── Hero Booking Tile ────────────────────────────── */}
      <div className="px-5 pt-2">
        <button
          onClick={() => setView('departures')}
          className="w-full bg-blue-600/10 backdrop-blur-xl border border-blue-500/30 rounded-[2rem] p-6 flex items-center justify-between active:scale-[0.98] transition-all shadow-2xl shadow-blue-900/10 group overflow-hidden relative"
        >
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
          <div className="flex items-center gap-5 relative z-10">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-blue-500/20 shadow-lg ${profile?.subscription_tier === 'guardian' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/20'}`}>
              <Navigation2 className={`w-7 h-7 ${profile?.subscription_tier === 'guardian' ? 'text-amber-400' : 'text-blue-400'} group-hover:rotate-12 transition-transform`} />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[18px] tracking-tighter uppercase italic leading-none">Find Station</p>
              <p className="text-blue-400/60 text-[10px] font-bold uppercase tracking-[0.2em] mt-2 italic">Connect to Inbound Sentinel</p>
            </div>
          </div>
          <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-colors">
            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white transition-colors" />
          </div>
        </button>
      </div>

      {/* ── 2×2 Quick Actions ────────────────────────────── */}
      <div className="px-5 pt-4 grid grid-cols-2 gap-3">
        {/* Wallet */}
        <button
          onClick={() => isGuest ? alert('Sign in for wallet access') : setIsWalletOpen(true)}
          className="bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all hover:border-green-500/40 hover:bg-slate-800 shadow-lg"
        >
          <div className="w-10 h-10 bg-green-500/15 rounded-xl flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] leading-tight">Portefeuille</p>
            <p className="text-[10px] text-white/40 font-medium truncate">MoMo · Orange</p>
          </div>
        </button>

        {/* Concierge */}
        <button
          onClick={() => setIsConciergeOpen(true)}
          className="bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all hover:border-amber-500/40 hover:bg-slate-800 shadow-lg"
        >
          <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] leading-tight">Concierge</p>
            <p className="text-[10px] text-white/40 font-medium truncate">VIP · Lost & Found</p>
          </div>
        </button>

        {/* SOS */}
        <button
          onClick={handleSOS}
          className={`bg-slate-800/80 backdrop-blur-md border rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all shadow-lg ${isSOSActive ? 'border-red-500/60 bg-red-500/10 animate-pulse' : 'border-white/10 hover:border-red-500/40 hover:bg-slate-800'}`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSOSActive ? 'bg-red-500' : 'bg-red-500/15'}`}>
            <AlertTriangle className={`w-5 h-5 ${isSOSActive ? 'text-white' : 'text-red-400'}`} />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] leading-tight">SOS Urgence</p>
            <p className="text-[10px] text-white/40 font-medium truncate">Alerte Grid • 117</p>
          </div>
        </button>

        {/* Scan & Pay */}
        <button
          onClick={() => setIsScanHubOpen(true)}
          className="bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all hover:border-blue-400/40 hover:bg-slate-800 shadow-lg"
        >
          <div className="w-10 h-10 bg-blue-400/15 rounded-xl flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] leading-tight">Scan & Pay</p>
            <p className="text-[10px] text-white/40 font-medium">QR Boarding</p>
          </div>
        </button>
      </div>

      {/* ── Services Row ─────────────────────────────────── */}
      <div className="px-5 pt-3 pb-32 grid grid-cols-2 gap-3">
        {/* Voice AI — Groq */}
        <button
          onClick={() => setIsVoiceReporterOpen(true)}
          className="bg-slate-800/80 backdrop-blur-md border border-purple-500/30 rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all hover:border-purple-500/60 hover:bg-slate-800 shadow-lg group"
        >
          <div className="w-10 h-10 bg-purple-500/15 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden">
             <div className="absolute inset-0 bg-purple-500/10 animate-pulse" />
             <div className="absolute inset-0 border border-purple-500/20 rounded-xl animate-ping opacity-20" />
             <Mic className="w-5 h-5 text-purple-400 relative z-10 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] leading-none">Voice AI</p>
            <p className="text-[10px] text-purple-400/70 font-black uppercase tracking-widest mt-1">SENTINEL</p>
          </div>
        </button>

        {/* Points & Rewards */}
        <button
          onClick={() => setIsPointsOpen(true)}
          className="bg-slate-800/80 backdrop-blur-md border border-amber-500/30 rounded-[1.5rem] p-4 flex items-center gap-3 active:scale-[0.97] transition-all hover:border-amber-500/60 hover:bg-slate-800 shadow-lg"
        >
          <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-left overflow-hidden">
            <p className="font-black text-white text-[13px] truncate">{profile?.trust_points || 0} pts</p>
            <p className="text-[10px] text-amber-400/70 font-bold truncate">Récompenses</p>
          </div>
        </button>

        {/* Live Traffic Feed */}
        <button
          onClick={() => setView('alerts')}
          className="col-span-2 bg-slate-800/80 backdrop-blur-md border border-blue-500/30 rounded-[1.5rem] p-5 flex items-center gap-4 active:scale-[0.97] transition-all hover:border-blue-500/60 hover:bg-slate-800 shadow-lg"
        >
          <div className="w-12 h-12 bg-blue-500/15 rounded-xl flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-blue-400 animate-pulse" />
          </div>
          <div className="text-left flex-1">
            <p className="font-black text-white text-[14px]">Live Traffic Feed</p>
            <p className="text-[10px] text-blue-400/80 font-bold uppercase tracking-wider mt-0.5">AFAT Grid Intelligence — Real-time</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/30 shrink-0" />
        </button>

        {/* Intelligence Settings */}
        <button
          onClick={() => setIsIntelligenceOpen(true)}
          className="col-span-2 bg-gradient-to-r from-slate-800 to-slate-900 border border-blue-500/20 rounded-[1.5rem] p-5 flex items-center gap-4 active:scale-[0.97] transition-all hover:border-blue-400/40 shadow-lg group"
        >
          <div className="w-12 h-12 bg-blue-400/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-400/20 transition-all">
            <Database className="w-6 h-6 text-blue-400" />
          </div>
          <div className="text-left flex-1">
            <p className="font-black text-white text-[14px]">Sentinel Settings</p>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider mt-0.5">Offline Maps • Ground Data Layer</p>
          </div>
          <Settings className="w-5 h-5 text-white/30 group-hover:text-blue-400 transition-colors shrink-0" />
        </button>
      </div>
    </div>
  );

  const renderBookings = () => (
    <div className="p-5 pb-32 bg-slate-900 min-h-screen">
      <h2 className="text-xl font-black text-white mb-1">Mes Réservations</h2>
      <p className="text-[12px] text-white/40 mb-5">Historique et trajets actifs</p>
      <div className="bg-slate-800/80 border border-white/10 rounded-[2rem] p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Ticket className="w-7 h-7 text-white/30" />
        </div>
        <p className="text-white/50 text-[13px] font-bold">Aucune réservation active.</p>
        <button
          onClick={() => setView('departures')}
          className="mt-5 bg-blue-600 text-white text-[12px] font-black px-6 py-3 rounded-xl uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-blue-900/50"
        >
          Réserver un trajet
        </button>
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div className="p-5 pb-32 bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-white">Alertes Trafic</h2>
          <p className="text-[12px] text-white/40">Intelligence terrain — Yaoundé & Douala</p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest">Live</span>
        </div>
      </div>
      {/* Multi-channel note */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-[1.5rem] p-4 flex items-center gap-3 mb-5 shadow-lg backdrop-blur-md">
        <MessageCircle className="w-5 h-5 text-blue-400 shrink-0" />
        <p className="text-[11px] text-blue-100 font-medium leading-relaxed">Ces alertes sont aussi diffusées sur <span className="font-black text-blue-400">@AFATTrafficLive</span> (Telegram) et via SMS.</p>
      </div>
      {incidents.length > 0 ? (
        <div className="space-y-3">
          {incidents.slice(0, 8).map((inc, i) => (
            <div key={i} className="bg-slate-800/80 border border-white/10 rounded-[1.5rem] p-4 flex items-center gap-4 shadow-lg backdrop-blur-md">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                inc.type === 'accident' ? 'bg-red-500/15 text-red-400' :
                inc.type === 'traffic_jam' ? 'bg-orange-500/15 text-orange-400' :
                'bg-blue-500/15 text-blue-400'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-white capitalize">{inc.type?.replace('_', ' ') || 'Incident'}</p>
                <p className="text-[11px] text-white/35 truncate">{inc.description?.slice(0, 60) || 'Signalé par un citoyen'}</p>
              </div>
              <span className="text-[10px] text-white/20 font-mono shrink-0">
                {new Date(inc.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#0f1520] border border-white/6 rounded-2xl p-10 text-center">
          <Shield className="w-8 h-8 text-green-400 mx-auto mb-3" />
          <p className="text-white/40 text-[13px] font-medium">Aucun incident signalé.</p>
          <p className="text-white/20 text-[11px] mt-1">La grille est propre.</p>
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="p-5 pb-32 bg-[#080c14] min-h-screen">
      <h2 className="text-xl font-black text-white mb-5">Profil Citoyen</h2>
      <div className="bg-[#0f1520] border border-white/8 rounded-[2rem] p-6 mb-4 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5">
           <AFATLogo className="w-24 h-24 text-white" />
        </div>
        <div className="flex items-center gap-5 mb-6 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-900 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-blue-900/40 border border-white/10 transition-transform hover:rotate-3">
            {(profile?.full_name || profile?.username || 'V')[0].toUpperCase()}
          </div>
          <div>
            <h3 className="font-black text-white text-[20px] leading-tight flex items-center gap-2 italic">
               {profile?.full_name || profile?.username || 'Citizen'}
               <Shield className="w-4 h-4 text-blue-400 shadow-[0_0_10px_#60a5fa]" />
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="bg-green-500/10 border border-green-500/20 px-3 py-0.5 rounded-full">
                <span className="text-[8px] font-black text-green-400 uppercase tracking-[0.2em] italic">Verified Grid User</span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/50">
            <p className="text-[9px] text-white/30 uppercase font-black mb-1.5 tracking-widest italic">Trust Points</p>
            <p className="font-black text-amber-400 text-[18px]">{profile?.trust_points || 0} pts</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 transition-all hover:bg-black/50">
            <p className="text-[9px] text-white/30 uppercase font-black mb-1.5 tracking-widest italic">Network Tier</p>
            <p className="font-black text-blue-400 text-[18px] uppercase">Alpha</p>
          </div>
        </div>

        {/* Identity Vault Trigger */}
        <button 
          onClick={() => setIsIDSOpen(true)}
          className="w-full bg-blue-600 border border-blue-400/30 hover:bg-blue-500 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98] group shadow-xl shadow-blue-900/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
              <Fingerprint className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <span className="block text-[11px] font-black text-white uppercase tracking-widest">Identity Sentinel</span>
              <span className="block text-[8px] text-blue-100/60 font-bold uppercase tracking-tighter italic">Grid Clearance Level 1</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/50 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
      {/* Wallet & Points */}
      <button onClick={() => setIsWalletOpen(true)} className="w-full bg-[#0f1520] border border-white/8 rounded-xl p-4 flex items-center justify-between mb-3 active:scale-[0.98] transition-all hover:border-green-500/30">
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-green-400" />
          <span className="font-bold text-white text-[13px]">MobilityWallet</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20" />
      </button>
      <button onClick={() => setIsPointsOpen(true)} className="w-full bg-[#0f1520] border border-white/8 rounded-xl p-4 flex items-center justify-between mb-3 active:scale-[0.98] transition-all hover:border-amber-500/30">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-white text-[13px]">Mes Récompenses</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20" />
      </button>
      <button onClick={onSignOut} className="w-full bg-red-500/8 border border-red-500/20 text-red-400 rounded-xl p-4 font-bold text-[13px] transition-all hover:bg-red-500/15 active:scale-[0.98] uppercase tracking-widest mt-2">
        Se déconnecter
      </button>
    </div>
  );

  const renderBookTab = () => (
    <div className="flex flex-col min-h-screen bg-[#080c14] pt-8 px-5 pb-32">
      <div className="mb-6 z-50 relative mt-8">
        <h2 className="text-2xl font-black text-white mb-2">Où allons-nous ?</h2>
        <p className="text-[12px] text-white/40 font-medium mb-6">Réservez un trajet en toute sécurité sur le réseau AFAT.</p>
        <div className="bg-[#0f1520] border border-white/8 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
            <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa]"></div>
            <input type="text" value={searchFrom} onChange={e => setSearchFrom(e.target.value)} placeholder="Départ (ex: Akwa, Douala)" className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none font-bold" />
          </div>
          <div className="flex items-center gap-3 px-4 py-4">
            <MapPin className="w-3.5 h-3.5 text-orange-400" />
            <input type="text" value={searchTo} onChange={e => setSearchTo(e.target.value)} placeholder="Destination (ex: Bonamoussadi)" className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none font-bold" />
          </div>
          <button onClick={() => setView('departures')} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[14px] font-black py-4 uppercase tracking-widest transition-all">
            Rechercher un trajet
          </button>
        </div>
      </div>
      
      <h3 className="font-black text-white mb-3 text-[14px]">Destinations Fréquentes</h3>
      <div className="space-y-3">
         <button onClick={() => { setSearchTo('Akwa'); setView('departures'); }} className="w-full bg-[#0f1520] border border-white/5 p-4 rounded-xl flex items-center gap-4 active:scale-95 transition-all hover:bg-white/5">
            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-white/40" /></div>
            <div className="text-left"><p className="font-bold text-[14px] text-white">Akwa, Douala</p><p className="font-medium text-[10px] text-white/40">Centre d'affaires</p></div>
         </button>
         <button onClick={() => { setSearchTo('Biyem-Assi'); setView('departures'); }} className="w-full bg-[#0f1520] border border-white/5 p-4 rounded-xl flex items-center gap-4 active:scale-95 transition-all hover:bg-white/5">
            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-white/40" /></div>
            <div className="text-left"><p className="font-bold text-[14px] text-white">Biyem-Assi, Yaoundé</p><p className="font-medium text-[10px] text-white/40">Zone résidentielle</p></div>
         </button>
      </div>
    </div>
  );


  const renderIntelligenceSettings = () => (
    <div className="fixed inset-0 z-[6000] bg-slate-950/95 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="px-6 pt-12 pb-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase italic tracking-tighter">Sentinel Intelligence</h2>
            <p className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest">Map Configuration & Data Sync</p>
          </div>
        </div>
        <button onClick={() => setIsIntelligenceOpen(false)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Map Mode Selection */}
        <section>
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Layers className="w-3 h-3" /> Map Visualization
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'standard', label: 'Standard', desc: 'Vector Grid' },
              { id: 'satellite', label: 'Satellite', desc: 'Ground Intel' },
              { id: 'hybrid', label: 'Hybrid', desc: 'Sat + Streets' },
              { id: 'intel', label: 'Analytics', desc: 'Traffic Heatmap' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMapMode(m.id as any)}
                className={`p-3 rounded-2xl border transition-all text-left ${mapMode === m.id ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-900/40' : 'bg-white/4 border-white/5 hover:border-white/20'}`}
              >
                <p className={`font-black text-[12px] uppercase tracking-wider ${mapMode === m.id ? 'text-white' : 'text-white/60'}`}>{m.label}</p>
                <p className={`text-[9px] font-bold mt-0.5 ${mapMode === m.id ? 'text-blue-100/60' : 'text-white/20'}`}>{m.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Cloud Logic */}
        <section>
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Cloud className="w-3 h-3" /> Cloud Intelligence Sync
          </h3>
          <div className="space-y-4">
            <button
               onClick={() => { setHybridStream(!hybridStream); mapOfflineService.setHybridStreamMode(!hybridStream); }}
               className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${hybridStream ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/4 border-white/5'}`}
            >
              <div className="flex items-center gap-3">
                <Wifi className={`w-5 h-5 ${hybridStream ? 'text-blue-400' : 'text-white/30'}`} />
                <div className="text-left">
                  <p className="font-black text-white text-[13px]">Hybrid Cloud Stream</p>
                  <p className="text-[9px] text-white/30 font-bold uppercase">Stream map tiles on-demand (No space burden)</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-all ${hybridStream ? 'bg-blue-500' : 'bg-white/10'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${hybridStream ? 'right-1' : 'left-1'}`} />
              </div>
            </button>

            <button
               onClick={handleCloudOffload}
               disabled={isCloudSyncing}
               className="w-full p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between shadow-xl shadow-blue-950/40 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <RefreshCw className={`w-5 h-5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                <div className="text-left">
                  <p className="font-black text-white text-[14px]">Offload to Sentinel Cloud</p>
                  <p className="text-[9px] text-blue-100/60 font-bold uppercase">Sync local intel to DB & clear device space</p>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
        </section>
 
        {/* Data Layers */}
        <section>
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Info className="w-3 h-3" /> Geospatial Overlays
          </h3>
          <div className="space-y-3">
            <button
               onClick={() => setShowInformalRoutes(!showInformalRoutes)}
               className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${showInformalRoutes ? 'bg-green-500/10 border-green-500/40' : 'bg-white/4 border-white/5'}`}
            >
              <div className="flex items-center gap-3">
                <Radio className={`w-5 h-5 ${showInformalRoutes ? 'text-green-400' : 'text-white/30'}`} />
                <div className="text-left">
                  <p className="font-black text-white text-[13px]">Informal Routes (HOT Data)</p>
                  <p className="text-[9px] text-white/30 font-bold uppercase">Include unmapped paths & shortcuts</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-all ${showInformalRoutes ? 'bg-green-500' : 'bg-white/10'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showInformalRoutes ? 'right-1' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </section>

        {/* Offline Management */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
              <Database className="w-3 h-3" /> Offline Intelligence Logic
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-tighter italic">Storage: {storageStats.used}MB / {storageStats.limit}MB</span>
              <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                <div className="h-full bg-blue-500" style={{ width: `${storageStats.percent}%` }} />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { id: 'yaounde', label: 'Yaoundé Core Grid', size: '42MB', desc: 'Z10 - Z18 High Detail' },
              { id: 'cameroon', label: 'Full Cameroon Net', size: '1.2GB', desc: 'Z5 - Z12 Country Scale' }
            ].map(r => (
              <div key={r.id} className="bg-white/3 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${offlineMaps[r.id] ? 'bg-green-500/20' : 'bg-white/5'}`}>
                    {downloadProgress[r.id] !== undefined ? (
                      <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                    ) : offlineMaps[r.id] ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Database className="w-5 h-5 text-white/20" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-black text-white text-[13px]">{r.label}</p>
                    <p className="text-[10px] text-white/40 font-bold uppercase">{r.size} • {r.desc}</p>
                  </div>
                </div>
                {downloadProgress[r.id] !== undefined ? (
                  <div className="text-right">
                    <p className="text-blue-400 font-black text-[12px]">{downloadProgress[r.id]}%</p>
                  </div>
                ) : offlineMaps[r.id] ? (
                  <button className="text-[10px] font-black text-green-400 uppercase tracking-widest bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">Installed</button>
                ) : (
                  <button
                    onClick={() => { handleDownloadMap(r.id as any); setStorageStats(mapOfflineService.getStorageUsage()); }}
                    className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <button 
            onClick={() => { mapOfflineService.clearStorage(); setOfflineMaps({ yaounde: false, douala: false, cameroon: false }); setStorageStats(mapOfflineService.getStorageUsage()); }}
            className="w-full mt-4 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500/10 transition-all active:scale-95"
          >
            Purge Intelligence Cache
          </button>
        </section>
      </div>

      <div className="p-6 border-t border-white/5">
        <button onClick={() => setIsIntelligenceOpen(false)} className="w-full bg-white text-slate-950 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[12px] shadow-xl shadow-white/10 active:scale-95 transition-all">
          Deploy Configuration
        </button>
      </div>
    </div>
  );

  const currentContent = () => {
    if (activeTab === 'book') return renderBookTab();
    if (activeTab === 'notifications') return renderAlerts();
    if (activeTab === 'profile') return renderProfile();
    return renderHome();
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-white overflow-hidden relative">
      {currentContent()}
      {isIntelligenceOpen && renderIntelligenceSettings()}
      
      {/* ── Version Indicator (Deployment Validation) ── */}
      <div className="fixed bottom-2 right-2 z-[9999] pointer-events-none opacity-20">
         <p className="text-[6px] font-mono text-white">AFAT Grid v1.0.8-stable [RECOVERY_ENABLED]</p>
      </div>

      {/* ── Report Modal ──────────────────────────────── */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end justify-center z-[2000] p-4 pb-8 animate-in fade-in duration-200">
          <div className="bg-[#0f1520] border border-white/10 w-full max-w-md rounded-3xl p-6 relative">
            <button onClick={() => setIsReportModalOpen(false)} className="absolute top-5 right-5 text-white/30 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black text-white mb-1">Signaler un Incident</h3>
            <p className="text-[11px] text-white/30 mb-5">Partagé sur App + Telegram + SMS</p>
            <form onSubmit={submitReport} className="space-y-4">
              <select
                value={newIncident.type}
                onChange={e => setNewIncident(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 text-white text-[13px] p-4 rounded-xl outline-none focus:border-blue-500/50 transition-colors"
              >
                <option value="accident">🚗 Accident</option>
                <option value="traffic_jam">🚦 Embouteillage</option>
                <option value="flooding">🌊 Inondation</option>
                <option value="road_works">🚧 Travaux</option>
                <option value="checkpoint">👮 Contrôle routier</option>
                <option value="hazard">⚠️ Danger</option>
                <option value="protest">✊ Manifestation</option>
                <option value="road_damage">🕳️ Route endommagée</option>
                <option value="emergency">🆘 Urgence</option>
              </select>
              <textarea
                value={newIncident.description}
                onChange={e => setNewIncident(p => ({ ...p, description: e.target.value }))}
                placeholder="Description (ex: accident à Carrefour Obili, 2 véhicules impliqués)..."
                rows={3}
                className="w-full bg-black/40 border border-white/10 text-white text-[13px] p-4 rounded-xl outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/20 resize-none"
              />
              <div>
                <label className="text-[10px] text-white/30 uppercase font-mono font-bold mb-2 block">Sévérité: {newIncident.severity}/5</label>
                <input
                  type="range" min={1} max={5} value={newIncident.severity}
                  onChange={e => setNewIncident(p => ({ ...p, severity: parseInt(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-[13px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/50 active:scale-[0.98]">
                <Send className="w-4 h-4" /> Signaler maintenant
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Overlays ───────────────────────────────────── */}
      {isSOSActive && (
        <EmergencySOS 
          userId={profile?.id} 
          userName={profile?.full_name || 'Voyageur AFAT'} 
          onClose={() => setIsSOSActive(false)} 
        />
      )}
      {isWalletOpen && (
        <CommuterWallet 
          userId={profile?.id} 
          userName={profile?.full_name || 'Voyageur AFAT'} 
          trustTier="silver"
          onClose={() => setIsWalletOpen(false)} 
        />
      )}
      {isConciergeOpen && (
        <ConciergeHelp 
          userId={profile?.id} 
          userName={profile?.full_name || 'Voyageur AFAT'} 
          onClose={() => setIsConciergeOpen(false)} 
        />
      )}
      {isPointsOpen && (
        <PointsSystem 
          userId={profile?.id} 
          userName={profile?.full_name || 'Voyageur AFAT'} 
          onClose={() => setIsPointsOpen(false)} 
        />
      )}
      {isVoiceReporterOpen && (
        <VoiceReporter 
          profile={profile} 
          onClose={() => setIsVoiceReporterOpen(false)} 
        />
      )}
      {isScanHubOpen && (
        <ScanAndPayHub 
          onClose={() => setIsScanHubOpen(false)} 
          onPaymentSuccess={(amt, op) => console.log(`Paid ${amt} to ${op}`)}
        />
      )}
      
      {/* Identity Sentinel Modal */}
      {isIDSOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
           <div className="w-full max-w-sm">
              <SentinelIDCard profile={profile} onClose={() => setIsIDSOpen(false)} />
           </div>
        </div>
      )}
    </div>
  );
}
