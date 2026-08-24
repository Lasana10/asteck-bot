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

async function getAuthProfileByToken(req: Request) {
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

async function requireAuthRole(req: Request, res: Response, roles?: string[]) {
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
    const devMode = process.env.NODE_ENV !== 'producti