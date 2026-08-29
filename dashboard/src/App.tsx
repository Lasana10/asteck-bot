import React, { useState, useEffect } from 'react';
import { supabase, sendPhoneOtp, verifyPhoneOtp, sendEmailOtp, verifyEmailOtp, signInOrSignUpWithEmailPassword, signInWithGoogle, signInAsGuest, completeGoogleAuthCallback, ensureSupabaseEmailProfile, getCurrentUser, getProfile, signOut, fetchAfatSessionProfile, refreshAfatSession, ensureReachableApiBaseUrl, getApiBaseUrl, setApiBaseOverride, bypassAfatRole, runAfatBackendDiagnostics } from './supabaseClient';
import { ShieldAlert, Car, Map as MapIcon, BarChart3, ChevronRight, Chrome } from 'lucide-react';
import { AFATLogo } from './components/shared/AFATLogo';
import { BottomNav } from './components/shared/BottomNav';
import { RoleOnboarding } from './components/shared/RoleOnboarding';
import { RegistrationHub } from './components/shared/RegistrationHub';
import { telemetry } from './services/telemetryService';
import { TurnstileGate } from './components/shared/TurnstileGate';
import { isLocalReviewAllowed, isLoopbackHost } from './utils/productionTruth';

const CommuterDashboard = React.lazy(() => import('./components/commuter/CommuterDashboard').then(module => ({ default: module.CommuterDashboard })));
const OperatorDashboard = React.lazy(() => import('./components/operator/OperatorDashboard').then(module => ({ default: module.OperatorDashboard })));
const PlannerDashboard = React.lazy(() => import('./components/planner/PlannerDashboard').then(module => ({ default: module.PlannerDashboard })));
const AdminControlPanel = React.lazy(() => import('./components/admin/AdminControlPanel').then(module => ({ default: module.AdminControlPanel })));
const AICopilot = React.lazy(() => import('./components/shared/AICopilot').then(module => ({ default: module.AICopilot })));
const GuardianWatchPage = React.lazy(() => import('./components/shared/GuardianWatchPage').then(module => ({ default: module.GuardianWatchPage })));

function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050813] px-6 text-white">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-950/80 p-7 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-500/10">
          <AFATLogo className="h-7 w-7 text-blue-100" />
        </div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">AFAT workspace</p>
        <p className="mt-2 text-sm font-semibold text-white/65">Loading the right mobility controls for your access level…</p>
      </div>
    </div>
  );
}

function explainAuthError(message?: string) {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('timeout-or-duplicate') || lower.includes('captcha')) {
    return 'The security check expired or was already used. Complete the new check below, then submit once.';
  }
  if (lower.includes('email not confirmed')) {
    return 'This account exists but its email is not confirmed yet. Open the latest AFAT confirmation email, then sign in again.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'That email and AFAT password do not match. Retry the password, or choose Create account if this email is new.';
  }
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'This email already has an AFAT account. Switch to Sign in and use the password created for AFAT.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many access attempts were made. Wait briefly, complete a fresh security check, and submit once.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return 'AFAT could not reach the identity service. Check your connection and retry.';
  }
  if (lower.includes('schema cache') || lower.includes("column of 'profiles'") || lower.includes('role_profile_unavailable')) {
    return 'AFAT role services are updating. Wait a moment, then retry access; your account remains safe.';
  }
  if (lower.includes('role_activation_failed')) {
    return 'AFAT could not finish role activation. Retry once; your current access has not changed.';
  }

  return raw || 'AFAT could not complete secure access. Please retry with a fresh security check.';
}

// ==============================================================================
// 🔐 OTP LOGIN COMPONENT
// ==============================================================================
function Login({ onRegisterRequest }: { onRegisterRequest: (role?: string) => void }) {
  const isStaffAccess = typeof window !== 'undefined' && window.location.pathname === '/staff/access';
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
  const [needsAccountCreation, setNeedsAccountCreation] = useState(false);
  const [authChallengeKey, setAuthChallengeKey] = useState(0);
  const [roleIntent, setRoleIntent] = useState<'commuter' | 'operator' | 'planner' | 'admin'>(isStaffAccess ? 'planner' : 'commuter');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'live' | 'offline'>('checking');
  const [apiTarget, setApiTarget] = useState(getApiBaseUrl());
  const [backendDetail, setBackendDetail] = useState('');
  const [backendDiagnostics, setBackendDiagnostics] = useState('');
  const [guestTurnstileToken, setGuestTurnstileToken] = useState('');
  const [authTurnstileToken, setAuthTurnstileToken] = useState('');
  const [staffRoleChosen, setStaffRoleChosen] = useState(!isStaffAccess);

  const resetAuthChallenge = () => {
    setAuthTurnstileToken('');
    setAuthChallengeKey((value) => value + 1);
  };

  const normalizedPhone = phone.replace(/\s+/g, '');
  const normalizedEmail = email.trim().toLowerCase();
  const supabaseReady = Boolean(import.meta.env.VITE_SUPABASE_URL && (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY));
  const turnstileReady = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const phoneAuthEnabled = import.meta.env.VITE_ENABLE_PHONE_AUTH === 'true';
  const needsAuthTurnstile = turnstileReady;
  const showTechnicalDiagnostics = import.meta.env.DEV || isLoopbackHost(window.location.hostname);
  const envDiagnostics = [
    `mode: ${import.meta.env.MODE || 'unknown'}`,
    `supabase url: ${import.meta.env.VITE_SUPABASE_URL ? 'present' : 'missing'}`,
    `publishable key: ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'present' : 'missing'}`,
    `anon key: ${import.meta.env.VITE_SUPABASE_ANON_KEY ? 'present' : 'missing'}`,
    `turnstile site key: ${import.meta.env.VITE_TURNSTILE_SITE_KEY ? 'present' : 'missing'}`,
    `api url: ${import.meta.env.VITE_API_URL || 'fallback live backend'}`,
  ];
  const guestAccessEnabled = import.meta.env.VITE_ENABLE_GUEST_ACCESS === 'true';
  const pendingAccessCodeStorageKey = 'afat_pending_access_code';
  const pendingAdminCodeStorageKey = 'afat_pending_admin_code';
  const accessLanes = isStaffAccess
    ? [
        { role: 'planner', label: 'Planner' },
        { role: 'admin', label: 'Admin' },
      ]
    : [
        { role: 'commuter', label: 'Commuter' },
        { role: 'operator', label: 'Operator' },
      ];
  const isGeneralStaffLane = roleIntent === 'operator' || roleIntent === 'planner';
  // Invitation codes are for the first controlled activation.  An already
  // approved staff member must be able to use ordinary email/password sign-in
  // afterwards; the backend restores the server-held role.
  const requiresApprovalCode = false;

  useEffect(() => {
    let mounted = true;

    const syncBackendStatus = async () => {
      if (!mounted) return;
      setBackendStatus('checking');
      const { url, healthy, corrected, contractHealthy, detail } = await ensureReachableApiBaseUrl();
      if (!mounted) return;
      setApiTarget(url);
      setBackendStatus(healthy ? 'live' : 'offline');
      setBackendDetail(detail || '');
      if (corrected) {
        setInfoText((current) => current || 'AFAT restored the live backend automatically for this device.');
      } else if (healthy && !contractHealthy && detail) {
        setInfoText((current) => current || detail);
      }
    };

    syncBackendStatus().catch(() => {
      if (mounted) {
        setBackendStatus('offline');
        setBackendDetail('AFAT could not verify the API target from this browser.');
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setAuthTurnstileToken('');
  }, [authChannel, roleIntent]);

  useEffect(() => {
    setNeedsAccountCreation(false);
  }, [normalizedEmail, authChannel, roleIntent]);

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

  const persistPendingAccessCodes = () => {
    sessionStorage.removeItem(pendingAccessCodeStorageKey);
    sessionStorage.removeItem(pendingAdminCodeStorageKey);
    if (accessCode.trim()) {
      sessionStorage.setItem(pendingAccessCodeStorageKey, accessCode.trim());
    }
    if (adminCode.trim()) {
      sessionStorage.setItem(pendingAdminCodeStorageKey, adminCode.trim());
    }
  };

  const handleGoogleLogin = async () => {
    if (isStaffAccess && !staffRoleChosen) {
      setErrorText('Choose Planner or Admin before continuing. AFAT will never guess a staff role from an email address.');
      return;
    }
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();
    persistPendingAccessCodes();

    const { error } = await signInWithGoogle({ roleIntent });
    if (error) {
      setErrorText('AFAT could not complete Google access. Please retry or use email access.');
      setLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    setLoading(true);
    setErrorText('');
    setInfoText('');
    localStorage.setItem('afat_access_intent_role', 'commuter');
    const { error } = await signInAsGuest(guestTurnstileToken);
    if (error) {
      setErrorText('Limited guest access is temporarily unavailable. Please sign in with email or Google.');
      setGuestTurnstileToken('');
      setLoading(false);
      return;
    }
    window.location.reload();
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffAccess && !staffRoleChosen) {
      setErrorText('Choose Planner or Admin before continuing. AFAT will never guess a staff role from an email address.');
      return;
    }
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();
    persistPendingAccessCodes();

    if (!turnstileReady) {
      setErrorText('Secure human verification is temporarily unavailable. Please try again shortly.');
      setLoading(false);
      return;
    }

    if (authChannel === 'phone' && !phoneAuthEnabled) {
      setErrorText('Phone sign-in is not active yet. Use email/password, an email link, or Google.');
      setLoading(false);
      return;
    }

    if (authChannel === 'email_password') {
      const { data, error } = await signInOrSignUpWithEmailPassword(normalizedEmail, password, {
        roleIntent,
        captchaToken: authTurnstileToken || undefined,
        createAccount: needsAccountCreation,
      });
      if (error) {
        setErrorText(explainAuthError(error.message));
        resetAuthChallenge();
      } else if (data?.mode === 'signup_required') {
        setNeedsAccountCreation(true);
        resetAuthChallenge();
        setInfoText('No AFAT account was found for this email. Complete the fresh security check, then press Create AFAT account.');
      } else if (data?.mode === 'confirmation_required') {
        setNeedsAccountCreation(false);
        resetAuthChallenge();
        setInfoText('Account created. Confirm the latest AFAT email, return to this page, then sign in with the same AFAT password.');
      } else {
        const profileResult = await ensureSupabaseEmailProfile({
          roleIntent,
          accessCode: accessCode.trim() || undefined,
          adminCode: adminCode.trim() || undefined,
        });
        if (profileResult.error) {
          setErrorText(profileResult.error.message);
          setLoading(false);
          return;
        }
        const grantedRole = normalizeAfatRole(profileResult.data?.profile?.role);
        if (['operator', 'planner', 'admin'].includes(grantedRole)) {
          localStorage.setItem('afat_access_intent_role', grantedRole);
        }
        window.location.reload();
      }
      setLoading(false);
      return;
    }

    const result = authChannel === 'email_otp'
      ? await sendEmailOtp(normalizedEmail, { roleIntent, captchaToken: authTurnstileToken || undefined })
      : await sendPhoneOtp(normalizedPhone, { captchaToken: authTurnstileToken || undefined });
    const { error } = result;
    if (error) {
      setErrorText(explainAuthError(error.message));
    } else {
      setStep('verify');
    }
    resetAuthChallenge();
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();
    persistPendingAccessCodes();
    if (authChannel === 'phone' && !phoneAuthEnabled) {
      setErrorText('Phone verification is not active in this deployment. Return to secure email or Google access.');
      setLoading(false);
      return;
    }
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
      if (authChannel === 'email_otp') {
        const profileResult = await ensureSupabaseEmailProfile({
          roleIntent,
          accessCode: accessCode.trim() || undefined,
          adminCode: adminCode.trim() || undefined,
        });
        if (profileResult.error) {
          setErrorText(profileResult.error.message);
          setLoading(false);
          return;
        }
      }
      window.location.reload();
    }
    setLoading(false);
  };

  const handleBypassLogin = async (role: string) => {
    setLoading(true);
    setErrorText('');
    try {
      const { data, error } = await bypassAfatRole(role);
      if (error) throw error;

      if (data?.userId) {
        if (!localStorage.getItem('afat_local_phone')) {
          localStorage.setItem('afat_local_phone', '237699999001');
        }
        window.location.reload();
      } else {
        setErrorText(`No seeded ${role} profile exists yet. Use email auth with the AFAT bootstrap code, or create a real ${role} account through onboarding.`);
      }
    } catch (err: any) {
      setErrorText(`Bypass failed: ${err.message || 'database connection issue'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="afat-secure-access" className="w-full font-sans text-on-surface">
      <div className="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80 p-5 shadow-ambient-float sm:p-7">
        <div className="absolute top-0 left-0 w-full h-1 bg-signature-gradient opacity-50"></div>

        <h2 className="text-2xl font-black tracking-tighter text-white uppercase italic">Secure access</h2>
        <p className="mb-6 mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Choose your lane and identity method</p>

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

        <div className="mb-6 grid grid-cols-3 gap-2">
          <div className={`rounded-2xl border px-3 py-3 ${supabaseReady ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">Identity protection</p>
            <p className={`mt-1 text-xs font-black ${supabaseReady ? 'text-emerald-200' : 'text-amber-200'}`}>
              {supabaseReady ? 'Ready' : 'Unavailable'}
            </p>
            {!supabaseReady && showTechnicalDiagnostics && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-amber-100/70">
                  Env details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-amber-200/10 bg-slate-950/60 p-2 text-[9px] leading-relaxed text-amber-50/80">
                  {envDiagnostics.join('\n')}
                </pre>
              </details>
            )}
          </div>
          <div className={`rounded-2xl border px-3 py-3 ${turnstileReady ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">Human verification</p>
            <p className={`mt-1 text-xs font-black ${turnstileReady ? 'text-emerald-200' : 'text-amber-200'}`}>
              {turnstileReady ? 'Ready' : 'Unavailable'}
            </p>
          </div>
          <div className={`rounded-2xl border px-3 py-3 ${backendStatus === 'live' ? 'border-emerald-400/25 bg-emerald-500/10' : backendStatus === 'checking' ? 'border-blue-400/25 bg-blue-500/10' : 'border-red-400/25 bg-red-500/10'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">AFAT network</p>
            <p className={`mt-1 text-xs font-black ${backendStatus === 'live' ? 'text-emerald-200' : backendStatus === 'checking' ? 'text-blue-200' : 'text-red-200'}`}>
              {backendStatus === 'live' ? 'Online' : backendStatus === 'checking' ? 'Connecting' : 'Unavailable'}
            </p>
            {showTechnicalDiagnostics && <p className="mt-1 truncate text-[9px] font-semibold text-white/35">{apiTarget.replace(/^https?:\/\//, '')}</p>}
          </div>
        </div>

        {backendStatus === 'offline' && (
          <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
            <p className="text-xs font-bold leading-relaxed text-red-100/80">
              AFAT is reconnecting to the mobility network. Please retry in a moment.
            </p>
            {backendDetail && showTechnicalDiagnostics && (
              <p className="mt-2 text-[11px] leading-relaxed text-red-100/60">
                {backendDetail}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  setErrorText('');
                  setInfoText('');
                  setBackendStatus('checking');
                  const { url, healthy, corrected, contractHealthy, detail } = await ensureReachableApiBaseUrl();
                  setApiTarget(url);
                  setBackendStatus(healthy ? 'live' : 'offline');
                  setBackendDetail(detail || '');
                  if (corrected) {
                    setInfoText('AFAT restored the live backend automatically for this device.');
                  } else if (healthy && !contractHealthy && detail) {
                    setInfoText(detail);
                  }
                }}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
              >
                Retry connection
              </button>
              {showTechnicalDiagnostics && (
                <>
              <button
                type="button"
                onClick={async () => {
                  setBackendDiagnostics('Running AFAT backend diagnostics...');
                  try {
                    const report = await runAfatBackendDiagnostics();
                    const lines = report.entries.flatMap((entry) => [
                      entry.candidate.replace(/^https?:\/\//, ''),
                      `contract ${entry.contract.status || 0}: ${entry.contract.reason}`,
                      `health ${entry.health.status || 0}: ${entry.health.reason}`,
                      `auth ${entry.authContract.status || 0}: ${entry.authContract.reason}`,
                    ]);
                    setBackendDiagnostics(lines.join('\n'));
                  } catch (err: any) {
                    setBackendDiagnostics(err?.message || 'AFAT diagnostics failed.');
                  }
                }}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
              >
                Run diagnostics
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiBaseOverride('https://asteck-bot.onrender.com');
                  window.location.reload();
                }}
                className="rounded-xl border border-red-200/20 bg-red-100/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-100"
              >
                Use live backend
              </button>
                </>
              )}
            </div>
            {backendDiagnostics && showTechnicalDiagnostics && (
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/60 p-3 text-[10px] leading-relaxed text-red-50/85">
                {backendDiagnostics}
              </pre>
            )}
          </div>
        )}

        {step === 'identity' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Access lane</label>
              <div className="grid grid-cols-2 gap-2">
                {accessLanes.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      setRoleIntent(item.role as typeof roleIntent);
                      setStaffRoleChosen(true);
                      setAccessCode('');
                      setAdminCode('');
                      setErrorText('');
                      setInfoText(`${item.label} access selected. Use the email invited specifically for this workspace.`);
                      resetAuthChallenge();
                    }}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                      roleIntent === item.role && staffRoleChosen
                        ? 'border-blue-400/50 bg-blue-500/15 text-blue-100'
                        : 'border-white/10 bg-slate-950 text-white/55 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {isStaffAccess && !staffRoleChosen && (
                <p role="status" className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-[10px] font-bold leading-relaxed text-amber-100">
                  Select the exact staff workspace first. Planner and Admin invitations are separate and cannot be exchanged.
                </p>
              )}
              {!isStaffAccess && (
                <button
                  type="button"
                  onClick={() => window.location.assign('/staff/access')}
                  className="mt-3 text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white"
                >
                  Staff access
                </button>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Access channel</label>
              <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Recommended now: Email password</p>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-white/50">Use email/password, an email link, or Google. Phone sign-in is prepared but remains paused until AFAT activates verified SMS delivery.</p>
              </div>
              <div className={`grid gap-2 ${phoneAuthEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {[
                  ...(phoneAuthEnabled ? [{ channel: 'phone', label: 'Phone OTP' }] : []),
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
              {!phoneAuthEnabled && (
                <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.07] px-3 py-2 text-[10px] font-semibold leading-relaxed text-amber-100/65">
                  Phone OTP coming later. Your phone can still be saved as a contact after secure email or Google sign-in.
                </p>
              )}
            </div>
            <div>
              {authChannel === 'email_password' && (
                <div className="mb-6">
                  <label className="mb-3 ml-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Account action</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1.5">
                    <button
                      type="button"
                      aria-pressed={!needsAccountCreation}
                      onClick={() => {
                        setNeedsAccountCreation(false);
                        setErrorText('');
                        setInfoText('Sign in with an existing AFAT email and its AFAT password.');
                        resetAuthChallenge();
                      }}
                      className={`min-h-12 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                        !needsAccountCreation
                          ? 'border border-blue-400/50 bg-blue-500/20 text-blue-100'
                          : 'border border-transparent text-white/45 hover:text-white'
                      }`}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      aria-pressed={needsAccountCreation}
                      onClick={() => {
                        setNeedsAccountCreation(true);
                        setErrorText('');
                        setInfoText(`Create the secure identity first. After email confirmation, sign in and complete the ${roleIntent} profile.`);
                        resetAuthChallenge();
                      }}
                      className={`min-h-12 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                        needsAccountCreation
                          ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                          : 'border border-transparent text-white/45 hover:text-white'
                      }`}
                    >
                      Create account
                    </button>
                  </div>
                  <p className="mt-2 px-1 text-[10px] font-semibold leading-relaxed text-white/45">
                    {needsAccountCreation
                      ? 'New identity mode: AFAT will create an account and send a confirmation email.'
                      : 'Existing identity mode: AFAT will not send a new email; it will verify the password.'}
                  </p>
                </div>
              )}
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
                  {(isGeneralStaffLane || roleIntent === 'admin') && (
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder={roleIntent === 'admin'
                          ? 'Administrator activation code'
                          : roleIntent === 'planner'
                            ? 'Planner invitation code'
                            : 'Operator invitation code'}
                        value={roleIntent === 'admin' ? adminCode : accessCode}
                        onChange={e => roleIntent === 'admin' ? setAdminCode(e.target.value) : setAccessCode(e.target.value)}
                        className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono font-bold"
                        required={requiresApprovalCode}
                        autoComplete="one-time-code"
                      />
                      <p className="px-1 text-[10px] font-semibold leading-relaxed text-white/45">
                        {roleIntent === 'operator'
                          ? 'Already approved by AFAT? Enter your operator invitation code once. Otherwise sign in first, then start a reviewed operator application deliberately.'
                          : roleIntent === 'planner'
                            ? 'Planner is an internal AFAT operations role. New access requires the invited email and its planner invitation code. Approved planners can sign in normally.'
                            : 'Administrator is a restricted platform-control role. New access requires the root-admin email and its separate activation code. Approved administrators can sign in normally.'}
                      </p>
                    </div>
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
            {needsAuthTurnstile && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <TurnstileGate
                  key={`${authChannel}:${roleIntent}:${authChallengeKey}`}
                  action="identity_auth"
                  onToken={setAuthTurnstileToken}
                  onExpire={() => setAuthTurnstileToken('')}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading || (isStaffAccess && !staffRoleChosen) || requiresApprovalCode && !(roleIntent === 'admin' ? adminCode.trim() : accessCode.trim()) || (needsAuthTurnstile && !authTurnstileToken) || (authChannel !== 'phone' ? !normalizedEmail.includes('@') || (authChannel === 'email_password' && password.length < 6) : normalizedPhone.length < 8)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              {loading ? 'Transmitting...' : authChannel === 'email_password' ? (needsAccountCreation ? 'Create AFAT account' : 'Enter AFAT') : authChannel === 'email_otp' ? 'Send Email Link' : 'Request Phone Code'}
              {!loading && <ChevronRight className="w-4 h-4" />}
            </button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-slate-950 px-3 text-[9px] font-black uppercase tracking-widest text-white/35">or verified identity</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || !supabaseReady || (isStaffAccess && !staffRoleChosen) || requiresApprovalCode && !(roleIntent === 'admin' ? adminCode.trim() : accessCode.trim())}
              className="w-full border border-white/15 bg-white text-slate-950 hover:bg-slate-100 font-black py-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              <Chrome className="h-4 w-4" />
              Continue with Google
            </button>
            <p className="text-[10px] font-semibold leading-relaxed text-white/40">
              Google confirms your identity. AFAT still controls driver, planner and admin approval separately.
            </p>
            {guestAccessEnabled && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <TurnstileGate
                  action="guest_access"
                  onToken={setGuestTurnstileToken}
                  onExpire={() => setGuestTurnstileToken('')}
                />
                <button
                  type="button"
                  onClick={handleGuestAccess}
                  disabled={loading || !supabaseReady || !guestTurnstileToken}
                  className="w-full border border-white/10 bg-slate-950 text-white/75 hover:text-white font-black py-3.5 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                  Continue as guest, limited
                </button>
              </div>
            )}
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
                  ? 'Use the code from your AFAT email, or open the secure email link in this browser.'
                  : 'Enter the phone OTP or use the temporary access path if your lane is allowlisted.'}
              </p>
            </div>
            {(authChannel === 'phone' || authChannel === 'email_otp') && isGeneralStaffLane && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">
                  {roleIntent === 'operator' ? 'Operator Invitation Code' : 'Planner Invitation Code'}
                </label>
                <input
                  type="password"
                  placeholder={roleIntent === 'operator' ? 'Operator invitation code' : 'Planner invitation code'}
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value)}
                  className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono font-bold"
                />
                <p className="mt-2 text-[10px] font-semibold text-white/40">
                  {roleIntent === 'operator'
                    ? 'Approved operators enter the current staff code. Leave it blank to start an operator application.'
                    : 'Required together with an allowlisted planner identity.'}
                </p>
              </div>
            )}
            {(authChannel === 'phone' || authChannel === 'email_otp') && roleIntent === 'admin' && (
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
                  This restricted path is available only to approved AFAT administrators.
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
          {isStaffAccess && import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setShowBypass(!showBypass)}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors"
            >
              {showBypass ? 'Hide QA Bypass' : 'Use QA Bypass'}
            </button>
          )}

          {showBypass && isStaffAccess && import.meta.env.DEV && (
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

          {!isStaffAccess && (
            <div className="mt-4 w-full space-y-2">
              <button
                type="button"
                onClick={() => {
                  setNeedsAccountCreation((current) => !current);
                  setErrorText('');
                  setInfoText(needsAccountCreation
                    ? 'Sign in with an existing AFAT account.'
                    : `Create the secure identity first. After email confirmation, sign in and complete the ${roleIntent} profile.`);
                  resetAuthChallenge();
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                {needsAccountCreation ? 'Already registered? Sign in' : 'New here? Create AFAT account'}
              </button>
              <button
                type="button"
                onClick={() => onRegisterRequest(roleIntent)}
                className="w-full px-4 py-2 text-[9px] font-black uppercase tracking-widest text-blue-200/65 transition-colors hover:text-blue-100"
              >
                View {roleIntent} registration requirements
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('Completing secure Google access...');
  const [phase, setPhase] = useState<'redirect' | 'session' | 'profile' | 'ready'>('redirect');

  useEffect(() => {
    let mounted = true;
    const roleIntent = localStorage.getItem('afat_access_intent_role') || 'commuter';
    const accessCode = sessionStorage.getItem('afat_pending_access_code') || '';
    const adminCode = sessionStorage.getItem('afat_pending_admin_code') || '';

    setPhase('session');
    completeGoogleAuthCallback({ roleIntent, accessCode, adminCode })
      .then(({ error }) => {
        sessionStorage.removeItem('afat_pending_access_code');
        sessionStorage.removeItem('afat_pending_admin_code');

        if (!mounted) return;
        if (error) {
          setStatus('error');
          setMessage(error.message || 'AFAT could not complete Google sign-in.');
          return;
        }

        setPhase('profile');
        window.history.replaceState({}, '', '/');
        window.location.replace('/');
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus('error');
        setMessage(err?.message || 'AFAT could not complete Google sign-in.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel rounded-[32px] border border-white/10 p-8 text-center shadow-ambient-float">
        <AFATLogo className="mx-auto h-12 w-12" />
        <h1 className="mt-6 text-2xl font-black uppercase tracking-tight">AFAT Google Access</h1>
        <p className={`mt-4 text-sm font-bold leading-relaxed ${status === 'error' ? 'text-red-200' : 'text-white/55'}`}>
          {message}
        </p>
        {status === 'loading' ? (
          <div className="mt-6 grid gap-3 text-left">
            <div className={`rounded-2xl border px-4 py-3 ${phase === 'redirect' ? 'border-blue-400/30 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">Step 1</p>
              <p className="mt-1 text-xs font-bold text-white">Google redirected back to AFAT.</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${phase === 'session' ? 'border-blue-400/30 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">Step 2</p>
              <p className="mt-1 text-xs font-bold text-white">Restoring your secure AFAT identity.</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${phase === 'profile' ? 'border-blue-400/30 bg-blue-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">Step 3</p>
              <p className="mt-1 text-xs font-bold text-white">Loading your AFAT profile and access lane.</p>
            </div>
            <div className="mx-auto mt-1 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => window.location.replace('/')}
              className="rounded-2xl bg-blue-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-500"
            >
              Return to AFAT access
            </button>
            <p className="text-[10px] font-semibold leading-relaxed text-white/40">
              If this repeats, return to AFAT access and use email sign-in or contact support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type AfatRole = 'commuter' | 'operator' | 'planner' | 'admin';
type AccessLevel = 'public' | 'guest' | 'verified' | 'operator' | 'planner' | 'admin';

function normalizeAfatRole(role?: string | null): AfatRole {
  return ['operator', 'planner', 'admin'].includes(String(role || '').toLowerCase())
    ? String(role).toLowerCase() as AfatRole
    : 'commuter';
}

function getAccessLevel(profile: any, sessionUser: any): AccessLevel {
  if (!sessionUser?.id) return 'public';
  const role = normalizeAfatRole(profile?.role);
  if (role === 'admin') return 'admin';
  if (role === 'planner') return 'planner';
  if (role === 'operator') return 'operator';
  return profile?.access_level === 'guest' || localStorage.getItem('afat_access_level') === 'guest' ? 'guest' : 'verified';
}

function canUseOperatorConsole(profile: any) {
  if (!profile) return false;
  const status = String(profile.operator_application_status || '').toUpperCase();
  return normalizeAfatRole(profile.role) === 'operator' && profile.is_active !== false && (!status || status === 'APPROVED');
}

function hasOperatorApplication(profile: any) {
  const status = String(profile?.operator_application_status || '').toUpperCase();
  return Boolean(status && !['NOT_APPLIED', 'APPROVED'].includes(status));
}

function OperatorAccessPending({
  profile,
  onRegister,
  onRedeem,
  onUseCommuter,
}: {
  profile: any;
  onRegister: () => void;
  onRedeem: (code: string) => Promise<string | null>;
  onUseCommuter: () => void;
}) {
  const status = String(profile?.operator_application_status || 'APPLICATION_STARTED').replace(/_/g, ' ');
  const [invitationCode, setInvitationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [activating, setActivating] = useState(false);

  const redeemInvitation = async () => {
    setActivating(true);
    setActivationError('');
    const error = await onRedeem(invitationCode.trim());
    if (error) setActivationError(error);
    setActivating(false);
  };

  return (
    <div className="min-h-screen sentinel-bg text-white px-5 py-8 pb-28">
      <div className="mesh-gradient" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-amber-400/20 bg-slate-950/80 p-7 shadow-ambient-float backdrop-blur-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/70">Controlled operator access</p>
          <h1 className="mt-3 text-3xl font-black uppercase italic tracking-tight text-white">Operator approval required</h1>
          <p className="mt-4 text-sm font-semibold leading-relaxed text-white/65">
            Your Google or email account is valid, but AFAT has not approved this profile for live driver/operator operations yet.
            This protects passengers, operators, payments and city intelligence from fake role elevation.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Current role</p>
              <p className="mt-2 text-sm font-black uppercase text-white">{normalizeAfatRole(profile?.role)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Application</p>
              <p className="mt-2 text-sm font-black uppercase text-amber-100">{status}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Live console</p>
              <p className="mt-2 text-sm font-black uppercase text-red-200">Locked</p>
            </div>
          </div>
          <div className="mt-7 rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Already invited by AFAT?</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-white/50">Redeem the operator invitation issued specifically to this signed-in email. Once activated, future sign-ins open the operator console directly.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={invitationCode}
                onChange={(event) => setInvitationCode(event.target.value)}
                placeholder="Operator invitation code"
                autoComplete="one-time-code"
                className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white outline-none focus:border-emerald-300/50"
              />
              <button
                type="button"
                disabled={!invitationCode.trim() || activating}
                onClick={redeemInvitation}
                className="min-h-12 rounded-2xl bg-emerald-400 px-5 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-50"
              >
                {activating ? 'Activating…' : 'Activate operator access'}
              </button>
            </div>
            {activationError && <p role="alert" className="mt-3 text-xs font-bold leading-relaxed text-red-200">{activationError}</p>}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRegister}
              className="rounded-2xl bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950"
            >
              Start or continue operator application
            </button>
            <button
              type="button"
              onClick={onUseCommuter}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-black uppercase tracking-widest text-white/70"
            >
              Use passenger workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RestrictedAccessPending({
  requestedRole,
  onActivate,
  onUseCommuter,
}: {
  requestedRole: 'planner' | 'admin';
  onActivate: (code: string) => Promise<string | null>;
  onUseCommuter: () => void;
}) {
  const label = requestedRole === 'admin' ? 'Admin command' : 'Planner access';
  const [invitationCode, setInvitationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [activating, setActivating] = useState(false);

  const activate = async () => {
    setActivating(true);
    setActivationError('');
    const error = await onActivate(invitationCode.trim());
    if (error) setActivationError(error);
    setActivating(false);
  };

  return (
    <div className="min-h-screen sentinel-bg text-white px-5 py-8 pb-28">
      <div className="mesh-gradient" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-blue-400/20 bg-slate-950/80 p-7 shadow-ambient-float backdrop-blur-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-200/70">Invite controlled access</p>
          <h1 className="mt-3 text-3xl font-black uppercase italic tracking-tight text-white">{label} requires approval</h1>
          <p className="mt-4 text-sm font-semibold leading-relaxed text-white/65">
            Your identity is verified, but your server profile has not received {requestedRole === 'admin' ? 'administrator' : 'AFAT operations planner'} authority.
            Enter the activation issued to this exact email. Company, fleet, and government registrations do not grant this platform role.
          </p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Access status">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-100">
              Identity verified
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-100">
              {requestedRole} activation pending
            </span>
          </div>
          <div className="mt-7 rounded-3xl border border-blue-400/20 bg-blue-500/[0.07] p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-blue-100">
              {requestedRole === 'admin' ? 'Administrator activation code' : 'Planner invitation code'}
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={invitationCode}
                onChange={(event) => setInvitationCode(event.target.value)}
                placeholder={requestedRole === 'admin' ? 'Administrator activation code' : 'Planner invitation code'}
                autoComplete="one-time-code"
                className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white outline-none focus:border-blue-300/50"
              />
              <button
                type="button"
                disabled={!invitationCode.trim() || activating}
                onClick={activate}
                className="min-h-12 rounded-2xl bg-blue-500 px-5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {activating ? 'Verifying…' : `Activate ${requestedRole}`}
              </button>
            </div>
            {activationError && <p role="alert" className="mt-3 text-xs font-bold leading-relaxed text-red-200">{activationError}</p>}
          </div>
          <button
            type="button"
            onClick={onUseCommuter}
            className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-black uppercase tracking-widest text-white/70"
          >
            Use passenger workspace instead
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessLevelStrip({ accessLevel, profile }: { accessLevel: AccessLevel; profile: any }) {
  const label: Record<AccessLevel, string> = {
    public: 'Public visitor',
    guest: 'Guest session',
    verified: 'Verified passenger',
    operator: 'Approved operator',
    planner: 'Planner / authority',
    admin: 'AFAT command',
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-xs font-bold text-white/60 backdrop-blur-xl">
        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-200/60">Access level</span>
        <span className="ml-3 text-white">{label[accessLevel]}</span>
        {profile?.operator_application_status && normalizeAfatRole(profile?.role) !== 'operator' && (
          <span className="ml-3 text-amber-200">Operator application: {String(profile.operator_application_status).replace(/_/g, ' ')}</span>
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

  if (pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  if (watchMatch?.[1]) {
    return (
      <React.Suspense fallback={<WorkspaceLoading />}>
        <GuardianWatchPage token={decodeURIComponent(watchMatch[1])} />
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={<WorkspaceLoading />}>
      <AppShell />
    </React.Suspense>
  );
}

function AppShell() {
  const isLocalHost = isLoopbackHost(window.location.hostname);
  // Never allow URL parameters to unlock roles in a deployed build. Local review
  // is deliberately restricted to loopback hosts and remains protected by the
  // backend/RLS boundary for every persisted operation.
  const showDevOverride = isLocalHost && new URLSearchParams(window.location.search).get('devOverride') === '1';
  const isLocalReview = isLocalReviewAllowed(window.location.hostname, window.location.search);
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
      label: 'AFAT operations planner',
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
        is_verified: !!idData?.ids_number,
        is_active: typeof idData?.is_active === 'boolean' ? idData.is_active : role !== 'operator',
        operator_application_status: idData?.operator_application_status || (role === 'operator' ? 'UNDER_REVIEW' : null)
      });
      setLoading(false);
    };

    useEffect(() => {
      const localProfileId = localStorage.getItem('afat_local_user_id');
      const bootAuth = async () => {
        const supabaseSession = await getCurrentUser();
        if (supabaseSession.user?.id) {
          const profileResult = await ensureSupabaseEmailProfile({
            roleIntent: localStorage.getItem('afat_access_intent_role') || 'commuter',
          });
          if (profileResult.error) {
            setBootError(profileResult.error.message);
          }
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

        if (isLocalReview && localProfileId) {
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
          setUserRole(normalizeAfatRole(data.role));
          setBootError(null);

          const profileRole = normalizeAfatRole(data.role);
          const hasOnboarded = localStorage.getItem(`onboarded_${userId}_${profileRole}`);
          if (!hasOnboarded) {
            setShowOnboarding(true);
          }
        } else {
          setUserRole(null);
          setUserProfile(null);
          setBootError('AFAT verified the identity, but no server-authorized mobility profile could be loaded. Retry the requested access below.');
        }
      } catch (err) {
        setBootError('AFAT could not load the role profile. Reconnect or finish registration.');
      }
    };

    const handleSignOut = async () => {
      localStorage.removeItem('afat_local_user_id');
      localStorage.removeItem('afat_local_phone');
      localStorage.removeItem('afat_user_id');
      localStorage.removeItem('afat_access_level');
      localStorage.removeItem('afat_access_intent_role');
      sessionStorage.removeItem('afat_pending_access_code');
      sessionStorage.removeItem('afat_pending_admin_code');
      setLocalAuthUserId(null);
      setUserProfile(null);
      setUserRole(null);
      await signOut();
    };

    const handleOnboardingComplete = () => {
      if (sessionUser) {
        localStorage.setItem(`onboarded_${sessionUser.id}_${normalizeAfatRole(userProfile?.role)}`, 'true');
      }
      setShowOnboarding(false);
    };

    const activateControlledRole = async (role: 'operator' | 'planner' | 'admin', code: string) => {
      if (!code.trim()) return `Enter the ${role === 'admin' ? 'administrator activation' : `${role} invitation`} code.`;
      localStorage.setItem('afat_access_intent_role', role);
      sessionStorage.removeItem('afat_pending_access_code');
      sessionStorage.removeItem('afat_pending_admin_code');
      if (role === 'admin') {
        sessionStorage.setItem('afat_pending_admin_code', code.trim());
      } else {
        sessionStorage.setItem('afat_pending_access_code', code.trim());
      }

      const result = await ensureSupabaseEmailProfile({
        roleIntent: role,
        accessCode: role === 'admin' ? undefined : code.trim(),
        adminCode: role === 'admin' ? code.trim() : undefined,
      });
      if (result.error) return explainAuthError(result.error.message);

      const activatedProfile = result.data?.profile;
      if (!activatedProfile || normalizeAfatRole(activatedProfile.role) !== role) {
        return `AFAT verified the identity but did not grant ${role} authority. Check that this exact email is on the ${role} invitation list.`;
      }

      setUserProfile(activatedProfile);
      setUserRole(role);
      setBootError(null);
      setActiveTab('home');
      setShowOnboarding(!localStorage.getItem(`onboarded_${activatedProfile.id}_${role}`));
      return null;
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
          <div className="relative z-10 flex min-h-screen items-start justify-center px-4 py-6 sm:px-6 sm:py-10 lg:items-center">
            <main className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/82 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[0.85fr_1.15fr]">
              <section className="flex flex-col justify-between border-b border-white/10 bg-gradient-to-br from-blue-950/50 via-slate-950 to-slate-950 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div>
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <AFATLogo className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black uppercase italic tracking-tight text-white">AFAT Access</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Real onboarding. Real route intelligence.</p>
                </div>
              </div>

              <div className="mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200/60">One identity. The right workspace.</p>
                <h2 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">Move safely. Operate clearly.</h2>
                <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-white/65">
                  Commuters book and travel. Operators manage verified service. Planners and admins enter through controlled staff access.
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

              </div>
              <div className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-blue-100">No AFAT profile?</p>
                <p className="mt-2 text-xs leading-relaxed text-white/55">Start a commuter, operator, government-linked, or fleet intake. Approval controls remain separate.</p>
                <button
                  onClick={() => {
                    setRegistrationTrack('select');
                    setIsRegistrationHubOpen(true);
                  }}
                  className="mt-4 min-h-11 w-full rounded-2xl bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-950 transition active:scale-[0.98]"
                >
                  Start registration
                </button>
              </div>
              </section>

              <section className="p-4 sm:p-8">
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

              </section>
            </main>
          </div>
          <RegistrationHub
            isVisible={isRegistrationHubOpen}
            onClose={() => setIsRegistrationHubOpen(false)}
            initialTrack={registrationTrack}
            prefillPhone={localStorage.getItem('afat_access_phone') || localStorage.getItem('afat_local_phone') || ''}
            hasAuthenticatedSession={false}
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
      const accessLevel = getAccessLevel(userProfile, sessionUser);
      const effectiveRole = normalizeAfatRole(userRole);
      const intendedRole = localStorage.getItem('afat_access_intent_role') || effectiveRole;
      const wantsOperatorConsole = effectiveRole === 'operator' || intendedRole === 'operator';
      if (wantsOperatorConsole && (effectiveRole !== 'operator' || !canUseOperatorConsole(userProfile) || hasOperatorApplication(userProfile))) {
        return (
          <OperatorAccessPending
            profile={userProfile}
            onRegister={() => {
              setRegistrationTrack('citizen_reg');
              setIsRegistrationHubOpen(true);
            }}
            onRedeem={(code) => activateControlledRole('operator', code)}
            onUseCommuter={() => {
              localStorage.setItem('afat_access_intent_role', 'commuter');
              setUserRole('commuter');
              setActiveTab('home');
            }}
          />
        );
      }
      if (effectiveRole === 'commuter' && (intendedRole === 'planner' || intendedRole === 'admin')) {
        return (
          <RestrictedAccessPending
            requestedRole={intendedRole as 'planner' | 'admin'}
            onActivate={(code) => activateControlledRole(intendedRole as 'planner' | 'admin', code)}
            onUseCommuter={() => {
              localStorage.setItem('afat_access_intent_role', 'commuter');
              setUserRole('commuter');
              setActiveTab('home');
            }}
          />
        );
      }

      switch (effectiveRole) {
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

    const effectiveRoleForFrame = normalizeAfatRole(userRole);
    const intendedRoleForFrame = localStorage.getItem('afat_access_intent_role') || effectiveRoleForFrame;
    const controlledAccessPending = Boolean(
      userProfile && (
        (effectiveRoleForFrame === 'commuter' && (intendedRoleForFrame === 'planner' || intendedRoleForFrame === 'admin')) ||
        ((effectiveRoleForFrame === 'operator' || intendedRoleForFrame === 'operator') &&
          ((effectiveRoleForFrame === 'operator' && !canUseOperatorConsole(userProfile)) || hasOperatorApplication(userProfile)))
      )
    );

    return (
      <div className="min-h-screen flex flex-col sentinel-bg text-white selection:bg-blue-500/30">
        <div className="mesh-gradient" />
        <div className="relative z-10 flex-1 flex flex-col">
          {!controlledAccessPending && <AccessLevelStrip accessLevel={getAccessLevel(userProfile, sessionUser)} profile={userProfile} />}
          {!controlledAccessPending && renderRoleFrame()}
          {renderDashboard()}
        </div>
        {!controlledAccessPending && <BottomNav role={normalizeAfatRole(userRole) as any} activeTab={activeTab} onTabChange={setActiveTab} />}
        {showDevOverride && renderRoleToggle()}
        {!controlledAccessPending && <RoleOnboarding
          role={normalizeAfatRole(userRole) as any}
          profile={userProfile}
          isVisible={showOnboarding}
          onClose={handleOnboardingComplete}
        />}
        <RegistrationHub
          isVisible={isRegistrationHubOpen}
          onClose={() => setIsRegistrationHubOpen(false)}
          initialTrack={registrationTrack}
          prefillPhone={localStorage.getItem('afat_access_phone') || localStorage.getItem('afat_local_phone') || ''}
          hasAuthenticatedSession={Boolean(sessionUser)}
          onRegisterCustom={(data) => {
            if (data?.id) {
              localStorage.setItem('afat_local_user_id', data.id);
              setLocalAuthUserId(data.id);
            }
            forceRole(data.role, data.vehicleType, data);
          }}
        />
        {!controlledAccessPending && <AICopilot userName={userProfile?.full_name || 'User'} userRole={normalizeAfatRole(userRole)} />}
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
