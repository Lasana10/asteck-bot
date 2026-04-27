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
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Changed to false: NEVER block UI on boot
  const [activeTab, setActiveTab] = useState<'home' | 'book' | 'bookings' | 'notifications' | 'profile'>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isProtocolHubOpen, setIsProtocolHubOpen] = useState(false);
  const [isRegistrationHubOpen, setIsRegistrationHubOpen] = useState(false);

  const forceRole = (role: string, vehicleType?: string, idData?: any) => {
    setUserRole(role);
    setSessionUser({ id: 'dev-id', phone: '237000000' });
    setUserProfile({
      id: 'dev-id',
      full_name: idData?.ids_number ? `Sentinel ${idData.ids_number.split('-').pop()}` : `${vehicleType ? vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1) + ' ' : ''}Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      role: role,
      trust_points: 500,
      subscription_tier: role === 'commuter' ? 'free' : 'guardian',
      vehicle_type: vehicleType || null,
      ids_number: idData?.ids_number || null,
      cni_number: idData?.cni_number || null,
      plate_number: idData?.plate_number || null,
      is_verified: !!idData?.ids_number
    });
    setLoading(false);
  };

  useEffect(() => {
    // ═══ INSTANT BOOT ═══
    // Instead of waiting, we let the UI load instantly as Guest.
    // If Supabase eventually resolves, it updates the state seamlessly.
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      }
    }).catch((err) => {
      console.error('[AFAT] Supabase init error:', err);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setSessionUser(user);
      if (user) {
        fetchRole(user.id);
        telemetry.start(user.id);
      } else {
        setUserRole(null);
        telemetry.stop();
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
        
        // Show onboarding if it's their first time
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
            <p className="text-[7px] text-white/30 uppercase font-bold tracking-widest ml-1">Citizens</p>
            {[['commuter', 'Free'], ['commuter', 'Guardian']].map(([r, label], i) => (
              <button
                key={`c-${i}`}
                onClick={() => {
                  const isGuardian = label === 'Guardian';
                  setUserRole(r as string);
                  setSessionUser({ id: 'dev-id', phone: '237000000' });
                  setUserProfile({ id: 'dev-id', full_name: `Citoyen AFAT`, role: r, trust_points: isGuardian ? 850 : 120, subscription_tier: isGuardian ? 'guardian' : 'free' });
                  setIsProtocolHubOpen(false);
                }}
                className={`w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border text-left ${
                  userRole === r && userProfile?.subscription_tier === (label === 'Guardian' ? 'guardian' : 'free')
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white/4 text-white/50 border-white/8 hover:border-blue-400/40'
                }`}
              >
                {label === 'Guardian' ? '🛡️' : '👤'} {label}
              </button>
            ))}

            <p className="text-[7px] text-white/30 uppercase font-bold tracking-widest mt-2 ml-1">Nodes</p>
            {(['moto', 'taxi', 'minibus', 'bus'] as const).map(vt => (
              <button
                key={vt}
                onClick={() => { forceRole('operator', vt); setIsProtocolHubOpen(false); }}
                className={`w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border text-left ${
                  userRole === 'operator' && userProfile?.vehicle_type === vt
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white/4 text-white/50 border-white/8 hover:border-green-400/40'
                }`}
              >
                {vt === 'moto' ? '🏍️' : vt === 'taxi' ? '🚕' : vt === 'minibus' ? '🚐' : '🚌'} {vt}
              </button>
            ))}

            <p className="text-[7px] text-white/30 uppercase font-bold tracking-widest mt-2 ml-1">Intelligence</p>
            {(['planner', 'admin'] as const).map(r => (
              <button
                key={r}
                onClick={() => { forceRole(r); setIsProtocolHubOpen(false); }}
                className={`w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border text-left ${
                  userRole === r
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white/4 text-white/50 border-white/8 hover:border-purple-400/40'
                }`}
              >
                {r === 'admin' ? '🕵️ Admin' : '📊 Planner'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══ NO MORE LOADING SCREEN ═══
  // We completely removed the `if (loading)` block. The app loads instantly.

  // GUEST MODE (Commuter experience without login)
  if (!sessionUser) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-950 px-4 pt-12">
        <CommuterDashboard 
          onSignOut={() => {}} 
          profile={{ username: 'Guest', trust_points: 0 }} 
          activeTab={activeTab}
          isGuest={true}
        />
        <div className="fixed bottom-24 left-6 right-6 z-[2000] animate-in slide-in-from-bottom duration-1000">
           <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-[32px] shadow-2xl flex items-center justify-between ring-4 ring-white/10">
              <div>
                 <h4 className="font-black text-white text-lg leading-tight uppercase italic">Ready to ride?</h4>
                 <p className="text-blue-100 text-xs font-bold opacity-80 mt-1">Sign in to book and track rides in real-time.</p>
              </div>
              <button 
                onClick={() => window.location.reload()} 
                className="bg-white text-blue-600 px-6 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl"
              >
                LOGIN NOW
              </button>
           </div>
           
           <button 
             onClick={() => setIsRegistrationHubOpen(true)}
             className="w-full mt-4 bg-slate-900 border border-white/10 hover:bg-slate-800 hover:border-white/20 text-white rounded-[24px] py-4 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all"
           >
             <Car className="w-4 h-4 text-blue-400" />
             Drive with AFAT Sentinel
           </button>
        </div>
        <BottomNav role="commuter" activeTab={activeTab} onTabChange={setActiveTab} />
        
        {/* Developer Role Toggle - INJECTED INTO GUEST VIEW TOO */}
        {renderRoleToggle()}

        <RegistrationHub 
          isVisible={isRegistrationHubOpen} 
          onClose={() => setIsRegistrationHubOpen(false)} 
          onRegisterCustom={(data) => forceRole(data.role, data.vehicleType, data)} 
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
        return (
          <CommuterDashboard 
            onSignOut={handleSignOut} 
            profile={userProfile} 
            activeTab={activeTab} 
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {renderDashboard()}
      
      <BottomNav 
        role={userRole as any} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />

      {/* Developer Role Toggle - INJECTED INTO LOGGED IN VIEW */}
      {renderRoleToggle()}

      {/* Onboarding Overlay */}
      <RoleOnboarding 
        role={userRole as any} 
        profile={userProfile}
        isVisible={showOnboarding} 
        onClose={handleOnboardingComplete} 
      />

      <AICopilot 
        userName={userProfile?.full_name || 'User'} 
        userRole={userRole || 'commuter'} 
      />
    </div>
  );
}
