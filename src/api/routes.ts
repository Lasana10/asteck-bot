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
const ticketSecret = process.env.TICKET_SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || 'afat-dev-ticket-secret';
const authSecret = process.env.AFAT_AUTH_SECRET || ticketSecret;
const paymentService = new PaymentService();

function signTicketPayload(payload: string) {
  return crypto.createHmac('sha256', ticketSecret).update(payload).digest('hex');
}

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function signLocalAuth(payload: Record<string, any>) {
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function verifyLocalAuth(token?: string) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && Number(payload.exp) < Date.now()) return null;
  return payload;
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

function adminBootstrapConfig() {
  const code = String(process.env.AFAT_ADMIN_BOOTSTRAP_CODE || '').trim();
  const allowlist = String(process.env.AFAT_ADMIN_BOOTSTRAP_PHONES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeAuthPhone);
  return { code, allowlist };
}

function generalBootstrapConfig() {
  const code = String(process.env.AFAT_BOOTSTRAP_ACCESS_CODE || '').trim();
  const allowlist = String(process.env.AFAT_BOOTSTRAP_ALLOW_PHONES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeAuthPhone);
  const roles = String(process.env.AFAT_BOOTSTRAP_ALLOW_ROLES || 'commuter,operator,planner,admin')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return { code, allowlist, roles };
}

function emailBootstrapConfig() {
  const generalCode = String(process.env.AFAT_BOOTSTRAP_ACCESS_CODE || '').trim();
  const adminCode = String(process.env.AFAT_ADMIN_BOOTSTRAP_CODE || '').trim();
  const allowlist = String(process.env.AFAT_BOOTSTRAP_ALLOW_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const adminAllowlist = String(process.env.AFAT_ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const roles = String(process.env.AFAT_BOOTSTRAP_ALLOW_ROLES || 'commuter,operator,planner,admin')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return { generalCode, adminCode, allowlist, adminAllowlist, roles };
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

export async function requireAuthRole(req: Request, res: Response, roles?: string[]) {
  const { auth, profile } = await getAuthProfileByToken(req);
  if (!auth?.sub || !profile) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  if (roles?.length && !roles.includes(String(profile.role || '').toLowerCase())) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { auth, profile };
}

async function fetchProfilesForNotificationTarget(target: {
  user_ids?: string[];
  role?: string;
  city?: string;
}) {
  if (target.user_ids?.length) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, telegram_id, whatsapp_id, preferred_city, role')
      .in('id', target.user_ids);
    if (error) throw error;
    return data || [];
  }

  if (!target.role) return [];

  let query = supabase
    .from('profiles')
    .select('id, full_name, phone, telegram_id, whatsapp_id, preferred_city, role')
    .eq('role', target.role)
    .limit(100);

  if (target.city) {
    query = query.eq('preferred_city', target.city);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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
  if (!expected) return true;

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
    const { code: bootstrapCode, allowlist } = adminBootstrapConfig();
    const { code: generalBootstrapCode, allowlist: generalAllowlist, roles: generalRoles } = generalBootstrapConfig();
    const wantsAdminBootstrap = String(roleIntent || '').trim().toLowerCase() === 'admin' && Boolean(adminCode);
    const adminBootstrapAllowed =
      wantsAdminBootstrap &&
      Boolean(bootstrapCode) &&
      String(adminCode).trim() === bootstrapCode &&
      allowlist.includes(normalizedPhone);
    const generalBootstrapAllowed =
      Boolean(accessCode) &&
      Boolean(generalBootstrapCode) &&
      String(accessCode).trim() === generalBootstrapCode &&
      generalAllowlist.includes(normalizedPhone) &&
      generalRoles.includes(desiredRole);
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

    const isVerified = adminBootstrapAllowed || generalBootstrapAllowed || challengeVerified || ArkeselClient.verifyOTP(normalizedPhone, code) || isDevCode;

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
            role: adminBootstrapAllowed ? 'admin' : generalBootstrapAllowed ? desiredRole : 'commuter',
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
          .update({ role: 'admin', updated_at: new Date().toISOString() })
          .eq('id', profile.id)
          .select('id, full_name, role, phone')
          .single();
        if (elevateError) throw elevateError;
        profile = elevatedProfile;
      }

      if (generalBootstrapAllowed && profile.role !== desiredRole) {
        const { data: bootstrapProfile, error: bootstrapElevateError } = await supabase
          .from('profiles')
          .update({ role: desiredRole, updated_at: new Date().toISOString() })
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
    const requestedRole = isAnonymousSession
      ? 'commuter'
      : String(req.body?.roleIntent || user.user_metadata?.role || 'commuter').trim().toLowerCase();
    const publicRoles = new Set(['commuter']);
    const platformRoles = new Set(['commuter', 'operator', 'planner', 'admin']);
    if (!platformRoles.has(requestedRole)) {
      return res.status(400).json({ error: 'Unsupported role intent.' });
    }

    const { generalCode, adminCode, allowlist, adminAllowlist, roles } = emailBootstrapConfig();
    const accessCode = String(req.body?.accessCode || '').trim();
    const providedAdminCode = String(req.body?.adminCode || '').trim();
    const generalBootstrapAllowed =
      Boolean(generalCode) &&
      accessCode === generalCode &&
      allowlist.includes(email) &&
      roles.includes(requestedRole);
    const adminBootstrapAllowed =
      requestedRole === 'admin' &&
      Boolean(adminCode) &&
      providedAdminCode === adminCode &&
      adminAllowlist.includes(email);

    const operatorApplicationRequested = requestedRole === 'operator' && !generalBootstrapAllowed && !adminBootstrapAllowed;
    if (!publicRoles.has(requestedRole) && !operatorApplicationRequested && !generalBootstrapAllowed && !adminBootstrapAllowed) {
      return res.status(403).json({
        error: 'This role needs AFAT email bootstrap approval. Add the email to AFAT_BOOTSTRAP_ALLOW_EMAILS or use commuter access.',
      });
    }

    const finalRole = operatorApplicationRequested ? 'commuter' : requestedRole;
    const username = email ? email.split('@')[0] : `afat-${user.id.slice(0, 8)}`;
    const fullName =
      String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim() ||
      `AFAT ${finalRole.charAt(0).toUpperCase()}${finalRole.slice(1)}`;

    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    let profile = existingProfile;
    if (!profile) {
      const { data: createdProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: fullName,
          username,
          role: finalRole,
          trust_points: finalRole === 'commuter' ? 50 : 25,
          preferred_city: 'yaounde',
          is_active: true,
          operator_application_status: operatorApplicationRequested ? 'APPLICATION_STARTED' : null,
          attribution_source: 'supabase_email_auth',
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (createError) throw createError;
      profile = createdProfile;
    } else if (operatorApplicationRequested) {
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
    } else if (profile.role !== finalRole && (publicRoles.has(finalRole) || generalBootstrapAllowed || adminBootstrapAllowed)) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          role: finalRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      profile = updatedProfile;
    }

    const accessIdentity = email || profile.phone || user.id;
    const accessToken = issueAccessToken(profile, accessIdentity);
    const { refreshToken, session } = await issueRefreshSession(profile, accessIdentity, req);

    res.status(200).json({
      success: true,
      userId: profile.id,
      email,
      profile,
      accessToken,
      refreshToken,
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
    });
  } catch (error: any) {
    console.error('Supabase email profile bootstrap error:', error);
    res.status(500).json({ error: error.message || 'Email profile bootstrap failed.' });
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
    res.status(200).json({
      success: true,
      userId: profile.id,
      profile,
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
  try {
    const { user_id, user_name, latitude, longitude, source } = req.body;
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!user_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'user_id, latitude and longitude are required' });
    }

    const incidentPayload = {
      type: 'emergency',
      description: `Emergency SOS from ${user_name || 'AFAT user'}. Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      latitude: lat,
      longitude: lng,
      location: `POINT(${lng} ${lat})`,
      severity: 5,
      source: source || 'sos_button',
      status: 'active',
      reporter_id: user_id,
      reporter_username: user_name || 'AFAT user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert(incidentPayload)
      .select()
      .single();

    if (incidentError) {
      console.warn('SOS accepted without incident persistence:', incidentError.message);
      return res.status(202).json({
        success: true,
        persisted: false,
        status: 'active',
        alert: incidentPayload,
      });
    }

    const { error: sosError } = await supabase
      .from('sos_events')
      .insert({
        user_id,
        incident_id: incident.id,
        latitude: lat,
        longitude: lng,
        status: 'active',
        created_at: new Date().toISOString(),
      });

    res.status(201).json({
      success: true,
      persisted: true,
      status: 'active',
      incident_id: incident.id,
      sos_logged: !sosError,
    });
  } catch (error: any) {
    res.status(500).json({ error: publicError(error, 'SOS dispatch failed') });
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
router.post('/intelligence/voice-report', async (req: Request, res: Response) => {
  try {
    // For now: accept the audio file and return a mock classification
    // In production: pipe audio to Groq Whisper API for transcription,
    // then classify with Gemini/Groq
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      // Mock mode — return simulated transcription
      console.log('🎙️ Voice report received (Mock Mode — no GROQ_API_KEY)');
      return res.status(200).json({
        transcription: 'Accident signalé près du carrefour Bastos',
        classification: {
          type: 'accident',
          severity: 3,
          location: 'Carrefour Bastos',
          confidence: 0.85
        }
      });
    }

    // Real mode: call Groq Whisper
    // The audio comes as multipart form data
    // We'd use multer to parse it, then forward to Groq
    console.log('🎙️ Voice report received — forwarding to Groq Whisper');
    
    // Placeholder for real Whisper integration
    res.status(200).json({
      transcription: 'Processing with Groq Whisper...',
      classification: {
        type: 'other',
        severity: 3,
        location: 'Unknown',
        confidence: 0.5
      }
    });
  } catch (error) {
    console.error('Voice report error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
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
      .select('id, passenger_id, price_paid, status, payment_status')
      .eq('id', booking_id)
      .eq('passenger_id', session.profile.id)
      .maybeSingle();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status !== 'pending' || !['unpaid', 'failed'].includes(String(booking.payment_status))) {
      return res.status(409).json({ error: 'Booking is not ready for payment' });
    }

    const parsedAmount = Number(booking.price_paid);
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
      .eq('status', 'pending')
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

router.get('/payment/provider-readiness', (_req: Request, res: Response) => {
  const provider = process.env.PAYMENT_PROVIDER || 'pawapay';
  const hasPawaPay = Boolean(process.env.PAWAPAY_API_TOKEN || process.env.PAYMENT_API_KEY);
  const hasAT = Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
  const pawaPayEnv = process.env.PAWAPAY_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

  res.status(200).json({
    success: true,
    provider,
    callback_url: `${(process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_DOMAIN || 'https://asteck-bot.onrender.com').replace(/\/$/, '')}/api/webhook/pawapay`,
    pawapay_environment: pawaPayEnv,
    ready: {
      pawapay: hasPawaPay,
      africastalking: hasAT
    },
    mode: hasPawaPay || hasAT ? 'live_or_hybrid' : 'stub',
    recommendation: hasPawaPay
      ? 'PawaPay is configured.'
      : 'Configure PAYMENT_API_KEY (PawaPay) for live collection.'
  });
});

router.get('/mobility/departures', async (_req: Request, res: Response) => {
  try {
    const { data: routes, error } = await supabase
      .from('routes')
      .select('id, operator_id, vehicle_id, name, origin, destination, departure_time, price_per_seat, capacity, vehicle_type')
      .eq('is_active', true)
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

    const operators = new Map((operatorsResult.data || []).map((profile: any) => [profile.id, profile]));
    const vehicles = new Map((vehiclesResult.data || []).map((vehicle: any) => [vehicle.id, vehicle]));
    const occupiedByRoute = new Map<string, Set<string>>();
    for (const booking of bookingsResult.data || []) {
      if (!occupiedByRoute.has(booking.route_id)) occupiedByRoute.set(booking.route_id, new Set());
      if (booking.seat_label) occupiedByRoute.get(booking.route_id)?.add(booking.seat_label);
    }

    const departures = (routes || []).flatMap((route: any) => {
      const operator: any = operators.get(route.operator_id);
      const vehicle: any = vehicles.get(route.vehicle_id);
      const operatorApproved = operator?.operator_application_status === 'APPROVED' && operator?.verification_status === 'verified';
      const vehicleApproved = vehicle?.clearance_status === 'verified';
      if (!operatorApproved || !vehicleApproved) return [];
      return [{
        id: route.id,
        vehicle_id: route.vehicle_id,
        route_name: route.name,
        origin: route.origin,
        destination: route.destination,
        departure_time: route.departure_time,
        price_xaf: route.price_per_seat,
        total_seats: vehicle?.capacity || route.capacity || 4,
        booked_seats: occupiedByRoute.get(route.id)?.size || 0,
        occupied_seats: Array.from(occupiedByRoute.get(route.id) || []),
        vehicle_type: vehicle?.type || route.vehicle_type || 'taxi',
        operator_id: route.operator_id,
        operator_name: operator?.full_name || 'Operateur AFAT verifie',
        plate_number: vehicle?.plate_number || null,
        rating: vehicle?.rating || null,
      }];
    });

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

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, operator_id, price_paid, payment_status')
      .eq(externalId ? 'id' : 'transaction_id', externalId || transactionId)
      .maybeSingle();

    await appendPaymentEvent({
      booking_id: booking?.id || externalId || null,
      provider: 'pawapay',
      external_id: transactionId || null,
      event_type: 'callback_received',
      event_status: status || 'UNKNOWN',
      amount_xaf: Number(booking?.price_paid || 0) || null,
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
        .eq(externalId ? 'id' : 'transaction_id', externalId || transactionId);
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

async function persistMapSignalReview(req: Request, res: Response, movementLogIdOverride?: string) {
  try {
    const auth = authPayloadFromRequest(req);
    const {
      movement_log_id: bodyMovementLogId,
      status = 'queued',
      confidence_score = 50,
      decision_notes,
      reward_points = 0,
      reviewer_id,
    } = req.body;
    const movement_log_id = movementLogIdOverride || bodyMovementLogId;

    if (!movement_log_id) {
      return res.status(400).json({ error: 'movement_log_id required' });
    }

    const allowed = ['queued', 'validated', 'dismissed', 'published'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }

    const reviewerId = auth?.sub || reviewer_id || null;
    const points = Math.max(0, Math.min(100, Number(reward_points || 0)));
    const reviewPayload = {
      movement_log_id,
      reviewer_id: reviewerId,
      status,
      confidence_score: Math.max(0, Math.min(100, Number(confidence_score || 50))),
      decision_notes: decision_notes || null,
      reward_points: points,
      reviewed_at: status === 'queued' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: review, error } = await supabase
      .from('map_signal_reviews')
      .upsert(reviewPayload, { onConflict: 'movement_log_id' })
      .select()
      .single();

    if (error) throw error;

    if (points > 0 && ['validated', 'published'].includes(status)) {
      const { data: signal } = await supabase
        .from('movement_logs')
        .select('user_id')
        .eq('id', movement_log_id)
        .maybeSingle();

      if (signal?.user_id) {
        await supabase.rpc('award_points', {
          p_user_id: signal.user_id,
          p_amount: points,
          p_reason: `Route truth ${status}`,
          p_ref_id: movement_log_id,
        });
      }
    }

    res.status(200).json({
      success: true,
      review,
      review_effect: {
        enters_admin_audit: true,
        contributor_rewarded: points > 0 && ['validated', 'published'].includes(status),
        publish_ready: status === 'published',
      },
    });
  } catch (error: any) {
    console.error('Map signal review error:', error);
    res.status(500).json({ error: error.message || 'Map signal review failed' });
  }
}

router.post('/ops/map-signal-reviews', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;
  return persistMapSignalReview(req, res);
});

router.patch('/ops/map-signal-reviews/:movementLogId', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;
  return persistMapSignalReview(req, res, String(req.params.movementLogId));
});

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
      updatePayload.operator_approved_at = nowIso;
      updatePayload.verification_status = 'verified';
    } else if (['REJECTED', 'SUSPENDED'].includes(nextStatus)) {
      updatePayload.operator_approved_at = null;
      if (nextStatus === 'REJECTED') updatePayload.role = 'commuter';
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

router.patch('/ops/companies/:companyId/status', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['admin', 'planner']);
  if (!access) return;

  try {
    const companyId = String(req.params.companyId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const notes = String(req.body?.notes || '').trim();
    const coordinatorProfileId = String(req.body?.coordinator_profile_id || '').trim();
    const grantPlannerAccess = Boolean(req.body?.grant_planner_access);
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
        .select('id, profile_id, company_id')
        .eq('company_id', companyId)
        .eq('profile_id', coordinatorProfileId)
        .maybeSingle();

      if (!membership) {
        return res.status(404).json({ error: 'Coordinator membership not found for this company.' });
      }

      const profileUpdate: Record<string, any> = {
        updated_at: nowIso,
        operator_review_notes: notes || `Company status moved to ${nextStatus}.`,
      };

      if (nextStatus === 'approved' && grantPlannerAccess) {
        profileUpdate.role = 'planner';
        profileUpdate.is_active = true;
      }

      if (['rejected', 'suspended'].includes(nextStatus)) {
        profileUpdate.role = 'commuter';
        profileUpdate.is_active = nextStatus !== 'suspended';
      }

      const { data: updatedCoordinator, error: coordinatorError } = await supabase
        .from('profiles')
        .update(profileUpdate)
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
       …12340 tokens truncated… setLoading(false);
      return;
    }
    window.location.reload();
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    setInfoText('');
    persistAccessIntent();

    if (authChannel !== 'phone' && !turnstileReady) {
      setErrorText('Turnstile site key missing in this build. Save VITE_TURNSTILE_SITE_KEY in both Cloudflare Preview and Production, then create a fresh deployment.');
      setLoading(false);
      return;
    }

    if (authChannel === 'email_password') {
      const { data, error } = await signInOrSignUpWithEmailPassword(normalizedEmail, password, {
        roleIntent,
        captchaToken: authTurnstileToken || undefined,
      });
      if (error) {
        setErrorText(`${error.message} Check Supabase Email provider settings and redirect URLs if this persists.`);
      } else if (data?.mode === 'confirmation_required') {
        setInfoText('AFAT created the account. Open the confirmation email once, then return here and sign in with the same password.');
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
        window.location.reload();
      }
      setLoading(false);
      return;
    }

    const result = authChannel === 'email_otp'
      ? await sendEmailOtp(normalizedEmail, { roleIntent, captchaToken: authTurnstileToken || undefined })
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
    <div className="w-full font-sans text-on-surface">
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
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">Email auth</p>
            <p className={`mt-1 text-xs font-black ${supabaseReady ? 'text-emerald-200' : 'text-amber-200'}`}>
              {supabaseReady ? 'Configured' : 'Needs env'}
            </p>
            {!supabaseReady && (
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
            <p className="text-[9px] font-black uppercase tracking-widest text-white/45">Turnstile</p>
            <p className={`mt-1 text-xs font-black ${turnstileReady ? 'text-emerald-200' : 'text-amber-200'}`}>
              {turnstileReady ? 'Configured' : 'Needs env'}
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
              AFAT cannot confirm the API target from this browser yet. This is often a Render wake-up or routing issue, not a full backend outage.
            </p>
            {backendDetail && (
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
                Retry check
              </button>
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
            </div>
            {backendDiagnostics && (
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
                  {['planner', 'admin'].includes(roleIntent) && (
                    <input
                      type="password"
                      placeholder={roleIntent === 'admin' ? 'Admin bootstrap code' : 'Temporary access code'}
                      value={roleIntent === 'admin' ? adminCode : accessCode}
                      onChange={e => roleIntent === 'admin' ? setAdminCode(e.target.value) : setAccessCode(e.target.value)}
                      className="w-full bg-slate-900 px-5 py-4 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 ring-blue-500/50 border border-white/10 font-mono font-bold"
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
            {needsAuthTurnstile && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <TurnstileGate
                  action="email_auth"
                  onToken={setAuthTurnstileToken}
                  onExpire={() => setAuthTurnstileToken('')}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading || (authChannel !== 'phone' ? !normalizedEmail.includes('@') || (authChannel === 'email_password' && password.length < 6) || (needsAuthTurnstile && !authTurnstileToken) : normalizedPhone.length < 8)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
            >
              {loading ? 'Transmitting...' : authChannel === 'email_password' ? 'Enter AFAT' : authChannel === 'email_otp' ? 'Send Email Link' : 'Request Phone Code'}
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
              disabled={loading || !supabaseReady}
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
                  ? 'Use the code from the Supabase email, or open the secure email link in this browser.'
                  : 'Enter the phone OTP or use the temporary access path if your lane is allowlisted.'}
              </p>
            </div>
            {(authChannel === 'phone' || (authChannel === 'email_otp' && roleIntent === 'planner')) && (
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
            <button
              type="button"
              onClick={() => onRegisterRequest(roleIntent)}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              New here? Register {roleIntent}
            </button>
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
    const accessCode = sessionStorage.getItem('afat_oauth_access_code') || '';
    const adminCode = sessionStorage.getItem('afat_oauth_admin_code') || '';

    setPhase('session');
    completeGoogleAuthCallback({ roleIntent, accessCode, adminCode })
      .then(({ error }) => {
        sessionStorage.removeItem('afat_oauth_access_code');
        sessionStorage.removeItem('afat_oauth_admin_code');

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
              <p className="mt-1 text-xs font-bold text-white">Restoring your Supabase session.</p>
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
              Check Supabase Google provider settings, callback redirect URLs, and AFAT backend reachability if this repeats.
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
  return Boolean(profile?.operator_application_status);
}

function OperatorAccessPending({ profile, onRegister, onUseCommuter }: { profile: any; onRegister: () => void; onUseCommuter: () => void }) {
  const status = String(profile?.operator_application_status || 'APPLICATION_STARTED').replace(/_/g, ' ');
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
          <button
            type="button"
            onClick={onRegister}
            className="mt-7 rounded-2xl bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950"
          >
            Complete operator application
          </button>
          <button
            type="button"
            onClick={onUseCommuter}
            className="ml-3 mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-black uppercase tracking-widest text-white/70"
          >
            Continue as commuter
          </button>
        </div>
      </div>
    </div>
  );
}

function RestrictedAccessPending({
  requestedRole,
  onRegister,
  onUseCommuter,
}: {
  requestedRole: 'planner' | 'admin';
  onRegister: () => void;
  onUseCommuter: () => void;
}) {
  const label = requestedRole === 'admin' ? 'Admin command' : 'Planner access';
  return (
    <div className="min-h-screen sentinel-bg text-white px-5 py-8 pb-28">
      <div className="mesh-gradient" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-blue-400/20 bg-slate-950/80 p-7 shadow-ambient-float backdrop-blur-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-200/70">Invite controlled access</p>
          <h1 className="mt-3 text-3xl font-black uppercase italic tracking-tight text-white">{label} requires approval</h1>
          <p className="mt-4 text-sm font-semibold leading-relaxed text-white/65">
            Your Google account is valid. AFAT keeps this lane locked until an approved bootstrap code, organization profile,
            or admin invitation confirms that this account should manage people, operators, city data, or platform controls.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Identity</p>
              <p className="mt-2 text-sm font-black uppercase text-emerald-100">Verified</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Requested lane</p>
              <p className="mt-2 text-sm font-black uppercase text-blue-100">{requestedRole}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Console</p>
              <p className="mt-2 text-sm font-black uppercase text-amber-100">Invite needed</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRegister}
            className="mt-7 rounded-2xl bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950"
          >
            Complete organization intake
          </button>
          <button
            type="button"
            onClick={onUseCommuter}
            className="ml-3 mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-black uppercase tracking-widest text-white/70"
          >
            Continue as commuter
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
    return <GuardianWatchPage token={decodeURIComponent(watchMatch[1])} />;
  }

  return <AppShell />;
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
        is_verified: !!idData?.ids_number,
        is_active: typeof idData?.is_active === 'boolean' ? idData.is_active : role !== 'operator',
        operator_application_status: idData?.operator_application_status || (role === 'operator' ? 'UNDER_REVIEW' : null)
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
          setSessionUser({
            id: session.user.id,
            phone: session.user.phone || localStorage.getItem('afat_local_phone') || '',
          });
          telemetry.start(session.user.id);
          ensureSupabaseEmailProfile({
            roleIntent: localStorage.getItem('afat_access_intent_role') || 'commuter',
          }).finally(() => fetchRole(session.user.id));
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
      localStorage.removeItem('afat_access_level');
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
      if (wantsOperatorConsole && ((effectiveRole === 'operator' && !canUseOperatorConsole(userProfile)) || hasOperatorApplication(userProfile))) {
        return (
          <OperatorAccessPending
            profile={userProfile}
            onRegister={() => {
              setRegistrationTrack('citizen_reg');
              setIsRegistrationHubOpen(true);
            }}
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
            onRegister={() => {
              setRegistrationTrack(getRegistrationTrackForRole(intendedRole));
              setIsRegistrationHubOpen(true);
            }}
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

    return (
      <div className="min-h-screen flex flex-col sentinel-bg text-white selection:bg-blue-500/30">
        <div className="mesh-gradient" />
        <div className="relative z-10 flex-1 flex flex-col">
          <AccessLevelStrip accessLevel={getAccessLevel(userProfile, sessionUser)} profile={userProfile} />
          {renderRoleFrame()}
          {renderDashboard()}
        </div>
        <BottomNav role={normalizeAfatRole(userRole) as any} activeTab={activeTab} onTabChange={setActiveTab} />
        {showDevOverride && renderRoleToggle()}
        <RoleOnboarding
          role={normalizeAfatRole(userRole) as any}
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
        <AICopilot userName={userProfile?.full_name || 'User'} userRole={normalizeAfatRole(userRole)} />
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
