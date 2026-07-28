import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, Car, LogOut, Power, Navigation, Clock, Check, X,
  Mic, History, CreditCard, QrCode, Users, Zap, TrendingUp,
  MessageCircle, Shield, Star, ChevronRight, AlertTriangle, DollarSign, Fingerprint, Radio, Megaphone,
  Database, Download, CheckCircle, Activity, Layout, Layers, Box, Cloud, Wifi, RefreshCw, ArrowUpRight
} from 'lucide-react';
import { fetchLiveMapOps, fetchPassageIntents, getOperatorWalletLedger, reportPassageOutcome, requestOperatorWithdrawal, submitNegotiationOffer, supabase, updatePassageIntentStatus } from '../../supabaseClient';
import { mapOfflineService } from '../../services/MapOfflineService';
import { VoiceReporter } from '../shared/VoiceReporter';
import { QRCodeGenerator } from '../shared/QRCodeGenerator';
import { TontineHub } from './TontineHub';
import { QRScanner } from './QRScanner';
import { offlineSync } from '../../services/offlineSync';
import { DriverDNA } from './DriverDNA';
import { InteractiveMap } from '../shared/InteractiveMap';
import { NegotiationPanel } from '../shared/NegotiationPanel';
import { AFATLogo } from '../shared/AFATLogo';
import { SentinelIDCard } from '../shared/SentinelIDCard';
import { telemetry } from '../../services/telemetry';
import { IntelligenceEngine } from '../../core/SentinelIntelligence';

interface Props {
  onSignOut: () => void;
  profile: any;
  activeTab?: string;
}

// ── Per-Vehicle Dynamic Theming ──────────────────────────
const TYPE_CONFIG: Record<string, { icon: React.ElementType, name: string, color: string, colorClass: string, textClass: string, glowClass: string }> = {
  moto: { icon: Zap, name: 'Bendskin', color: '#f97316', colorClass: 'border-orange-500/20', textClass: 'text-orange-400', glowClass: 'shadow-[0_0_15px_rgba(249,115,22,0.15)] bg-gradient-to-br from-[#2a1305] to-[#1a0a02]' },
  taxi: { icon: Car, name: 'Taxi Ville', color: '#eab308', colorClass: 'border-yellow-500/20', textClass: 'text-yellow-400', glowClass: 'shadow-[0_0_15px_rgba(234,179,8,0.15)] bg-gradient-to-br from-[#2a2205] to-[#1a1502]' },
  minibus: { icon: Users, name: 'Cargo', color: '#3b82f6', colorClass: 'border-blue-500/20', textClass: 'text-blue-400', glowClass: 'shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-gradient-to-br from-[#05132a] to-[#020a1a]' },
  bus: { icon: Navigation, name: 'VIP Express', color: '#a855f7', colorClass: 'border-purple-500/20', textClass: 'text-purple-400', glowClass: 'shadow-[0_0_15px_rgba(168,85,247,0.15)] bg-gradient-to-br from-[#1d052a] to-[#11021a]' },
  default: { icon: Car, name: 'Standard', color: '#22c55e', colorClass: 'border-green-500/20', textClass: 'text-green-400', glowClass: 'shadow-[0_0_15px_rgba(34,197,94,0.15)] bg-gradient-to-br from-[#052a13] to-[#021a0a]' }
};

export function OperatorDashboard({ onSignOut, profile, activeTab = 'home' }: Props): React.ReactElement {
  const [isOnline, setIsOnline] = useState(false);
  const [vehicle, setVehicle] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [passageIntents, setPassageIntents] = useState<any[]>([]);
  const [isVoiceReporterOpen, setIsVoiceReporterOpen] = useState(false);
  const [isQRGeneratorOpen, setIsQRGeneratorOpen] = useState(false);
  const [driveTimeMinutes, setDriveTimeMinutes] = useState(0);
  const [showFatigueAlert, setShowFatigueAlert] = useState(false);
  const [wallet, setWallet] = useState<any>(null);
  const [walletLedger, setWalletLedger] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTontineHub, setShowTontineHub] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [lastBoardedBookingId, setLastBoardedBookingId] = useState<string | null>(null);
  const [isIDSOpen, setIsIDSOpen] = useState(false);
  const [showDriverDNA, setShowDriverDNA] = useState(false);
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [storageStats, setStorageStats] = useState(mapOfflineService.getStorageUsage());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [offlineMaps, setOfflineMaps] = useState<Record<string, boolean>>({
    yaounde: localStorage.getItem('afat_offline_yaounde') === 'true',
    douala: localStorage.getItem('afat_offline_douala') === 'true',
    cameroon: localStorage.getItem('afat_offline_cameroon') === 'true'
  });
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [hybridStream, setHybridStream] = useState(mapOfflineService.getHybridStreamMode());
  const [latestDirective, setLatestDirective] = useState<any>(null);
  const [isDriveModeActive, setIsDriveModeActive] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [regionalSupply, setRegionalSupply] = useState<any[]>([]);
  const [regionalCheckpoints, setRegionalCheckpoints] = useState<any[]>([]);
  const [regionalLabel, setRegionalLabel] = useState('Cameroon');
  const [coPilotFeed, setCoPilotFeed] = useState<{ time: string, text: string, type: 'info' | 'warning' | 'success' }[]>([
    { time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), text: "Système Sentinel activé. Scan en cours...", type: 'info' }
  ]);
  const [negotiatingRequest, setNegotiatingRequest] = useState<any | null>(null);
  const [operatorNotice, setOperatorNotice] = useState('');
  const [isNegotiationSaving, setIsNegotiationSaving] = useState(false);
  const operatorLifecycle = String(
    profile?.operator_application_status || (profile?.is_active ? 'APPROVED' : 'UNDER_REVIEW')
  ).toUpperCase();
  const isOperatorApproved = operatorLifecycle === 'APPROVED' && profile?.is_active !== false;

  const handleDownloadMap = async (regionId: 'yaounde' | 'douala' | 'cameroon') => {
    if (offlineMaps[regionId]) return;
    setDownloadProgress(p => ({ ...p, [regionId]: 0 }));
    try {
      if (regionId === 'cameroon') {
        await mapOfflineService.downloadFullCameroon((progress) => {
          setDownloadProgress(p => ({ ...p, [regionId]: progress }));
        });
      } else {
        await mapOfflineService.downloadRegion(regionId, (progress) => {
          setDownloadProgress(p => ({ ...p, [regionId]: progress }));
        });
      }
      setOfflineMaps(p => ({ ...p, [regionId]: true }));
      localStorage.setItem(`afat_offline_${regionId}`, 'true');
      setStorageStats(mapOfflineService.getStorageUsage());
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

  const handleCloudOffload = async () => {
    setIsCloudSyncing(true);
    await mapOfflineService.offloadIntelligenceToDatabase();
    setTimeout(() => {
      setIsCloudSyncing(false);
      setStorageStats(mapOfflineService.getStorageUsage());
    }, 1500);
  };

  const refreshRegionalOps = async () => {
    const city = profile?.preferred_city || 'cameroon';
    const { data } = await fetchLiveMapOps(city);
    if (!data) return;
    setIncidents(data.incidents || []);
    setRegionalSupply(data.vehicles || []);
    setRegionalCheckpoints(data.checkpoints || []);
    setRegionalLabel(data.label || 'Cameroon');
  };

  useEffect(() => {
    fetchVehicle();
    fetchRequests();
    fetchWallet();
    fetchWalletLedger();
    refreshRegionalOps();

    const channel = supabase
      .channel('operator-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchRequests();
        fetchWallet();
        fetchWalletLedger();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'operator_wallets',
        filter: `operator_id=eq.${profile?.id}`
      }, () => { fetchWallet(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        refreshRegionalOps();
      })
      .subscribe();

    const directiveChannel = supabase
      .channel('operator-directives')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sentinel_directives', filter: 'status=eq.broadcasted' }, (payload) => {
        setLatestDirective(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sentinel_directives', filter: 'status=eq.broadcasted' }, (payload) => {
        setLatestDirective(payload.new);
      })
      .subscribe();

    const fetchGov = async () => {
      const { data } = await supabase.from('sentinel_directives').select('*').eq('status', 'broadcasted').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setLatestDirective(data);
    };
    fetchGov();

    return () => { 
      supabase.removeChannel(channel); 
      supabase.removeChannel(directiveChannel);
    };
  }, [profile?.id, profile?.preferred_city]);

  useEffect(() => {
    if (!isDriveModeActive) return;

    const interval = setInterval(async () => {
      const language = profile?.language || 'fr';
      const prediction = await IntelligenceEngine.predict('Yaoundé Centre', language);
      
      setCoPilotFeed(prev => [
        { 
          time: new Date().toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' }), 
          text: prediction, 
          type: prediction.toLowerCase().includes('alert') || prediction.toLowerCase().includes('danger') ? 'warning' : 'info'
        },
        ...prev.slice(0, 4)
      ]);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isDriveModeActive, profile?.language]);

  useEffect(() => {
    if (isOnline && profile?.id) {
      telemetry.start(profile.id);
    } else {
      telemetry.stop();
    }
    return () => telemetry.stop();
  }, [isOnline, profile?.id]);

  useEffect(() => {
    let interval: any;
    if (isOnline) {
      interval = setInterval(() => {
        setDriveTimeMinutes(prev => {
          const newTime = prev + 1;
          if (newTime >= 240 && !showFatigueAlert) setShowFatigueAlert(true);
          return newTime;
        });
      }, 60000);
    } else {
      setDriveTimeMinutes(0);
      setShowFatigueAlert(false);
    }
    return () => clearInterval(interval);
  }, [isOnline]);

  const fetchVehicle = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('vehicles').select('*').eq('operator_id', profile.id).limit(1).maybeSingle();
    setVehicle(data);
  };

  const fetchRequests = async () => {
    if (!profile?.id) return;
    const [{ data }, openPassages, assignedPassages] = await Promise.all([
      supabase
        .from('bookings').select('*, routes(name, price_per_seat)')
        .eq('operator_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
      fetchPassageIntents({ open: true }),
      fetchPassageIntents({ operator_id: profile.id }),
    ]);
    setRequests(data || []);
    const passages = [...(openPassages.data?.passages || []), ...(assignedPassages.data?.passages || [])];
    setPassageIntents(Array.from(new Map(passages.map((passage: any) => [passage.id, passage])).values()));
  };

  const acknowledgePassage = async (passageId: string) => {
    const { error } = await updatePassageIntentStatus(passageId, {
      status: 'driver_acknowledged',
      operator_id: profile.id,
    });
    if (error) {
      setOperatorNotice(`Passage could not be acknowledged: ${error.message}`);
      return;
    }
    setOperatorNotice('Passage acknowledged. AFAT now shows both sides the same meeting point and instructions.');
    fetchRequests();
  };

  const markPassageArrived = async (passageId: string) => {
    const { error } = await updatePassageIntentStatus(passageId, {
      status: 'driver_arrived',
      operator_id: profile.id,
    });
    if (error) {
      setOperatorNotice(`Arrival could not be confirmed: ${error.message}`);
      return;
    }
    setOperatorNotice('Arrival confirmed. The passenger and operator are now anchored on the same meeting point.');
    fetchRequests();
  };

  const recordPassageOutcome = async (
    passageId: string,
    outcomeType: 'successful_pickup' | 'road_inaccessible' | 'meeting_point_incorrect' | 'passenger_no_show' | 'driver_cancelled' | 'passenger_cancelled',
    responsibility: 'driver' | 'passenger' | 'map' | 'road_condition' | 'shared' | 'unclassified',
  ) => {
    const { error } = await reportPassageOutcome(passageId, {
      outcome_type: outcomeType,
      responsibility,
    });
    if (error) {
      setOperatorNotice(`Outcome could not be recorded: ${error.message}`);
      return;
    }
    setOperatorNotice(outcomeType === 'successful_pickup'
      ? 'Pickup confirmed. AFAT has strengthened this meeting point with verified evidence.'
      : 'Issue recorded. The passage remains active in recovery while operations reviews the evidence.');
    fetchRequests();
  };

  const fetchWallet = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('operator_wallets').select('*').eq('operator_id', profile.id).maybeSingle();
    setWallet(data);
  };

  const fetchWalletLedger = async () => {
    if (!profile?.id) return;
    const { data } = await getOperatorWalletLedger(profile.id);
    setWalletLedger(data || []);
  };

  const fetchHistory = async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('bookings').select('*, routes(name, price_per_seat)')
      .eq('operator_id', profile.id).neq('status', 'pending')
      .order('created_at', { ascending: false }).limit(20);
    setRideHistory(data || []);
  };

  const toggleOnline = async () => {
    if (!isOperatorApproved) {
      setOperatorNotice('AFAT approval is still pending. Complete review and compliance before going live.');
      return;
    }
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    if (vehicle?.id) {
      await supabase.from('vehicles').update({ is_available: newStatus }).eq('id', vehicle.id);
    }
  };

  const acceptRequest = async (bookingId: string, finalPrice?: number) => {
    const updates: Record<string, any> = { status: 'confirmed' };
    if (typeof finalPrice === 'number') {
      updates.price_paid = finalPrice;
    }
    await supabase.from('bookings').update(updates).eq('id', bookingId);
    fetchRequests();
  };

  const cancelRequest = async (bookingId: string) => {
    await supabase.from('bookings').update({ status
      : 'cancelled' }).eq('id', bookingId);
    setOperatorNotice('Signal declined. AFAT released that seat request back to the marketplace.');
    fetchRequests();
  };

  const handleCounterOffer = async (price: number) => {
    if (!negotiatingRequest) return;
    setIsNegotiationSaving(true);
    const { error } = await submitNegotiationOffer({
      booking_id: negotiatingRequest.id,
      role: 'operator',
      price,
      status: 'countered',
    });
    setIsNegotiationSaving(false);

    if (error) {
      setOperatorNotice(`Counter offer could not be sent yet: ${error.message}`);
      return;
    }

    setOperatorNotice(`Counter offer sent at ${price.toLocaleString()} XAF. The commuter now sees the updated fare thread.`);
  };

  const handleAcceptNegotiation = async (price: number) => {
    if (!negotiatingRequest) return;
    setIsNegotiationSaving(true);
    const { error } = await submitNegotiationOffer({
      booking_id: negotiatingRequest.id,
      role: 'operator',
      price,
      status: 'accepted',
    });

    if (error) {
      setIsNegotiationSaving(false);
      setOperatorNotice(`Final fare could not be locked yet: ${error.message}`);
      return;
    }

    await acceptRequest(negotiatingRequest.id, price);
    setIsNegotiationSaving(false);
    setOperatorNotice(`Fare locked at ${price.toLocaleString()} XAF. Passenger signal is now confirmed for boarding and payment.`);
    setNegotiatingRequest(null);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) return;
    const { error } = await requestOperatorWithdrawal(profile?.id, amount);
    if (!error) {
      setShowWithdraw(false);
      setWithdrawAmount('');
      fetchWallet();
      fetchWalletLedger();
    }
  };

  const shiftHours = Math.floor(driveTimeMinutes / 60);
  const shiftMins = driveTimeMinutes % 60;
  
  const vTypeStr = profile?.vehicle_type || vehicle?.type || 'default';
  const theme = TYPE_CONFIG[vTypeStr] || TYPE_CONFIG.default;
  const TypeIcon = theme.icon;

  const renderOperatorNotice = () => (
    operatorNotice ? (
      <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-[11px] font-semibold leading-relaxed text-blue-100">
        {operatorNotice}
      </div>
    ) : null
  );

  const renderLifecycleBanner = () => {
    if (isOperatorApproved) return null;

    const lifecycleCopy: Record<string, { title: string; body: string }> = {
      APPLICATION_STARTED: {
        title: 'Application started',
        body: 'AFAT saved the operator profile, but identity and vehicle details are still incomplete.',
      },
      DOCUMENTS_PENDING: {
        title: 'Documents pending',
        body: 'AFAT needs more operator or vehicle documents before review can finish.',
      },
      UNDER_REVIEW: {
        title: 'Under review',
        body: 'Operations is reviewing this operator for live dispatch, bookings, and marketplace activation.',
      },
      REJECTED: {
        title: 'Application needs correction',
        body: 'This operator file was rejected for now. Review notes below should be resolved before reapplying.',
      },
      SUSPENDED: {
        title: 'Operator suspended',
        body: 'Live activity is paused. AFAT must clear the operator again before dispatch returns.',
      },
    };

    const copy = lifecycleCopy[operatorLifecycle] || lifecycleCopy.UNDER_REVIEW;

    return (
      <div className="mx-5 mt-4 rounded-[1.75rem] border border-amber-400/20 bg-amber-500/10 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/70">Operator readiness</p>
            <h2 className="mt-1 text-base font-black text-white">{copy.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{copy.body}</p>
            {profile?.operator_review_notes && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] text-white/65">
                {profile.operator_review_notes}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDirectiveSurface = () => (
    <div id="operator-directives">
      {latestDirective ? (
        <div className={`border rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top duration-300 relative overflow-hidden ${
          latestDirective.tier === 2 || latestDirective.source === 'ADMIN_OVERRIDE'
            ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
            : 'bg-blue-500/10 border-blue-500/30'
        }`}>
          {latestDirective.tier === 2 && <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/20 blur-2xl rounded-full" />}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            latestDirective.tier === 2 || latestDirective.source === 'ADMIN_OVERRIDE' ? 'bg-amber-500/20 border-amber-500/30' : 'bg-blue-500/20 border-blue-500/30'
          }`}>
            <Megaphone className={`w-5 h-5 ${latestDirective.tier === 2 ? 'text-amber-400' : 'text-blue-400'}`} />
          </div>
          <div className="flex-1 relative z-10">
            <div className="flex items-center justify-between mb-1">
              <p className={`font-black text-[13px] uppercase tracking-wider ${latestDirective.tier === 2 ? 'text-amber-400' : 'text-blue-400'}`}>
                {latestDirective.tier === 2 ? '⚠️ COMMANDEMENT CENTRAL' : '🤖 AFAT Sentinel AI'}
              </p>
              <span className="text-[9px] text-white/40 uppercase font-mono">{latestDirective.source}</span>
            </div>
            <p className="text-[14px] text-white font-bold leading-tight mb-2">{latestDirective.directive}</p>
            <p className="text-[10px] text-white/50 italic border-l-2 border-white/10 pl-2">Vérifié via: {latestDirective.basis}</p>
          </div>
          <button onClick={() => setLatestDirective(null)} className="text-white/20 hover:text-white/60 transition-colors relative z-10">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] font-semibold text-white/45">
          Grid Intel is quiet right now. New directives and operator-wide broadcasts will appear here.
        </div>
      )}
    </div>
  );

  const renderRequestsPanel = () => (
    <div id="operator-marketplace">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-black text-white text-[16px] flex items-center gap-2">
          <Navigation className="w-4 h-4 text-blue-400" />
          Demandes en Direct
        </h3>
        {requests.length > 0 && (
          <div className="bg-blue-500/15 border border-blue-500/25 px-2.5 py-1 rounded-full">
            <span className="text-[10px] font-black text-blue-400">{requests.length} nouveau{requests.length > 1 ? 'x' : ''}</span>
          </div>
        )}
      </div>

      {renderOperatorNotice()}

      {isOnline && passageIntents.length > 0 && (
        <div className="mb-5 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/65">AFAT passage intents</p>
          {passageIntents.map((passage) => {
            const place = passage.afat_places;
            const meetingPoint = passage.afat_meeting_points;
            return (
              <div key={passage.id} className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/8 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-white">{place?.canonical_name || passage.destination_text}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200/65">
                      {passage.requested_vehicle_type || 'vehicle flexible'} · place confidence {passage.place_confidence || 0}%
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-black uppercase text-white/55">
                    {passage.arrival_target ? `Arrive ${new Date(passage.arrival_target).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Now'}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-200/60">Shared meeting point</p>
                  <p className="mt-1 text-xs font-black text-white">{meetingPoint?.name || 'Meeting point pending review'}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/55">{meetingPoint?.instructions || 'Use the passenger description and request operations support before moving.'}</p>
                  {meetingPoint && (
                    <p className="mt-2 text-[10px] font-bold text-blue-200/65">Passenger walk {meetingPoint.walk_minutes} min · meeting confidence {meetingPoint.confidence}%</p>
                  )}
                </div>

                {['open', 'assigned'].includes(String(passage.status || '')) ? (
                  <button
                    onClick={() => acknowledgePassage(passage.id)}
                    disabled={!meetingPoint}
                    className="mt-4 w-full rounded-2xl bg-emerald-500 px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-950 disabled:opacity-40"
                  >
                    Acknowledge meeting point
                  </button>
                ) : passage.status === 'recovery' ? (
                  <div className="mt-4 rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-orange-100">
                    Recovery active · operations reviewing
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => markPassageArrived(passage.id)} className="col-span-2 rounded-2xl bg-blue-500 px-3 py-3 text-[9px] font-black uppercase text-white">
                      I have arrived at meeting point
                    </button>
                    <button onClick={() => recordPassageOutcome(passage.id, 'successful_pickup', 'shared')} className="rounded-2xl bg-emerald-500 px-3 py-3 text-[9px] font-black uppercase text-slate-950">
                      Pickup succeeded
                    </button>
                    <button onClick={() => recordPassageOutcome(passage.id, 'road_inaccessible', 'road_condition')} className="rounded-2xl border border-orange-300/25 bg-orange-400/10 px-3 py-3 text-[9px] font-black uppercase text-orange-100">
                      Road inaccessible
                    </button>
                    <button onClick={() => recordPassageOutcome(passage.id, 'meeting_point_incorrect', 'map')} className="col-span-2 rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-3 text-[9px] font-black uppercase text-red-100">
                      Meeting point incorrect
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOnline && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-5 shadow-xl relative overflow-hidden group animate-in slide-in-from-right duration-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />
              
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-900 rounded-2xl flex items-center justify-center text-white font-black text-[20px] shadow-lg border border-white/10 italic">
                  {req.passenger_id.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-[16px] truncate italic uppercase tracking-tighter">{req.routes?.name || 'Inbound Signal'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                     <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Seat: {req.seat_label}</p>
                     <span className="w-1 h-1 rounded-full bg-white/20"></span>
                     <p className="text-[10px] text-white/30 font-mono">#{req.id.substring(0, 8)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white/45">
                      {req.payment_status || 'payment pending'}
                    </span>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                      negotiation ready
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-white text-[18px] tracking-tight">{(req.routes?.price_per_seat || 0).toLocaleString()}</p>
                  <p className="text-[8px] text-white/40 font-black uppercase tracking-widest leading-none">XAF</p>
                </div>
              </div>
              
              <div className="flex gap-3 relative z-10 mb-3">
                <button
                  onClick={() => {
                    setNegotiatingRequest(req);
                    setOperatorNotice('Negotiation channel opened. Counter offers here are tied to the live booking thread.');
                  }}
                  className="flex-1 bg-white/5 border border-blue-500/30 text-blue-400 font-black text-[11px] py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-[0.2em]"
                >
                  <TrendingUp className="w-4 h-4" /> Negocier
                </button>
              </div>

              <div className="flex gap-3 relative z-10">
                <button
                  onClick={() => {
                    acceptRequest(req.id, req.routes?.price_per_seat || 0);
                    setOperatorNotice(`Passenger request confirmed at ${(req.routes?.price_per_seat || 0).toLocaleString()} XAF.`);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                >
                  <Check className="w-4 h-4" /> Confirm Node
                </button>
                <button
                  onClick={() => cancelRequest(req.id)}
                  className="bg-white/5 border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 px-5 rounded-2xl flex items-center justify-center transition-all active:scale-[0.98] group/cancel"
                >
                  <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOnline && requests.length === 0 && passageIntents.length === 0 && (
        <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-12 text-center shadow-inner">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400 relative z-10 shadow-[0_0_15px_#10b981]"></div>
          </div>
          <p className="text-white font-black text-[15px] uppercase tracking-tighter italic">Grid Scanning Active</p>
          <p className="text-white/30 text-[11px] font-bold uppercase tracking-widest mt-1">Listening for passenger signals...</p>
        </div>
      )}

      {!isOnline && (
        <div className="bg-white/2 backdrop-blur-sm border border-dashed border-white/10 rounded-[2rem] p-12 text-center">
          <Power className="w-10 h-10 text-white/5 mx-auto mb-4" />
          <p className="text-white/20 font-black text-[13px] uppercase tracking-[0.3em] italic">Terminal Standby</p>
          <p className="text-white/10 text-[10px] font-bold uppercase tracking-widest mt-2">Activate link to start receiving</p>
        </div>
      )}
    </div>
  );

  const renderHomeContent = () => (
    <div id="operator-home-top" className="p-5 pb-32 space-y-5">
      {/* ── Fatigue Alert ──────────────────────────────── */}
      {showFatigueAlert && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-black text-amber-400 text-[13px]">AFAT Sentinel Monitor: Repos Suggéré</p>
            <p className="text-[11px] text-white/40 mt-0.5">Vous conduisez depuis +4h. Pensez à faire une pause.</p>
          </div>
          <button onClick={() => setShowFatigueAlert(false)} className="text-white/20 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Boarding Confirmed Banner ──────────────────── */}
      {lastBoardedBookingId && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top duration-300">
          <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <p className="font-black text-green-400 text-[13px]">Boarding Vérifié!</p>
            <p className="text-[11px] text-white/40">Booking #{lastBoardedBookingId.substring(0, 8)} traité et crédité.</p>
          </div>
          <button onClick={() => setLastBoardedBookingId(null)} className="text-white/20 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Hero Earnings + Status ──────────────────────────── */}
      <div className={`rounded-[2.5rem] overflow-hidden relative hud-border backdrop-blur-3xl bg-black/40 shadow-2xl ${theme.glowClass} animate-in fade-in zoom-in-95 duration-700`} style={{minHeight: '180px'}}>
        {/* If default/car, use operator-hero.png, else use pure gradient */}
        {vTypeStr === 'default' && <div className="absolute inset-0 operator-hero-bg opacity-20 mix-blend-overlay" />}
        
        {/* Animated HUD Grid Lines */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        
        <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice">
          <path d="M0,90 Q120,45 200,80 T400,65" fill="none" stroke={theme.color} strokeWidth="2.5" strokeDasharray="1000" className="animate-route-draw" />
          <circle r="5" fill={theme.color} className="shadow-[0_0_15px_currentColor]">
            <animateMotion dur="5s" repeatCount="indefinite" path="M0,90 Q120,45 200,80 T400,65" />
          </circle>
        </svg>

        <div className="relative z-10 p-7">
          <div className="flex items-center justify-between mb-7">
            <div>
              <p className="text-[10px] text-white/50 uppercase font-black mb-2 tracking-[0.25em] flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-current animate-pulse shadow-[0_0_10px_currentColor] ${theme.textClass}`}></div>
                {theme.name} Terminal Alpha
              </p>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-black tracking-tighter ${theme.textClass} drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>{wallet?.balance_xaf ? wallet.balance_xaf.toLocaleString() : '0'}</span>
                <span className={`text-[12px] font-black ${theme.textClass} opacity-40 uppercase tracking-widest`}>XAF</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase font-black mb-1.5 tracking-[0.2em] italic">Live Tracking</p>
              <p className="font-black text-white/90 text-[20px] mono tracking-tighter glass-dark px-4 py-1.5 rounded-xl border border-white/10 shadow-lg">{String(shiftHours).padStart(2, '0')}:{String(shiftMins).padStart(2, '0')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => setIsQRGeneratorOpen(true)} className={`glass-panel rounded-2xl py-4 font-black text-[10px] ${theme.textClass} uppercase tracking-widest flex flex-col items-center gap-2 active:scale-95 transition-all hover:bg-white/10 shadow-xl group border-white/10`}>
              <QrCode className="w-5 h-5 group-hover:scale-110 transition-transform" />QR DASH
            </button>
            <button onClick={() => setShowWithdraw(true)} className={`glass-panel rounded-2xl py-4 font-black text-[10px] ${theme.textClass} uppercase tracking-widest flex flex-col items-center gap-2 active:scale-95 transition-all hover:bg-white/10 shadow-xl group border-white/10`}>
              <CreditCard className="w-5 h-5 group-hover:scale-110 transition-transform" />CASH OUT
            </button>
            <button onClick={() => { fetchHistory(); setShowHistory(true); }} className="glass-panel rounded-2xl py-4 font-black text-[10px] text-white/50 uppercase tracking-widest flex flex-col items-center gap-2 active:scale-95 transition-all hover:bg-white/10 group border-white/5">
              <History className="w-5 h-5 group-hover:rotate-[-45deg] transition-transform" />ARCHIVES
            </button>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Grid Pulse</p>
              <p className="text-[14px] font-black uppercase tracking-tight text-white">Today's operating picture</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-red-500/15 bg-red-500/8 px-3 py-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-red-200/60">Alerts</p>
              <p className="mt-2 text-2xl font-black text-white">{incidents.length}</p>
            </div>
            <div className="rounded-2xl border border-blue-500/15 bg-blue-500/8 px-3 py-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-200/60">Nodes</p>
              <p className="mt-2 text-2xl font-black text-white">{regionalSupply.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-3 py-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200/60">Demand</p>
              <p className="mt-2 text-2xl font-black text-white">{requests.length}</p>
            </div>
          </div>
          {latestDirective && (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-200/70">Latest directive</p>
              <p className="mt-1 text-[12px] font-semibold leading-relaxed text-white/85">{latestDirective.directive}</p>
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Fast Launch</p>
              <p className="text-[14px] font-black uppercase tracking-tight text-white">Move without friction</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="space-y-3">
            <button onClick={() => setIsDriveModeActive(true)} className="w-full rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-4 flex items-center justify-between text-left transition-all hover:bg-blue-500/15 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                  <Navigation className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white">Enter Drive HUD</p>
                  <p className="text-[10px] text-blue-200/60">Navigation, co-pilot, live route view</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </button>
            <button onClick={() => setIsVoiceReporterOpen(true)} className="w-full rounded-2xl border border-purple-500/20 bg-purple-500/10 px-4 py-4 flex items-center justify-between text-left transition-all hover:bg-purple-500/15 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white">Send Voice Intel</p>
                  <p className="text-[10px] text-purple-200/60">Push new field signal to the grid</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </button>
            <button onClick={() => setIsIntelligenceOpen(true)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 flex items-center justify-between text-left transition-all hover:bg-white/[0.06] active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-white/70" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white">Map Control</p>
                  <p className="text-[10px] text-white/45">Offline regions and hybrid cloud sync</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </button>
          </div>
        </div>
      </section>

      {walletLedger.length > 0 && (
        <div className="mt-4 rounded-[2rem] border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-black">Recent Ledger</p>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-mono">{walletLedger.length} entries</p>
          </div>
          <div className="space-y-2">
            {walletLedger.slice(0, 3).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-tight text-white">{entry.entry_type.replace('_', ' ')}</p>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">{entry.status}</p>
                </div>
                <p className={`text-sm font-black ${entry.direction === 'credit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {entry.direction === 'credit' ? '+' : '-'}{Number(entry.net_amount || 0).toLocaleString()} XAF
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Vehicle + DNA Row ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Vehicle card */}
        <div className={`glass-dark hud-border rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden group`}>
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TypeIcon className={`w-24 h-24 ${theme.textClass}`} />
          </div>
          <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center mb-4 border border-white/10 shadow-lg ${theme.glowClass}`}>
            <TypeIcon className={`w-6 h-6 ${theme.textClass}`} />
          </div>
          <p className="font-black text-white text-[18px] tracking-tighter italic uppercase text-glow-white drop-shadow-md">{vehicle?.plate_number || 'TR-7724-XY'}</p>
          <p className={`text-[10px] uppercase font-black tracking-[0.3em] ${theme.textClass} opacity-60 mt-1 italic`}>{theme.name} Node Alpha</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
              <p className="text-[9px] text-white/25 uppercase font-black tracking-widest mb-1">Rides</p>
              <p className="font-black text-white text-[14px]">{vehicle?.total_rides || 0}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
              <p className="text-[9px] text-white/25 uppercase font-black tracking-widest mb-1">Trust</p>
              <p className="font-black text-amber-400 text-[14px] text-glow-amber">{vehicle?.rating || '5.0'}★</p>
            </div>
          </div>
        </div>

        {/* Quick tools */}
        <div className="grid grid-cols-1 gap-2.5 font-secondary">
          <button onClick={() => setIsQRScannerOpen(true)} className="glass-panel border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.97] transition-all hover:bg-emerald-500/20 hover:border-emerald-500/40 glow-green group">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/30">
              <QrCode className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[13px] uppercase tracking-tighter italic">Scan Ticket</p>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest opacity-60">Boarding Grid</p>
            </div>
          </button>
          <button onClick={() => setShowTontineHub(true)} className="glass-panel border-blue-500/20 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.97] transition-all hover:bg-blue-500/20 hover:border-blue-500/40 glow-blue group">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0 border border-blue-500/30">
              <Users className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[13px] uppercase tracking-tighter italic">Tontine Hub</p>
              <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest opacity-60">Security Pot</p>
            </div>
          </button>
          <button onClick={() => setIsVoiceReporterOpen(true)} className="glass-panel border-purple-500/20 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.97] transition-all hover:bg-purple-500/20 hover:border-purple-500/40 shadow-xl group">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center shrink-0 border border-purple-500/30">
              <Mic className="w-5 h-5 text-purple-400 group-hover:animate-pulse transition-transform" />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[13px] uppercase tracking-tighter italic">Voice Intel</p>
              <p className="text-[9px] text-purple-400 font-bold uppercase tracking-widest opacity-60">Hands Free</p>
            </div>
          </button>
          <button onClick={() => setShowDriverDNA(true)} className="bg-orange-600/10 backdrop-blur-xl border border-orange-500/20 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.97] transition-all hover:bg-orange-500/20 hover:border-orange-500/40 shadow-lg group">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center shrink-0 border border-orange-500/30">
              <Shield className="w-5 h-5 text-orange-400 group-hover:rotate-12 transition-transform" />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[13px] uppercase tracking-tighter italic">Driver DNA</p>
              <p className="text-[9px] text-orange-400/60 font-bold uppercase tracking-widest">Profile Intel</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── TACTICAL DRIVE MODE LAUNCH ───────────────── */}
      <button onClick={() => setIsDriveModeActive(true)} className="w-full mt-5 mb-5 bg-[#0f172a] border border-blue-500/30 hover:border-blue-400 p-6 rounded-[2.5rem] relative overflow-hidden group shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all active:scale-95">
         <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent group-hover:from-blue-600/20 transition-colors"></div>
         {/* Sweeping radar effect on button */}
         <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-blue-400/20 to-transparent skew-x-12 -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
         <div className="relative z-10 flex items-center justify-between">
            <div className="text-left flex items-center gap-4">
               <div className="w-14 h-14 bg-black/50 border border-blue-500/30 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-shadow">
                 <Navigation className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
               </div>
               <div>
                 <h3 className="font-black text-[20px] text-white uppercase italic tracking-tighter drop-shadow-md">Tactical Drive HUD</h3>
                 <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em] mt-0.5">Initialize 2.5D Navigation</p>
               </div>
            </div>
            <ChevronRight className="w-8 h-8 text-blue-500/50 group-hover:text-blue-400 group-hover:translate-x-2 transition-all" />
         </div>
      </button>

    </div>
  );

  const renderIntelligenceSettings = () => (
    <div className="fixed inset-0 z-[6000] bg-[#080c14]/95 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-300">
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

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
              <Database className="w-3 h-3" /> Offline Regions
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-tighter italic">Storage: {storageStats.used}MB / {storageStats.limit}MB</span>
              <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                <div className="h-full bg-blue-500" style={{ width: `${storageStats.percent}%` }} />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {mapOfflineService.getCatalog().map(r => (
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
                    <p className="font-black text-white text-[13px]">{r.name}</p>
                    <p className="text-[10px] text-white/40 font-bold uppercase">
                      {r.status === 'ready' ? `${r.sizeMb}MB` : 'planned'} • {r.detail}
                    </p>
                  </div>
                </div>
                {downloadProgress[r.id] !== undefined ? (
                  <div className="text-right">
                    <p className="text-blue-400 font-black text-[12px]">{downloadProgress[r.id]}%</p>
                  </div>
                ) : offlineMaps[r.id] ? (
                  <button className="text-[10px] font-black text-green-400 uppercase tracking-widest bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">Installed</button>
                ) : r.status !== 'ready' ? (
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">Planned</span>
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

  const renderProfile = () => (
    <div className="p-5 pb-32 bg-[#080c14] min-h-screen">
      <h2 className="text-xl font-black text-white mb-6 uppercase tracking-tighter italic">Sentinel Operator Profile</h2>
      <div className="bg-[#0f1520] border border-white/8 rounded-[32px] p-6 mb-4 relative overflow-hidden transition-all shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <AFATLogo className="w-24 h-24 text-white" />
        </div>
        
        <div className="flex items-center gap-5 mb-6 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-600 to-orange-800 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-orange-900/40 border border-white/10">
            {(profile?.full_name || 'O')[0]}
          </div>
          <div className="flex-1">
            <h3 className="font-black text-white text-[20px] leading-tight flex items-center gap-2 italic">
              {profile?.full_name || 'AFAT Agent'}
              <Shield className="w-4 h-4 text-orange-400" />
            </h3>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-1 italic">Verified Operator Node</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4">
             <span className="text-[9px] text-white/30 uppercase font-black tracking-widest block mb-1">Reputation Score</span>
             <p className="font-black text-white text-[16px] italic">{profile?.trust_points || 98} PTS</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4">
             <span className="text-[9px] text-white/30 uppercase font-black tracking-widest block mb-1">Security Level</span>
             <p className="font-black text-orange-400 text-[16px] uppercase italic">ALPHA</p>
          </div>
        </div>

        {/* Identity Vault Trigger */}
        <button 
          onClick={() => setIsIDSOpen(true)}
          className="w-full bg-orange-600 border border-orange-400/30 hover:bg-orange-500 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98] group shadow-xl shadow-orange-900/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
              <Fingerprint className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <span className="block text-[11px] font-black text-white uppercase tracking-widest">Identity Vault</span>
              <span className="block text-[8px] text-orange-100/60 font-bold uppercase tracking-tighter italic">Strategic Clearance</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/50 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Intelligence Settings (Offline Maps) */}
        <button 
          onClick={() => setIsIntelligenceOpen(true)}
          className="w-full mt-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-left">
              <span className="block text-[11px] font-black text-white uppercase tracking-widest">Offline Intelligence</span>
              <span className="block text-[8px] text-white/40 font-bold uppercase tracking-tighter italic">Regional Maps & Nodes</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/20 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-4 flex items-center gap-3">
         <Radio className="w-5 h-5 text-blue-400 shrink-0 animate-pulse" />
         <p className="text-[11px] text-blue-200/80 font-medium tracking-tight">Broadcast Terrain Intel to <span className="font-black">@AFATTrafficLive</span> active.</p>
      </div>

      <button onClick={onSignOut} className="w-full bg-red-500/10 border border-red-500/20 text-red-500 font-black py-5 rounded-2xl text-[12px] uppercase tracking-[0.3em] active:scale-95 transition-all mt-6 shadow-lg shadow-red-900/10">End Operating Session</button>
    </div>
  );

  const renderRequestsWorkspace = () => (
    <div className="p-5 pb-32 space-y-5 bg-[#080c14] min-h-screen">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/60">Requests Workspace</p>
        <h2 className="mt-2 text-xl font-black uppercase italic tracking-tight text-white">Live marketplace and fare decisions</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-white/45">
          This is where an operator should spend decision time: confirm demand, counter on price, and keep booking truth aligned with payment and boarding.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setIsQRScannerOpen(true)} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-left transition-all hover:bg-emerald-500/15 active:scale-[0.98]">
          <QrCode className="w-5 h-5 text-emerald-400 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Scan boarding</p>
          <p className="text-[10px] text-emerald-200/60">Verify ticket at the door</p>
        </button>
        <button onClick={() => setIsQRGeneratorOpen(true)} className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-left transition-all hover:bg-blue-500/15 active:scale-[0.98]">
          <QrCode className="w-5 h-5 text-blue-400 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Publish QR</p>
          <p className="text-[10px] text-blue-200/60">Share your current access code</p>
        </button>
        <button onClick={() => setShowHistory(true)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:bg-white/[0.06] active:scale-[0.98]">
          <History className="w-5 h-5 text-white/60 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Archives</p>
          <p className="text-[10px] text-white/35">Review completed movements</p>
        </button>
      </div>

      {renderRequestsPanel()}
    </div>
  );

  const renderIntelWorkspace = () => (
    <div className="p-5 pb-32 space-y-5 bg-[#080c14] min-h-screen">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/60">Intel Workspace</p>
        <h2 className="mt-2 text-xl font-black uppercase italic tracking-tight text-white">Directives, hazards, and regional operating picture</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-white/45">
          This tab should help an operator understand where to move next, not just show decorative alerts.
        </p>
      </div>

      {renderDirectiveSurface()}
      {renderOperatorNotice()}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-red-200/70">Incidents</p>
          <p className="mt-2 text-2xl font-black text-white">{incidents.length}</p>
          <p className="text-[10px] text-white/35">live field reports</p>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-200/70">Checkpoints</p>
          <p className="mt-2 text-2xl font-black text-white">{regionalCheckpoints.length}</p>
          <p className="text-[10px] text-white/35">{regionalLabel} network</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-200/70">Supply</p>
          <p className="mt-2 text-2xl font-black text-white">{regionalSupply.length}</p>
          <p className="text-[10px] text-white/35">vehicles on grid</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setIsVoiceReporterOpen(true)} className="rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4 text-left transition-all hover:bg-purple-500/15 active:scale-[0.98]">
          <Mic className="w-5 h-5 text-purple-400 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Voice report</p>
          <p className="text-[10px] text-purple-200/60">Push field intel hands-free</p>
        </button>
        <button onClick={() => setIsIntelligenceOpen(true)} className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-left transition-all hover:bg-blue-500/15 active:scale-[0.98]">
          <Database className="w-5 h-5 text-blue-400 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Map settings</p>
          <p className="text-[10px] text-blue-200/60">Offline packs and cloud sync</p>
        </button>
      </div>

      <div className="space-y-3">
        {incidents.slice(0, 5).map((incident) => (
          <div key={incident.id} className="rounded-2xl border border-white/8 bg-black/30 px-4 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black uppercase tracking-tight text-white">{incident.type?.replace('_', ' ') || 'Incident'}</p>
              <p className="text-[11px] leading-relaxed text-white/45">{incident.description || 'Signal received from the AFAT field network.'}</p>
            </div>
          </div>
        ))}
        {incidents.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-8 text-center text-[11px] font-semibold text-white/40">
            No active incidents on this grid right now.
          </div>
        )}
      </div>
    </div>
  );

  const renderDriveHUD = () => (
    <div className="fixed inset-0 z-[9999] bg-black animate-in fade-in duration-500 overflow-hidden">
       <InteractiveMap 
         incidents={incidents || []} 
         driveMode={true} 
         trackedVehicle={vehicle} 
         role="operator"
         realtimeOverlay={true}
         checkpoints={regionalCheckpoints}
       />
       
       {/* ── Sentinel Navigation HUD ────────────────────────── */}
       {/* Top bar: Speed + Shift + Route */}
       <div className="absolute top-0 left-0 right-0 p-5 pointer-events-none flex items-start justify-between z-[10000]">
          {/* Speed Panel */}
          <div className="bg-black/70 backdrop-blur-2xl border border-blue-500/20 px-5 py-4 rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.1)] pointer-events-auto">
             <p className="text-[8px] text-blue-400/60 font-black uppercase tracking-[0.3em] mb-1">Sentinel Velocity</p>
             <div className="flex items-baseline gap-1">
               <span className="text-[2.5rem] font-black text-white leading-none tabular-nums">{vehicle?.current_speed || 65}</span>
               <span className="text-[11px] text-blue-400/50 font-black uppercase">km/h</span>
             </div>
             <div className="flex items-center gap-2 mt-2">
               <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full" style={{ width: `${Math.min(100, ((vehicle?.current_speed || 65) / 80) * 100)}%` }} />
               </div>
               <span className="text-[8px] text-white/30 font-bold">80 MAX</span>
             </div>
          </div>

          {/* Shift Timer */}
          <div className="bg-black/70 backdrop-blur-2xl border border-white/10 px-5 py-4 rounded-2xl shadow-2xl pointer-events-auto text-center">
             <p className="text-[8px] text-white/30 font-black uppercase tracking-[0.3em] mb-1">Active Shift</p>
             <p className="text-2xl font-black text-white tabular-nums">{String(shiftHours).padStart(2, '0')}:{String(shiftMins).padStart(2, '0')}</p>
             <div className="flex items-center gap-1.5 mt-2 justify-center">
               <div className={`w-1.5 h-1.5 rounded-full ${driveTimeMinutes >= 240 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
               <span className={`text-[8px] font-black uppercase tracking-widest ${driveTimeMinutes >= 240 ? 'text-red-400' : 'text-emerald-400/60'}`}>
                 {driveTimeMinutes >= 240 ? 'REST NEEDED' : 'OPTIMAL'}
               </span>
             </div>
          </div>

          {/* Route Intel */}
          <div className="bg-black/70 backdrop-blur-2xl border border-amber-500/20 px-5 py-4 rounded-2xl shadow-2xl pointer-events-auto text-right">
             <p className="text-[8px] text-amber-400/60 font-black uppercase tracking-[0.3em] mb-1">Route Intel</p>
             <p className="text-[14px] font-black text-amber-400 uppercase tracking-tight">{requests.length > 0 ? 'PASSENGER ACTIVE' : 'CRUISING'}</p>
             <p className="text-[9px] text-white/30 font-bold mt-1">Grid Sector: {regionalLabel} • {regionalSupply.length} nodes</p>
          </div>
       </div>

       {/* Co-Pilot Intelligence Feed — bottom left */}
       <div className="absolute bottom-24 left-5 z-[10000] pointer-events-none w-80">
          <div className="bg-black/70 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl">
             <div className="flex items-center gap-2 mb-3">
               <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
               <p className="text-[8px] text-emerald-400 font-black uppercase tracking-[0.3em]">Sentinel Co-Pilot</p>
             </div>
             <div className="space-y-2 font-mono h-[100px] overflow-y-auto no-scrollbar">
               {coPilotFeed.map((item, idx) => (
                 <div key={idx} className="flex items-start gap-2">
                   <span className={`text-[9px] shrink-0 ${item.type === 'warning' ? 'text-amber-400/50' : 'text-blue-400/50'}`}>{item.time}</span>
                   <span className={`text-[10px] ${item.type === 'warning' ? 'text-amber-400' : 'text-white/60'}`}>{item.text}</span>
                 </div>
               ))}
             </div>
          </div>
       </div>

       {/* Exit button — bottom center */}
       <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-xs px-6">
          <button onClick={() => setIsDriveModeActive(false)} className="w-full bg-red-600/80 hover:bg-red-500 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(220,38,38,0.25)] backdrop-blur-md border border-red-400/40 transition-all active:scale-95">
             Quitter Navigation
          </button>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080c14] text-white flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="px-6 pt-12 pb-6 flex items-center justify-between z-50 relative border-b border-white/5 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <AFATLogo className="w-7 h-7 text-white relative z-10" />
          </div>
          <div>
            <h1 className="font-black text-white text-[20px] tracking-tighter uppercase italic leading-none drop-shadow-md">AFAT</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.4em] mt-1 italic opacity-70">Grid Sentinel</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online/Offline toggle */}
          <button
            onClick={toggleOnline}
            disabled={!isOperatorApproved}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full font-black text-[11px] transition-all uppercase tracking-[0.15em] border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                : !isOperatorApproved
                  ? 'bg-amber-500/10 text-amber-200/65 border-amber-500/20 cursor-not-allowed'
                  : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]' : 'bg-white/20'}`}></div>
            {isOnline ? 'Active' : 'Standby'}
          </button>
          <button onClick={onSignOut} className="w-10 h-10 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/30 hover:text-red-400 hover:border-red-500/30 transition-all active:scale-90">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {renderLifecycleBanner()}

      {/* ── Shift Status Bar ────────────────────────────── */}
      {isOnline && (
        <div className="mx-5 mb-2 bg-green-500/8 border border-green-500/15 rounded-xl px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-top duration-300">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]"></div>
          <span className="text-[11px] font-bold text-green-400">Service actif</span>
          <span className="text-[11px] text-white/25">·</span>
          <span className="text-[11px] text-white/40 font-mono">{String(shiftHours).padStart(2, '0')}:{String(shiftMins).padStart(2, '0')} en service</span>
          <div className="ml-auto flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/15 px-2.5 py-1 rounded-full">
            <MessageCircle className="w-3 h-3 text-blue-400" />
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Live</span>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto relative z-10">
        {isDriveModeActive ? renderDriveHUD() : (
          activeTab === 'profile'
            ? renderProfile()
            : activeTab === 'bookings'
              ? renderRequestsWorkspace()
              : activeTab === 'notifications'
                ? renderIntelWorkspace()
                : renderHomeContent()
        )}
      </main>

      {isVoiceReporterOpen && <VoiceReporter profile={profile} onClose={() => setIsVoiceReporterOpen(false)} />}
      {isQRScannerOpen && (
        <QRScanner
          operatorId={profile?.id}
          onClose={() => setIsQRScannerOpen(false)}
          onSuccess={(id) => {
            setIsQRScannerOpen(false);
            setLastBoardedBookingId(id);
            fetchWallet();
            fetchRequests();
          }}
        />
      )}
      {isQRGeneratorOpen && (
        <QRCodeGenerator
          operatorId={profile?.id}
          vehiclePlate={vehicle?.plate_number || 'NA-000'}
          onClose={() => setIsQRGeneratorOpen(false)}
        />
      )}
      {showHistory && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end justify-center z-[2000] p-4 pb-8 animate-in fade-in duration-200">
          <div className="bg-[#0f1520] border border-white/10 w-full max-w-lg rounded-3xl p-6 relative max-h-[80vh] flex flex-col">
            <button onClick={() => setShowHistory(false)} className="absolute top-5 right-5 text-white/30 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-[18px] font-black text-white mb-1 flex items-center gap-2"><History className="w-5 h-5 text-blue-400" /> Historique</h3>
            <p className="text-[11px] text-white/30 mb-5">Vos derniers trajets effectues</p>
            <div className="overflow-y-auto space-y-3 flex-1">
              {rideHistory.map(h => (
                <div key={h.id} className="bg-black/30 border border-white/6 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-black text-white text-[13px]">{h.routes?.name || 'Trajet'}</p>
                    <p className="text-[10px] text-white/25 font-mono">{new Date(h.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-[14px] ${h.status === 'cancelled' ? 'text-red-400' : 'text-green-400'}`}>
                      {h.status === 'cancelled' ? '0' : (h.routes?.price_per_seat || 0).toLocaleString()} F
                    </p>
                    <p className="text-[9px] text-white/25 uppercase font-mono">{h.status}</p>
                  </div>
                </div>
              ))}
              {rideHistory.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-white/25 text-[13px]">Aucun historique.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showWithdraw && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end justify-center z-[2000] p-4 pb-8 animate-in fade-in duration-200">
          <div className="bg-[#0f1520] border border-white/10 w-full max-w-sm rounded-3xl p-6 relative text-center">
            <button onClick={() => setShowWithdraw(false)} className="absolute top-5 right-5 text-white/30 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="w-16 h-16 bg-green-500/15 border border-green-500/25 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-[18px] font-black text-white mb-1">Cash Out</h3>
            <p className="text-[10px] text-white/25 uppercase font-mono tracking-widest mb-5">Mobile Money Terminal - MoMo / Orange</p>
            <div className="bg-black/40 border border-white/6 rounded-xl p-4 mb-4 text-left">
              <p className="text-[10px] text-white/25 uppercase font-mono mb-1">Solde Disponible</p>
              <p className="text-2xl font-black text-green-400">{wallet?.balance_xaf?.toLocaleString() || 0} XAF</p>
            </div>
            <input
              type="number"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder="Montant a retirer"
              className="w-full bg-black/40 border border-white/8 text-white text-[18px] font-black p-4 rounded-xl outline-none focus:border-green-500/50 transition-colors placeholder:text-white/15 text-center mb-4"
            />
            <button
              onClick={handleWithdraw}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl uppercase tracking-widest text-[12px] transition-all shadow-lg shadow-green-900/40 active:scale-[0.98]"
            >
              Confirmer le retrait
            </button>
          </div>
        </div>
      )}
      {showTontineHub && <TontineHub userId={profile?.id} onClose={() => setShowTontineHub(false)} />}
      {negotiatingRequest && (
        <div className="fixed inset-0 z-[7000] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-sm">
            <NegotiationPanel
              initialPrice={negotiatingRequest.routes?.price_per_seat || 0}
              role="operator"
              bookingId={negotiatingRequest.id}
              otherPartyName={`Passenger ${negotiatingRequest.passenger_id?.substring(0, 4)?.toUpperCase() || ''}`}
              onAccept={handleAcceptNegotiation}
              onReject={() => setNegotiatingRequest(null)}
              onCounter={handleCounterOffer}
            />
            {isNegotiationSaving && (
              <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-blue-200">
                Syncing negotiation to the AFAT grid...
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Identity Sentinel Modal */}
      {isIDSOpen && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
           <div className="w-full max-w-sm">
              <SentinelIDCard profile={profile} onClose={() => setIsIDSOpen(false)} />
           </div>
        </div>
      )}
      {showDriverDNA && profile && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
           <div className="w-full max-w-sm">
              <DriverDNA operatorId={profile.id} />
              <button 
                onClick={() => setShowDriverDNA(false)}
                className="w-full mt-4 bg-white/5 border border-white/10 text-white/40 py-3 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                Close Intelligence
              </button>
           </div>
        </div>
      )}
      {isIntelligenceOpen && renderIntelligenceSettings()}
    </div>
  );
}
