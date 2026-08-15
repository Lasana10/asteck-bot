import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { createAfatStaffInvitation, getAfatAccessSnapshot, supabase } from '../../supabaseClient';

type StaffRole = {
  role_key: string;
  display_name: string;
  role_family: string;
};

export function StaffInvitationPanel() {
  const [authorized, setAuthorized] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('afat_operational_planner');
  const [companyId, setCompanyId] = useState('');
  const [scopeType, setScopeType] = useState('country');
  const [scopeValue, setScopeValue] = useState('Cameroon');
  const [reason, setReason] = useState('AFAT controlled staff activation');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [snapshot, roleResult] = await Promise.all([
        getAfatAccessSnapshot(),
        supabase
          .from('access_role_definitions')
          .select('role_key, display_name, role_family')
          .eq('staff_only', true)
          .neq('role_key', 'founder_owner')
          .order('privilege_rank'),
      ]);
      if (!active) return;
      const permissions = snapshot.data?.access?.permissions || [];
      setAuthorized(permissions.includes('*') || permissions.includes('access.staff.invite'));
      if (!roleResult.error) setRoles((roleResult.data || []) as StaffRole[]);
    };
    load().catch(() => setAuthorized(false));
    return () => {
      active = false;
    };
  }, []);

  if (!authorized) return null;

  const selectedRole = roles.find((role) => role.role_key === roleKey);
  const organizationScopeRequired = selectedRole?.role_family === 'organization';

  const sendInvitation = async () => {
    if (!email.trim() || (organizationScopeRequired && !companyId.trim())) {
      setError(organizationScopeRequired ? 'Email and organization ID are required for this role.' : 'Staff email is required.');
      return;
    }
    setBusy(true);
    setError('');
    setFeedback('');
    const result = await createAfatStaffInvitation({
      email: email.trim(),
      roleKey,
      companyId: companyId.trim() || null,
      scopes: scopeValue.trim() ? [{ type: scopeType, value: scopeValue.trim() }] : [],
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEmail('');
    setFeedback(`Protected invitation sent to ${result.data?.invitation?.email || 'the staff identity'}. It expires in 72 hours and requires MFA.`);
  };

  return (
    <section className="rounded-[2rem] border border-cyan-400/20 bg-cyan-500/[0.06] p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3"><UserPlus className="h-5 w-5 text-cyan-200" /></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-200/60">Identity & access</p>
          <h2 className="mt-1 text-xl font-black uppercase italic tracking-tight text-white">Invite scoped staff</h2>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-white/45">The recipient must use this email, complete authenticator MFA, and accept before any role becomes active. Server grant ceilings remain authoritative.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Staff email" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" />
        <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50">
          {roles.map((role) => <option key={role.role_key} value={role.role_key}>{role.display_name}</option>)}
        </select>
        <input value={companyId} onChange={(event) => setCompanyId(event.target.value)} placeholder={organizationScopeRequired ? 'Organization UUID (required)' : 'Organization UUID (optional)'} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" />
        <select value={scopeType} onChange={(event) => setScopeType(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50">
          {['platform', 'country', 'region', 'city', 'district', 'corridor', 'route', 'terminal', 'resource'].map((scope) => <option key={scope} value={scope}>{scope}</option>)}
        </select>
        <input value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder="Scope value" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" />
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Invitation reason" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" />
      </div>
      <button type="button" disabled={busy || !roles.length} onClick={sendInvitation} className="mt-4 rounded-2xl bg-cyan-400 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">Send protected invitation</button>
      {feedback ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-100">{feedback}</p> : null}
      {error ? <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-xs font-bold text-red-100">{error}</p> : null}
    </section>
  );
}
