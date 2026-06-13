import React, { useState, useEffect } from 'react';
import { supabase, sendPhoneOtp, verifyPhoneOtp, getProfile, signOut } from './supabaseClient';
import { LogOut, ShieldAlert, Car, Map as MapIcon, BarChart3, ChevronRight } from 'lucide-react';
import { AFATLogo } from './components/shared/AFATLogo';

import { CommuterDashboard } from './components/commuter/CommuterDashboard';
import { OperatorDashboard } from './components/operator/OperatorDashboard';
import { PlannerDashboard } from './components/planner/PlannerDashboard';
import { AdminControlPanel } from './components/admin/AdminControlPanel';
import { BottomNav } from './components/shared/BottomNav';
import { RoleOnboarding } from './components/shared/RoleOnboarding';
import { RegistrationHub } from './components/shared/RegistrationHub';
import { telemetry } from './services/telemetryService';
import { AICopilot } from './components/shared/AICopilot';
import { GuardianWatchPage } from './components/shared/GuardianWatchPage';

// ==============================================================================
// 🔐 OTP LOGIN COMPONENT
// ==============================================================================
function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    const { error } = await sendPhoneOtp(phone);
    if (error) {
      setErrorText(error.message);
    } else {
      setStep('otp');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    const { error } = await verifyPhoneOtp(phone, otp);
    if (error) {
      setErrorText(error.message);
    }
    // App router will handle the redirect once session updates
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-sans text-on-surface">
      <div className="w-full max-w-sm glass-panel ghost-border p-8 rounded-[32px] shadow-ambient-float relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-signature-gradient opacity-50"></div>
        <div className="flex items-center justify-center w-28 h-28 bg-white/5 rounded-full mb-10 mx-auto border border-white/10 shadow-2xl relative group">
          <div className="absolute inset-0 bg-white/5 animate-pulse rounded-full group-hover:bg-white/10 transition-colors"></div>
          <AFATLogo className="w-16 h-16 text-white relative z-10" />
        </div>
        <h1 className="text-4xl font-black text-center mb-1 tracking-tighter text-white uppercase italic">AFAT</h1>
        <p className="text-slate-500 text-center mb-12 text-[10px] font-bold uppercase tracking-[0.4em] opacity-80 italic">Intelligent Safe Passage</p>

        {errorText && (
          <div className="bg-error/10 border border-error/20 text-error p-4 rounded-2xl text-xs mb-8 font-bold animate-shake">
            {errorText}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-3 ml-1">Secure Phone Line</label>
              <div className="flex bg-surface-container rounded-2xl overflow-hidden focus-within:ring-2 ring-primary/50 transition-all ghost-border">
                <span className="flex items-center justify-center px-5 bg-surface-container-high text-on-surface-variant border-r border-outline-variant font-mono font-bold">+237</span>
                <input
                  type="tel"
                  placeholder="6XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-transparent px-5 py-4 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none font-mono font-bold text-lg"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || phone.length < 8}
              className="w-full signature-btn text-white font-bold py-4 rounded-2xl transition-all shadow-neon-primary disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              {loading ? 'Transmitting...' : 'Request Access Code'}
              {!loading && <ChevronRight className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-3 ml-1">Verification Identity</label>
              <input
                type="text"
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                className="w-full bg-surface-container px-5 py-5 rounded-2xl text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 ring-primary/50 ghost-border font-mono tracking-[0.5em] text-center text-3xl font-bold"
                maxLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full signature-btn text-white font-bold py-4 rounded-2xl transition-all shadow-neon-primary disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              {loading ? 'Verifying Intel...' : 'Verify & Establish Link'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); }}
              className="w-full text-on-surface-variant hover:text-on-surface text-[10px] font-bold py-2 uppercase tracking-widest transition-colors"
            >
              Change connection line
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==============================================================================
// 🚪 MAIN APP ROUTER (Gatekeeper)
// ==============================================================================

export default function App() {
  const pathname = window.location.pathname || '/';
  const watchMatch = pathname.match(/^\/watch\/([^/]+)$/);

  if (watchMatch?.[1]) {
    return <GuardianWatchPage token={decodeURIComponent(watchMatch[1])} />;
  }

  return <AppShell />;
}

function AppShell() {
  const showDevOverride = new URLSearchParams(window.location.search).get('devOverride') === '1';
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Changed to false: NEVER block UI on boot
  const [activeTab, setActiveTab] = useState<'home' | 'book' | 'bookings' | 'notifications' | 'profile'>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isProtocolHubOpen, setIsProtocolHubOpen] = useState(false);
  const [isRegistrationHubOpen, setIsRegistrationHubOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [localAuthUserId, setLocalAuthUserId] = useState<string | null>(() => localStorage.getItem('afat_local_user_id'));

  try {
    const forceRole = (role: string, vehicleType?: string, idData?: any) => {
      setUserRole(role);
      const resolvedId = idData?.id || `afat-local-${role}`;
      const resolvedPhone = idData?.phone || localStorage.getItem('afat_local_phone') || '237000000';
      localStorage.setItem('afat_local_user_id', resolvedId);
      localStorage.setItem('afat_local_phone', resolvedPhone);
      localStorage.setItem('afat_user_id', resolvedId);
      setLocalAuthUserId(resolvedId);
      setSessionUser({ id: resolvedId, phone: resolvedPhone });
      setUserProfile({
        id: resolvedId,
        full_name: idData?.full_name || (idData?.ids_number ? `Sentinel ${idData.ids_number.split('-').pop()}` : `${vehicleType ? vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1) + ' ' : ''}Test ${role.charAt(0).toUpperCase() + role.slice(1)}`),
        role: role,
        trust_points: 500,
        subscription_tier: role === 'commuter' ? 'free' : 'guardian',
        vehicle_type: vehicleType || null,
        ids_number: idData?.ids_number || null,
        cni_number: idData?.cni_number || null,
        plate_number: idData?.plate_number || null,
        company_name: idData?.company_name || null,
        is_verified: !!idData?.ids_number
      });
      setLoading(false);
    };

    useEffect(() => {
      const localProfileId = localStorage.getItem('afat_local_user_id');
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSessionUser(session?.user ?? null);
        if (session?.user) {
          localStorage.setItem('afat_user_id', session.user.id);
          fetchRole(session.user.id);
        } else if (localProfileId) {
          setSessionUser({ id: localProfileId, phone: localStorage.getItem('afat_local_phone') || '' });
          localStorage.setItem('afat_user_id', localProfileId);
          fetchRole(localProfileId);
        }
      }).catch((err) => {
        console.error('[AFAT] Supabase init error:', err);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null;
        setSessionUser(user);
        if (user) {
          localStorage.setItem('afat_user_id', user.id);
          fetchRole(user.id);
          telemetry.start(user.id);
        } else {
          const fallbackProfileId = localStorage.getItem('afat_local_user_id');
          if (fallbackProfileId) {
            setSessionUser({ id: fallbackProfileId, phone: localStorage.getItem('afat_local_phone') || '' });
            localStorage.setItem('afat_user_id', fallbackProfileId);
            fetchRole(fallbackProfileId);
          } else {
            localStorage.removeItem('afat_user_id');
            setUserRole(null);
            telemetry.stop();
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }, []);

    const fetchRole = async (userId: string) => {
      try {
        const { data, error } = await getProfile(userId);
        if (!error && data) {
          setUserProfile(data);
          setUserRole(data.role || 'commuter');
          
          const hasOnboarded = localStorage.getItem(`onboarded_${userId}`);
          if (!hasOnboarded) {
            setShowOnboarding(true);
          }
        } else {
          setUserRole('commuter'); 
          setUserProfile({ full_name: 'Voyageur AFAT', trust_points: 0 });
        }
      } catch (err) {
        setUserRole('commuter'); 
        setUserProfile({ full_name: 'Voyageur AFAT', trust_points: 0 });
      }
    };

    const handleSignOut = async () => {
      localStorage.removeItem('afat_local_user_id');
      localStorage.removeItem('afat_local_phone');
      localStorage.removeItem('afat_user_id');
      setLocalAuthUserId(null);
      setUserProfile(null);
      setUserRole(null);
      await signOut();
    };

    const handleOnboardingComplete = () => {
      if (sessionUser) {
        localStorage.setItem(`onboarded_${sessionUser.id}`, 'true');
      }
      setShowOnboarding(false);
    };

    const renderRoleToggle = () => (
      <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end gap-2">
        <button 
          onClick={() => setIsProtocolHubOpen(!isProtocolHubOpen)}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-2xl border ${isProtocolHubOpen ? 'bg-red-500 border-red-400 rotate-90' : 'bg-[#0f1520]/90 backdrop-blur-xl border-white/10 hover:border-blue-400/50 hover:scale-110'}`}
        >
          <ShieldAlert className={`w-5 h-5 ${isProtocolHubOpen ? 'text-white' : 'text-blue-400'}`} />
        </button>

        {isProtocolHubOpen && (
          <div className="flex flex-col gap-1.5 p-3 bg-[#0f1520]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200" style={{maxWidth: '160px'}}>
            <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1 px-1">Grid Protocol Override</p>
            <div className="space-y-1">
              <button
                onClick={() => { forceRole('commuter'); setIsProtocolHubOpen(false); }}
                className="w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-blue-500 text-white"
              >
                👤 Commuter
              </button>
              <button
                onClick={() => { forceRole('operator', 'taxi'); setIsProtocolHubOpen(false); }}
                className="w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-green-500 text-white"
              >
                🚕 Taxi Node
              </button>
              <button
                onClick={() => { forceRole('admin'); setIsProtocolHubOpen(false); }}
                className="w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-purple-500 text-white"
              >
                🕵️ Admin
              </button>
            </div>
          </div>
        )}
      </div>
    );

    if (!sessionUser) {
      return (
        <div className="min-h-screen sentinel-bg text-white">
          <div className="mesh-gradient" />
          <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-xl rounded-[2.5rem] border border-white/10 bg-slate-950/70 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <AFATLogo className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black uppercase italic tracking-tight text-white">AFAT Access</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Real onboarding. Real route intelligence.</p>
                </div>
              </div>

              <div className="mb-8 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200/60">Why you’re here</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/75">
                  AFAT now opens through a real access flow instead of the old guest shell. Sign in with your phone or register your commuter, operator, or fleet identity to enter the live system.
                </p>
              </div>

              <Login />

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight text-white">No AFAT profile yet?</p>
                    <p className="mt-1 text-xs text-white/45">Create commuter, operator, government-linked, or fleet onboarding before sign-in.</p>
                  </div>
                  <button
                    onClick={() => setIsRegistrationHubOpen(true)}
                    className="rounded-2xl bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98]"
                  >
                    Register
                  </button>
                </div>
              </div>
            </div>
          </div>
          <RegistrationHub 
            isVisible={isRegistrationHubOpen} 
            onClose={() => setIsRegistrationHubOpen(false)} 
            onRegisterCustom={(data) => {
              if (data?.id) {
                localStorage.setItem('afat_local_user_id', data.id);
                setLocalAuthUserId(data.id);
              }
              forceRole(data.role, data.vehicleType, data);
            }} 
          />
        </div>
      );
    }

    const renderDashboard = () => {
      switch (userRole) {
        case 'admin':
          return <AdminControlPanel onSignOut={handleSignOut} activeTab={activeTab} />;
        case 'planner':
          return <PlannerDashboard onSignOut={handleSignOut} />;
        case 'operator':
          return <OperatorDashboard onSignOut={handleSignOut} activeTab={activeTab} profile={userProfile} />;
        case 'commuter':
        default:
          return <CommuterDashboard onSignOut={handleSignOut} profile={userProfile} activeTab={activeTab} />;
      }
    };

    return (
      <div className="min-h-screen flex flex-col sentinel-bg text-white selection:bg-blue-500/30">
        <div className="mesh-gradient" />
        <div className="relative z-10 flex-1 flex flex-col">
          {renderDashboard()}
        </div>
        <BottomNav role={userRole as any} activeTab={activeTab} onTabChange={setActiveTab} />
        {showDevOverride && renderRoleToggle()}
        <RoleOnboarding 
          role={userRole as any} 
          profile={userProfile}
          isVisible={showOnboarding} 
          onClose={handleOnboardingComplete} 
        />
        <AICopilot userName={userProfile?.full_name || 'User'} userRole={userRole || 'commuter'} />
      </div>
    );
  } catch (err: any) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-6 animate-pulse" />
        <h2 className="text-2xl font-black uppercase italic mb-2">Protocol Recovery Mode</h2>
        <p className="text-slate-400 text-sm text-center mb-8">The AFAT OS encountered a boot failure. Diagnostic info below:</p>
        <div className="bg-slate-900 border border-red-500/30 p-6 rounded-2xl w-full max-w-md font-mono text-[10px] text-red-400 overflow-auto">
          {err?.message || 'Unknown Boot Error'}
        </div>
        <button onClick={() => window.location.reload()} className="mt-8 bg-blue-600 px-8 py-4 rounded-2xl font-black uppercase text-xs">
          Force Restart
        </button>
      </div>
    );
  }
}
