import React, { useState, useEffect } from 'react';
import { supabase, sendPhoneOtp, verifyPhoneOtp, sendEmailOtp, verifyEmailOtp, signInOrSignUpWithEmailPassword, getCurrentUser, getProfile, signOut, fetchAfatSessionProfile, refreshAfatSession, getApiBaseUrl, setApiBaseOverride } from './supabaseClient';
import { ShieldAlert, Car, Map as MapIcon, BarChart3, ChevronRight } from 'lucide-react';
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
function Login({ onRegisterRequest }: { onRegisterRequest: (role?: string) => void }) {
  const [authChannel, setAuthChannel] = useState<'email_password' | 'email_otp' | 'phone'>('email_password');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [step, setStep] = useState<'identity' | 'verify'>('identity');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [infoText, setInfoText] = useState('');
  const [showBypass, setShowBypass] = useState(false);
  const [roleIntent, setRoleIntent] = useState<'commuter' | 'operator' | 'planner' | 'admin'>('commuter');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'live' | 'offline'>('checking');

  const normalizedPhone = phone.replace(/\s+/g, '');
  const normalizedEmail = email.trim().toLowerCase();
  const supabaseReady = Boolean(import.meta.env.VITE_SUPABASE_URL && (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY));
  const apiTarget = getApiBaseUrl();

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);

    fetch(`${getApiBaseUrl()}/health`, { signal: controller.signal })
      .then((res) => {
        if (mounted) setBackendStatus(res.ok ? 'live' : 'offline');
      })
      .catch(() => {
        if (mounted) setBackendStatus('offline');
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      mounted = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const persistAccessIntent = () => {
    localStorage.setItem('afat_access_intent_role', roleIntent);
    localStorage.setItem('afat_access_channel', authChannel);
    if (normalizedPhone) {
      localStorage.setItem('afat_access_phone', normalizedPhone);
    }
    if (normalizedEmail) {
      localStorage.setItem('afat_access_email', normalizedEmail);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();

    if (authChannel === 'email_password') {
      const { data, error } = await signInOrSignUpWithEmailPassword(normalizedEmail, password, { roleIntent });
      if (error) {
        setErrorText(`${error.message} Check Supabase Email provider settings and redirect URLs if this persists.`);
      } else if (data?.mode === 'confirmation_required') {
        setInfoText('AFAT created the account. Open the confirmation email once, then return here and sign in with the same password.');
      } else {
        window.location.reload();
      }
      setLoading(false);
      return;
    }

    const result = authChannel === 'email_otp'
      ? await sendEmailOtp(normalizedEmail, { roleIntent })
      : await sendPhoneOtp(normalizedPhone);
    const { error } = result;
    if (error) {
      setErrorText(authChannel === 'email_otp'
        ? `${error.message} Check Supabase Auth email settings, redirect URLs, and SMTP if no email arrives.`
        : `${error.message} Phone OTP depends on the AFAT backend and the active SMS provider.`);
    } else {
      setStep('verify');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();
    const { error } = authChannel === 'email_otp'
      ? await verifyEmailOtp(normalizedEmail, otp)
      : await verifyPhoneOtp(normalizedPhone, otp, {
          roleIntent,
          adminCode: roleIntent === 'admin' ? adminCode.trim() : undefined,
          accessCode: accessCode.trim() || undefined,
        });
    if (error) {
      setErrorText(error.message);
    } else {
      window.location.reload();
    }
    setLoading(false);
  };

  const handleBypassLogin = async (role: string) => {
    setLoading(true);
    setErrorText('');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, role')
        .eq('role', role)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        localStorage.setItem('afat_local_user_id', data.id);
        localStorage.setItem('afat_local_phone', data.phone || '237699999001');
        localStorage.setItem('afat_user_id', data.id);
        localStorage.setItem('afat_access_intent_role', role);
        window.location.reload();
      } else {
        const testPhone = `23769999900${role === 'commuter' ? '1' : role === 'operator' ? '2' : role === 'planner' ? '3' : '4'}`;
        const testName = `Test ${role.toUpperCase()}`;
        
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            full_name: testName,
            phone: testPhone,
            role: role,
            trust_points: 100,
            is_active: true,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) throw createError;

        localStorage.setItem('afat_local_user_id', newProfile.id);
        localStorage.setItem('afat_local_phone', testPhone);
        localStorage.setItem('afat_user_id', newProfile.id);
        localStorage.setItem('afat_access_intent_role', role);
        window.location.reload();
      }
    } catch (err: any) {
      setErrorText(`Bypass failed: ${err.message || 'database connection issue'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center font-sans text-on-surface">
      <div className="w-full max-w-sm glass-panel p-8 rounded-[32px] shadow-ambient-float relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-signature-gradient opacity-50"></div>
        
        <h1 className="text-3xl font-black text-center mb-1 tracking-tighter text-white uppercase italic">AFAT</h1>
        <p className="text-slate-500 text-center mb-6 text-[10px] font-bold uppercase tracking-[0.4em] opacity-80 italic">Intelligent Safe Passage</p>

        {errorText && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs mb-6 font-bold">
            {errorText}
          </div>
        )}

        {infoText && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 p-4 rounded-2xl text-xs mb-6 font-bold">
            {infoText}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-2">
          <div className={`rounded-2xl border px-3 py-3 ${supabaseReady ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">Email auth</p>
            <p className={`mt-1 text-xs font-black ${supabaseReady ? 'text-emerald-200' : 'text-amber-200'}`}>
              {supabaseReady ? 'Configured' : 'Needs env'}
            </p>
          </div>
          <div className={`rounded-2xl border px-3 py-3 ${backendStatus === 'live' ? 'border-emerald-400/25 bg-emerald-500/10' : backendStatus === 'checking' ? 'border-blue-400/25 bg-blue-500/10' : 'border-red-400/25 bg-red-500/10'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">AFAT backend</p>
            <p className={`mt-1 text-xs font-black ${backendStatus === 'live' ? 'text-emerald-200' : backendStatus === 'checking' ? 'text-blue-200' : 'text-red-200'}`}>
              {backendStatus === 'live' ? 'Live' : backendStatus === 'checking' ? 'Checking' : 'Offline'}
            </p>
            <p className="mt-1 truncate text-[9px] font-semibold text-white/35">{apiTarget.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>

        {backendStatus === 'offline' && (
          <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
            <p className="text-xs font-bold leading-relaxed text-red-100/80">
              AFAT cannot reach the API target from this browser. Use the live backend unless you are running a local backend on purpose.
            </p>
            <button
              type="button"
              onClick={() => {
                setApiBaseOverride('https://asteck-bot.onrender.com');
                window.location.reload();
              }}
              className="mt-3 rounded-xl border border-red-200/20 bg-red-100/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-100"
            >
              Use live backend
            </button>
          </div>
        )}

        {step === 'identity' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Access lane</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { role: 'commuter', label: 'Commuter' },
                  { role: 'operator', label: 'Operator' },
                  { role: 'planner', label: 'Planner' },
                  { role: 'admin', label: 'Admin' },
                ].map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => setRoleIntent(item.role as typeof roleIntent)}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                      roleIntent === item.role
                        ? 'border-blue-400/50 bg-blue-500/15 text-blue-100'
                        : 'border-white/10 bg-slate-950 text-white/55 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Access channel</label>
              <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Recommended now: Email password</p>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-white/50">Email/password is the stable pilot lane. Email link/code and phone access remain available where providers are configured.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { channel: 'phone', label: 'Phone OTP' },
                  { channel: 'email_password', label: 'Email Pass' },
                  { channel: 'email_otp', label: 'Email Link' },
                ].map((item) => (
                  <button
                    key={item.channel}
                    type="button"
                    onClick={() => setAuthChannel(item.channel as typeof authChannel)}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                      authChannel === item.channel
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-slate-950 text-white/55 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">
                {authChannel === 'phone' ? 'Secure phone line' : 'Secure email identity'}
              </label>
              {authChannel !== 'phone' ? (
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-semibold"
                    required
                  />
                  {authChannel === 'email_password' && (
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-semibold"
                      minLength={6}
                      required
                    />
                  )}
                </div>
              ) : (
                <div className="flex bg-slate-900 rounded-2xl overflow-hidden focus-within:ring-2 ring-blue-500/50 transition-all border border-white/10">
                  <span className="flex items-center justify-center px-5 bg-slate-950 text-slate-400 border-r border-white/10 font-mono font-bold">+237</span>
                  <input
                    type="tel"
                    placeholder="6XX XXX XXX"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-transparent px-5 py-4 text-white placeholder:text-white/20 focus:outline-none font-mono font-bold text-lg"
                    required
                  />
                </div>
              )}
            </div>
              <button
                type="submit"
              disabled={loading || (authChannel !== 'phone' ? !normalizedEmail.includes('@') || (authChannel === 'email_password' && password.length < 6) : normalizedPhone.length < 8)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              {loading ? 'Transmitting...' : authChannel === 'email_password' ? 'Enter AFAT' : authChannel === 'email_otp' ? 'Send Email Link' : 'Request Phone Code'}
              {!loading && <ChevronRight className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Verification Identity</label>
              <input
                type="text"
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                className="w-full bg-slate-900 px-5 py-5 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono tracking-[0.5em] text-center text-3xl font-bold"
                maxLength={6}
                required={authChannel === 'email_otp' || roleIntent !== 'admin' || (!adminCode.trim() && !accessCode.trim())}
              />
              <p className="mt-2 text-[10px] font-semibold text-white/40">
                {authChannel === 'email_otp'
                  ? 'Use the code from the Supabase email, or open the secure email link in this browser.'
                  : 'Enter the phone OTP or use the temporary access path if your lane is allowlisted.'}
              </p>
            </div>
            {authChannel === 'phone' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Temporary Access Code</label>
                <input
                  type="password"
                  placeholder="Temporary access code"
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value)}
                  className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono font-bold"
                />
                <p className="mt-2 text-[10px] font-semibold text-white/40">
                  Optional temporary lane access for allowlisted phones while full provider auth is being finalized.
                </p>
              </div>
            )}
            {authChannel === 'phone' && roleIntent === 'admin' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Admin Bootstrap Code</label>
                <input
                  type="password"
                  placeholder="Temporary admin code"
                  value={adminCode}
                  onChange={e => setAdminCode(e.target.value)}
                  className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono font-bold"
                />
                <p className="mt-2 text-[10px] font-semibold text-white/40">
                  This only works when your phone is allowlisted in backend env and a bootstrap code is configured.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || (otp.length < 6 && authChannel === 'email_otp') || (authChannel === 'phone' && otp.length < 6 && !adminCode.trim() && !accessCode.trim())}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
            {loading ? 'Verifying...' : authChannel === 'email_otp' ? 'Verify Email Code' : accessCode.trim() ? 'Use Temporary Access Code' : roleIntent === 'admin' && adminCode.trim() ? 'Use Admin Access Code' : 'Verify Phone Access'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('identity'); setOtp(''); setAdminCode(''); setAccessCode(''); }}
              className="w-full text-slate-400 hover:text-white text-[10px] font-bold py-2 uppercase tracking-widest transition-colors"
            >
              Change access method
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setShowBypass(!showBypass)}
            className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors"
          >
            {showBypass ? 'Hide QA Bypass' : 'Use QA Bypass'}
          </button>

          {showBypass && (
            <div className="mt-4 grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={() => handleBypassLogin('commuter')}
                className="px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all"
              >
                👤 Commuter
              </button>
              <button
                type="button"
                onClick={() => handleBypassLogin('operator')}
                className="px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all"
              >
                🚕 Operator
              </button>
              <button
                type="button"
                onClick={() => handleBypassLogin('planner')}
                className="px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all"
              >
                📊 Planner
              </button>
              <button
                type="button"
                onClick={() => handleBypassLogin('admin')}
                className="px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all"
              >
                🕵️ Admin
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onRegisterRequest(roleIntent)}
            className="mt-4 text-[10px] text-white/60 hover:text-white font-bold uppercase tracking-widest transition-colors"
          >
            Register this lane instead
          </button>
        </div>
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
  const isLocalReview = ['localhost', '127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).get('review') === '1';
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Changed to false: NEVER block UI on boot
  const [activeTab, setActiveTab] = useState<'home' | 'book' | 'bookings' | 'notifications' | 'profile'>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isProtocolHubOpen, setIsProtocolHubOpen] = useState(false);
  const [isRegistrationHubOpen, setIsRegistrationHubOpen] = useState(false);
  const [registrationTrack, setRegistrationTrack] = useState<'select' | 'commuter' | 'gov_link' | 'citizen_reg' | 'company'>('select');
  const [bootError, setBootError] = useState<string | null>(null);
  const [localAuthUserId, setLocalAuthUserId] = useState<string | null>(() => localStorage.getItem('afat_local_user_id'));
  const roleAccessConfig: Record<string, { label: string; icon: React.ElementType; iconWrapClass: string; iconClass: string }> = {
    commuter: {
      label: 'Commuter / passenger',
      icon: MapIcon,
      iconWrapClass: 'bg-blue-500/10 border-blue-400/20',
      iconClass: 'text-blue-300',
    },
    operator: {
      label: 'Driver / operator node',
      icon: Car,
      iconWrapClass: 'bg-emerald-500/10 border-emerald-400/20',
      iconClass: 'text-emerald-300',
    },
    planner: {
      label: 'Company / agency / city planner',
      icon: BarChart3,
      iconWrapClass: 'bg-purple-500/10 border-purple-400/20',
      iconClass: 'text-purple-300',
    },
    admin: {
      label: 'AFAT admin command',
      icon: ShieldAlert,
      iconWrapClass: 'bg-red-500/10 border-red-400/20',
      iconClass: 'text-red-300',
    }
  };

  try {
    const getRegistrationTrackForRole = (role?: string) => {
      if (role === 'commuter') return 'commuter';
      if (role === 'operator') return 'citizen_reg';
      if (role === 'planner') return 'company';
      if (role === 'admin') return 'gov_link';
      return 'select';
    };

    const forceRole = (role: string, vehicleType?: string, idData?: any) => {
      setUserRole(role);
      setActiveTab('home');
      setShowOnboarding(false);
      const resolvedId = idData?.id || `afat-local-${role}`;
      const resolvedPhone = idData?.phone || localStorage.getItem('afat_local_phone') || '237000000';
      localStorage.setItem('afat_local_user_id', resolvedId);
      localStorage.setItem('afat_local_phone', resolvedPhone);
      localStorage.setItem('afat_user_id', resolvedId);
      localStorage.setItem('afat_access_intent_role', role);
      setLocalAuthUserId(resolvedId);
      setSessionUser({ id: resolvedId, phone: resolvedPhone });
      setUserProfile({
        id: resolvedId,
        full_name: idData?.full_name || (idData?.ids_number ? `Sentinel ${idData.ids_number.split('-').pop()}` : `${vehicleType ? vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1) + ' ' : ''}Test ${role.charAt(0).toUpperCase() + role.slice(1)}`),
        role: role,
        trust_points: 500,
        subscription_tier: role === 'commuter' ? 'free' : 'guardian',
        vehicle_type: vehicleType || null,
        preferred_city: idData?.preferred_city || idData?.base_city || null,
        preferred_zone: idData?.preferred_zone || idData?.operating_zone || null,
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
      const bootAuth = async () => {
        const me = await fetchAfatSessionProfile();
        const authProfile = me.data?.profile;

        if (authProfile?.id) {
          setSessionUser({ id: authProfile.id, phone: authProfile.phone || localStorage.getItem('afat_local_phone') || '' });
          localStorage.setItem('afat_local_user_id', authProfile.id);
          localStorage.setItem('afat_user_id', authProfile.id);
          if (authProfile.phone) localStorage.setItem('afat_local_phone', authProfile.phone);
          telemetry.start(authProfile.id);
          await fetchRole(authProfile.id);
          return;
        }

        const refreshed = await refreshAfatSession();
        const refreshedProfile = refreshed.data?.profile;
        if (refreshedProfile?.id) {
          setSessionUser({ id: refreshedProfile.id, phone: refreshedProfile.phone || localStorage.getItem('afat_local_phone') || '' });
          localStorage.setItem('afat_local_user_id', refreshedProfile.id);
          localStorage.setItem('afat_user_id', refreshedProfile.id);
          if (refreshedProfile.phone) localStorage.setItem('afat_local_phone', refreshedProfile.phone);
          telemetry.start(refreshedProfile.id);
          await fetchRole(refreshedProfile.id);
          return;
        }

        const supabaseSession = await getCurrentUser();
        if (supabaseSession.user?.id) {
          setSessionUser({
            id: supabaseSession.user.id,
            phone: supabaseSession.user.phone || localStorage.getItem('afat_local_phone') || '',
          });
          localStorage.setItem('afat_local_user_id', supabaseSession.user.id);
          localStorage.setItem('afat_user_id', supabaseSession.user.id);
          telemetry.start(supabaseSession.user.id);
          await fetchRole(supabaseSession.user.id);
          return;
        }

        if (localProfileId) {
          setSessionUser({ id: localProfileId, phone: localStorage.getItem('afat_local_phone') || '' });
          localStorage.setItem('afat_user_id', localProfileId);
          await fetchRole(localProfileId);
          return;
        }

        setSessionUser(null);
        setUserRole(null);
        telemetry.stop();
      };

      bootAuth().catch((err) => {
        console.error('[AFAT] Auth boot error:', err);
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          localStorage.setItem('afat_local_user_id', session.user.id);
          localStorage.setItem('afat_user_id', session.user.id);
          if (session.user.phone) localStorage.setItem('afat_local_phone', session.user.phone);
          setSessionUser({
            id: session.user.id,
            phone: session.user.phone || localStorage.getItem('afat_local_phone') || '',
          });
          telemetry.start(session.user.id);
          fetchRole(session.user.id);
        }

        if (event === 'SIGNED_OUT') {
          setSessionUser(null);
          setUserProfile(null);
          setUserRole(null);
          telemetry.stop();
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    }, []);

    const fetchRole = async (userId: string) => {
      try {
        const { data, error } = await getProfile(userId);
        if (!error && data) {
          setUserProfile(data);
          setUserRole(data.role || 'commuter');
          setBootError(null);
          
          const hasOnboarded = localStorage.getItem(`onboarded_${userId}`);
          if (!hasOnboarded) {
            setShowOnboarding(true);
          }
        } else {
          const intendedRole = localStorage.getItem('afat_access_intent_role') || 'commuter';
          setUserRole(null);
          setUserProfile(null);
          setRegistrationTrack(getRegistrationTrackForRole(intendedRole));
          setIsRegistrationHubOpen(true);
          setBootError('AFAT recognized the phone session, but no mobility profile is attached yet.');
        }
      } catch (err) {
        setBootError('AFAT could not load the role profile. Reconnect or finish registration.');
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
                onClick={() => { forceRole('planner'); setIsProtocolHubOpen(false); }}
                className="w-full px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-cyan-500 text-white"
              >
                Planner
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
                  AFAT now opens through a real access flow instead of the old guest shell. Email and password is the recommended pilot path now; phone OTP remains available for approved provider lanes. Register your commuter, operator, or fleet identity if no profile exists yet.
                </p>
              </div>

              {isLocalReview && (
                <div className="mb-8 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200/70">Local review mode</p>
                      <p className="mt-1 text-xs font-semibold text-white/55">Browse AFAT surfaces without waiting on SMS or production sessions.</p>
                    </div>
                    <button
                      onClick={() => {
                        setRegistrationTrack('select');
                        setIsRegistrationHubOpen(true);
                      }}
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-white/15"
                    >
                      Onboard
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { role: 'commuter', label: 'Commuter', vehicle: undefined },
                      { role: 'operator', label: 'Operator', vehicle: 'taxi' },
                      { role: 'planner', label: 'Planner', vehicle: undefined },
                      { role: 'admin', label: 'Admin', vehicle: undefined },
                    ].map((item) => (
                      <button
                        key={item.role}
                        onClick={() => forceRole(item.role, item.vehicle)}
                        className="min-h-12 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/70 transition hover:border-emerald-300/50 hover:text-white"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Login
                onRegisterRequest={(role) => {
                  setRegistrationTrack(getRegistrationTrackForRole(role));
                  setIsRegistrationHubOpen(true);
                }}
              />

              {bootError && (
                <div className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100/80">
                  {bootError}
                </div>
              )}

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight text-white">No AFAT profile yet?</p>
                    <p className="mt-1 text-xs text-white/45">Create commuter, operator, government-linked, or fleet onboarding before sign-in.</p>
                  </div>
                  <button
                    onClick={() => {
                      setRegistrationTrack('select');
                      setIsRegistrationHubOpen(true);
                    }}
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
            initialTrack={registrationTrack}
            prefillPhone={localStorage.getItem('afat_access_phone') || localStorage.getItem('afat_local_phone') || ''}
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
          return <PlannerDashboard onSignOut={handleSignOut} activeTab={activeTab} />;
        case 'operator':
          return <OperatorDashboard onSignOut={handleSignOut} activeTab={activeTab} profile={userProfile} />;
        case 'commuter':
        default:
          return <CommuterDashboard onSignOut={handleSignOut} profile={userProfile} activeTab={activeTab} />;
      }
    };

    const renderRoleFrame = () => {
      if (!isLocalReview) {
        return null;
      }

      const config = roleAccessConfig[userRole || 'commuter'] || roleAccessConfig.commuter;
      const Icon = config.icon;
      const isCompanyCoordinator = userRole === 'planner' && userProfile?.company_name;
      const reviewRoles = [
        { role: 'commuter', label: 'Commuter', vehicle: undefined },
        { role: 'operator', label: 'Operator', vehicle: userProfile?.vehicle_type || 'taxi' },
        { role: 'planner', label: 'Planner', vehicle: undefined },
        { role: 'admin', label: 'Admin', vehicle: undefined },
      ];
      return (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 px-4 py-3 shadow-xl backdrop-blur-2xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${config.iconWrapClass}`}>
                  <Icon className={`h-4 w-4 ${config.iconClass}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">QA workspace</p>
                  <p className="truncate text-sm font-black uppercase tracking-tight text-white">
                    {isCompanyCoordinator ? 'Company / fleet coordinator' : config.label}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Role switch</span>
                {reviewRoles.map((item) => (
                  <button
                    key={item.role}
                    onClick={() => forceRole(item.role, item.vehicle)}
                    className={`min-h-10 rounded-2xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest transition ${
                      userRole === item.role
                        ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setRegistrationTrack('select');
                    setIsRegistrationHubOpen(true);
                  }}
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/70 transition hover:text-white"
                >
                  Register
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="min-h-screen flex flex-col sentinel-bg text-white selection:bg-blue-500/30">
        <div className="mesh-gradient" />
        <div className="relative z-10 flex-1 flex flex-col">
          {renderRoleFrame()}
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
        <RegistrationHub
          isVisible={isRegistrationHubOpen}
          onClose={() => setIsRegistrationHubOpen(false)}
          initialTrack={registrationTrack}
          prefillPhone={localStorage.getItem('afat_access_phone') || localStorage.getItem('afat_local_phone') || ''}
          onRegisterCustom={(data) => {
            if (data?.id) {
              localStorage.setItem('afat_local_user_id', data.id);
              setLocalAuthUserId(data.id);
            }
            forceRole(data.role, data.vehicleType, data);
          }}
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
