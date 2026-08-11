import crypto from 'crypto';
import { promisify } from 'util';
import { Request } from 'express';
import { supabase } from '../infra/supabase';

const scryptAsync = promisify(crypto.scrypt);

export type AuthenticatedIdentity = {
  id: string;
  email: string;
  aal: 'aal1' | 'aal2';
  emailConfirmed: boolean;
  isAnonymous: boolean;
};

type AccessAssignment = {
  id: string;
  role_key: string;
  company_id: string | null;
  status: string;
  expires_at: string | null;
};

function bearerToken(req: Request) {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function requestContext(req: Request) {
  return {
    ip: req.ip || null,
    user_agent: req.headers['user-agent'] || null,
    request_id: req.headers['x-request-id'] || null,
  };
}

export async function requireSupabaseIdentity(req: Request): Promise<AuthenticatedIdentity> {
  if (!String(process.env.SUPABASE_SECRET_KEY || '').trim()) {
    throw new AccessControlError(503, 'AFAT access authority requires the server-only Supabase secret key.');
  }
  const token = bearerToken(req);
  if (!token) throw new AccessControlError(401, 'Supabase session required.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) throw new AccessControlError(401, 'Invalid or expired Supabase session.');

  const claims = jwtPayload(token);
  return {
    id: data.user.id,
    email: String(data.user.email || '').trim().toLowerCase(),
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    emailConfirmed: Boolean((data.user as any).email_confirmed_at),
    isAnonymous: Boolean((data.user as any).is_anonymous || claims.is_anonymous),
  };
}

export class AccessControlError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function activeAssignments(profileId: string): Promise<AccessAssignment[]> {
  const { data, error } = await supabase
    .from('profile_role_assignments')
    .select('id, role_key, company_id, status, expires_at')
    .eq('profile_id', profileId)
    .eq('status', 'active');
  if (error) throw error;
  const now = Date.now();
  return ((data || []) as AccessAssignment[]).filter((assignment) => (
    !assignment.expires_at || new Date(assignment.expires_at).getTime() > now
  ));
}

export async function hasAccessPermission(
  identity: AuthenticatedIdentity,
  permissionKey: string,
  companyId?: string | null,
) {
  const { data: permission, error: permissionError } = await supabase
    .from('access_permissions')
    .select('permission_key, requires_aal2')
    .eq('permission_key', permissionKey)
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission) return false;
  if (permission.requires_aal2 && identity.aal !== 'aal2') return false;

  const assignments = await activeAssignments(identity.id);
  if (assignments.some((assignment) => assignment.role_key === 'founder_owner')) return true;

  const { data: capabilityOverride, error: overrideError } = await supabase
    .from('profile_capability_overrides')
    .select('allowed, expires_at')
    .eq('profile_id', identity.id)
    .eq('permission_key', permissionKey)
    .maybeSingle();
  if (overrideError) throw overrideError;
  if (capabilityOverride && (!capabilityOverride.expires_at || new Date(capabilityOverride.expires_at).getTime() > Date.now())) {
    return Boolean(capabilityOverride.allowed);
  }

  const scopedAssignments = assignments.filter((assignment) => (
    !companyId || !assignment.company_id || assignment.company_id === companyId
  ));
  const roleKeys = [...new Set(scopedAssignments.map((assignment) => assignment.role_key))];
  if (!roleKeys.length) return false;

  const { data: granted, error: grantError } = await supabase
    .from('access_role_permissions')
    .select('role_key')
    .eq('permission_key', permissionKey)
    .in('role_key', roleKeys)
    .limit(1);
  if (grantError) throw grantError;
  return Boolean(granted?.length);
}

export async function requireAccessPermission(
  identity: AuthenticatedIdentity,
  permissionKey: string,
  companyId?: string | null,
) {
  if (!(await hasAccessPermission(identity, permissionKey, companyId))) {
    const suffix = identity.aal === 'aal2' ? '' : ' Complete MFA if this is a privileged action.';
    throw new AccessControlError(403, `AFAT permission denied: ${permissionKey}.${suffix}`);
  }
}

export async function bootstrapFounder(
  identity: AuthenticatedIdentity,
  bootstrapCode: string,
  context: Record<string, unknown>,
) {
  const configuredEmail = String(process.env.AFAT_FOUNDER_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const configuredTokenHash = String(process.env.AFAT_FOUNDER_BOOTSTRAP_TOKEN_HASH || '').trim().toLowerCase();

  if (!configuredEmail || !configuredTokenHash) {
    throw new AccessControlError(503, 'Founder bootstrap is not configured on this server.');
  }
  if (!identity.emailConfirmed || !identity.email || identity.email !== configuredEmail) {
    throw new AccessControlError(403, 'The signed-in verified email is not the configured Founder bootstrap identity.');
  }
  if (identity.aal !== 'aal2') {
    throw new AccessControlError(403, 'Founder bootstrap requires authenticator MFA (AAL2).');
  }
  if (!bootstrapCode || !timingSafeHexEqual(sha256(bootstrapCode), configuredTokenHash)) {
    throw new AccessControlError(403, 'Invalid Founder bootstrap code.');
  }

  const { data, error } = await supabase.rpc('afat_bootstrap_founder', {
    p_profile_id: identity.id,
    p_email: identity.email,
    p_request_context: context,
  });
  if (error) throw new AccessControlError(409, error.message);
  return { assignmentId: data };
}

async function founderAssignment(profileId: string) {
  const { data, error } = await supabase
    .from('profile_role_assignments')
    .select('id')
    .eq('profile_id', profileId)
    .eq('role_key', 'founder_owner')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function deriveFounderPass(passphrase: string, salt: Buffer) {
  return (await scryptAsync(passphrase, salt, 64)) as Buffer;
}

export async function setFounderPass(identity: AuthenticatedIdentity, passphrase: string, context: Record<string, unknown>) {
  if (identity.aal !== 'aal2') throw new AccessControlError(403, 'Founder Pass setup requires AAL2.');
  if (!(await founderAssignment(identity.id))) throw new AccessControlError(403, 'Founder authority required.');
  if (passphrase.length < 14 || passphrase.length > 200) {
    throw new AccessControlError(400, 'Founder Pass must contain between 14 and 200 characters.');
  }

  const salt = crypto.randomBytes(32);
  const hash = await deriveFounderPass(passphrase, salt);
  const { error } = await supabase.from('founder_credentials').upsert({
    profile_id: identity.id,
    pass_salt: salt.toString('base64'),
    pass_hash: hash.toString('base64'),
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' });
  if (error) throw error;

  await supabase.from('access_audit_events').insert({
    actor_profile_id: identity.id,
    event_type: 'founder.pass.configured',
    target_type: 'profile',
    target_id: identity.id,
    reason: 'Founder Pass created or rotated after AAL2 verification',
    request_context: context,
  });
}

export async function verifyFounderPass(identity: AuthenticatedIdentity, passphrase: string, context: Record<string, unknown>) {
  if (identity.aal !== 'aal2') throw new AccessControlError(403, 'Founder Pass verification requires AAL2.');
  if (!(await founderAssignment(identity.id))) throw new AccessControlError(403, 'Founder authority required.');

  const { data: credential, error } = await supabase
    .from('founder_credentials')
    .select('pass_salt, pass_hash, failed_attempts, locked_until')
    .eq('profile_id', identity.id)
    .maybeSingle();
  if (error) throw error;
  if (!credential) throw new AccessControlError(409, 'Founder Pass has not been configured.');
  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) {
    throw new AccessControlError(429, 'Founder Pass is temporarily locked after repeated failures.');
  }

  const expected = Buffer.from(credential.pass_hash, 'base64');
  const actual = await deriveFounderPass(passphrase, Buffer.from(credential.pass_salt, 'base64'));
  const verified = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!verified) {
    const failedAttempts = Number(credential.failed_attempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await supabase.from('founder_credentials').update({
      failed_attempts: failedAttempts,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }).eq('profile_id', identity.id);
    await supabase.from('access_audit_events').insert({
      actor_profile_id: identity.id,
      event_type: 'founder.pass.failed',
      target_type: 'profile',
      target_id: identity.id,
      reason: 'Founder Pass verification failed',
      request_context: context,
    });
    throw new AccessControlError(403, 'Founder Pass verification failed.');
  }

  await supabase.from('founder_credentials').update({
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  }).eq('profile_id', identity.id);
  await supabase.from('access_audit_events').insert({
    actor_profile_id: identity.id,
    event_type: 'founder.pass.verified',
    target_type: 'profile',
    target_id: identity.id,
    reason: 'Founder confirmed a protected command',
    request_context: context,
  });
  return true;
}

function normalizeScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) return [];
  const allowedTypes = new Set(['platform', 'organization', 'country', 'region', 'city', 'district', 'corridor', 'route', 'terminal', 'resource']);
  return scopes.slice(0, 30).map((scope: any) => ({
    type: String(scope?.type || '').trim().toLowerCase(),
    value: String(scope?.value || '').trim(),
  })).filter((scope) => allowedTypes.has(scope.type) && scope.value && scope.value.length <= 160);
}

export async function createStaffInvitation(
  identity: AuthenticatedIdentity,
  input: { email: string; roleKey: string; companyId?: string | null; scopes?: unknown; reason?: string },
  context: Record<string, unknown>,
) {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AccessControlError(400, 'A valid staff email is required.');
  if (input.companyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.companyId)) {
    throw new AccessControlError(400, 'Organization scope must be a valid UUID.');
  }
  await requireAccessPermission(identity, 'access.staff.invite', input.companyId);

  const assignments = await activeAssignments(identity.id);
  const actorRoleKeys = assignments.map((assignment) => assignment.role_key);
  const { data: actorRoles, error: actorRoleError } = await supabase
    .from('access_role_definitions')
    .select('role_key, grant_ceiling')
    .in('role_key', actorRoleKeys);
  if (actorRoleError) throw actorRoleError;
  const actorCeiling = Math.max(0, ...(actorRoles || []).map((role: any) => Number(role.grant_ceiling || 0)));

  const { data: targetRole, error: targetRoleError } = await supabase
    .from('access_role_definitions')
    .select('role_key, role_family, privilege_rank, staff_only')
    .eq('role_key', input.roleKey)
    .maybeSingle();
  if (targetRoleError) throw targetRoleError;
  if (!targetRole?.staff_only) throw new AccessControlError(400, 'This role is not assigned through staff invitation.');
  if (targetRole.role_family === 'organization' && !input.companyId) {
    throw new AccessControlError(400, 'Organization staff invitations require an organization scope.');
  }
  if (targetRole.role_key === 'founder_owner' || Number(targetRole.privilege_rank) > actorCeiling) {
    throw new AccessControlError(403, 'The requested role exceeds your grant ceiling.');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(rawToken);
  const scopes = normalizeScopes(input.scopes);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60_000).toISOString();
  const { data: invitation, error: invitationError } = await supabase
    .from('staff_invitations')
    .insert({
      email,
      role_key: input.roleKey,
      company_id: input.companyId || null,
      invited_by: identity.id,
      status: 'pending',
      token_hash: tokenHash,
      requested_scopes: scopes,
      invitation_context: { reason: input.reason || null },
      expires_at: expiresAt,
    })
    .select('id, email, role_key, company_id, status, expires_at')
    .single();
  if (invitationError) throw invitationError;

  const frontendUrl = String(process.env.FRONTEND_URL || 'https://asteck-bot.pages.dev').replace(/\/$/, '');
  const redirectTo = `${frontendUrl}/staff/invite?invitation=${encodeURIComponent(invitation.id)}&token=${encodeURIComponent(rawToken)}`;
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { afat_invitation_id: invitation.id },
  });

  if (inviteError) {
    await supabase.from('staff_invitations').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', invitation.id);
    throw new AccessControlError(502, `Staff invitation could not be delivered: ${inviteError.message}`);
  }

  await supabase.from('staff_invitations').update({
    status: 'sent',
    updated_at: new Date().toISOString(),
  }).eq('id', invitation.id);
  await supabase.from('access_audit_events').insert({
    actor_profile_id: identity.id,
    event_type: 'staff.invitation.sent',
    target_type: 'staff_invitation',
    target_id: invitation.id,
    company_id: input.companyId || null,
    reason: input.reason || 'Protected staff invitation',
    new_state: { email, role_key: input.roleKey, scopes, expires_at: expiresAt },
    request_context: context,
  });

  return { ...invitation, status: 'sent' };
}

export async function acceptStaffInvitation(
  identity: AuthenticatedIdentity,
  invitationId: string,
  rawToken: string,
  context: Record<string, unknown>,
) {
  if (!identity.emailConfirmed || !identity.email) throw new AccessControlError(403, 'A confirmed email is required.');
  if (identity.aal !== 'aal2') throw new AccessControlError(403, 'Staff activation requires authenticator MFA (AAL2).');
  const { data, error } = await supabase.rpc('afat_accept_staff_invitation', {
    p_invitation_id: invitationId,
    p_profile_id: identity.id,
    p_email: identity.email,
    p_token_hash: sha256(rawToken),
    p_request_context: context,
  });
  if (error) throw new AccessControlError(409, error.message);
  return { assignmentId: data };
}

export async function accessSnapshot(identity: AuthenticatedIdentity) {
  const assignments = await activeAssignments(identity.id);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const roleKeys = [...new Set(assignments.map((assignment) => assignment.role_key))];
  const [scopeResult, clearanceResult, permissionResult] = await Promise.all([
    assignmentIds.length
      ? supabase.from('access_scopes').select('assignment_id, scope_type, scope_value').in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('clearance_records').select('*').eq('profile_id', identity.id),
    roleKeys.length
      ? supabase.from('access_role_permissions').select('role_key, permission_key').in('role_key', roleKeys)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scopeResult.error) throw scopeResult.error;
  if (clearanceResult.error) throw clearanceResult.error;
  if (permissionResult.error) throw permissionResult.error;

  const permissions = new Set((permissionResult.data || []).map((item: any) => item.permission_key));
  if (roleKeys.includes('founder_owner')) permissions.add('*');
  return {
    identity: { id: identity.id, email: identity.email, aal: identity.aal, isAnonymous: identity.isAnonymous },
    assignments,
    scopes: scopeResult.data || [],
    clearances: clearanceResult.data || [],
    permissions: [...permissions].sort(),
  };
}
