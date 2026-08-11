import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import {
  acceptAfatStaffInvitation,
  bootstrapAfatFounder,
  getAfatAccessSnapshot,
  setAfatFounderPass,
  supabase,
} from '../../supabaseClient';
import { AFATLogo } from '../shared/AFATLogo';

type ActivationMode = 'founder' | 'staff';
type MfaMode = 'checking' | 'ready' | 'challenge' | 'enroll';

export function AccessActivationPage({ mode }: { mode: ActivationMode }) {
  const [{ invitationId, invitationToken }] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get('invitation') || sessionStorage.getItem('afat_staff_invitation_id') || '';
    const token = query.get('token') || sessionStorage.getItem('afat_staff_invitation_token') || '';
    if (id && token) {
      sessionStorage.setItem('afat_staff_invitation_id', id);
      sessionStorage.setItem('afat_staff_invitation_token', token);
    }
    return { invitationId: id, invitationToken: token };
  });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [mfaMode, setMfaMode] = useState<MfaMode>('checking');
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [founderPass, setFounderPass] = useState('');
  const [founderPassConfirmation, setFounderPassConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (mode === 'staff' && window.location.search) {
      window.history.replaceState({}, '', '/staff/invite');
    }
    const inspectSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      const session = sessionData.session;
      setSignedIn(Boolean(session?.user));
      setEmail(session?.user?.email || '');
      if (!session?.user) {
        setMfaMode('checking');
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (aal?.currentLevel === 'aal2') {
        setMfaMode('ready');
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verifiedFactor = factors?.totp?.find((factor) => factor.status === 'verified');
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setMfaMode('challenge');
      } else {
        setMfaMode('enroll');
      }
    };

    inspectSession().catch((reason) => {
      if (active) setError(reason?.message || 'AFAT could not inspect this secure session.');
    });
    return () => {
      active = false;
    };
  }, []);

  const beginMfaEnrollment = async () => {
    setBusy(true);
    setError('');
    const { data, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: mode === 'founder' ? 'AFAT Founder' : 'AFAT Staff',
    });
    setBusy(false);
    if (enrollmentError || !data?.id) {
      setError(enrollmentError?.message || 'AFAT could not start authenticator enrollment.');
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setTotpSecret(data.totp.secret);
  };

  const confirmMfa = async () => {
    if (!factorId || verificationCode.trim().length < 6) {
      setError('Enter the current six-digit authenticator code.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: verificationCode.trim(),
    });
    if (!verificationError) await supabase.auth.refreshSession();
    setBusy(false);
    if (verificationError) {
      setError(verificationError.message || 'Authenticator verification failed.');
      return;
    }
    setVerificationCode('');
    setMfaMode('ready');
    setMessage('Authenticator verification complete. This session is now AAL2.');
  };

  const activateStaff = async () => {
    if (!invitationId || !invitationToken) {
      setError('This invitation link is incomplete. Ask the inviter to issue a new AFAT invitation.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await acceptAfatStaffInvitation(invitationId, invitationToken);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    sessionStorage.removeItem('afat_staff_invitation_id');
    sessionStorage.removeItem('afat_staff_invitation_token');
    setMessage('Staff access activated. AFAT is loading your assigned workspace.');
    window.setTimeout(() => window.location.replace('/'), 900);
  };

  const activateFounder = async () => {
    if (founderPass.length < 14 || founderPass !== founderPassConfirmation) {
      setError('Founder Pass must be at least 14 characters and both entries must match.');
      return;
    }
    setBusy(true);
    setError('');
    const snapshot = await getAfatAccessSnapshot();
    const alreadyFounder = snapshot.data?.access?.assignments?.some((assignment: any) => assignment.role_key === 'founder_owner');
    if (!alreadyFounder) {
      if (!bootstrapCode.trim()) {
        setBusy(false);
        setError(snapshot.error?.message || 'Enter the one-time Founder bootstrap code configured on the server.');
        return;
      }
      const bootstrap = await bootstrapAfatFounder(bootstrapCode.trim());
      if (bootstrap.error) {
        setBusy(false);
        setError(bootstrap.error.message);
        return;
      }
    }
    const passResult = await setAfatFounderPass(founderPass);
    setBusy(false);
    if (passResult.error) {
      setError(`Founder authority was established, but Founder Pass setup needs attention: ${passResult.error.message}`);
      return;
    }
    setBootstrapCode('');
    setFounderPass('');
    setFounderPassConfirmation('');
    setMessage('Founder authority and Founder Pass are active. AFAT is opening Command access.');
    window.setTimeout(() => window.location.replace('/'), 900);
  };

  const isReady = signedIn && mfaMode === 'ready';
  const heading = mode === 'founder' ? 'Founder bootstrap' : 'Staff activation';

  return (
    <main className="min-h-screen sentinel-bg px-5 py-10 text-white">
      <div className="mesh-gradient" />
      <section className="relative z-10 mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/85 p-7 shadow-ambient-float backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <AFATLogo className="h-11 w-11" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-200/60">Protected identity ceremony</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight">{heading}</h1>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
          <p><span className="font-black text-white">1.</span> Use the invited or configured email.</p>
          <p className="mt-2"><span className="font-black text-white">2.</span> Complete authenticator MFA.</p>
          <p className="mt-2"><span className="font-black text-white">3.</span> Activate only the server-authorized role and scope.</p>
        </div>

        {signedIn === false && (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
            <p className="text-sm font-bold text-amber-100">No Supabase session is active.</p>
            <p className="mt-2 text-xs leading-relaxed text-white/55">Open the original invitation email again, or sign in with the configured email and return to this protected URL.</p>
            <button type="button" onClick={() => {
              sessionStorage.setItem('afat_post_auth_redirect', mode === 'staff' ? '/staff/invite' : '/founder/bootstrap');
              window.location.assign('/');
            }} className="mt-4 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950">
              Go to AFAT sign-in
            </button>
          </div>
        )}

        {signedIn && (
          <div className="mt-6">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200/60">Signed-in identity</p>
                <p className="mt-1 text-sm font-bold text-white">{email || 'Verified AFAT identity'}</p>
              </div>
            </div>

            {mfaMode !== 'ready' && (
              <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-5">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-blue-200" />
                  <p className="text-sm font-black uppercase tracking-tight">Authenticator MFA required</p>
                </div>
                {mfaMode === 'enroll' && !factorId && (
                  <button type="button" disabled={busy} onClick={beginMfaEnrollment} className="mt-4 rounded-xl bg-blue-500 px-4 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-50">
                    Set up authenticator
                  </button>
                )}
                {qrCode && <img src={qrCode} alt="AFAT authenticator QR code" className="mt-4 w-full max-w-56 rounded-xl bg-white p-3" />}
                {totpSecret && <p className="mt-3 break-all rounded-xl bg-slate-950/60 p-3 font-mono text-xs text-white/70">{totpSecret}</p>}
                {factorId && (
                  <div className="mt-4 flex gap-2">
                    <input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none focus:border-blue-300/50" />
                    <button type="button" disabled={busy} onClick={confirmMfa} className="rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">Verify</button>
                  </div>
                )}
              </div>
            )}

            {isReady && mode === 'founder' && (
              <div className="mt-5 grid gap-3">
                <input type="password" value={bootstrapCode} onChange={(event) => setBootstrapCode(event.target.value)} autoComplete="off" placeholder="One-time bootstrap code" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-cyan-300/50" />
                <input type="password" value={founderPass} onChange={(event) => setFounderPass(event.target.value)} autoComplete="new-password" placeholder="Create Founder Pass (14+ characters)" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-cyan-300/50" />
                <input type="password" value={founderPassConfirmation} onChange={(event) => setFounderPassConfirmation(event.target.value)} autoComplete="new-password" placeholder="Confirm Founder Pass" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-cyan-300/50" />
                <button type="button" disabled={busy} onClick={activateFounder} className="rounded-xl bg-cyan-500 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">Establish Founder authority</button>
              </div>
            )}

            {isReady && mode === 'staff' && (
              <button type="button" disabled={busy} onClick={activateStaff} className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">
                Activate assigned staff access
              </button>
            )}
          </div>
        )}

        {message && <p className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{message}</p>}
        {error && <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</p>}
      </section>
    </main>
  );
}
