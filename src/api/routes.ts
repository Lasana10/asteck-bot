import {reviewedSafetyFeed,urgentReviewedAlerts,incidentReviewLabel} from '../services/reviewedSafetyProjection';
import {validateScheduleDraft} from '../services/scheduledDeparturePublishing';
import {departureWithdrawalEligibility} from '../services/operatorDepartureOperations';
import {projectPublishedDepartures} from '../services/publishedDepartureTruth';
import express, { Request, Response } from 'express';
import { createIncident, getActiveIncidents, supabase } from '../infra/supabase';
import { IncidentType, Severity } from '../types';
import { waBridge } from '../services/WhatsAppBridge';
import crypto from 'crypto';
import { dnaQueue } from '../services/QueueService';
import { aiRouter } from '../services/AIRouter';
import { brainService } from '../services/brain';
import { PaymentService } from '../services/payment';
import { ArkeselClient } from '../infra/arkesel';
import { TermiiClient } from '../infra/termii';
import { NotificationChannel, NotificationService } from '../services/NotificationService';

const router = express.Router();
const ticketSecret = process.env.TICKET_SIGNING_SECRET;
const authSecret = process.env.AFAT_AUTH_SECRET || process.env.TICKET_SIGNING_SECRET;
const paymentService = new PaymentService();

function requireConfiguredSecret(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is not configured on AFAT backend.`);
  return value;
}

function signTicketPayload(payload: string) {
  return crypto.createHmac('sha256', requireConfiguredSecret(ticketSecret, 'TICKET_SIGNING_SECRET')).update(payload).digest('hex');
}

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function signLocalAuth(payload: Record<string, any>) {
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', requireConfiguredSecret(authSecret, 'AFAT_AUTH_SECRET')).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function verifyLocalAuth(token?: string) {
  // Local AFAT tokens are optional when Supabase owns the browser session.
  // Never pass an undefined signing key into createHmac: that used to turn a
  // valid Supabase request into a 500 before getAuthProfileByToken could fall
  // back to Supabase verification.
  if (!authSecret || !token || !token.includes('.')) return null;
  try {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function authPayloadFromRequest(req: Request) {
  const header = req.headers.authorization || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : undefined;
  return verifyLocalAuth(token);
}

function bearerTokenFromRequest(req: Request) {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function normalizeAuthPhone(phone: string) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.startsWith('237')) return `+${digits}`;
  return `+237${digits.replace(/^0+/, '')}`;
}

function otpProviderMode() {
  const configured = String(process.env.OTP_PROVIDER || '').trim().toLowerCase();
  if (configured === 'termii') return 'termii';
  if (configured === 'arkesel') return 'arkesel';
  if (TermiiClient.isConfigured()) return 'termii';
  if (Boolean(process.env.ARKESEL_API_KEY)) return 'arkesel';
  return 'development';
}

type ControlledAccessRole = 'operator' | 'planner' | 'admin';

function controlledAccessConfig(role: ControlledAccessRole) {
  const prefix = role === 'operator'
    ? 'AFAT_OPERATOR_INVITE'
    : role === 'planner'
      ? 'AFAT_PLANNER_INVITE'
      : 'AFAT_ADMIN_BOOTSTRAP';
  const code = String(process.env[`${prefix}_CODE`] || '').trim();
  const emails = String(process.env[`${prefix}_EMAILS`] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const phones = String(process.env[`${prefix}_PHONES`] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeAuthPhone);
  return { code, emails, phones };
}

function matchesControlledCode(expected: string, provided: string) {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function controlledRoleApproval(role: string, identity: { email?: string; phone?: string }, providedCode: string) {
  if (!['operator', 'planner', 'admin'].includes(role)) return false;
  const config = controlledAccessConfig(role as ControlledAccessRole);
  if (!config.code || !providedCode || !matchesControlledCode(config.code, providedCode)) return false;

  const emailAllowed = Boolean(identity.email && config.emails.includes(identity.email.trim().toLowerCase()));
  const phoneAllowed = Boolean(identity.phone && config.phones.includes(normalizeAuthPhone(identity.phone)));
  return emailAllowed || phoneAllowed;
}

function controlledRoleFailure(role: ControlledAccessRole, identity: { email?: string; phone?: string }, providedCode: string) {
  const config = controlledAccessConfig(role);
  const label = role === 'admin' ? 'administrator activation' : `${role} invitation`;
  if (!config.code) {
    return { code: 'CONTROLLED_ACCESS_NOT_CONFIGURED', error: `The ${label} path is not configured on the AFAT backend.` };
  }
  if (!providedCode) {
    return { code: 'CONTROLLED_ACCESS_CODE_REQUIRED', error: `Enter the ${label} code, or sign in through the ${role} workspace if this account has already been activated.` };
  }
  if (!matchesControlledCode(config.code, providedCode)) {
    return { code: 'CONTROLLED_ACCESS_CODE_INVALID', error: `The ${label} code is incorrect.` };
  }
  return {
    code: 'CONTROLLED_ACCESS_IDENTITY_DENIED',
    error: `This signed-in identity is not invited to the ${role} workspace. Sign out and use the email that AFAT invited for this role.`,
  };
}

function qaBypassAllowed(req: Request) {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.AFAT_ALLOW_QA_BYPASS === 'true') return true;
  const host = String(req.headers.origin || req.headers.referer || '').toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1');
}

async function verifyTurnstileToken(req: Request, action: string) {
  const secret = process.env.TURNSTILE_SECRET;
  const expectedHostnames = new Set(
    String(process.env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean)
  );
  const token = String(req.body?.turnstileToken || req.body?.['cf-turnstile-response'] || '').trim();

  if (!secret) return { ok: false, status: 503, error: 'Turnstile secret is not configured on AFAT backend.' };
  if (!token || token.length > 2048) return { ok: false, status: 403, error: 'Turnstile verification token is required.' };
  if (!expectedHostnames.size) return { ok: false, status: 503, error: 'Turnstile hostname allowlist is not configured.' };

  try {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const remoteip = forwarded || req.socket.remoteAddress || undefined;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      }),
    });

    if (!response.ok) return { ok: false, status: 403, error: `Turnstile siteverify failed with ${response.status}.` };
    const result: any = await response.json();
    if (!result.success) return { ok: false, status: 403, error: 'Turnstile challenge was not accepted.' };
    if (result.action !== action) return { ok: false, status: 403, error: 'Turnstile action mismatch.' };
    if (!expectedHostnames.has(result.hostname)) return { ok: false, status: 403, error: 'Turnstile hostname mismatch.' };
    return { ok: true, status: 200, result };
  } catch (error: any) {
    return { ok: false, status: 403, error: error.message || 'Turnstile verification failed.' };
  }
}

function issueAccessToken(profile: any, phone: string) {
  // A Supabase-authenticated request does not require a second AFAT token.
  // Return no local token when its signing secret is unavailable so profile
  // activation can still complete and the client can use its Supabase JWT.
  if (!authSecret) return null;
  return signLocalAuth({
    sub: profile.id,
    phone,
    role: profile.role || 'commuter',
    exp: Date.now() + 1000 * 60 * 15,
  });
}

async function issueRefreshSession(profile: any, phone: string, req: Request) {
  const refreshToken = generateOpaqueToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  const { data: session, error } = await supabase
    .from('auth_refresh_sessions')
    .insert({
      profile_id: profile.id,
      phone,
      refresh_token_hash: refreshTokenHash,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 512) || null,
      ip_address: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 128) || null,
      expires_at: expiresAt,
      last_used_at: new Date().toISOString(),
    })
    .select('id, expires_at')
    .single();

  if (error) throw error;
  return { refreshToken, session };
}

export async function getAuthProfileByToken(req: Request) {
  const token = bearerTokenFromRequest(req);
  if (!token) return { auth: null, profile: null };

  let auth = verifyLocalAuth(token);
  if (!auth?.sub) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) return { auth: null, profile: null };
    auth = {
      sub: data.user.id,
      email: data.user.email || null,
      provider: 'supabase',
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.sub)
    .maybeSingle();
  return { auth, profile };
}

function mobilityErrorStatus(error: any) {
  const message = String(error?.message || '');
  if (/NOT_FOUND/.test(message)) return 404;
  if (/REQUIRED|INVALID/.test(message)) return 400;
  if (/NOT_AVAILABLE|NOT_BOOKABLE|ALREADY|HELD|EXPIRED|STATE|BOARDABLE|IN_PROGRESS/.test(message)) return 409;
  return 500;
}

async function getActiveRoleAssignments(profileId: string) {
  const { data, error } = await supabase
    .from('profile_role_assignments')
    .select('id, role_key, company_id, status, expires_at, metadata')
    .eq('profile_id', profileId)
    .in('status', ['active', 'provisional']);

  if (error) throw error;
  const now = Date.now();
  return (data || []).filter((assignment: any) =>
    !assignment.expires_at || new Date(assignment.expires_at).getTime() > now
  );
}

function workspaceCapabilities(profile: any, assignments: any[]) {
  const capabilities = new Set<string>(['commuter']);
  const legacyRole = String(profile?.role || 'commuter').toLowerCase();
  const operatorApproved = String(profile?.operator_application_status || '').toUpperCase() === 'APPROVED';
  if (legacyRole === 'operator' && operatorApproved) capabilities.add('operator');
  if (['planner', 'admin'].includes(legacyRole) && profile?.is_active !== false) capabilities.add(legacyRole);

  for (const assignment of assignments || []) {
    const key = String(assignment.role_key || '').toLowerCase();
    if (['verified_operator', 'trusted_operator', 'fleet_lead'].includes(key)) capabilities.add('operator');
    if (['afat_operational_planner', 'municipal_planner', 'government_planner', 'emergency_planner', 'fleet_planner'].includes(key)) capabilities.add('planner');
    if (['operations_admin', 'security_admin', 'platform_admin', 'founder_owner'].includes(key)) capabilities.add('admin');
    if (['organization_member', 'organization_admin', 'organization_owner', 'fleet_manager', 'dispatcher', 'analyst', 'auditor', 'compliance_officer', 'finance_officer'].includes(key)) capabilities.add('organization');
  }

  return Array.from(capabilities);
}

function requestedWorkspaceRole(req: Request, profile: any, capabilities: string[]) {
  const headerRole = String(req.headers['x-afat-workspace-role'] || '').trim().toLowerCase();
  if (headerRole) {
    return { requested: headerRole, allowed: capabilities.includes(headerRole) };
  }
  const legacyRole = String(profile?.role || 'commuter').toLowerCase();
  return {
    requested: capabilities.includes(legacyRole) ? legacyRole : 'commuter',
    allowed: true,
  };
}

export async function requireAuthRole(req: Request, res: Response, roles?: string[]) {
  const { auth, profile } = await getAuthProfileByToken(req);
  if (!auth?.sub || !profile) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  if (profile.is_active === false || String(profile.approval_status || '').toLowerCase() === 'suspended') {
    res.status(403).json({ error: 'Access suspended' });
    return null;
  }

  let assignments: any[] = [];
  try {
    assignments = await getActiveRoleAssignments(profile.id);
  } catch (error) {
    console.error('Role assignment lookup failed:', error);
  }
  const capabilities = workspaceCapabilities(profile, assignments);
  const workspace = requestedWorkspaceRole(req, profile, capabilities);

  if (!workspace.allowed) {
    res.status(403).json({
      error: 'Requested AFAT workspace is not approved for this identity.',
      requested_workspace: workspace.requested,
      capabilities,
    });
    return null;
  }

  if (workspace.requested === 'operator') {
    const assignmentApproved = assignments.some((assignment: any) =>
      ['verified_operator', 'trusted_operator', 'fleet_lead'].includes(String(assignment.role_key || '').toLowerCase())
    );
    if (String(profile.operator_application_status || '').toUpperCase() !== 'APPROVED' && !assignmentApproved) {
      res.status(403).json({ error: 'Operator approval required' });
      return null;
    }
  }

  if (roles?.length && !roles.map((role) => String(role).toLowerCase()).includes(workspace.requested)) {
    res.status(403).json({
      error: 'This action is not available in the selected AFAT workspace.',
      workspace_role: workspace.requested,
    });
    return null;
  }

  return { auth, profile, assignments, capabilities, workspaceRole: workspace.requested };
}

async function fetchProfilesForNotificationTarget(target: {
  user_ids?: string[];
  role?: string;
  city?: string;
}) {
  const selectColumns = 'id, full_name, phone, telegram_id, whatsapp_id, preferred_city, role';
  if (target.user_ids?.length) {
    const { data, error } = await supabase
      .from('profiles')
      .select(selectColumns)
      .in('id', target.user_ids);
    if (error) throw error;
    return data || [];
  }

  if (!target.role) return [];

  const normalizedRole = String(target.role).toLowerCase();
  const roleKeys: Record<string, string[]> = {
    operator: ['verified_operator','trusted_operator','fleet_lead'],
    planner: ['afat_operational_planner','municipal_planner','government_planner','emergency_planner','fleet_planner'],
    admin: ['operations_admin','security_admin','platform_admin','founder_owner'],
    organization: ['organization_member','organization_admin','organization_owner','fleet_manager','dispatcher','analyst','auditor','compliance_officer','finance_officer'],
  };

  let legacyQuery = supabase
    .from('profiles')
    .select(selectColumns)
    .eq('role', normalizedRole)
    .eq('is_active', true)
    .limit(100);
  if (target.city) legacyQuery = legacyQuery.eq('preferred_city', target.city);
  const { data: legacyProfiles, error: legacyError } = await legacyQuery;
  if (legacyError) throw legacyError;

  const assignmentKeys = roleKeys[normalizedRole] || [];
  let assignedProfiles: any[] = [];
  if (assignmentKeys.length) {
    const { data: assignments, error: assignmentError } = await supabase
      .from('profile_role_assignments')
      .select('profile_id,expires_at')
      .in('role_key', assignmentKeys)
      .in('status', ['active','provisional'])
      .limit(500);
    if (assignmentError) throw assignmentError;

    const now = Date.now();
    const ids = Array.from(new Set((assignments || [])
      .filter((item: any) => !item.expires_at || new Date(item.expires_at).getTime() > now)
      .map((item: any) => item.profile_id)
      .filter(Boolean)));

    if (ids.length) {
      let profileQuery = supabase
        .from('profiles')
        .select(selectColumns)
        .in('id', ids)
        .eq('is_active', true);
      if (target.city) profileQuery = profileQuery.eq('preferred_city', target.city);
      const { data, error } = await profileQuery;
      if (error) throw error;
      assignedProfiles = data || [];
    }
  }

  return Array.from(new Map([...(legacyProfiles || []), ...assignedProfiles].map((profile: any) => [profile.id, profile])).values());
}

async function notifyRecipients(target: {
  user_ids?: string[];
  role?: string;
  city?: string;
}, payload: {
  type: string;
  title: string;
  body: string;
  referenceId?: string | null;
  channels?: NotificationChannel[];
}) {
  const recipients = await fetchProfilesForNotificationTarget(target);
  if (!recipients.length) {
    return { recipients: [], deliveries: [] };
  }

  const deliveries = await NotificationService.notifyMany(
    recipients,
    {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      referenceId: payload.referenceId || null,
    },
    payload.channels?.length ? payload.channels : ['in_app']
  );

  return { recipients, deliveries };
}

async function appendWalletLedgerEntry(entry: any) {
  const { error } = await supabase
    .from('wallet_ledger')
    .insert({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...entry,
    });

  if (error) throw error;
}

async function appendPaymentEvent(entry: any) {
  if (entry?.external_id) {
    const { data: existing } = await supabase
      .from('payment_events')
      .select('id')
      .eq('provider', entry.provider || 'pawapay')
      .eq('external_id', entry.external_id)
      .eq('event_type', entry.event_type)
      .eq('event_status', entry.event_status)
      .maybeSingle();

    if (existing) return existing;
  }

  const { error } = await supabase
    .from('payment_events')
    .insert({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...entry,
    });

  if (error) throw error;
}

function validateWebhookSecret(req: Request) {
  const expected = process.env.PAWAPAY_WEBHOOK_SECRET || process.env.AFAT_WEBHOOK_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production' || process.env.AFAT_ALLOW_UNSIGNED_PAWAPAY_CALLBACKS === 'true';
  }

  const provided = String(
    req.headers['x-afat-webhook-secret'] ||
    req.headers['x-webhook-secret'] ||
    req.query.secret ||
    ''
  );

  return provided === expected;
}

async function ensureOperatorWallet(operatorId: string) {
  const { data: existing, error } = await supabase
    .from('operator_wallets')
    .select('operator_id, balance_xaf')
    .eq('operator_id', operatorId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('operator_wallets')
    .insert({
      operator_id: operatorId,
      balance_xaf: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('operator_id, balance_xaf')
    .single();

  if (createError) throw createError;
  return created;
}

async function applyRideCredit(booking: any, reference: string) {
  if (!booking?.operator_id) return;

  const amount = Number(booking.price_paid || 0);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const { data: existingEntry, error: existingError } = await supabase
    .from('wallet_ledger')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('operator_id', booking.operator_id)
    .eq('entry_type', 'ride_credit')
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') throw existingError;
  if (existingEntry) return;

  const commission = Math.round(amount * 0.08);
  const operatorNet = amount - commission;

  await appendWalletLedgerEntry({
    operator_id: booking.operator_id,
    booking_id: booking.id,
    entry_type: 'ride_credit',
    direction: 'credit',
    gross_amount: amount,
    commission_amount: commission,
    net_amount: operatorNet,
    status: 'posted',
    reference,
  });

  const wallet = await ensureOperatorWallet(booking.operator_id);
  const { error: walletUpdateError } = await supabase
    .from('operator_wallets')
    .update({
      balance_xaf: Number(wallet.balance_xaf || 0) + operatorNet,
      updated_at: new Date().toISOString()
    })
    .eq('operator_id', booking.operator_id);

  if (walletUpdateError) throw walletUpdateError;
}

function isBoardablePaymentStatus(paymentStatus: string) {
  return ['paid', 'cash_due'].includes(paymentStatus || '');
}

async function expireSeatHolds(routeId?: string, seatLabel?: string) {
  let query = supabase
    .from('seat_holds')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString());

  if (routeId) query = query.eq('route_id', routeId);
  if (seatLabel) query = query.eq('seat_label', seatLabel);

  await query;
}

function scoreFromIncidentLoad(incidentCount: number, severeCount: number) {
  const score = 100 - (incidentCount * 4) - (severeCount * 8);
  return Math.max(5, Math.min(100, score));
}

function scoreFromCompliance(records: any[]) {
  if (!records.length) return 0;
  const verified = records.filter((record) => record.status === 'verified').length;
  const dueSoon = records.filter((record) => {
    if (!record.due_at) return false;
    const remaining = new Date(record.due_at).getTime() - Date.now();
    return remaining <= 30 * 24 * 60 * 60 * 1000 && remaining > 0;
  }).length;
  const overdue = records.filter((record) => {
    if (!record.due_at) return false;
    return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
  }).length;

  const score = 100 - (overdue * 22) - (dueSoon * 7) + (verified * 5);
  return Math.max(0, Math.min(100, score));
}

function parsePointText(location?: string | null) {
  if (!location) return null;
  const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

const LIVE_MAP_REGIONS: Record<string, { label: string; center: { lat: number; lng: number }; radiusKm: number }> = {
  yaounde: { label: 'Yaounde', center: { lat: 3.866, lng: 11.514 }, radiusKm: 35 },
  douala: { label: 'Douala', center: { lat: 4.0511, lng: 9.7679 }, radiusKm: 38 },
  bafoussam: { label: 'Bafoussam', center: { lat: 5.4778, lng: 10.4176 }, radiusKm: 28 },
  garoua: { label: 'Garoua', center: { lat: 9.3014, lng: 13.3977 }, radiusKm: 40 },
  cameroon: { label: 'Cameroon', center: { lat: 5.7, lng: 12.7 }, radiusKm: 950 },
};

const SERVICE_REQUEST_TYPES = [
  'ride',
  'taxi_hire',
  'bike_pickup',
  'delivery',
  'agency_booking',
  'charter',
  'airport',
  'special_needs',
  'lost_found',
  'complaint',
] as const;

const NON_DISPATCH_SERVICE_TYPES = new Set(['lost_found', 'complaint']);

function normalizeRegion(region?: string) {
  const key = String(region || 'cameroon').trim().toLowerCase();
  return LIVE_MAP_REGIONS[key] ? key : 'cameroon';
}

function withinRegion(latitude: number | undefined, longitude: number | undefined, regionKey: string) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const region = LIVE_MAP_REGIONS[regionKey] || LIVE_MAP_REGIONS.cameroon;
  const latRadius = region.radiusKm / 111;
  const lngRadius = region.radiusKm / Math.max(Math.cos((region.center.lat * Math.PI) / 180) * 111, 1);
  return (
    Math.abs(Number(latitude) - region.center.lat) <= latRadius &&
    Math.abs(Number(longitude) - region.center.lng) <= lngRadius
  );
}

function normalizeServiceType(serviceType?: string) {
  const normalized = String(serviceType || '').trim().toLowerCase();
  return SERVICE_REQUEST_TYPES.includes(normalized as any) ? normalized : '';
}

function servicePriority(serviceType: string, requestedPriority?: string) {
  if (requestedPriority && ['low', 'normal', 'high', 'emergency'].includes(requestedPriority)) {
    return requestedPriority;
  }
  if (serviceType === 'special_needs' || serviceType === 'airport') return 'high';
  return 'normal';
}

function publicError(error: any, fallback: string) {
  console.error(fallback, error);
  return process.env.NODE_ENV === 'production'
    ? fallback
    : error?.message || fallback;
}

// ── AUTHENTICATION (OTP Flow) ────────────────────────────────
router.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const normalizedPhone = normalizeAuthPhone(phone);
    const { data: recentChallenge } = await supabase
      .from('auth_otp_challenges')
      .select('id, created_at')
      .eq('phone', normalizedPhone)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentChallenge?.created_at) {
      const ageMs = Date.now() - new Date(recentChallenge.created_at).getTime();
      if (ageMs < 45 * 1000) {
        return res.status(429).json({ error: 'Please wait before requesting another OTP.' });
      }
    }

    const provider = otpProviderMode();
    const hasSmsProvider = provider !== 'development';
    const devMode = process.env.NODE_ENV !== 'production';
    if (!hasSmsProvider && !devMode) {
      return res.status(503).json({ error: 'OTP provider not configured for production.' });
    }
    let code = '';
    let providerRef: string | null = null;

    if (provider === 'termii') {
      const result = await TermiiClient.sendOTP(normalizedPhone);
      if (!result.success) {
        return res.status(502).json({ error: 'Termii OTP send failed' });
      }
      providerRef = result.pinId;
    } else {
      code = await ArkeselClient.sendOTP(normalizedPhone);
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: challengeError } = await supabase
      .from('auth_otp_challenges')
      .insert({
        phone: normalizedPhone,
        otp_code: code,
        delivery_provider: provider,
        provider_ref: providerRef,
        expires_at: expiresAt,
      });

    if (challengeError) throw challengeError;

    res.status(200).json({
      success: true,
      message: hasSmsProvider ? 'OTP sent successfully' : 'Development OTP generated',
      mode: provider,
      expires_at: expiresAt,
      ...(!hasSmsProvider && devMode ? { dev_code: code } : {})
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, code, adminCode, accessCode, roleIntent } = req.body;
    if (!phone || (!code && !adminCode && !accessCode)) return res.status(400).json({ error: 'Phone and code required' });

    const normalizedPhone = normalizeAuthPhone(phone);
    const desiredRole = String(roleIntent || 'commuter').trim().toLowerCase();
    const provider = otpProviderMode();
    const hasSmsProvider = provider !== 'development';
    const devMode = process.env.NODE_ENV !== 'production';
    const isDevCode = !hasSmsProvider && devMode && code === '123456';
    const wantsAdminBootstrap = String(roleIntent || '').trim().toLowerCase() === 'admin' && Boolean(adminCode);
    const adminBootstrapAllowed =
      wantsAdminBootstrap &&
      controlledRoleApproval('admin', { phone: normalizedPhone }, String(adminCode).trim());
    const invitedRoleAllowed =
      ['operator', 'planner'].includes(desiredRole) &&
      controlledRoleApproval(desiredRole, { phone: normalizedPhone }, String(accessCode || '').trim());
    let challengeVerified = false;

    const { data: challenge, error: challengeLookupError } = await supabase
      .from('auth_otp_challenges')
      .select('id, otp_code, attempts, expires_at, consumed_at, delivery_provider, provider_ref')
      .eq('phone', normalizedPhone)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeLookupError) throw challengeLookupError;

    if (challenge && new Date(challenge.expires_at).getTime() > Date.now()) {
      if (challenge.delivery_provider === 'termii' && challenge.provider_ref) {
        const verification = await TermiiClient.verifyOTP(challenge.provider_ref, String(code).trim());
        challengeVerified = verification.success;
      } else {
        challengeVerified = challenge.otp_code === String(code).trim();
      }
      await supabase
        .from('auth_otp_challenges')
        .update({
          attempts: Number(challenge.attempts || 0) + 1,
          consumed_at: challengeVerified ? new Date().toISOString() : null,
        })
        .eq('id', challenge.id);
    }

    const isVerified = adminBootstrapAllowed || invitedRoleAllowed || challengeVerified || ArkeselClient.verifyOTP(normalizedPhone, code) || isDevCode;

    if (isVerified) {
      const { data: existingProfile, error: lookupError } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (lookupError) throw lookupError;

      let profile = existingProfile;

      if (!profile) {
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            full_name: `AFAT User ${normalizedPhone.slice(-4)}`,
            phone: normalizedPhone,
            role: adminBootstrapAllowed ? 'admin' : invitedRoleAllowed ? desiredRole : 'commuter',
            access_level: adminBootstrapAllowed ? 'admin' : invitedRoleAllowed ? desiredRole : 'verified',
            approval_status: adminBootstrapAllowed || invitedRoleAllowed ? 'approved' : 'self_service',
            operator_application_status: invitedRoleAllowed && desiredRole === 'operator' ? 'APPROVED' : null,
            operator_approved_at: invitedRoleAllowed && desiredRole === 'operator' ? new Date().toISOString() : null,
            verification_status: invitedRoleAllowed && desiredRole === 'operator' ? 'verified' : 'pending',
            trust_points: 25,
            is_active: true,
            created_at: new Date().toISOString()
          })
          .select('id, full_name, role, phone')
          .single();

        if (createError) throw createError;
        profile = createdProfile;
      }

      if (adminBootstrapAllowed && profile.role !== 'admin') {
        const { data: elevatedProfile, error: elevateError } = await supabase
          .from('profiles')
          .update({ role: 'admin', access_level: 'admin', approval_status: 'approved', is_active: true, updated_at: new Date().toISOString() })
          .eq('id', profile.id)
          .select('id, full_name, role, phone')
          .single();
        if (elevateError) throw elevateError;
        profile = elevatedProfile;
      }

      if (invitedRoleAllowed && profile.role !== desiredRole) {
        const activation = desiredRole === 'operator'
          ? {
              role: 'operator',
              access_level: 'operator',
              approval_status: 'approved',
              operator_application_status: 'APPROVED',
              operator_approved_at: new Date().toISOString(),
              verification_status: 'verified',
              is_active: true,
              updated_at: new Date().toISOString(),
            }
          : {
              role: 'planner',
              access_level: 'planner',
              approval_status: 'approved',
              is_active: true,
              updated_at: new Date().toISOString(),
            };
        const { data: bootstrapProfile, error: bootstrapElevateError } = await supabase
          .from('profiles')
          .update(activation)
          .eq('id', profile.id)
          .select('id, full_name, role, phone')
          .single();
        if (bootstrapElevateError) throw bootstrapElevateError;
        profile = bootstrapProfile;
      }

      const accessToken = issueAccessToken(profile, normalizedPhone);
      const { refreshToken, session } = await issueRefreshSession(profile, normalizedPhone, req);

      res.status(200).json({
        success: true,
        userId: profile.id,
        phone: normalizedPhone,
        profile,
        accessToken,
        refreshToken,
        session: {
          id: session.id,
          expires_at: session.expires_at,
        }
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP code' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/auth/supabase-profile', async (req: Request, res: Response) => {
  try {
    const header = req.headers.authorization || '';
    const supabaseAccessToken = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
    if (!supabaseAccessToken) {
      return res.status(401).json({ error: 'Supabase session required.' });
    }

    const { data: userResult, error: userError } = await supabase.auth.getUser(supabaseAccessToken);
    if (userError || !userResult?.user?.id) {
      return res.status(401).json({ error: 'Invalid Supabase session.' });
    }

    const user = userResult.user;
    const isAnonymousSession = Boolean((user as any).is_anonymous);
    const email = String(user.email || '').trim().toLowerCase();
    const phone = normalizeAuthPhone(String(user.phone || ''));
    const hasPhoneIdentity = Boolean(user.phone && phone);
    let requestedRole = isAnonymousSession
      ? 'commuter'
      : String(req.body?.roleIntent || user.user_metadata?.role || 'commuter').trim().toLowerCase();
    const publicRoles = new Set(['commuter']);
    const platformRoles = new Set(['commuter', 'operator', 'planner', 'admin']);
    if (!platformRoles.has(requestedRole)) {
      return res.status(400).json({ error: 'Unsupported role intent.' });
    }

    // A role code grants an account once.  After that, ordinary sign-in must
    // restore the already-approved workspace rather than asking for the same
    // shared bootstrap code on every visit.
    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const accessCode = String(req.body?.accessCode || '').trim();
    const providedAdminCode = String(req.body?.adminCode || '').trim();
    // A remembered browser lane is never role authority. If this identity
    // already has a profile and no activation credential was supplied, restore
    // the server-held role instead of failing or opening another role's UI.
    if (existingProfile && !accessCode && !providedAdminCode) {
      requestedRole = String(existingProfile.role || 'commuter').trim().toLowerCase();
    }
    const identity = { email: email || undefined, phone: hasPhoneIdentity ? phone : undefined };
    const existingOperatorApproved = Boolean(
      existingProfile &&
      existingProfile.role === 'operator' &&
      existingProfile.is_active !== false &&
      String(existingProfile.approval_status || '').toLowerCase() === 'approved' &&
      String(existingProfile.operator_application_status || '').toUpperCase() === 'APPROVED'
    );
    const existingRoleApproved = Boolean(
      existingProfile &&
      existingProfile.role === requestedRole &&
      existingProfile.is_active !== false &&
      String(existingProfile.approval_status || '').toLowerCase() === 'approved' &&
      (requestedRole !== 'operator' || existingOperatorApproved)
    );
    const invitedRoleAllowed =
      ['operator', 'planner'].includes(requestedRole) &&
      controlledRoleApproval(requestedRole, identity, accessCode);
    const adminBootstrapAllowed =
      requestedRole === 'admin' &&
      controlledRoleApproval('admin', identity, providedAdminCode);

    if (requestedRole === 'operator' && accessCode && !invitedRoleAllowed) {
      return res.status(403).json(controlledRoleFailure('operator', identity, accessCode));
    }

    const roleGranted = existingRoleApproved || invitedRoleAllowed || adminBootstrapAllowed;
    const operatorApplicationRequested = requestedRole === 'operator' && !roleGranted && Boolean(req.body?.startOperatorApplication);
    const operatorIntentPending = requestedRole === 'operator' && !roleGranted;
    if (!publicRoles.has(requestedRole) && !operatorApplicationRequested && !operatorIntentPending && !roleGranted) {
      const code = requestedRole === 'admin' ? providedAdminCode : accessCode;
      return res.status(403).json(controlledRoleFailure(requestedRole as ControlledAccessRole, identity, code));
    }

    const finalRole = roleGranted ? requestedRole : 'commuter';
    const username = email ? email.split('@')[0] : `afat-${user.id.slice(0, 8)}`;
    const fullName =
      String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim() ||
      `AFAT ${finalRole.charAt(0).toUpperCase()}${finalRole.slice(1)}`;

    let profile = existingProfile;
    if (!profile) {
      const { data: createdProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          phone: hasPhoneIdentity ? phone : null,
          full_name: fullName,
          username,
          role: finalRole,
          access_level: finalRole === 'commuter' ? 'verified' : finalRole,
          approval_status: operatorApplicationRequested ? 'application_started' : finalRole === 'commuter' ? 'self_service' : 'approved',
          trust_points: finalRole === 'commuter' ? 50 : 25,
          preferred_city: 'yaounde',
          is_active: true,
          operator_application_status: operatorApplicationRequested ? 'APPLICATION_STARTED' : finalRole === 'operator' ? 'APPROVED' : operatorIntentPending ? 'NOT_APPLIED' : null,
          operator_approved_at: finalRole === 'operator' ? new Date().toISOString() : null,
          verification_status: finalRole === 'operator' ? 'verified' : null,
          attribution_source: hasPhoneIdentity ? 'supabase_phone_auth' : 'supabase_email_auth',
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (createError) throw createError;
      profile = createdProfile;
    } else if (hasPhoneIdentity && profile.phone !== phone) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ phone, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      profile = updatedProfile;
    }

    if (profile && operatorApplicationRequested && profile.role === 'commuter') {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          operator_application_status: profile.operator_application_status || 'APPLICATION_STARTED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      profile = updatedProfile;
    } else if (profile && !existingRoleApproved && (invitedRoleAllowed || adminBootstrapAllowed)) {
      const activation = finalRole === 'operator'
        ? {
            role: finalRole,
            access_level: finalRole,
            approval_status: 'approved',
            operator_application_status: 'APPROVED',
            operator_approved_at: new Date().toISOString(),
            verification_status: 'verified',
            is_active: true,
            updated_at: new Date().toISOString(),
          }
        : {
            role: finalRole,
            access_level: finalRole,
            approval_status: 'approved',
            is_active: true,
            updated_at: new Date().toISOString(),
          };
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(activation)
        .eq('id', user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      profile = updatedProfile;
    }

    const accessIdentity = email || phone || profile.phone || user.id;
    const accessToken = issueAccessToken(profile, accessIdentity);
    let refreshToken: string | null = null;
    let session: any = null;
    try {
      const issued = await issueRefreshSession(profile, accessIdentity, req);
      refreshToken = issued.refreshToken;
      session = issued.session;
    } catch (sessionError) {
      // Supabase already owns this authenticated browser session. A secondary
      // AFAT refresh-session outage must not turn a valid identity into a
      // failed role activation; API calls can continue with the Supabase JWT.
      console.warn('AFAT refresh session unavailable for Supabase identity:', sessionError);
    }

    res.status(200).json({
      success: true,
      userId: profile.id,
      email,
      phone: hasPhoneIdentity ? phone : profile.phone || null,
      profile,
      accessToken,
      refreshToken,
      session: session ? {
        id: session.id,
        expires_at: session.expires_at,
      } : null,
    });
  } catch (error: any) {
    console.error('Supabase identity profile bootstrap error:', error);
    const schemaContractUnavailable = /schema cache|could not find.+column|pgrst20[024]/i.test(String(error?.message || error?.code || ''));
    res.status(schemaContractUnavailable ? 503 : 500).json({
      code: schemaContractUnavailable ? 'ROLE_PROFILE_UNAVAILABLE' : 'ROLE_ACTIVATION_FAILED',
      error: schemaContractUnavailable
        ? 'AFAT role services are updating. Please wait a moment and retry.'
        : 'AFAT could not finish role activation. Please retry; your current access has not changed.',
    });
  }
});

router.post('/auth/guest-gate', async (req: Request, res: Response) => {
  const turnstile = await verifyTurnstileToken(req, 'guest_access');
  if (!turnstile.ok) {
    return res.status(turnstile.status).json({ error: turnstile.error });
  }

  return res.status(200).json({
    success: true,
    gate: 'guest_access',
    message: 'Guest access challenge accepted.',
  });
});

router.post('/auth/qa-bypass', async (req: Request, res: Response) => {
  try {
    if (!qaBypassAllowed(req)) {
      return res.status(403).json({ error: 'QA bypass is disabled for this environment.' });
    }

    const requestedRole = String(req.body?.role || 'commuter').trim().toLowerCase();
    const allowedRoles = new Set(['commuter', 'operator', 'planner', 'admin']);
    if (!allowedRoles.has(requestedRole)) {
      return res.status(400).json({ error: 'Unsupported bypass role.' });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', requestedRole)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!profile?.id) {
      return res.status(404).json({
        error: `No seeded ${requestedRole} profile exists yet. Create one through onboarding first.`,
      });
    }

    const accessIdentity = String(
      profile.phone ||
      profile.email ||
      profile.contact_phone ||
      `qa:${profile.id}`
    );
    const accessToken = issueAccessToken(profile, accessIdentity);
    const { refreshToken, session } = await issueRefreshSession(profile, accessIdentity, req);

    res.status(200).json({
      success: true,
      userId: profile.id,
      profile,
      accessToken,
      refreshToken,
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
    });
  } catch (error: any) {
    console.error('QA bypass bootstrap error:', error);
    res.status(500).json({ error: error.message || 'QA bypass failed.' });
  }
});

router.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const refreshTokenHash = hashToken(String(refreshToken));
    const { data: session, error } = await supabase
      .from('auth_refresh_sessions')
      .select('id, profile_id, phone, expires_at, revoked_at')
      .eq('refresh_token_hash', refreshTokenHash)
      .maybeSingle();

    if (error) throw error;
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: 'Refresh session expired or invalid' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone')
      .eq('id', session.profile_id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(401).json({ error: 'Profile no longer exists' });

    const nextRefreshToken = generateOpaqueToken();
    const nextHash = hashToken(nextRefreshToken);
    const nextExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    const { error: rotateError } = await supabase
      .from('auth_refresh_sessions')
      .update({
        refresh_token_hash: nextHash,
        last_used_at: new Date().toISOString(),
        expires_at: nextExpiresAt,
      })
      .eq('id', session.id);
    if (rotateError) throw rotateError;

    res.status(200).json({
      success: true,
      accessToken: issueAccessToken(profile, session.phone),
      refreshToken: nextRefreshToken,
      profile,
      session: {
        id: session.id,
        expires_at: nextExpiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const { auth, profile } = await getAuthProfileByToken(req);
    if (!auth?.sub || !profile) return res.status(401).json({ error: 'Unauthorized' });
    const assignments = await getActiveRoleAssignments(profile.id);
    const capabilities = workspaceCapabilities(profile, assignments);
    res.status(200).json({
      success: true,
      userId: profile.id,
      profile: { ...profile, capabilities, role_assignments: assignments },
      capabilities,
      role_assignments: assignments,
      auth: {
        sub: auth.sub,
        phone: auth.phone,
        role: auth.role,
        exp: auth.exp,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Auth lookup failed' });
  }
});

router.get('/access/applications/mine', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const { data, error } = await supabase
      .from('access_applications')
      .select('*')
      .eq('profile_id', access.profile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json({ applications: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Access applications unavailable.' });
  }
});

router.post('/access/applications', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const capabilityKey = String(req.body?.capability_key || '').trim().toLowerCase();
    const allowed = new Set(['operator', 'planner', 'organization', 'public_partner']);
    if (!allowed.has(capabilityKey)) {
      return res.status(400).json({ error: 'Unsupported capability request.' });
    }

    const roleKey = capabilityKey === 'operator'
      ? 'operator_applicant'
      : capabilityKey === 'planner'
        ? 'afat_operational_planner'
        : capabilityKey === 'organization'
          ? 'organization_member'
          : null;

    const companyId = req.body?.company_id || null;
    const { data: existing } = await supabase
      .from('access_applications')
      .select('*')
      .eq('profile_id', access.profile.id)
      .eq('capability_key', capabilityKey)
      .in('status', ['draft', 'submitted', 'under_review', 'needs_information'])
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ application: existing, resumed: true });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('access_applications')
      .insert({
        profile_id: access.profile.id,
        capability_key: capabilityKey,
        requested_role_key: roleKey,
        company_id: companyId,
        status: 'submitted',
        application_type: req.body?.application_type || 'self_service',
        reason: req.body?.reason || null,
        requested_scope: req.body?.requested_scope || {},
        evidence_summary: req.body?.evidence_summary || {},
        submitted_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw error;

    if (capabilityKey === 'operator') {
      await supabase
        .from('profiles')
        .update({
          operator_application_status: 'UNDER_REVIEW',
          operator_application_submitted_at: nowIso,
          operator_review_notes: 'Capability application submitted and awaiting AFAT review.',
          updated_at: nowIso,
        })
        .eq('id', access.profile.id);
    }

    await notifyRecipients(
      { role: 'admin' },
      {
        type: 'access_application_submitted',
        title: 'AFAT capability review',
        body: `${access.profile.full_name || 'An AFAT member'} requested ${capabilityKey.replace(/_/g, ' ')} access.`,
        referenceId: data.id,
        channels: ['in_app'],
      }
    ).catch((notificationError) => console.warn('Access review notification failed:', notificationError));

    return res.status(201).json({ application: data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Access application failed.' });
  }
});

router.get('/ops/access/applications', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin']);
  if (!access) return;
  try {
    const statuses = String(req.query.status || 'submitted,under_review,needs_information')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const { data, error } = await supabase
      .from('access_applications')
      .select('*, profiles:profile_id(id, full_name, phone, preferred_city, verification_status, operator_application_status), companies:company_id(id, name, compliance_status)')
      .in('status', statuses)
      .order('submitted_at', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return res.status(200).json({ applications: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Approval inbox unavailable.' });
  }
});

router.patch('/ops/access/applications/:applicationId', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin']);
  if (!access) return;
  try {
    const applicationId = String(req.params.applicationId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const { data, error } = await supabase.rpc('afat_review_access_application', {
      p_application_id: applicationId,
      p_reviewer_id: access.profile.id,
      p_decision: decision,
      p_notes: req.body?.notes || null,
      p_role_key: req.body?.role_key || null,
      p_review_scope: req.body?.review_scope || {},
    });
    if (error) throw error;
    const reviewedApplication: any = Array.isArray(data) ? data[0] : data;
    if (reviewedApplication?.profile_id) {
      await notifyRecipients(
        { user_ids: [reviewedApplication.profile_id] },
        {
          type: 'access_application_reviewed',
          title: 'AFAT access decision',
          body: decision === 'needs_information'
            ? `AFAT needs more information before activating your ${reviewedApplication.capability_key || 'requested'} capability.`
            : `Your ${reviewedApplication.capability_key || 'requested'} capability was marked ${decision.replace(/_/g, ' ')}.`,
          referenceId: reviewedApplication.id || applicationId,
          channels: ['in_app'],
        }
      ).catch((notificationError) => console.warn('Access decision notification failed:', notificationError));
    }
    return res.status(200).json({ application: data, decision });
  } catch (error: any) {
    const message = String(error?.message || 'Access review failed.');
    const status = message.includes('ADMIN_INVITATION_REQUIRED') ? 409 : message.includes('APPLICATION_NOT_FOUND') ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});

router.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await supabase
        .from('auth_refresh_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('refresh_token_hash', hashToken(String(refreshToken)));
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Sovereign Incident Reporting (Direct from Native App)
router.post('/report', async (req: Request, res: Response) => {
  try {
    const { userId, type, description, latitude, longitude, severity } = req.body;

    if (!userId || !type || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const incident = await createIncident({
      reporterId: userId,
      reporterUsername: 'native_app_user',
      type: type as IncidentType,
      description,
      location: { latitude, longitude },
      address: '',
      severity: (severity as Severity) || 3,
      confirmations: 0,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    if (incident) {
      res.status(201).json({ success: true, incidentId: incident.id });
    } else {
      res.status(500).json({ error: 'Failed to create incident' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/sos/panic', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const profileId = access.profile.id;
    const source = String(req.body?.source || 'sos_button').slice(0, 80);
    const requestedAssignmentId = String(req.body?.dispatch_assignment_id || '').trim() || null;
    const rawLat = req.body?.latitude;
    const rawLng = req.body?.longitude;
    const rawAccuracy = req.body?.accuracy_m;
    const deviceLat = rawLat == null || rawLat === '' ? null : Number(rawLat);
    const deviceLng = rawLng == null || rawLng === '' ? null : Number(rawLng);
    const accuracy = rawAccuracy == null || rawAccuracy === '' ? null : Number(rawAccuracy);

    const hasDeviceLocation = Number.isFinite(deviceLat) && Number.isFinite(deviceLng)
      && deviceLat! >= -90 && deviceLat! <= 90 && deviceLng! >= -180 && deviceLng! <= 180;
    if ((rawLat != null || rawLng != null) && !hasDeviceLocation) {
      return res.status(400).json({ error: 'Invalid emergency location coordinates.' });
    }
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) {
      return res.status(400).json({ error: 'Invalid emergency location accuracy.' });
    }

    const activeStates = ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency','disputed'];
    const rank: Record<string, number> = { emergency: 0, in_journey: 1, pickup_verified: 2, arrived: 3, en_route: 4, assigned: 5, accepted: 6, offered: 7, queued: 8, disputed: 9 };
    let assignments: any[] = [];

    const { data: operatorAssignments, error: operatorError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,vehicle_id,status,updated_at')
      .eq('operator_id', profileId)
      .in('status', activeStates)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (operatorError) throw operatorError;
    assignments.push(...(operatorAssignments || []));

    const { data: passengerBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('passenger_id', profileId)
      .limit(100);
    if (bookingError) throw bookingError;
    const bookingIds = (passengerBookings || []).map((item: any) => item.id).filter(Boolean);
    if (bookingIds.length) {
      const { data: passengerAssignments, error: passengerAssignmentError } = await supabase
        .from('dispatch_assignments')
        .select('id,booking_id,operator_id,vehicle_id,status,updated_at')
        .in('booking_id', bookingIds)
        .in('status', activeStates)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (passengerAssignmentError) throw passengerAssignmentError;
      assignments.push(...(passengerAssignments || []));
    }

    assignments = Array.from(new Map(assignments.map((item: any) => [item.id, item])).values())
      .sort((a: any, b: any) => (rank[String(a.status)] ?? 99) - (rank[String(b.status)] ?? 99)
        || new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());

    const assignment = requestedAssignmentId
      ? assignments.find((item: any) => item.id === requestedAssignmentId)
      : assignments[0] || null;
    if (requestedAssignmentId && !assignment) {
      return res.status(403).json({ error: 'The requested dispatch is not an active journey owned by this identity.' });
    }

    let journey: any = null;
    if (assignment?.id) {
      const { data, error } = await supabase
        .from('afat_journeys')
        .select('id,status,started_at')
        .eq('dispatch_assignment_id', assignment.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      journey = data || null;
    }

    let lat: number | null = hasDeviceLocation ? Number(deviceLat) : null;
    let lng: number | null = hasDeviceLocation ? Number(deviceLng) : null;
    let resolvedAccuracy: number | null = hasDeviceLocation && accuracy != null ? accuracy : null;
    let locationSource: 'device' | 'journey_last_known' | 'unavailable' = hasDeviceLocation ? 'device' : 'unavailable';

    if (!hasDeviceLocation && journey?.id) {
      const { data: sample, error } = await supabase
        .from('afat_journey_samples')
        .select('latitude,longitude,accuracy_m,recorded_at')
        .eq('journey_id', journey.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (sample && Number.isFinite(Number(sample.latitude)) && Number.isFinite(Number(sample.longitude))) {
        lat = Number(sample.latitude);
        lng = Number(sample.longitude);
        resolvedAccuracy = sample.accuracy_m == null ? null : Number(sample.accuracy_m);
        locationSource = 'journey_last_known';
      }
    }

    let passengerId: string | null = null;
    if (assignment?.booking_id) {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('passenger_id')
        .eq('id', assignment.booking_id)
        .maybeSingle();
      if (error) throw error;
      passengerId = booking?.passenger_id || null;
    }

    let incident: any = null;
    if (lat != null && lng != null) {
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          type: 'emergency',
          description: `Authenticated AFAT SOS. Location source: ${locationSource}.`,
          latitude: lat,
          longitude: lng,
          location: `POINT(${lng} ${lat})`,
          severity: 5,
          source: 'sos_authenticated',
          status: 'active',
          verification_status: 'authenticated_sos',
          confidence_score: locationSource === 'device' ? 95 : 80,
          reporter_id: profileId,
          reporter_username: access.profile.full_name || 'AFAT member',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      incident = data;
    }

    const { data: sosEvent, error: sosError } = await supabase
      .from('sos_events')
      .insert({
        user_id: profileId,
        incident_id: incident?.id || null,
        dispatch_assignment_id: assignment?.id || null,
        journey_id: journey?.id || null,
        operator_id: assignment?.operator_id || null,
        vehicle_id: assignment?.vehicle_id || null,
        latitude: lat,
        longitude: lng,
        accuracy_m: resolvedAccuracy,
        location_source: locationSource,
        status: 'active',
        source,
        metadata: {
          workspace_role: access.workspaceRole,
          dispatch_status: assignment?.status || null,
        },
      })
      .select()
      .single();
    if (sosError) throw sosError;

    let emergencyTransitioned = assignment?.status === 'emergency';
    if (assignment && ['en_route','arrived','pickup_verified','in_journey'].includes(String(assignment.status))) {
      const { error } = await supabase.rpc('afat_transition_dispatch_journey', {
        p_assignment_id: assignment.id,
        p_actor_profile_id: profileId,
        p_expected_status: assignment.status,
        p_next_status: 'emergency',
        p_idempotency_key: `sos-${sosEvent.id}`,
        p_reason: 'Authenticated AFAT SOS activated',
        p_evidence: {
          sos_event_id: sosEvent.id,
          incident_id: incident?.id || null,
          location_source: locationSource,
        },
      });
      if (!error) emergencyTransitioned = true;
      else console.warn('SOS persisted but dispatch emergency transition failed:', error.message);
    }

    const participantIds = Array.from(new Set(
      [passengerId, assignment?.operator_id].filter((id): id is string => Boolean(id) && id !== profileId)
    ));
    if (participantIds.length) {
      await notifyRecipients(
        { user_ids: participantIds },
        {
          type: 'journey_sos',
          title: 'AFAT journey emergency',
          body: 'An authenticated SOS was activated for the active journey.',
          referenceId: sosEvent.id,
          channels: ['in_app'],
        }
      ).catch((notificationError) => console.warn('SOS participant notification failed:', notificationError));
    }

    await Promise.allSettled([
      notifyRecipients(
        { role: 'planner', city: access.profile.preferred_city || undefined },
        {
          type: 'journey_sos',
          title: 'AFAT safety escalation',
          body: 'An authenticated AFAT SOS requires operational attention.',
          referenceId: sosEvent.id,
          channels: ['in_app'],
        }
      ),
      notifyRecipients(
        { role: 'admin' },
        {
          type: 'journey_sos',
          title: 'AFAT safety escalation',
          body: 'An authenticated AFAT SOS was recorded.',
          referenceId: sosEvent.id,
          channels: ['in_app'],
        }
      ),
    ]);

    return res.status(201).json({
      success: true,
      persisted: true,
      status: 'active',
      sos_event_id: sosEvent.id,
      incident_id: incident?.id || null,
      dispatch_assignment_id: assignment?.id || null,
      journey_id: journey?.id || null,
      dispatch_emergency_state: emergencyTransitioned,
      location_status: locationSource,
    });
  } catch (error: any) {
    return res.status(500).json({ error: publicError(error, 'SOS dispatch failed') });
  }
});

// Fetch Active Incidents for Mapbox/Native App View
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const incidents = await getActiveIncidents();
    res.status(200).json(incidents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const { message, directive, target_role, source, tier, severity, metadata } = req.body;
    const finalDirective = String(directive || message || '').trim();

    if (!finalDirective) {
      return res.status(400).json({ error: 'message or directive is required' });
    }

    const payload = {
      source: source || 'dashboard',
      basis: 'manual_broadcast',
      directive: finalDirective.slice(0, 600),
      tier: tier || (Number(severity || 0) >= 4 ? 1 : 2),
      target_role: target_role || 'all',
      status: Number(severity || 0) >= 4 ? 'broadcasted' : 'pending_admin',
      metadata: metadata || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('sentinel_directives')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('Broadcast accepted without persistence:', error.message);
      return res.status(202).json({
        success: true,
        persisted: false,
        directive: payload,
      });
    }

    res.status(201).json({ success: true, persisted: true, directive: data });
  } catch (error: any) {
    res.status(500).json({ error: publicError(error, 'Broadcast failed') });
  }
});

// ── VOICE INTELLIGENCE (Whisper transcription + AI classification) ────────
// No backend speech-to-text pipeline is operational here. Never return
// invented accident transcription or pretend a model classified the audio.
// Browser speech-to-text (when available) plus user confirmation is handled
// by VoiceReporter and enters the protected map-signal human-review path.
router.post('/intelligence/voice-report', async (req: Request, res: Response) => {
  const access=await requireAuthRole(req,res);
  if(!access)return;
  return res.status(501).json({
    success:false,
    error:'VOICE_SERVER_TRANSCRIPTION_NOT_CONFIGURED',
    guidance:'Use voice-assisted reporting in the AFAT passenger workspace, or type your observed incident and confirm live GPS.',
    generated_transcription:false,classified_by_ai:false,submitted_incident:false,
  });
});

// ── PAYMENT CHECKOUT (PawaPay / MoMo / Orange Money) ──────────────────────
router.post('/payment/checkout', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['commuter']);
    if (!session) return;

    const { phone, booking_id, provider, mobile_network } = req.body;

    if (!booking_id || !phone) {
      return res.status(400).json({ error: 'booking_id and phone are required' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, passenger_id, price_xaf, price_paid, status, payment_status')
      .eq('id', booking_id)
      .eq('passenger_id', session.profile.id)
      .maybeSingle();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const payableStatuses = ['pending','accepted','confirmed','boarded','in_progress','completed'];
    if (!payableStatuses.includes(String(booking.status || '')) || !['unpaid', 'failed'].includes(String(booking.payment_status))) {
      return res.status(409).json({ error: 'Booking is not ready for mobile-money payment' });
    }

    const parsedAmount = Number(booking.price_xaf ?? booking.price_paid);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(409).json({ error: 'Booking has no valid server-side fare' });
    }

    const normalizedProvider = provider === 'africastalking' || provider === 'pawapay' || provider === 'mtn_momo' || provider === 'orange_money'
      ? (provider === 'africastalking' ? 'africastalking' : 'pawapay')
      : undefined;

    const transactionId = crypto.randomUUID();
    const { data: reservedBooking, error: reservationError } = await supabase
      .from('bookings')
      .update({
        transaction_id: transactionId,
        payment_status: 'collection_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id)
      .eq('passenger_id', session.profile.id)
      .in('status', ['pending','accepted','confirmed','boarded','in_progress','completed'])
      .in('payment_status', ['unpaid', 'failed'])
      .select('id')
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservedBooking) {
      return res.status(409).json({ error: 'A payment attempt is already active for this booking' });
    }

    console.log(`💳 Payment checkout: ${parsedAmount} XAF from ${phone} via ${normalizedProvider || 'auto-fallback'}`);
    const payment = await paymentService.initiateMomoPayment(
      phone,
      parsedAmount,
      `Booking ${booking_id || 'direct'}`,
      normalizedProvider,
      mobile_network,
      transactionId,
    );

    if (!payment.success || !payment.transactionId) {
      await supabase
        .from('bookings')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', booking_id)
        .eq('transaction_id', transactionId)
        .eq('payment_status', 'collection_pending');
      return res.status(502).json({
        success: false,
        error: payment.message || 'Payment provider unavailable'
      });
    }

    await appendPaymentEvent({
      booking_id: booking_id || null,
      provider: payment.provider || normalizedProvider || 'unknown',
      external_id: payment.transactionId,
      event_type: 'checkout_initiated',
      event_status: 'pending',
      amount_xaf: parsedAmount,
      phone_number: String(phone || ''),
      metadata: {
        requested_provider: provider || null,
        mobile_network: mobile_network || null,
        raw_status: payment.rawStatus || null,
      },
    });

    res.status(200).json({
      success: true,
      transactionId: payment.transactionId,
      status: 'pending',
      provider: payment.provider,
      rawStatus: payment.rawStatus,
      message: payment.message || `Payment of ${parsedAmount} XAF initiated. Check your phone for PIN prompt.`
    });
  } catch (error) {
    console.error('Payment checkout error:', error);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

router.get('/payment/provider-readiness', async (_req: Request, res: Response) => {
  const provider = process.env.PAYMENT_PROVIDER || 'pawapay';
  const hasPawaPay = Boolean(process.env.PAWAPAY_API_TOKEN || process.env.PAWAPAY_API_KEY || process.env.PAYMENT_API_KEY);
  const hasAT = Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
  const pawaPayEnv = process.env.PAWAPAY_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
  const providerProbe = hasPawaPay ? await paymentService.checkPawaPayAvailability() : null;

  res.status(200).json({
    success: true,
    provider,
    callback_url: `${(process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_DOMAIN || 'https://asteck-bot.onrender.com').replace(/\/$/, '')}/api/webhook/pawapay`,
    pawapay_environment: pawaPayEnv,
    ready: {
      pawapay: hasPawaPay,
      africastalking: hasAT
    },
    provider_probe: providerProbe,
    callback_security: {
      secret_configured: Boolean(process.env.PAWAPAY_WEBHOOK_SECRET || process.env.AFAT_WEBHOOK_SECRET),
      unsigned_callbacks_explicitly_allowed: process.env.AFAT_ALLOW_UNSIGNED_PAWAPAY_CALLBACKS === 'true',
    },
    mode: hasPawaPay || hasAT ? 'live_or_hybrid' : 'stub',
    recommendation: hasPawaPay
      ? 'PawaPay credentials are configured; use provider reconciliation as the settlement source of truth.'
      : 'Configure PAWAPAY_API_TOKEN or PAWAPAY_API_KEY for live collection.'
  });
});
router.post('/payment/reconcile', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res);
    if (!session) return;
    const bookingId = String(req.body?.booking_id || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'booking_id is required' });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id,passenger_id,operator_id,transaction_id,payment_status,price_xaf,price_paid,status')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const workspaceRole = String(session.workspaceRole || session.profile.role || '').toLowerCase();
    const isStaff = ['planner','admin'].includes(workspaceRole);
    if (!isStaff && booking.passenger_id !== session.profile.id && booking.operator_id !== session.profile.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!booking.transaction_id) {
      return res.status(409).json({ error: 'No mobile-money transaction is attached to this booking.' });
    }

    const providerResult = await paymentService.checkPaymentStatus(booking.transaction_id);
    const rawStatus = String(providerResult.rawStatus || providerResult.message || '').toUpperCase();

    await appendPaymentEvent({
      booking_id: booking.id,
      provider: providerResult.provider || 'pawapay',
      external_id: booking.transaction_id,
      event_type: 'status_reconciled',
      event_status: rawStatus || 'UNKNOWN',
      amount_xaf: Number(booking.price_xaf ?? booking.price_paid ?? 0) || null,
      metadata: {
        source: 'authenticated_reconciliation',
        requested_by: session.profile.id,
        workspace_role: workspaceRole,
      },
    });

    let reconciledBooking = booking;
    if (rawStatus === 'COMPLETED') {
      const { data, error } = await supabase.rpc('afat_confirm_mobile_payment', {
        p_booking_id: booking.id,
        p_transaction_id: booking.transaction_id,
        p_provider: 'pawapay',
      });
      if (error) throw error;
      reconciledBooking = data || booking;
    } else if (['FAILED','REJECTED','CANCELLED'].includes(rawStatus) && booking.payment_status === 'collection_pending') {
      const { data, error } = await supabase
        .from('bookings')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', booking.id)
        .eq('transaction_id', booking.transaction_id)
        .eq('payment_status', 'collection_pending')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      reconciledBooking = data || booking;
    }

    return res.status(200).json({
      success: true,
      provider: providerResult.provider || 'pawapay',
      provider_status: rawStatus || 'UNKNOWN',
      booking: reconciledBooking,
      settled: rawStatus === 'COMPLETED',
    });
  } catch (error: any) {
    console.error('Payment reconciliation error:', error);
    return res.status(502).json({ error: error?.message || 'Payment reconciliation failed' });
  }
});


// Operator's authoritative future departure inventory. Never expose another
// operator's private schedule or pretend published supply is a seat reservation.
router.get('/mobility/departures/mine', async (req: Request, res: Response) => {
  const access=await requireAuthRole(req,res,['operator']);
  if(!access)return;
  try{
    const result=await supabase.from('routes')
      .select('id,vehicle_id,origin,destination,departure_time,price_per_seat,capacity,is_active,created_at')
      .eq('operator_id',access.profile.id)
      .gte('departure_time',new Date(Date.now()-24*60*60*1000).toISOString())
      .order('departure_time',{ascending:true}).limit(80);
    if(result.error)throw result.error;
    const ids=(result.data||[]).map((row:any)=>row.id);
    const [bookings,holds]=await Promise.all([
      ids.length?supabase.from('bookings').select('route_id,id,status').in('route_id',ids):Promise.resolve({data:[],error:null}),
      ids.length?supabase.from('seat_holds').select('route_id,id,status,expires_at').in('route_id',ids)
        .eq('status','active').gt('expires_at',new Date().toISOString()):Promise.resolve({data:[],error:null}),
    ]);
    if(bookings.error||holds.error)throw bookings.error||holds.error;
    const bookingIds=new Set((bookings.data||[]).map((x:any)=>x.route_id));
    const holdIds=new Set((holds.data||[]).map((x:any)=>x.route_id));
    res.status(200).json({success:true,departures:(result.data||[]).map((route:any)=>({
      ...route,has_booking_history:bookingIds.has(route.id),
      has_active_holds:holdIds.has(route.id),
      can_withdraw:departureWithdrawalEligibility({is_active:route.is_active,
        departure_time:route.departure_time,has_booking_history:bookingIds.has(route.id),
        has_active_holds:holdIds.has(route.id)}).canWithdraw,
    }))});
  }catch(error:any){
    console.error('Operator departure management unavailable',error);
    res.status(503).json({error:'OPERATOR_DEPARTURES_UNAVAILABLE'});
  }
});

// The database RPC acquires the same route row lock as seat booking. Only a
// verified, authenticated owner can withdraw uncommitted inventory.
router.post('/mobility/departures/:departureId/withdraw', async(req:Request,res:Response)=>{
  const access=await requireAuthRole(req,res,['operator']);
  if(!access)return;
  const id=String(req.params.departureId||'');
  const reason=String(req.body?.reason||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ||reason.length<12||reason.length>500)
    return res.status(400).json({error:'VALID_DEPARTURE_ID_AND_WITHDRAWAL_REASON_REQUIRED'});
  try{
    const result=await supabase.rpc('afat_cancel_operator_departure',{
      p_operator_id:access.profile.id,p_route_id:id,p_reason:reason,
    });
    if(result.error){
      const message=String(result.error.message||'WITHDRAWAL_REJECTED');
      const status=message.includes('NOT_FOUND')?404:
        /HAS_BOOKING|HAS_ACTIVE|ALREADY_STARTED/.test(message)?409:
        /REQUIRED/.test(message)?400:503;
      return res.status(status).json({error:message});
    }
    return res.status(200).json({success:true,departure:result.data});
  }catch(error:any){
    console.error('Operator departure withdrawal unavailable',error);
    return res.status(503).json({error:'WITHDRAWAL_UNAVAILABLE'});
  }
});

router.post('/mobility/departures/publish', async (req: Request, res: Response) => {
  const access=await requireAuthRole(req,res,['operator']);
  if(!access)return;
  let draft;
  try{
    draft=validateScheduleDraft(req.body);
  }catch(error:any){return res.status(400).json({error:String(error?.message||'INVALID_DEPARTURE')});}
  try{
    const [operatorResult,vehicleResult]=await Promise.all([
      supabase.from('profiles').select('id,verification_status,operator_application_status')
        .eq('id',access.profile.id).maybeSingle(),
      supabase.from('vehicles').select('id,operator_id,type,capacity,clearance_status')
        .eq('id',draft.vehicle_id).eq('operator_id',access.profile.id).maybeSingle(),
    ]);
    if(operatorResult.error||vehicleResult.error)throw operatorResult.error||vehicleResult.error;
    const operator=operatorResult.data,vehicle=vehicleResult.data;
    if(operator?.verification_status!=='verified'||operator?.operator_application_status!=='APPROVED'||
       vehicle?.clearance_status!=='verified')
      return res.status(403).json({error:'VERIFIED_OPERATOR_AND_VEHICLE_REQUIRED'});
    const eligibility=await supabase.rpc('afat_vehicle_compliance_current',{p_vehicle_id:draft.vehicle_id});
    if(eligibility.error)throw eligibility.error;
    if(eligibility.data!==true)return res.status(409).json({error:'CURRENT_VEHICLE_DOCUMENTS_AND_CLEARANCE_REQUIRED'});
    const capacity=Number(vehicle.capacity);
    if(!Number.isSafeInteger(capacity)||capacity<1||capacity>200)
      return res.status(409).json({error:'VEHICLE_CAPACITY_NOT_APPROVED'});
    const departMs=Date.parse(draft.departure_time);
    const before=new Date(departMs-30*60_000).toISOString();
    const after=new Date(departMs+30*60_000).toISOString();
    const conflicts=await supabase.from('routes').select('id')
      .eq('vehicle_id',draft.vehicle_id).eq('is_active',true)
      .gte('departure_time',before).lte('departure_time',after).limit(1);
    if(conflicts.error)throw conflicts.error;
    if(conflicts.data?.length)return res.status(409).json({error:'VEHICLE_ALREADY_SCHEDULED_NEAR_THIS_TIME'});

    // Identity and vehicle approval come from auth and the verified database,
    // not the posted request. The operator states proposed meeting points;
    // neither coordinates nor a map pin certify boarding/access safety.
    const routeRow={
      operator_id:access.profile.id,vehicle_id:vehicle.id,
      name:`${draft.origin} → ${draft.destination}`,origin:draft.origin,
      destination:draft.destination,origin_lat:draft.origin_lat,
      origin_lng:draft.origin_lng,dest_lat:draft.dest_lat,dest_lng:draft.dest_lng,
      departure_time:draft.departure_time,price_per_seat:draft.price_per_seat,
      price_xaf:draft.price_per_seat,capacity,vehicle_type:vehicle.type||'other',
      is_active:true,
    };
    const inserted=await supabase.from('routes').insert(routeRow)
      .select('id,origin,destination,departure_time,price_per_seat,capacity,vehicle_type,is_active').single();
    if(inserted.error)throw inserted.error;
    return res.status(201).json({
      success:true,departure:inserted.data,origin_status:'operator_reported',
      destination_status:'operator_reported',verified_access:false,
      warning:'Published schedule only; route passability, boarding access and departure fulfilment are not field verified.',
    });
  }catch(error:any){
    console.error('Approved scheduled departure publication failed:',error);
    return res.status(503).json({error:'DEPARTURE_PUBLICATION_UNAVAILABLE'});
  }
});

// Staff clearance is not AI or automatic evidence promotion. The same
// verified vehicle is then eligible for operator schedule publication.
router.get('/mobility/vehicle-clearance/queue', async (req: Request, res: Response) => {
  const access=await requireAuthRole(req,res,['admin','planner']);
  if(!access)return;
  try{
    const result=await supabase.from('vehicles')
      .select('id,operator_id,plate_number,type,capacity,clearance_status,is_available,created_at,updated_at')
      .order('created_at',{ascending:false}).limit(80);
    if(result.error)throw result.error;
    const ids=Array.from(new Set((result.data||[]).map((v:any)=>v.operator_id)));
    const [people,documents]=await Promise.all([
      ids.length?supabase.from('profiles')
        .select('id,full_name,operator_application_status,verification_status').in('id',ids)
        :Promise.resolve({data:[],error:null}),
      ids.length?supabase.from('compliance_records')
        .select('id,profile_id,document_type,status,due_at,verified_at,file_url')
        .in('profile_id',ids).in('role',['operator','bike_rider'])
        .in('document_type',['vehicle_registration','bike_registration','helmet_compliance','insurance','license'])
        :Promise.resolve({data:[],error:null}),
    ]);
    if(people.error||documents.error)throw people.error||documents.error;
    const byOperator=new Map((people.data||[]).map((p:any)=>[p.id,p]));
    const cases=(result.data||[]).map((vehicle:any)=>({
      ...vehicle,operator:byOperator.get(vehicle.operator_id)||null,
      documents:(documents.data||[]).filter((d:any)=>d.profile_id===vehicle.operator_id)
        .map((d:any)=>({id:d.id,document_type:d.document_type,status:d.status,
          due_at:d.due_at,verified_at:d.verified_at,
          has_document:Boolean(d.file_url)})),
    }));
    return res.status(200).json({success:true,cases,review_authority:'human_staff_only'});
  }catch(error:any){
    console.error('Vehicle clearance review queue unavailable',error);
    return res.status(503).json({error:'VEHICLE_REVIEW_QUEUE_UNAVAILABLE'});
  }
});
router.post('/mobility/vehicle-clearance/:id/review', async(req:Request,res:Response)=>{
  const access=await requireAuthRole(req,res,['admin','planner']);
  if(!access)return;
  const decision=String(req.body?.decision||'');
  const reason=String(req.body?.reason||'').trim();
  if(!['verified','restricted','under_review'].includes(decision)||reason.length<15||reason.length>2000)
    return res.status(400).json({error:'VALID_DECISION_AND_REVIEW_REASON_REQUIRED'});
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(req.params.id||'')))
    return res.status(400).json({error:'VALID_VEHICLE_ID_REQUIRED'});
  try{
    const {data,error}=await supabase.rpc('afat_staff_review_vehicle',{
      p_staff_id:access.profile.id,p_vehicle_id:req.params.id,
      p_decision:decision,p_reason:reason,
    });
    if(error){
      const code=String(error.message||'VEHICLE_REVIEW_DENIED');
      const status=/NOT_FOUND/.test(code)?404:/REQUIRED|NOT_APPROVED|NOT_VERIFIED|ALREADY_RECORDED|INCOMPLETE/.test(code)?409:503;
      return res.status(status).json({error:code});
    }
    return res.status(200).json({success:true,vehicle:data,verified_by_human_review:true});
  }catch(error:any){
    console.error('Vehicle clearance review failed',error);
    return res.status(503).json({error:'VEHICLE_REVIEW_UNAVAILABLE'});
  }
});

router.get('/mobility/departures', async (_req: Request, res: Response) => {
  try {
    const { data: routes, error } = await supabase
      .from('routes')
      .select('id, operator_id, vehicle_id, name, origin, destination, departure_time, price_per_seat, capacity, vehicle_type, is_active')
      .eq('is_active', true)
      .gt('departure_time',new Date().toISOString())
      .order('departure_time', { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) throw error;

    const routeIds = (routes || []).map((route: any) => route.id);
    const operatorIds = Array.from(new Set((routes || []).map((route: any) => route.operator_id).filter(Boolean)));
    const vehicleIds = Array.from(new Set((routes || []).map((route: any) => route.vehicle_id).filter(Boolean)));

    const [bookingsResult, operatorsResult, vehiclesResult] = await Promise.all([
      routeIds.length
        ? supabase.from('bookings').select('route_id, seat_label').in('route_id', routeIds).in('status', ['pending', 'accepted', 'confirmed', 'boarded', 'in_progress'])
        : Promise.resolve({ data: [], error: null }),
      operatorIds.length
        ? supabase.from('profiles').select('id, full_name, verification_status, operator_application_status').in('id', operatorIds)
        : Promise.resolve({ data: [], error: null }),
      vehicleIds.length
        ? supabase.from('vehicles').select('id, plate_number, type, capacity, rating, clearance_status').in('id', vehicleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (bookingsResult.error) throw bookingsResult.error;
    if (operatorsResult.error) throw operatorsResult.error;
    if (vehiclesResult.error) throw vehiclesResult.error;

    // Verified on EACH read: current time-based insurance/registration expiry
    // must not advertise a bookable service, even before a cron or operator
    // event has changed an existing vehicle's clearance state.
    const compliant=await Promise.all(
      (vehiclesResult.data||[]).filter((v:any)=>v.clearance_status==='verified')
        .map(async(v:any)=>({id:v.id,result:await supabase.rpc('afat_vehicle_compliance_current',{p_vehicle_id:v.id})}))
    );
    if(compliant.some(x=>x.result.error))throw new Error('CURRENT_VEHICLE_CLEARANCE_LOOKUP_UNAVAILABLE');
    const safeIds=new Set(compliant.filter(x=>x.result.data===true).map(x=>x.id));
    const eligibleVehicles=(vehiclesResult.data||[]).filter((v:any)=>safeIds.has(v.id));
    const departures = projectPublishedDepartures({routes:routes||[],bookings:bookingsResult.data||[],operators:operatorsResult.data||[],vehicles:eligibleVehicles,nowMs:Date.now()});
    res.status(200).json({ success: true, departures });
  } catch (error: any) {
    console.error('Departure feed error:', error);
    res.status(500).json({ error: error.message || 'Departure feed failed' });
  }
});

// ── PAYMENT WEBHOOK (PawaPay callback) ────────────────────────────────────
router.post('/webhook/pawapay', async (req: Request, res: Response) => {
  try {
    if (!validateWebhookSecret(req)) {
      return res.status(403).json({ error: 'Invalid webhook secret' });
    }

    const transactionId = req.body.transactionId || req.body.depositId || req.body.payoutId;
    const status = String(req.body.status || '').toUpperCase();
    const externalId = req.body.externalId || req.body.booking_id;

    console.log(`💰 PawaPay webhook: ${transactionId} (Ext: ${externalId || 'lookup-by-transaction'}) → ${status}`);

    let booking: any = null;
    if (transactionId) {
      const { data } = await supabase
        .from('bookings')
        .select('id, operator_id, price_xaf, price_paid, payment_status')
        .eq('transaction_id', transactionId)
        .maybeSingle();
      booking = data || null;
    }
    if (!booking && externalId && /^[0-9a-f-]{36}$/i.test(String(externalId))) {
      const { data } = await supabase
        .from('bookings')
        .select('id, operator_id, price_xaf, price_paid, payment_status')
        .eq('id', externalId)
        .maybeSingle();
      booking = data || null;
    }

    await appendPaymentEvent({
      booking_id: booking?.id || externalId || null,
      provider: 'pawapay',
      external_id: transactionId || null,
      event_type: 'callback_received',
      event_status: status || 'UNKNOWN',
      amount_xaf: Number(booking?.price_xaf ?? booking?.price_paid ?? 0) || null,
      metadata: req.body,
    });

    // Update booking status in Supabase if transaction is completed
    if (status === 'COMPLETED' && transactionId) {
      if (!booking?.id) {
        return res.status(404).json({ error: 'Payment callback booking not found' });
      }
      const { error } = await supabase.rpc('afat_confirm_mobile_payment', {
        p_booking_id: booking.id,
        p_transaction_id: transactionId,
        p_provider: 'pawapay',
      });
      if (error) throw error;
    } else if (['FAILED', 'REJECTED', 'CANCELLED'].includes(status) && transactionId) {
      await supabase
        .from('bookings')
        .update({
          payment_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq(booking?.id ? 'id' : 'transaction_id', booking?.id || transactionId);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── WHATSAPP WEBHOOK (Twilio) ─────────────────────────────────────────────
router.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const response = await waBridge.handleWebhook(req.body);

    // Twilio expects TwiML in response, but for WhatsApp we can just send the text back
    // or use their MessagingResponse. Since we handle it in waBridge, we send a 200.
    res.set('Content-Type', 'text/xml');
    res.send(`<Response><Message>${response}</Message></Response>`);
  } catch (error) {
    console.error('WhatsApp Webhook error:', error);
    res.status(500).send('<Response><Message>Désolé, une erreur est survenue.</Message></Response>');
  }
});

// ── GUARDIAN MODE (Token-based Live Watch) ────────────────────────────────
router.post('/guardian/token', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res);
    if (!session) return;
    const { booking_id, expires_in_minutes } = req.body;

    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, passenger_id, operator_id')
      .eq('id', booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isStaff = ['planner', 'admin'].includes(String(session.profile.role));
    if (!isStaff && booking.passenger_id !== session.profile.id && booking.operator_id !== session.profile.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://asteck-bot.pages.dev';

    const token = require('crypto').randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (expires_in_minutes || 60) * 60 * 1000);

    const { error } = await supabase
      .from('guardian_tokens')
      .insert({
        token,
        booking_id,
        expires_at: expiresAt
      });

    if (error) throw error;

    res.status(200).json({
      token,
      watch_url: `${frontendBaseUrl.replace(/\/$/, '')}/watch/${token}`,
      expires_at: expiresAt
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ops/map-signal', async (req: Request, res: Response) => {
  try {
    const auth = authPayloadFromRequest(req);
    const {
      profile_id,
      campaign_id,
      vehicle_id,
      checkpoint_id,
      signal_type = 'movement',
      latitude,
      longitude,
      speed,
      speed_kph,
      heading,
      accuracy,
      source = 'app',
      description,
      severity,
      incident_type,
      network_type,
      device_os,
      actor_type = 'app_user',
      verification_hint,
    } = req.body;

    if ((signal_type === 'incident' || incident_type) && source === 'app') {
      const turnstile = await verifyTurnstileToken(req, 'incident_report');
      if (!turnstile.ok) {
        return res.status(turnstile.status).json({ error: turnstile.error });
      }
    }

    const userId = auth?.sub || profile_id;
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('data_ingest_allowed')
        .eq('id', userId)
        .maybeSingle();

      if (!profile || !profile.data_ingest_allowed) {
        return res.status(202).json({
          success: true,
          accepted: false,
          reason: 'telemetry_staged_passive',
          message: 'Telemetry queued under passive review queue. Live ingestion requires Admin activation.'
        });
      }
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Valid latitude and longitude required' });
    }

    const createdAt = new Date().toISOString();
    const movementPayload = {
      user_id: userId || null,
      campaign_id: campaign_id || null,
      latitude: lat,
      longitude: lng,
      speed: Number(speed_kph ?? speed ?? 0) || 0,
      heading: Number(heading || 0),
      accuracy: Number(accuracy || 0),
      device_os: device_os || 'web',
      network_type: network_type || 'unknown',
      timestamp: createdAt,
    };

    const { data: movement, error: movementError } = await supabase
      .from('movement_logs')
      .insert(movementPayload)
      .select('id, timestamp')
      .single();
    if (movementError) throw movementError;

    if (vehicle_id) {
      await supabase
        .from('vehicles')
        .update({
          current_lat: lat,
          current_lng: lng,
          current_location: `POINT(${lng} ${lat})`,
          last_ping_at: createdAt,
          is_available: true,
        })
        .eq('id', vehicle_id);
    }

    let incident = null;
    if (signal_type === 'incident' || incident_type) {
      const { data: createdIncident, error: incidentError } = await supabase
        .from('incidents')
        .insert({
          reporter_id: userId || null,
          reporter_username: auth?.phone || source,
          type: incident_type || 'hazard',
          description: description || 'AFAT field signal',
          latitude: lat,
          longitude: lng,
          location: `POINT(${lng} ${lat})`,
          severity: Math.max(1, Math.min(5, Number(severity || 3))),
          source: checkpoint_id ? 'checkpoint' : source,
          status: checkpoint_id || verification_hint === 'trusted' ? 'verified' : Number(severity || 3) >= 4 ? 'pending' : 'verified',
          verification_status: checkpoint_id || verification_hint === 'trusted' ? 'verified' : 'pending',
          created_at: createdAt,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        })
        .select('id, type, severity, status')
        .single();

      if (incidentError) throw incidentError;
      incident = createdIncident;
    }

    res.status(201).json({
      success: true,
      accepted: true,
      movement,
      incident,
      actor_type,
      checkpoint_id: checkpoint_id || null,
      publish_channels: ['movement_logs', ...(incident ? ['incidents'] : []), ...(vehicle_id ? ['vehicles'] : [])],
      map_effect: {
        contributes_to_live_feed: true,
        contributes_to_safety_score: Boolean(incident),
        contributes_to_demand_radar: signal_type === 'movement',
      },
    });
  } catch (error: any) {
    console.error('Map signal ingest error:', error);
    res.status(500).json({ error: error.message || 'Map signal ingest failed' });
  }
});

/** A review is an atomic incident/ledger decision, never a mere UI label.
 * Only authenticated staff may invoke the service-role-owned RPC.
 */
async function persistMapSignalReview(req: Request, res: Response, movementLogIdOverride?: string) {
  const access=await requireAuthRole(req,res,['admin','planner']);
  if(!access)return;
  const id=String(movementLogIdOverride||req.body?.movement_log_id||'').trim();
  const status=String(req.body?.status||'queued').trim();
  const notes=String(req.body?.decision_notes||'').trim();
  const confidence=Number(req.body?.confidence_score??50);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
    !['queued','validated','dismissed','published'].includes(status)||
    !Number.isInteger(confidence)||confidence<0||confidence>100||
    notes.length<15||notes.length>2000) {
    return res.status(400).json({error:'REVIEW_REQUIRES_EVIDENCE_REASON_AND_VALID_DECISION'});
  }
  if(Number(req.body?.reward_points||0)!==0)
    return res.status(400).json({error:'REVIEW_REWARDS_REQUIRE_SEPARATE_APPROVED_LEDGER_ACTION'});
  try {
    const result=await supabase.rpc('afat_apply_incident_review',{
      p_movement_log_id:id,p_reviewer_id:access.profile.id,
      p_status:status,p_confidence:confidence,p_notes:notes,
    });
    if(result.error){
      const reason=String(result.error.message||'REVIEW_UNAVAILABLE');
      const code=reason.includes('NOT_FOUND')?404:
        reason.includes('CLOSED_INCIDENT')?409:
        reason.includes('NOT_ACTIVE_STAFF')?403:
        reason.includes('REQUIRED')?400:503;
      return res.status(code).json({error:reason});
    }
    return res.status(200).json({
      success:true,accepted:true,review:result.data,
      review_effect:{
        enters_admin_audit:true,
        incident_status_updated:true,
        contributor_rewarded:false,
        publish_ready:result.data?.incident_verification_status==='verified',
      },
    });
  } catch(error:any){
    console.error('Atomic map signal review unavailable',error);
    return res.status(503).json({error:'ATOMIC_INCIDENT_REVIEW_UNAVAILABLE'});
  }
}

router.post('/ops/map-signal-reviews', (req:Request,res:Response)=>
  persistMapSignalReview(req,res));
router.patch('/ops/map-signal-reviews/:movementLogId', (req:Request,res:Response)=>
  persistMapSignalReview(req,res,String(req.params.movementLogId)));

router.get('/ops/checkpoints', async (req: Request, res: Response) => {
  try {
    const regionKey = normalizeRegion(req.query.city as string | undefined);
    const { data: checkpoints, error } = await supabase
      .from('checkpoints')
      .select('id, name, city, zone_label, latitude, longitude, status, checkpoint_type, trust_score, coverage_radius_meters')
      .eq('status', 'active')
      .limit(200);

    if (error) throw error;

    const scoped = (checkpoints || []).filter((checkpoint: any) =>
      withinRegion(Number(checkpoint.latitude), Number(checkpoint.longitude), regionKey)
    );

    res.status(200).json({
      success: true,
      city: regionKey,
      count: scoped.length,
      checkpoints: scoped,
    });
  } catch (error: any) {
    console.error('Checkpoint feed error:', error);
    res.status(500).json({ error: error.message || 'Checkpoint feed failed' });
  }
});

router.post('/ops/checkpoints/enroll', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const {
      checkpoint_name,
      city,
      zone_label,
      latitude,
      longitude,
      checkpoint_type = 'community',
      notes,
    } = req.body;

    const actorId = access.profile.id;

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!checkpoint_name || !city || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'checkpoint_name, city, latitude and longitude are required' });
    }

    const { data: checkpoint, error: checkpointError } = await supabase
      .from('checkpoints')
      .insert({
        name: checkpoint_name,
        city: String(city).trim().toLowerCase(),
        zone_label: zone_label || null,
        latitude: lat,
        longitude: lng,
        checkpoint_type,
        status: 'active',
        trust_score: 50,
        coverage_radius_meters: 350,
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (checkpointError) throw checkpointError;

    const { data: membership, error: membershipError } = await supabase
      .from('checkpoint_memberships')
      .insert({
        checkpoint_id: checkpoint.id,
        profile_id: actorId,
        role: 'captain',
        status: 'active',
        legal_acknowledged: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (membershipError) throw membershipError;

    res.status(201).json({
      success: true,
      checkpoint,
      membership,
    });
  } catch (error: any) {
    console.error('Checkpoint enroll error:', error);
    res.status(500).json({ error: error.message || 'Checkpoint enrollment failed' });
  }
});

router.patch('/ops/operators/:operatorId/status', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;

  try {
    const operatorId = String(req.params.operatorId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    const reviewNotes = String(req.body?.notes || '').trim();
    const allowedStatuses = new Set([
      'APPLICATION_STARTED',
      'DOCUMENTS_PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
    ]);

    if (!operatorId || !allowedStatuses.has(nextStatus)) {
      return res.status(400).json({ error: 'Valid operator id and lifecycle status are required.' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id, role, full_name, is_active, operator_application_status')
      .eq('id', operatorId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing || (!existing.operator_application_status && existing.role !== 'operator')) {
      return res.status(404).json({ error: 'Operator application profile not found.' });
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      operator_application_status: nextStatus,
      operator_review_notes: reviewNotes || null,
      updated_at: nowIso,
      is_active: nextStatus === 'APPROVED',
    };

    if (nextStatus === 'APPROVED') {
      updatePayload.role = 'operator';
      updatePayload.access_level = 'operator';
      updatePayload.approval_status = 'approved';
      updatePayload.operator_approved_at = nowIso;
      updatePayload.verification_status = 'verified';
    } else if (['REJECTED', 'SUSPENDED'].includes(nextStatus)) {
      updatePayload.operator_approved_at = null;
      updatePayload.approval_status = nextStatus === 'SUSPENDED' ? 'suspended' : 'rejected';
      if (nextStatus === 'REJECTED') {
        updatePayload.role = 'commuter';
        updatePayload.access_level = 'verified';
      }
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', operatorId)
      .select('*')
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      operator: profile,
      message: `${existing.full_name || 'Operator'} marked ${nextStatus}.`,
    });
  } catch (error: any) {
    console.error('Operator lifecycle update error:', error);
    return res.status(500).json({ error: error.message || 'Operator lifecycle update failed.' });
  }
});

router.patch('/ops/staff/:profileId/status', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin']);
  if (!access) return;

  try {
    const profileId = String(req.params.profileId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    if (!profileId || !['ACTIVE', 'SUSPENDED'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Valid staff profile and status are required.' });
    }
    if (profileId === access.profile.id && nextStatus === 'SUSPENDED') {
      return res.status(409).json({ error: 'Administrators cannot suspend their own active session.' });
    }

    const { data: staff, error: lookupError } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active, approval_status')
      .eq('id', profileId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!staff || !['planner', 'admin'].includes(String(staff.role || '').toLowerCase())) {
      return res.status(404).json({ error: 'Planner or administrator profile not found.' });
    }

    const isActive = nextStatus === 'ACTIVE';
    const { data: updatedStaff, error: updateError } = await supabase
      .from('profiles')
      .update({
        is_active: isActive,
        approval_status: isActive ? 'approved' : 'suspended',
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select('id, full_name, role, is_active, approval_status')
      .single();
    if (updateError) throw updateError;

    if (!isActive) {
      const { error: revokeError } = await supabase
        .from('auth_refresh_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .is('revoked_at', null);
      if (revokeError) throw revokeError;
    }

    return res.status(200).json({
      success: true,
      staff: updatedStaff,
      message: `${updatedStaff.full_name || updatedStaff.role} marked ${nextStatus}.`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Staff lifecycle update failed.' });
  }
});

router.patch('/ops/companies/:companyId/status', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;

  try {
    const companyId = String(req.params.companyId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const notes = String(req.body?.notes || '').trim();
    const coordinatorProfileId = String(req.body?.coordinator_profile_id || '').trim();
    const allowedStatuses = new Set(['partial_intake', 'under_review', 'approved', 'documents_pending', 'rejected', 'suspended']);

    if (!companyId || !allowedStatuses.has(nextStatus)) {
      return res.status(400).json({ error: 'Valid company id and review status are required.' });
    }

    const nowIso = new Date().toISOString();
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .update({
        compliance_status: nextStatus,
        notes: notes || null,
        updated_at: nowIso,
      })
      .eq('id', companyId)
      .select('*')
      .single();

    if (companyError) throw companyError;

    let coordinator = null;
    if (coordinatorProfileId) {
      const { data: membership } = await supabase
        .from('company_memberships')
        .select('id, profile_id, company_id, role, status')
        .eq('company_id', companyId)
        .eq('profile_id', coordinatorProfileId)
        .maybeSingle();

      if (!membership) {
        return res.status(404).json({ error: 'Coordinator membership not found for this company.' });
      }

      const membershipStatus = nextStatus === 'suspended' || nextStatus === 'rejected' ? 'suspended' : 'active';
      const { error: membershipStatusError } = await supabase
        .from('company_memberships')
        .update({ status: membershipStatus })
        .eq('id', membership.id);

      if (membershipStatusError) throw membershipStatusError;

      const { data: updatedCoordinator, error: coordinatorError } = await supabase
        .from('profiles')
        .update({
          operator_review_notes: notes || `Company status moved to ${nextStatus}.`,
          updated_at: nowIso,
        })
        .eq('id', coordinatorProfileId)
        .select('id, full_name, role, is_active')
        .single();

      if (coordinatorError) throw coordinatorError;
      coordinator = updatedCoordinator;
    }

    return res.status(200).json({
      success: true,
      company,
      coordinator,
      message: `${company.name || 'Company'} marked ${nextStatus}.`,
    });
  } catch (error: any) {
    console.error('Company lifecycle update error:', error);
    return res.status(500).json({ error: error.message || 'Company lifecycle update failed.' });
  }
});

router.post('/ops/notifications/send', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;

    const {
      user_ids,
      role,
      city,
      channels,
      title,
      body,
      type = 'ops_broadcast',
      reference_id,
    } = req.body || {};

    if ((!Array.isArray(user_ids) || !user_ids.length) && !role) {
      return res.status(400).json({ error: 'Provide user_ids or a role target.' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required.' });
    }

    const { recipients, deliveries } = await notifyRecipients(
      {
        user_ids: Array.isArray(user_ids) ? user_ids.filter(Boolean) : undefined,
        role: role ? String(role).toLowerCase() : undefined,
        city: city ? String(city).trim().toLowerCase() : undefined,
      },
      {
        type,
        title,
        body,
        referenceId: reference_id || null,
        channels: Array.isArray(channels) ? channels : ['in_app'],
      }
    );

    res.status(200).json({
      success: true,
      sent_by: access.profile.id,
      recipient_count: recipients.length,
      recipients,
      deliveries,
    });
  } catch (error: any) {
    console.error('Ops notification send error:', error);
    res.status(500).json({ error: error.message || 'Notification send failed' });
  }
});

router.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { prompt, user_name, user_role, context, language, task } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const systemPrompt = [
      `You are AFAT Guidance, the calm transport intelligence layer for Cameroon.`,
      `User: ${user_name || 'Guardian'} (${user_role || 'commuter'}).`,
      context ? `Context: ${context}` : '',
      language ? `Reply in ${language}.` : '',
      `Keep replies short, practical, and transport-focused.`
    ].filter(Boolean).join('\n');

    const result = await aiRouter.route((task as any) || 'predict', {
      prompt,
      system: systemPrompt,
      text: prompt
    });

    res.status(200).json({
      success: true,
      text: result.text,
      model: result.model
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: error.message || 'AI chat failed' });
  }
});

router.post('/ai/vision', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { image, prompt } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image required' });
    }

    const result = await aiRouter.route('vision', {
      image,
      prompt: prompt || 'Analyze this AFAT transport image for hazards, incidents, or useful route intelligence.'
    });

    res.status(200).json({
      success: true,
      text: result.text,
      model: result.model
    });
  } catch (error: any) {
    console.error('AI vision error:', error);
    res.status(500).json({ error: error.message || 'AI vision failed' });
  }
});

router.post('/ai/analyze', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { text, language } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }

    const result = await brainService.analyze(text);
    res.status(200).json({
      success: true,
      language: language || 'fr',
      result
    });
  } catch (error: any) {
    console.error('AI analyze error:', error);
    res.status(500).json({ error: error.message || 'AI analyze failed' });
  }
});

// ── PRIVACY-SAFE PUBLIC PARTNER CONDITIONS ───────────────────────────────
router.get('/public-partner/mobility-conditions', async (req: Request, res: Response) => {
  try {
    const { auth, profile } = await getAuthProfileByToken(req);
    if (!auth?.sub || !profile?.id) {
      return res.status(401).json({ error: 'Authenticated public partner identity required.' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('public_partner_memberships')
      .select('partner_id, role, status, permission_scope')
      .eq('profile_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      return res.status(403).json({ error: 'Active public partner membership required.' });
    }

    const { data: partner, error: partnerError } = await supabase
      .from('public_partner_entities')
      .select('id, name, jurisdiction, service_coverage, status')
      .eq('id', membership.partner_id)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner || ['rejected', 'suspended'].includes(String(partner.status))) {
      return res.status(403).json({ error: 'Public partner workspace is not active.' });
    }

    const regionKey = normalizeRegion(req.query.city as string | undefined);
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const [{ data: incidents }, { data: vehicles }, { data: checkpoints }] = await Promise.all([
      supabase
        .from('incidents')
        .select('id, type, severity, status, verification_status, latitude, longitude, location, created_at')
        .gte('created_at', since)
        .neq('status', 'false')
        .order('created_at', { ascending: false })
        .limit(160),
      supabase
        .from('vehicles')
        .select('id, is_available, current_lat, current_lng')
        .eq('is_available', true)
        .limit(500),
      supabase
        .from('checkpoints')
        .select('id, name, city, zone_label, latitude, longitude, status, checkpoint_type, coverage_radius_meters')
        .eq('status', 'active')
        .limit(120),
    ]);

    const scopedIncidents = reviewedSafetyFeed(incidents || []).filter((incident: any) => {
      const point = {
        latitude: Number(incident.latitude ?? parsePointText(incident.location)?.latitude),
        longitude: Number(incident.longitude ?? parsePointText(incident.location)?.longitude),
      };
      return withinRegion(point.latitude, point.longitude, regionKey);
    });
    const scopedVehicles = (vehicles || []).filter((vehicle: any) =>
      withinRegion(Number(vehicle.current_lat), Number(vehicle.current_lng), regionKey)
    );
    const scopedCheckpoints = (checkpoints || []).filter((checkpoint: any) =>
      withinRegion(Number(checkpoint.latitude), Number(checkpoint.longitude), regionKey)
    );

    res.json({
      success: true,
      privacy: 'aggregated_no_personal_data',
      partner: { id: partner.id, name: partner.name, jurisdiction: partner.jurisdiction, status: partner.status },
      region: regionKey,
      incidents: scopedIncidents,
      checkpoints: scopedCheckpoints,
      vehicles: [],
      service_summary: {
        available_vehicle_count: scopedVehicles.length,
        active_checkpoint_count: scopedCheckpoints.length,
        validated_incident_count: scopedIncidents.length,
      },
      excluded_fields: ['citizen_identity', 'reporter_identity', 'operator_identity', 'operator_financials', 'dispatch_assignments'],
    });
  } catch (error: any) {
    console.error('Public partner conditions error:', error);
    res.status(500).json({ error: error.message || 'Public mobility conditions unavailable.' });
  }
});

router.post('/public-partner/responses', async (req: Request, res: Response) => {
  try {
    const { auth, profile } = await getAuthProfileByToken(req);
    if (!auth?.sub || !profile?.id) {
      return res.status(401).json({ error: 'Authenticated public partner identity required.' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('public_partner_memberships')
      .select('partner_id, role, status, permission_scope')
      .eq('profile_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      return res.status(403).json({ error: 'Active public partner membership required.' });
    }

    const { data: partner, error: partnerError } = await supabase
      .from('public_partner_entities')
      .select('id, name, jurisdiction, mandate_scope, status')
      .eq('id', membership.partner_id)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner || ['rejected', 'suspended'].includes(String(partner.status))) {
      return res.status(403).json({ error: 'Public partner workspace is not active.' });
    }

    const evidenceId = String(req.body?.evidence_id || '').trim();
    const actions = Array.isArray(req.body?.requested_actions)
      ? req.body.requested_actions.map((action: unknown) => String(action).trim()).filter(Boolean).slice(0, 8)
      : [];
    if (!evidenceId || actions.length === 0) {
      return res.status(400).json({ error: 'Validated evidence and at least one requested action are required.' });
    }

    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .select('id, type, severity, status, verification_status, location')
      .eq('id', evidenceId)
      .maybeSingle();
    if (incidentError) throw incidentError;
    if (!incident) {
      return res.status(404).json({ error: 'The selected public mobility evidence is no longer available.' });
    }
    if (!reviewedSafetyFeed([incident]).length) {
      return res.status(409).json({ error: 'Independent incident review is required before public-partner action.' });
    }

    const nowIso = new Date().toISOString();
    const { data: request, error: requestError } = await supabase
      .from('service_requests')
      .insert({
        requester_id: profile.id,
        service_type: 'complaint',
        origin: partner.jurisdiction || 'Public jurisdiction',
        destination: incident.location || incident.type || 'Validated movement condition',
        priority: Number(incident.severity || 0) >= 4 ? 'high' : 'normal',
        status: 'needs_review',
        notes: actions.join('; '),
        contact_name: profile.full_name || null,
        contact_phone: profile.phone || null,
        metadata: {
          category: 'public_mobility_response',
          public_partner_id: partner.id,
          public_partner_name: partner.name,
          membership_role: membership.role,
          permission_scope: membership.permission_scope,
          mandate_scope: partner.mandate_scope,
          evidence_id: incident.id,
          evidence_type: incident.type,
          requested_actions: actions,
          approval_state: 'public_approval_required',
        },
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, status, priority, created_at')
      .single();
    if (requestError) throw requestError;

    return res.status(201).json({
      success: true,
      request,
      approval_state: 'public_approval_required',
      message: 'Public mobility response entered mandate-scoped review.',
    });
  } catch (error: any) {
    console.error('Public partner response error:', error);
    return res.status(500).json({ error: error.message || 'Public mobility response could not be created.' });
  }
});

// Passenger, operator and organisation members receive a sanitized map feed.
// The staff live-map below remains richer and Planner/Admin-only.
router.get('/mobility/map-feed', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['commuter', 'operator']);
    if (!access) return;
    const regionKey = normalizeRegion(req.query.city as string | undefined);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: incidents }, { data: vehicles }, { data: checkpoints }, { data: addressLedger }] = await Promise.all([
      supabase
        .from('incidents')
        .select('id, type, severity, status, verification_status, latitude, longitude, location, created_at')
        .gte('created_at', since)
        .neq('status', 'false')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('vehicles')
        .select('id, type, is_available, current_lat, current_lng, last_ping_at, rating')
        .eq('is_available', true)
        .limit(200),
      supabase
        .from('checkpoints')
        .select('id, name, city, zone_label, latitude, longitude, status, checkpoint_type, trust_score, coverage_radius_meters')
        .eq('status', 'active')
        .limit(120),
      supabase
        .from('afat_address_ledger')
        .select('id, canonical_label, city, zone_label, address_type, latitude, longitude, access_notes, confidence, status, source')
        .in('status', ['candidate', 'verified'])
        .limit(200),
    ]);

    const scopedIncidents = reviewedSafetyFeed(incidents || []).filter((incident: any) => {
      const point = {
        latitude: Number(incident.latitude ?? parsePointText(incident.location)?.latitude),
        longitude: Number(incident.longitude ?? parsePointText(incident.location)?.longitude),
      };
      return withinRegion(point.latitude, point.longitude, regionKey);
    });
    const scopedVehicles = (vehicles || []).filter((vehicle: any) =>
      withinRegion(Number(vehicle.current_lat), Number(vehicle.current_lng), regionKey)
    );
    const scopedCheckpoints = (checkpoints || []).filter((checkpoint: any) =>
      withinRegion(Number(checkpoint.latitude), Number(checkpoint.longitude), regionKey)
    );
    const scopedAddresses = (addressLedger || []).filter((address: any) =>
      withinRegion(Number(address.latitude), Number(address.longitude), regionKey)
    );

    res.json({
      success: true,
      privacy: 'sanitized_mobility_feed',
      region: regionKey,
      incidents: scopedIncidents,
      vehicles: scopedVehicles,
      checkpoints: scopedCheckpoints,
      addresses: scopedAddresses,
      excluded_fields: ['passenger_identity', 'reporter_identity', 'operator_identity', 'plate_number', 'operator_financials', 'dispatch_assignment'],
    });
  } catch (error: any) {
    console.error('Sanitized mobility feed error:', error);
    res.status(500).json({ error: error.message || 'Mobility map feed unavailable.' });
  }
});

// ── OPS COMMAND CENTER (Reports, Dispatch, Safety, Demand) ────────────────
router.get('/ops/live-map', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const regionKey = normalizeRegion(req.query.city as string | undefined);
    const region = LIVE_MAP_REGIONS[regionKey];
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const [{ data: vehicles }, { data: incidents }, { data: dispatches }, { data: checkpoints }, { data: missionSignals }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, operator_id, plate_number, type, is_available, current_lat, current_lng, last_ping_at, rating')
        .eq('is_available', true)
        .limit(200),
      supabase
        .from('incidents')
        .select('id, type, description, severity, status, verification_status, latitude, longitude, location, created_at, reporter_username')
        .gte('created_at', since)
        .neq('status', 'false')
        .order('created_at', { ascending: false })
        .limit(160),
      supabase
        .from('dispatch_assignments')
        .select('id, booking_id, operator_id, vehicle_id, status, priority, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, created_at')
        .in('status', ['queued', 'assigned', 'en_route', 'arrived'])
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('checkpoints')
        .select('id, name, city, zone_label, latitude, longitude, status, checkpoint_type, trust_score, coverage_radius_meters')
        .eq('status', 'active')
        .limit(120),
      supabase
        .from('movement_logs')
        .select('id, user_id, campaign_id, latitude, longitude, speed, heading, accuracy, timestamp')
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(180),
    ]);

    const scopedVehicles = (vehicles || []).filter((vehicle: any) =>
      withinRegion(Number(vehicle.current_lat), Number(vehicle.current_lng), regionKey)
    );

    const scopedIncidents = (incidents || []).filter((incident: any) => {
      const point = {
        latitude: Number(incident.latitude ?? parsePointText(incident.location)?.latitude),
        longitude: Number(incident.longitude ?? parsePointText(incident.location)?.longitude),
      };
      return withinRegion(point.latitude, point.longitude, regionKey);
    });

    const scopedDispatches = (dispatches || []).filter((dispatch: any) => {
      const pickupLat = Number(dispatch.pickup_lat);
      const pickupLng = Number(dispatch.pickup_lng);
      const dropoffLat = Number(dispatch.dropoff_lat);
      const dropoffLng = Number(dispatch.dropoff_lng);
      return (
        withinRegion(pickupLat, pickupLng, regionKey) ||
        withinRegion(dropoffLat, dropoffLng, regionKey) ||
        (!Number.isFinite(pickupLat) && !Number.isFinite(dropoffLat))
      );
    });

    const scopedCheckpoints = (checkpoints || []).filter((checkpoint: any) =>
      withinRegion(Number(checkpoint.latitude), Number(checkpoint.longitude), regionKey)
    );

    const scopedMissionSignals = (missionSignals || []).filter((signal: any) =>
      withinRegion(Number(signal.latitude), Number(signal.longitude), regionKey)
    );

    const urgentAlerts = urgentReviewedAlerts(scopedIncidents)
      .slice(0, 6)
      .map((incident: any) => ({
        id: incident.id,
        title: incident.type || 'incident',
        severity: incident.severity || 3,
        description: incident.description || 'Live terrain signal',
        created_at: incident.created_at,
        source: incident.reporter_username || 'AFAT field grid',
      }));

    const signalFreshness = scopedVehicles.map((vehicle: any) => {
      const lastPing = vehicle.last_ping_at ? new Date(vehicle.last_ping_at).getTime() : 0;
      return lastPing ? Math.max(0, Math.round((Date.now() - lastPing) / 1000)) : null;
    }).filter((age: number | null) => age !== null) as number[];

    const averageSignalAgeSeconds = signalFreshness.length
      ? Math.round(signalFreshness.reduce((sum, age) => sum + age, 0) / signalFreshness.length)
      : null;

    const enrichedVehicles = scopedVehicles.map((vehicle: any) => {
      const ageSeconds = vehicle.last_ping_at
        ? Math.max(0, Math.round((Date.now() - new Date(vehicle.last_ping_at).getTime()) / 1000))
        : null;
      return {
        ...vehicle,
        vehicle_type: vehicle.type,
        signal_age_seconds: ageSeconds,
        signal_quality: ageSeconds === null ? 'unknown' : ageSeconds <= 60 ? 'fresh' : ageSeconds <= 300 ? 'aging' : 'stale',
        publish_channel: 'vehicles',
      };
    });

    const enrichedIncidents = scopedIncidents.map((incident: any) => ({
      ...incident,
      publish_channel: 'incidents',
      trust_state: incidentReviewLabel(incident),
    }));

    const verifiedIncidents = reviewedSafetyFeed(scopedIncidents);

    const missionSignalIds = scopedMissionSignals.map((signal: any) => signal.id).filter(Boolean);
    const { data: signalReviews } = missionSignalIds.length
      ? await supabase
        .from('map_signal_reviews')
        .select('movement_log_id, status, confidence_score, reward_points, reviewed_at, decision_notes')
        .in('movement_log_id', missionSignalIds)
      : { data: [] as any[] };
    const reviewBySignal = new Map((signalReviews || []).map((review: any) => [review.movement_log_id, review]));

    res.status(200).json({
      success: true,
      city: regionKey,
      label: region.label,
      generated_at: new Date().toISOString(),
      center: region.center,
      summary: {
        active_vehicles: scopedVehicles.length,
        active_incidents: verifiedIncidents.length,
        pending_review_incidents: scopedIncidents.length-verifiedIncidents.length,
        urgent_alerts: urgentAlerts.length,
        verified_incidents: verifiedIncidents.length,
        active_dispatches: scopedDispatches.length,
        average_signal_age_seconds: averageSignalAgeSeconds,
        publish_channels: ['vehicles', 'movement_logs', 'incidents', 'dispatch_assignments', 'checkpoints'],
        data_contract: 'AFAT live-map v2',
        recommended_mode:
          urgentAlerts.length >= 3 ? 'alert' : scopedDispatches.length > scopedVehicles.length ? 'demand_pressure' : 'stable',
        city_scale_ready: ['yaounde', 'douala', 'bafoussam', 'garoua', 'cameroon'],
      },
      geodata: {
        foundation: 'local_open_data_packs',
        live_overlay: true,
        region_radius_km: region.radiusKm,
        center: region.center,
      },
      transmission: {
        receives: ['app telemetry', 'operator vehicle pings', 'citizen reports', 'dispatch assignments', 'checkpoint stewards'],
        publishes: ['live map feed', 'safety score', 'demand radar', 'operator guidance', 'admin review queue', 'checkpoint network'],
        ingest_endpoint: '/api/ops/map-signal',
      },
      alerts: urgentAlerts,
      vehicles: enrichedVehicles,
      incidents: enrichedIncidents,
      dispatches: scopedDispatches,
      checkpoints: scopedCheckpoints.map((checkpoint: any) => ({
        ...checkpoint,
        publish_channel: 'checkpoints',
      })),
      campaign_signals: scopedMissionSignals.map((signal: any) => ({
        ...signal,
        publish_channel: 'movement_logs',
        review: reviewBySignal.get(signal.id) || null,
        review_status: reviewBySignal.get(signal.id)?.status || 'new',
        signal_age_seconds: signal.timestamp ? Math.max(0, Math.round((Date.now() - new Date(signal.timestamp).getTime()) / 1000)) : null,
      })),
    });
  } catch (error: any) {
    console.error('Live map feed error:', error);
    res.status(500).json({ error: error.message || 'Live map feed failed' });
  }
});

router.get('/ops/report-center', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: reports, error } = await supabase
      .from('incidents')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) throw error;

    const items = reports || [];
    const active = items.filter((report: any) => !['resolved', 'dismissed', 'expired', 'false'].includes(report.status));
    const severe = active.filter((report: any) => Number(report.severity || 0) >= 4);
    const verified = items.filter((report: any) => ['verified', 'confirmed'].includes(report.status) || report.verification_status === 'verified');

    res.status(200).json({
      success: true,
      summary: {
        total_24h: items.length,
        active: active.length,
        severe: severe.length,
        verified: verified.length,
        safety_score: scoreFromIncidentLoad(active.length, severe.length),
      },
      reports: items,
    });
  } catch (error: any) {
    console.error('Report center error:', error);
    res.status(500).json({ error: error.message || 'Report center fetch failed' });
  }
});

router.patch('/ops/reports/:id/status', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const { id } = req.params;
    const { status, resolver_id } = req.body;
    const allowed = ['new', 'pending', 'verified', 'resolved', 'dismissed', 'expired'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const update: any = {
      status,
      verification_status: status,
      updated_at: new Date().toISOString(),
    };

    if (['resolved', 'dismissed', 'expired'].includes(status)) {
      update.resolved_at = new Date().toISOString();
      update.resolver_id = resolver_id || access.profile.id;
    }

    const { data, error } = await supabase
      .from('incidents')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ success: true, report: data });
  } catch (error: any) {
    console.error('Report status update error:', error);
    res.status(500).json({ error: error.message || 'Report status update failed' });
  }
});

router.get('/ops/safety-score', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query.lat || 3.866);
    const lng = Number(req.query.lng || 11.514);
    const radiusKm = Number(req.query.radius_km || 5);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('id, type, severity, status, latitude, longitude, location, created_at')
      .gte('created_at', since)
      .neq('status', 'false');

    if (error) throw error;

    const radiusDegrees = radiusKm / 111;
    const nearby = (incidents || []).filter((incident: any) => {
      const point = {
        latitude: Number(incident.latitude ?? parsePointText(incident.location)?.latitude),
        longitude: Number(incident.longitude ?? parsePointText(incident.location)?.longitude),
      };
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
      return Math.abs(point.latitude - lat) <= radiusDegrees && Math.abs(point.longitude - lng) <= radiusDegrees;
    });

    const severe = nearby.filter((incident: any) => Number(incident.severity || 0) >= 4);
    const score = scoreFromIncidentLoad(nearby.length, severe.length);

    res.status(200).json({
      success: true,
      score,
      level: score >= 80 ? 'stable' : score >= 55 ? 'caution' : 'high-risk',
      radius_km: radiusKm,
      incident_count: nearby.length,
      severe_count: severe.length,
      top_signals: nearby.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Safety score error:', error);
    res.status(500).json({ error: error.message || 'Safety score failed' });
  }
});

router.get('/ops/demand-radar', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const since = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const [{ data: bookings }, { data: vehicles }, { data: movements }] = await Promise.all([
      supabase.from('bookings').select('id, status, route_id, created_at, routes(name, origin, destination)').gte('created_at', since),
      supabase.from('vehicles').select('id, operator_id, type, is_available, current_lat, current_lng, last_ping_at').eq('is_available', true),
      supabase.from('movement_logs').select('id, latitude, longitude, timestamp').gte('timestamp', since).limit(200),
    ]);

    const bookingCount = (bookings || []).length;
    const vehicleCount = (vehicles || []).length;
    const pulseCount = (movements || []).length;
    const pressure = bookingCount * 2 + pulseCount * 0.25 - vehicleCount;

    res.status(200).json({
      success: true,
      summary: {
        booking_count: bookingCount,
        active_vehicles: vehicleCount,
        telemetry_pulses: pulseCount,
        pressure: Math.round(pressure),
        recommendation: pressure > 20 ? 'add_supply' : pressure < 4 ? 'hold_supply' : 'balanced',
      },
      routes: bookings || [],
      vehicles: vehicles || [],
      pulses: movements || [],
    });
  } catch (error: any) {
    console.error('Demand radar error:', error);
    res.status(500).json({ error: error.message || 'Demand radar failed' });
  }
});

router.get('/ops/compliance-radar', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const lookback = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: records, error } = await supabase
      .from('compliance_records')
      .select('*')
      .gte('created_at', lookback)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const items = records || [];
    const active = items.filter((record: any) => !['verified', 'missing'].includes(record.status));
    const verified = items.filter((record: any) => record.status === 'verified');
    const dueSoon = items.filter((record: any) => {
      if (!record.due_at) return false;
      const remaining = new Date(record.due_at).getTime() - Date.now();
      return remaining > 0 && remaining <= 30 * 24 * 60 * 60 * 1000;
    });
    const overdue = items.filter((record: any) => {
      if (!record.due_at) return false;
      return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
    });

    const byRole = items.reduce((acc: Record<string, number>, record: any) => {
      acc[record.role] = (acc[record.role] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      summary: {
        total: items.length,
        active: active.length,
        verified: verified.length,
        due_soon: dueSoon.length,
        overdue: overdue.length,
        score: scoreFromCompliance(items),
      },
      by_role: byRole,
      records: items,
    });
  } catch (error: any) {
    console.error('Compliance radar error:', error);
    res.status(500).json({ error: error.message || 'Compliance radar failed' });
  }
});

router.get('/ops/operational-health', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;

  try {
    const now = Date.now();
    const dispatchCutoff = new Date(now - 20 * 60 * 1000).toISOString();
    const paymentCutoff = new Date(now - 10 * 60 * 1000).toISOString();
    const telemetryCutoff = new Date(now - 8 * 60 * 1000).toISOString();

    const [
      stuckDispatchResult,
      pendingPaymentResult,
      activeJourneyResult,
      recentSamplesResult,
      fieldReportResult,
      staleVehicleResult,
    ] = await Promise.all([
      supabase
        .from('dispatch_assignments')
        .select('id,status,operator_id,vehicle_id,booking_id,updated_at')
        .in('status', ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','reassigned'])
        .lt('updated_at', dispatchCutoff)
        .order('updated_at', { ascending: true })
        .limit(50),
      supabase
        .from('bookings')
        .select('id,transaction_id,payment_status,price_xaf,updated_at')
        .eq('payment_status', 'collection_pending')
        .lt('updated_at', paymentCutoff)
        .order('updated_at', { ascending: true })
        .limit(50),
      supabase
        .from('afat_journeys')
        .select('id,dispatch_assignment_id,passenger_id,operator_id,vehicle_id,status,started_at,updated_at')
        .eq('status', 'active')
        .order('updated_at', { ascending: true })
        .limit(100),
      supabase
        .from('afat_journey_samples')
        .select('journey_id,recorded_at')
        .gte('recorded_at', telemetryCutoff)
        .limit(1000),
      supabase
        .from('afat_field_reports')
        .select('id,dispatch_assignment_id,report_type,severity,status,recorded_at')
        .in('status', ['submitted','triaged'])
        .order('severity', { ascending: false })
        .order('recorded_at', { ascending: true })
        .limit(100),
      supabase
        .from('vehicles')
        .select('id,operator_id,plate_number,type,is_available,last_ping_at,status,clearance_status')
        .eq('is_available', true)
        .or(`last_ping_at.is.null,last_ping_at.lt.${telemetryCutoff}`)
        .limit(100),
    ]);

    const errors = [
      stuckDispatchResult.error,
      pendingPaymentResult.error,
      activeJourneyResult.error,
      recentSamplesResult.error,
      fieldReportResult.error,
      staleVehicleResult.error,
    ].filter(Boolean);
    if (errors.length) throw errors[0];

    const sampledJourneys = new Set((recentSamplesResult.data || []).map((sample: any) => sample.journey_id));
    const journeysWithoutRecentEvidence = (activeJourneyResult.data || [])
      .filter((journey: any) => !sampledJourneys.has(journey.id));

    const stuckDispatches = stuckDispatchResult.data || [];
    const pendingPayments = pendingPaymentResult.data || [];
    const fieldReports = fieldReportResult.data || [];
    const staleVehicles = staleVehicleResult.data || [];

    const critical =
      journeysWithoutRecentEvidence.length
      + fieldReports.filter((report: any) => Number(report.severity || 0) >= 4).length;
    const warning =
      stuckDispatches.length
      + pendingPayments.length
      + staleVehicles.length
      + fieldReports.filter((report: any) => Number(report.severity || 0) < 4).length;

    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      thresholds: {
        dispatch_stuck_minutes: 20,
        payment_pending_minutes: 10,
        journey_evidence_stale_minutes: 8,
      },
      summary: {
        critical,
        warning,
        healthy: critical === 0 && warning === 0,
        stuck_dispatches: stuckDispatches.length,
        stale_payments: pendingPayments.length,
        journeys_without_recent_evidence: journeysWithoutRecentEvidence.length,
        unreviewed_field_reports: fieldReports.length,
        stale_available_vehicles: staleVehicles.length,
      },
      stuck_dispatches: stuckDispatches,
      stale_payments: pendingPayments,
      journeys_without_recent_evidence: journeysWithoutRecentEvidence,
      field_reports: fieldReports,
      stale_available_vehicles: staleVehicles,
    });
  } catch (error: any) {
    console.error('Operational health error:', error);
    return res.status(500).json({ error: error?.message || 'Operational health unavailable.' });
  }
});

router.get('/dispatch/active', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;

  try {
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .select('*')
      .in('status', ['queued', 'assigned', 'en_route', 'arrived'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.status(200).json({ success: true, dispatches: data || [] });
  } catch (error: any) {
    console.error('Active dispatch fetch error:', error);
    res.status(500).json({ error: error.message || 'Active dispatch fetch failed' });
  }
});

const complianceBucket='afat-operator-compliance';
const supportedComplianceMime:Record<string,string>={
  'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp',
};
const complianceUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function complianceRecordForCaller(req:Request,res:Response,recordId:string,staffOnly=false){
  const access=await requireAuthRole(req,res,staffOnly?['admin','planner']:undefined);
  if(!access)return null;
  if(!complianceUuid.test(recordId)){res.status(400).json({error:'VALID_COMPLIANCE_RECORD_REQUIRED'});return null;}
  const record=await supabase.from('compliance_records').select(
    'id,profile_id,role,document_type,status,file_url,due_at,verified_at',
  ).eq('id',recordId).maybeSingle();
  if(record.error){res.status(503).json({error:'COMPLIANCE_LOOKUP_UNAVAILABLE'});return null;}
  if(!record.data){res.status(404).json({error:'COMPLIANCE_RECORD_NOT_FOUND'});return null;}
  const staff=['admin','planner'].includes(String(access.workspaceRole||access.profile.role));
  if(!staff&&record.data.profile_id!==access.profile.id){
    res.status(403).json({error:'DOCUMENT_OWNERSHIP_REQUIRED'});return null;
  }
  if(!staff&&!['operator','bike_rider'].includes(record.data.role)){
    res.status(403).json({error:'OPERATOR_DOCUMENT_REQUIRED'});return null;
  }
  return {access,record:record.data,staff};
}

// Owner-only upload URL for an already-created compliance record. Each upload
// replaces the review request, not verification. No credentials leak to UI.
router.post('/compliance/:id/upload-authorize',async(req:Request,res:Response)=>{
  const scope=await complianceRecordForCaller(req,res,String(req.params.id||''));
  if(!scope)return;
  if(scope.access.profile.id!==scope.record.profile_id){
    return res.status(403).json({error:'DOCUMENT_OWNER_REQUIRED'});
  }
  const mime=String(req.body?.mime_type||'');
  const bytes=Number(req.body?.bytes);
  const ext=supportedComplianceMime[mime];
  if(!ext||!Number.isSafeInteger(bytes)||bytes<1||bytes>8*1024*1024)
    return res.status(400).json({error:'PDF_OR_IMAGE_UNDER_8MB_REQUIRED'});
  if(!['vehicle_registration','bike_registration','helmet_compliance','insurance','license','national_id'].includes(scope.record.document_type))
    return res.status(400).json({error:'DOCUMENT_TYPE_NOT_SUPPORTED_FOR_UPLOAD'});
  const filename=`${crypto.randomUUID()}.${ext}`;
  const prefix=`${scope.record.profile_id}/${scope.record.id}`;
  const path=`${prefix}/${filename}`;
  const token=await supabase.storage.from(complianceBucket).createSignedUploadUrl(path);
  if(token.error||!token.data?.token)
    return res.status(503).json({error:'PRIVATE_DOCUMENT_UPLOAD_UNAVAILABLE'});
  return res.status(200).json({
    success:true,bucket:complianceBucket,path,token:token.data.token,
    private:true,maximum_bytes:8*1024*1024,
    review_status:'not_verified', // signed upload does not prove contents
  });
});

// Finalize only a file found at precisely the owner/record-specific path.
// Old reviewed evidence is invalidated atomically at the record update.
router.post('/compliance/:id/upload-confirm',async(req:Request,res:Response)=>{
  const scope=await complianceRecordForCaller(req,res,String(req.params.id||''));
  if(!scope)return;
  if(scope.access.profile.id!==scope.record.profile_id)
    return res.status(403).json({error:'DOCUMENT_OWNER_REQUIRED'});
  const path=String(req.body?.path||'');
  const prefix=`${scope.record.profile_id}/${scope.record.id}/`;
  const filename=path.startsWith(prefix)?path.slice(prefix.length):'';
  if(!/^[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/i.test(filename)||!complianceUuid.test(filename.slice(0,36))||
     path!==prefix+filename)
    return res.status(400).json({error:'OWNED_UPLOAD_PATH_REQUIRED'});
  const result=await supabase.storage.from(complianceBucket).list(
    prefix.replace(/\/$/,''),{search:filename,limit:100},
  );
  if(result.error)return res.status(503).json({error:'PRIVATE_DOCUMENT_CHECK_UNAVAILABLE'});
  const uploaded=(result.data||[]).find(entry=>entry.name===filename);
  if(!uploaded||!uploaded.id||!Number.isFinite(uploaded.metadata?.size)||
     Number(uploaded.metadata?.size)<1||Number(uploaded.metadata?.size)>8*1024*1024)
    return res.status(409).json({error:'UPLOAD_NOT_CONFIRMED_OR_SIZE_INVALID'});
  const uri=`${complianceBucket}/${path}`;
  const updated=await supabase.from('compliance_records').update({
    file_url:uri,status:'submitted',verified_at:null,
    updated_at:new Date().toISOString(),
  }).eq('id',scope.record.id).eq('profile_id',scope.record.profile_id)
    .select('id,profile_id,document_type,status,verified_at').single();
  if(updated.error)return res.status(503).json({error:'COMPLIANCE_SUBMISSION_UNAVAILABLE'});
  return res.status(200).json({success:true,record:updated.data,
    review_required:true,automatic_verification:false});
});

// Staff receives only a short-lived private URL for a specific reviewed record.
// No public bucket, listing or permanent signed access is exposed.
router.get('/compliance/:id/review-file',async(req:Request,res:Response)=>{
  const scope=await complianceRecordForCaller(req,res,String(req.params.id||''),true);
  if(!scope)return;
  const full=String(scope.record.file_url||'');
  if(!full.startsWith(complianceBucket+'/'))
    return res.status(404).json({error:'PRIVATE_DOCUMENT_NOT_SUBMITTED'});
  const path=full.slice(complianceBucket.length+1);
  const prefix=`${scope.record.profile_id}/${scope.record.id}/`;
  if(!path.startsWith(prefix)||!/^[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/i.test(path.slice(prefix.length)))
    return res.status(409).json({error:'DOCUMENT_STORAGE_PROVENANCE_UNTRUSTED'});
  const signed=await supabase.storage.from(complianceBucket).createSignedUrl(path,120);
  if(signed.error||!signed.data?.signedUrl)
    return res.status(503).json({error:'PRIVATE_REVIEW_FILE_UNAVAILABLE'});
  return res.status(200).json({success:true,document_type:scope.record.document_type,
    expires_in_seconds:120,url:signed.data.signedUrl,
    review_required:true,automatically_verified:false});
});

// Repair legacy motorcycle operator intakes that predated mandatory
// insurance records. Creates an EMPTY pending record only, never evidence.
router.post('/compliance/operator/ensure-required',async(req:Request,res:Response)=>{
 const access=await requireAuthRole(req,res,['operator']);
 if(!access)return;
 const id=access.profile.id;
 try{
  const existing=await supabase.from('compliance_records')
   .select('id,document_type,role').eq('profile_id',id).in('role',['operator','bike_rider']);
  if(existing.error)throw existing.error;
  const prior=existing.data||[];
  const isMoto=prior.some(r=>r.role==='bike_rider'||r.document_type==='bike_registration');
  const required=isMoto
    ? [{document_type:'bike_registration',document_label:'Motorcycle registration'},
       {document_type:'insurance',document_label:'Current motorcycle insurance'},
       {document_type:'helmet_compliance',document_label:'Helmet and rider safety'}]
    : [{document_type:'vehicle_registration',document_label:'Vehicle registration card'},
       {document_type:'insurance',document_label:'Vehicle insurance'}];
  const role=isMoto?'bike_rider':'operator';
  const missing=required.filter(item=>!prior.some(r=>r.role===role&&r.document_type===item.document_type));
  // A one-time existing profile reconciliation, not arbitrary document creation.
  if(missing.length){
   const inserted=await supabase.from('compliance_records').insert(missing.map(item=>({
    profile_id:id,role,document_type:item.document_type,document_label:item.document_label,
    package_tier:'core_operator',status:'pending',followup_channel:'manual',
    notes:'Missing mandatory evidence record seeded for operator self-submission; not verified.',
   })));
   if(inserted.error)throw inserted.error;
  }
  return res.status(200).json({success:true,created_missing:missing.map(x=>x.document_type),
    automatically_verified:false,review_required:true});
 }catch(error:any){
  console.error('Operator evidence intake reconciliation failed',error);
  return res.status(503).json({error:'OPERATOR_COMPLIANCE_RECONCILIATION_UNAVAILABLE'});
 }
});

router.get('/compliance/summary/:profileId', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { profileId } = req.params;
    const isStaff = ['admin', 'planner'].includes(String(access.workspaceRole || access.profile.role));
    if (!isStaff && access.profile.id !== profileId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: profileRecords, error: profileError } = await supabase
      .from('compliance_records')
      .select('*')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false });

    if (profileError) throw profileError;

    const { data: memberships, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, status, companies:company_id(id, name, fleet_size)')
      .eq('profile_id', profileId)
      .eq('status', 'active');

    if (membershipError) throw membershipError;

    const companyIds = (memberships || []).map((membership: any) => membership.company_id).filter(Boolean);
    const { data: companyRecords, error: companyRecordsError } = companyIds.length
      ? await supabase
          .from('compliance_records')
          .select('*')
          .in('company_id', companyIds)
          .order('updated_at', { ascending: false })
      : { data: [], error: null as any };

    if (companyRecordsError) throw companyRecordsError;

    const records = [...(profileRecords || []), ...(companyRecords || [])];
    const score = scoreFromCompliance(records);
    const overdue = records.filter((record: any) => {
      if (!record.due_at) return false;
      return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
    }).length;

    res.status(200).json({
      success: true,
      summary: {
        total: records.length,
        verified: records.filter((record: any) => record.status === 'verified').length,
        due_soon: records.filter((record: any) => {
          if (!record.due_at) return false;
          const remaining = new Date(record.due_at).getTime() - Date.now();
          return remaining > 0 && remaining <= 30 * 24 * 60 * 60 * 1000;
        }).length,
        overdue,
        score,
      },
      memberships: memberships || [],
      records,
    });
  } catch (error: any) {
    console.error('Compliance summary error:', error);
    res.status(500).json({ error: error.message || 'Compliance summary failed' });
  }
});

router.patch('/compliance/:id/status', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const { id } = req.params;
    const { status, notes } = req.body;
    const allowed = ['missing', 'pending', 'submitted', 'verified', 'expired', 'rejected', 'needs_followup'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid compliance status' });
    }
    const recordResult=await supabase.from('compliance_records').select('id,profile_id,role,document_type,file_url,status,due_at')
      .eq('id',id).maybeSingle();
    if(recordResult.error)return res.status(503).json({error:'COMPLIANCE_LOOKUP_UNAVAILABLE'});
    if(!recordResult.data)return res.status(404).json({error:'COMPLIANCE_RECORD_NOT_FOUND'});
    const sensitive=['operator','bike_rider'].includes(recordResult.data.role)&&
      ['vehicle_registration','bike_registration','helmet_compliance','insurance','national_id','license'].includes(recordResult.data.document_type);
    if(status==='verified'&&sensitive){
      const source=String(recordResult.data.file_url||'');
      const prefix=`${complianceBucket}/${recordResult.data.profile_id}/${id}/`;
      if(!source.startsWith(prefix)||!/^\w/.test(source.slice(prefix.length)))
        return res.status(409).json({error:'ORIGINAL_PRIVATE_DOCUMENT_REQUIRED'});
      if(recordResult.data.due_at&&Date.parse(recordResult.data.due_at)<=Date.now())
        return res.status(409).json({error:'DOCUMENT_EXPIRED'});
      if(typeof notes!=='string'||notes.trim().length<25)
        return res.status(400).json({error:'HUMAN_REVIEW_NOTES_MINIMUM_25_CHARACTERS'});
      const objectPath=source.slice(complianceBucket.length+1);
      const objectName=objectPath.slice(objectPath.lastIndexOf('/')+1);
      const located=await supabase.storage.from(complianceBucket)
        .list(`${recordResult.data.profile_id}/${id}`,{search:objectName,limit:30});
      if(located.error)return res.status(503).json({error:'ORIGINAL_DOCUMENT_LOOKUP_UNAVAILABLE'});
      if(!(located.data||[]).some(obj=>obj.name===objectName&&obj.id))
        return res.status(409).json({error:'ORIGINAL_DOCUMENT_NOT_PRESENT'});
    }

    const { data, error } = await supabase
      .from('compliance_records')
      .update({
        status,
        notes: notes || null,
        verified_at: status === 'verified' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (data?.profile_id) {
      await notifyRecipients(
        { user_ids: [data.profile_id] },
        {
          type: 'compliance_update',
          title: `Compliance ${status.replace(/_/g, ' ')}`,
          body: notes
            ? `AFAT updated your compliance record to ${status.replace(/_/g, ' ')}. ${notes}`
            : `AFAT updated your compliance record to ${status.replace(/_/g, ' ')}.`,
          referenceId: data.id,
          channels: ['in_app', 'whatsapp'],
        }
      );
    }

    res.status(200).json({ success: true, record: data });
  } catch (error: any) {
    console.error('Compliance status update error:', error);
    res.status(500).json({ error: error.message || 'Compliance status update failed' });
  }
});

router.post('/dispatch/assign', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['admin', 'planner']);
    if (!access) return;
    const {
      booking_id,
      route_id,
      operator_id,
      vehicle_id,
      dispatcher_id,
      origin,
      destination,
      priority,
      notes,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
    } = req.body;

    if (!operator_id && !vehicle_id && !booking_id) {
      return res.status(400).json({ error: 'operator_id, vehicle_id, or booking_id required' });
    }

    const { data, error } = await supabase
      .from('dispatch_assignments')
      .insert({
        booking_id: booking_id || null,
        route_id: route_id || null,
        operator_id: operator_id || null,
        vehicle_id: vehicle_id || null,
        dispatcher_id: dispatcher_id || access.profile.id,
        origin: origin || null,
        destination: destination || null,
        priority: priority || 'normal',
        status: 'assigned',
        notes: notes || null,
        pickup_lat: pickup_lat || null,
        pickup_lng: pickup_lng || null,
        dropoff_lat: dropoff_lat || null,
        dropoff_lng: dropoff_lng || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    if (booking_id) {
      await supabase
        .from('bookings')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', booking_id);
    }

    if (data?.operator_id) {
      await notifyRecipients(
        { user_ids: [data.operator_id] },
        {
          type: 'dispatch_assignment',
          title: `New ${data.priority || 'normal'} dispatch`,
          body: `${data.origin || 'AFAT command'} -> ${data.destination || 'assigned destination'}${data.notes ? `\n${data.notes}` : ''}`,
          referenceId: data.id,
          channels: ['in_app', 'whatsapp', 'telegram'],
        }
      );
    }

    res.status(201).json({ success: true, dispatch: data });
  } catch (error: any) {
    console.error('Dispatch assignment error:', error);
    res.status(500).json({ error: error.message || 'Dispatch assignment failed' });
  }
});

router.post('/service/request', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res);
    if (!session) return;

    const {
      company_id,
      operator_id,
      vehicle_id,
      service_type,
      origin,
      destination,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      scheduled_at,
      passenger_count,
      package_count,
      priority,
      price_quote_xaf,
      notes,
      contact_name,
      contact_phone,
      metadata,
    } = req.body;

    const normalizedType = normalizeServiceType(service_type);
    if (!normalizedType) {
      return res.status(400).json({ error: 'Valid service_type is required' });
    }


    const pickupLat = pickup_lat === undefined || pickup_lat === null ? null : Number(pickup_lat);
    const pickupLng = pickup_lng === undefined || pickup_lng === null ? null : Number(pickup_lng);
    const dropoffLat = dropoff_lat === undefined || dropoff_lat === null ? null : Number(dropoff_lat);
    const dropoffLng = dropoff_lng === undefined || dropoff_lng === null ? null : Number(dropoff_lng);

    const requestPriority = servicePriority(normalizedType, priority);
    const shouldDispatch = !NON_DISPATCH_SERVICE_TYPES.has(normalizedType);

    const { data: request, error: requestError } = await supabase
      .from('service_requests')
      .insert({
        requester_id: session.profile.id,
        company_id: company_id || null,
        operator_id: operator_id || null,
        vehicle_id: vehicle_id || null,
        service_type: normalizedType,
        origin: origin || null,
        destination: destination || null,
        pickup_lat: Number.isFinite(pickupLat) ? pickupLat : null,
        pickup_lng: Number.isFinite(pickupLng) ? pickupLng : null,
        dropoff_lat: Number.isFinite(dropoffLat) ? dropoffLat : null,
        dropoff_lng: Number.isFinite(dropoffLng) ? dropoffLng : null,
        scheduled_at: scheduled_at || null,
        passenger_count: Number(passenger_count || 1),
        package_count: Number(package_count || 0),
        priority: requestPriority,
        status: shouldDispatch ? (operator_id || vehicle_id ? 'assigned' : 'queued') : 'needs_review',
        price_quote_xaf: price_quote_xaf ? Number(price_quote_xaf) : null,
        notes: notes || null,
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        metadata: { ...(metadata || {}), requested_by_role: session.profile.role },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (requestError) {
      throw requestError;
    }

    let dispatch = null;
    if (shouldDispatch) {
      const dispatchPayload = {
        service_request_id: request.id,
        operator_id: operator_id || null,
        vehicle_id: vehicle_id || null,
        origin: origin || `${normalizedType} request`,
        destination: destination || null,
        priority: requestPriority,
        status: operator_id || vehicle_id ? 'assigned' : 'queued',
        notes: [notes, `service_request=${request.id}`, `service_type=${normalizedType}`].filter(Boolean).join(' | '),
        pickup_lat: Number.isFinite(pickupLat) ? pickupLat : null,
        pickup_lng: Number.isFinite(pickupLng) ? pickupLng : null,
        dropoff_lat: Number.isFinite(dropoffLat) ? dropoffLat : null,
        dropoff_lng: Number.isFinite(dropoffLng) ? dropoffLng : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: dispatchData, error: dispatchError } = await supabase
        .from('dispatch_assignments')
        .insert(dispatchPayload)
        .select()
        .single();

      if (dispatchError) {
        console.warn('Service request created without dispatch assignment:', dispatchError.message);
      } else {
        dispatch = dispatchData;
        await supabase
          .from('service_requests')
          .update({
            dispatch_assignment_id: dispatchData.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id);
      }
    }

    res.status(201).json({
      success: true,
      service_request: request,
      dispatch,
      status: request.status,
      next_action: shouldDispatch
        ? (dispatch ? 'dispatch_queued' : 'manual_dispatch_review')
        : 'ops_review',
    });
  } catch (error: any) {
    console.error('Service request error:', error);
    res.status(500).json({ error: error.message || 'Service request failed' });
  }
});

router.get('/guardian/watch/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const { data: guardianToken, error: tokenError } = await supabase
      .from('guardian_tokens')
      .select('token, booking_id, expires_at, created_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!guardianToken) {
      return res.status(404).json({ error: 'Guardian watch link not found' });
    }

    if (new Date(guardianToken.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Guardian watch link expired' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, passenger_id, operator_id, route_id, status, payment_status, seat_label, price_paid, created_at, updated_at, completed_at')
      .eq('id', guardianToken.booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const [passengerRes, operatorRes, routeRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone').eq('id', booking.passenger_id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, phone').eq('id', booking.operator_id).maybeSingle(),
      supabase.from('routes').select('id, name, origin, destination, departure_time').eq('id', booking.route_id).maybeSingle(),
    ]);

    res.status(200).json({
      success: true,
      watch: {
        token: guardianToken.token,
        expires_at: guardianToken.expires_at,
        booking: {
          ...booking,
          passenger: passengerRes.data || null,
          operator: operatorRes.data || null,
          route: routeRes.data || null,
        }
      }
    });
  } catch (error: any) {
    console.error('Guardian watch fetch error:', error);
    res.status(500).json({ error: error.message || 'Guardian watch lookup failed' });
  }
});

router.post('/payment/finalize', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['commuter']);
    if (!session) return;
    const { booking_id, method } = req.body;

    if (!booking_id || !method) {
      return res.status(400).json({ error: 'booking_id and method are required' });
    }
    if (method !== 'cash') {
      return res.status(409).json({ error: 'Mobile-money payments are confirmed only by the provider callback' });
    }

    const { data: booking, error } = await supabase.rpc('afat_select_cash_payment', {
      p_passenger_id: session.profile.id,
      p_booking_id: booking_id,
    });
    if (error) throw error;

    res.status(200).json({
      success: true,
      booking_id,
      transaction_id: booking.transaction_id,
      payment_status: booking.payment_status,
      status: booking.status,
      awaiting_callback: false,
    });
  } catch (error: any) {
    console.error('Payment finalize error:', error);
    res.status(mobilityErrorStatus(error)).json({ error: error.message || 'Payment finalization failed' });
  }
});

router.get('/booking/:bookingId', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res);
    if (!session) return;
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, passenger_id, operator_id, vehicle_id, route_id, status, payment_status, price_paid, seat_label, transaction_id, boarded_at, started_at, completed_at, created_at, updated_at')
      .eq('id', req.params.bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isStaff = ['planner', 'admin'].includes(String(session.profile.role));
    if (!isStaff && booking.passenger_id !== session.profile.id && booking.operator_id !== session.profile.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(200).json({ success: true, booking });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Booking lookup failed' });
  }
});

// ── SEAT HOLDS ───────────────────────────────────────────────────────────────
router.post('/booking/seat-hold', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['commuter']);
    if (!session) return;
    const { route_id, seat_label, hold_minutes } = req.body;

    if (!route_id || !seat_label) {
      return res.status(400).json({ error: 'route_id and seat_label are required' });
    }
    const { data: hold, error } = await supabase.rpc('afat_hold_seat', {
      p_passenger_id: session.profile.id,
      p_route_id: route_id,
      p_seat_label: seat_label,
      p_hold_minutes: hold_minutes || 8,
    });
    if (error) throw error;

    res.status(201).json({ success: true, hold });
  } catch (error: any) {
    console.error('Seat hold error:', error);
    res.status(mobilityErrorStatus(error)).json({ error: error.message || 'Seat hold failed' });
  }
});

router.post('/booking/seat-hold/release', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['commuter']);
    if (!session) return;
    const { hold_id } = req.body;

    if (!hold_id) {
      return res.status(400).json({ error: 'hold_id required' });
    }

    const { data: hold, error } = await supabase.rpc('afat_release_seat_hold', {
      p_passenger_id: session.profile.id,
      p_hold_id: hold_id,
    });
    if (error) throw error;

    res.status(200).json({ success: true, hold });
  } catch (error: any) {
    console.error('Seat hold release error:', error);
    res.status(mobilityErrorStatus(error)).json({ error: error.message || 'Seat hold release failed' });
  }
});

router.post('/booking/create-from-hold', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['commuter']);
    if (!session) return;
    const { hold_id } = req.body;

    if (!hold_id) {
      return res.status(400).json({ error: 'hold_id is required' });
    }
    const { data: booking, error } = await supabase.rpc('afat_create_booking_from_hold', {
      p_passenger_id: session.profile.id,
      p_hold_id: hold_id,
    });
    if (error) throw error;

    res.status(201).json({ success: true, booking });
  } catch (error: any) {
    console.error('Create booking from hold error:', error);
    res.status(mobilityErrorStatus(error)).json({ error: error.message || 'Booking creation from seat hold failed' });
  }
});

// ── WALLET WITHDRAWAL REQUESTS ──────────────────────────────────────────────
router.post('/wallet/withdraw', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['operator']);
    if (!session) return;
    const operator_id = session.profile.id;
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('operator_wallets')
      .select('balance_xaf')
      .eq('operator_id', operator_id)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Operator wallet not found' });
    }

    if (Number(wallet.balance_xaf || 0) < parsedAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const reference = `WD-${Date.now().toString(36).toUpperCase()}`;

    await appendWalletLedgerEntry({
      operator_id,
      entry_type: 'withdrawal',
      direction: 'debit',
      gross_amount: parsedAmount,
      commission_amount: 0,
      net_amount: parsedAmount,
      status: 'requested',
      reference,
    });

    const { error: updateError } = await supabase
      .from('operator_wallets')
      .update({
        balance_xaf: Number(wallet.balance_xaf || 0) - parsedAmount,
        updated_at: new Date().toISOString()
      })
      .eq('operator_id', operator_id);

    if (updateError) throw updateError;

    res.status(200).json({
      success: true,
      withdrawal: { amount: parsedAmount, reference, status: 'requested' }
    });
  } catch (error: any) {
    console.error('Wallet withdrawal error:', error);
    res.status(500).json({ error: error.message || 'Withdrawal request failed' });
  }
});

// ── SECURE TICKET ISSUE ─────────────────────────────────────────────────────
router.post('/ticket/issue', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res);
    if (!session) return;
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id required' });
    }

    const { data: ownedBooking } = await supabase
      .from('bookings')
      .select('id, passenger_id, operator_id')
      .eq('id', booking_id)
      .maybeSingle();
    if (!ownedBooking) return res.status(404).json({ error: 'Booking not found' });
    const isStaff = ['planner', 'admin'].includes(String(session.profile.role));
    if (!isStaff && ownedBooking.passenger_id !== session.profile.id && ownedBooking.operator_id !== session.profile.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, operator_id, route_id, seat_label, transaction_id, payment_status, status')
      .eq('id', booking_id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!isBoardablePaymentStatus(booking.payment_status) || booking.status !== 'confirmed') {
      return res.status(400).json({ error: 'Booking is not ready for ticket issuance' });
    }

    const payload = Buffer.from(JSON.stringify({
      bid: booking.id,
      oid: booking.operator_id,
      rid: booking.route_id,
      seat: booking.seat_label,
      txid: booking.transaction_id,
      pm: booking.payment_status,
      iat: Date.now()
    })).toString('base64url');

    const signature = signTicketPayload(payload);

    res.status(200).json({
      success: true,
      ticket: {
        t: payload,
        s: signature,
      }
    });
  } catch (error: any) {
    console.error('Ticket issue error:', error);
    res.status(500).json({ error: error.message || 'Ticket issue failed' });
  }
});

// ── SECURE BOARDING VERIFICATION ────────────────────────────────────────────
router.post('/ticket/verify-boarding', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['operator']);
    if (!session) return;
    const { ticket } = req.body;
    const operator_id = session.profile.id;

    if (!ticket?.t || !ticket?.s) {
      return res.status(400).json({ error: 'ticket is required' });
    }

    const expectedSignature = signTicketPayload(ticket.t);
    if (expectedSignature !== ticket.s) {
      return res.status(403).json({ error: 'Invalid ticket signature' });
    }

    const decoded = JSON.parse(Buffer.from(ticket.t, 'base64url').toString('utf8'));
    if (!decoded?.bid || !decoded?.oid) {
      return res.status(400).json({ error: 'Malformed ticket payload' });
    }

    if (decoded.oid !== operator_id) {
      return res.status(403).json({ error: 'Ticket does not belong to this operator' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, operator_id, status, payment_status')
      .eq('id', decoded.bid)
      .eq('operator_id', operator_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found for this operator' });
    }

    if (!isBoardablePaymentStatus(booking.payment_status)) {
      return res.status(400).json({ error: 'Booking is unpaid' });
    }

    if (!['confirmed', 'accepted'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking is not boardable' });
    }

    const { data: boardedBooking, error: updateError } = await supabase.rpc('afat_board_booking', {
      p_operator_id: operator_id,
      p_booking_id: decoded.bid,
    });
    if (updateError) throw updateError;

    res.status(200).json({
      success: true,
      booking_id: decoded.bid,
      booking: boardedBooking,
      message: 'Boarding verified'
    });
  } catch (error: any) {
    console.error('Ticket verify error:', error);
    res.status(500).json({ error: error.message || 'Ticket verification failed' });
  }
});

// ── TRIP COMPLETION (Triggers DNA Update) ────────────────────────────────
router.post('/booking/complete', async (req: Request, res: Response) => {
  try {
    const session = await requireAuthRole(req, res, ['operator']);
    if (!session) return;
    const { booking_id, rating, feedback } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id required' });
    }

    const { data: booking, error: updateError } = await supabase.rpc('afat_complete_booking', {
      p_operator_id: session.profile.id,
      p_booking_id: booking_id,
      p_rating: rating || null,
      p_feedback: feedback || null,
    });
    if (updateError) throw updateError;

    await dnaQueue.add(`dna-update-${booking_id}`, { driverId: session.profile.id, tripId: booking_id });

    res.status(200).json({
      success: true,
      booking,
      message: 'Trip completed. DriverDNA evidence review queued.'
    });
  } catch (error: any) {
    res.status(mobilityErrorStatus(error)).json({ error: error.message });
  }
});

// ── WHATSAPP WEBHOOK (Twilio Integration) ──────────────────────────────
// Duplicate WhatsApp webhook removed; the canonical handler is registered above.

// ── HEALTH CHECK ─────────────────────────────────────────────────────────
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'AFAT OS Sentinel',
    timestamp: new Date().toISOString()
  });
});

export default router;
