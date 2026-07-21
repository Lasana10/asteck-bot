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
  const auth = authPayloadFromRequest(req);
  if (!auth?.sub) return { auth: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.sub)
    .maybeSingle();
  return { auth, profile };
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
    const email = String(user.email || '').trim().toLowerCase();
    const requestedRole = String(req.body?.roleIntent || user.user_metadata?.role || 'commuter').trim().toLowerCase();
    const publicRoles = new Set(['commuter', 'operator']);
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

    if (!publicRoles.has(requestedRole) && !generalBootstrapAllowed && !adminBootstrapAllowed) {
      return res.status(403).json({
        error: 'This role needs AFAT email bootstrap approval. Add the email to AFAT_BOOTSTRAP_ALLOW_EMAILS or use commuter/operator.',
      });
    }

    const finalRole = requestedRole;
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
          attribution_source: 'supabase_email_auth',
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (createError) throw createError;
      profile = createdProfile;
    } else if (profile.role !== finalRole && (publicRoles.has(finalRole) || generalBootstrapAllowed || adminBootstrapAllowed)) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ role: finalRole, updated_at: new Date().toISOString() })
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
    const { amount, phone, booking_id, provider, mobile_network } = req.body;

    if (!amount || !phone) {
      return res.status(400).json({ error: 'Amount and phone required' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const normalizedProvider = provider === 'africastalking' || provider === 'pawapay' || provider === 'mtn_momo' || provider === 'orange_money'
      ? (provider === 'africastalking' ? 'africastalking' : 'pawapay')
      : undefined;

    console.log(`💳 Payment checkout: ${parsedAmount} XAF from ${phone} via ${normalizedProvider || 'auto-fallback'}`);
    const payment = await paymentService.initiateMomoPayment(
      phone,
      parsedAmount,
      `Booking ${booking_id || 'direct'}`,
      normalizedProvider
    );

    if (!payment.success || !payment.transactionId) {
      return res.status(502).json({
        success: false,
        error: payment.message || 'Payment provider unavailable'
      });
    }

    const transactionId = payment.transactionId;

    if (booking_id) {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          transaction_id: transactionId,
          payment_status: 'collection_pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', booking_id);

      if (bookingError) throw bookingError;
    }

    await appendPaymentEvent({
      booking_id: booking_id || null,
      provider: payment.provider || normalizedProvider || 'unknown',
      external_id: transactionId,
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
      transactionId,
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
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          transaction_id: transactionId,
          updated_at: new Date().toISOString()
        })
        .eq(externalId ? 'id' : 'transaction_id', externalId || transactionId);

      if (error) console.error('Error updating booking:', error);

      if (booking?.operator_id) {
        await applyRideCredit(booking, transactionId);
      }
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
    const { booking_id, expires_in_minutes } = req.body;
    
    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

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
    const auth = authPayloadFromRequest(req);
    const {
      profile_id,
      checkpoint_name,
      city,
      zone_label,
      latitude,
      longitude,
      checkpoint_type = 'community',
      notes,
    } = req.body;

    const actorId = auth?.sub || profile_id;
    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated actor required' });
    }

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
      .eq('role', 'operator')
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return res.status(404).json({ error: 'Operator profile not found.' });
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      operator_application_status: nextStatus,
      operator_review_notes: reviewNotes || null,
      updated_at: nowIso,
      is_active: nextStatus === 'APPROVED',
    };

    if (nextStatus === 'APPROVED') {
      updatePayload.operator_approved_at = nowIso;
      updatePayload.verification_status = 'verified';
    } else if (['REJECTED', 'SUSPENDED'].includes(nextStatus)) {
      updatePayload.operator_approved_at = null;
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
    const regionKey = normalizeRegion(req.query.city as string | undefined);
    const region = LIVE_MAP_REGIONS[regionKey];
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const [{ data: vehicles }, { data: incidents }, { data: dispatches }, { data: checkpoints }, { data: missionSignals }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, operator_id, plate_number, vehicle_type, type, is_available, current_lat, current_lng, last_ping_at, rating')
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

    const urgentAlerts = scopedIncidents
      .filter((incident: any) => Number(incident.severity || 0) >= 4)
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
        signal_age_seconds: ageSeconds,
        signal_quality: ageSeconds === null ? 'unknown' : ageSeconds <= 60 ? 'fresh' : ageSeconds <= 300 ? 'aging' : 'stale',
        publish_channel: 'vehicles',
      };
    });

    const enrichedIncidents = scopedIncidents.map((incident: any) => ({
      ...incident,
      publish_channel: 'incidents',
      trust_state: ['verified', 'confirmed'].includes(incident.status) || incident.verification_status === 'verified'
        ? 'verified'
        : Number(incident.severity || 0) >= 4
          ? 'needs_human_review'
          : 'field_signal',
    }));

    const verifiedIncidents = scopedIncidents.filter((incident: any) =>
      ['verified', 'confirmed'].includes(incident.status) || incident.verification_status === 'verified'
    );

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
        active_incidents: scopedIncidents.length,
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

router.get('/ops/report-center', async (_req: Request, res: Response) => {
  try {
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

router.get('/ops/demand-radar', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const [{ data: bookings }, { data: vehicles }, { data: movements }] = await Promise.all([
      supabase.from('bookings').select('id, status, route_id, created_at, routes(name, origin, destination)').gte('created_at', since),
      supabase.from('vehicles').select('id, operator_id, type, is_available, current_lat, current_lng, last_ping_at').eq('is_available', true),
      supabase.from('movement_logs').select('id, latitude, longitude, created_at').gte('created_at', since).limit(200),
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

router.get('/ops/compliance-radar', async (_req: Request, res: Response) => {
  try {
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

router.get('/dispatch/active', async (_req: Request, res: Response) => {
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

router.get('/compliance/summary/:profileId', async (req: Request, res: Response) => {
  try {
    const { profileId } = req.params;

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
    const access = await requireAuthRole(req, res, ['admin', 'planner', 'operator']);
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
    const {
      requester_id,
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

    if (!requester_id && !company_id && !contact_phone) {
      return res.status(400).json({ error: 'requester_id, company_id, or contact_phone is required' });
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
        requester_id: requester_id || null,
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
        metadata: metadata || {},
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
    const { booking_id, transaction_id, method } = req.body;

    if (!booking_id || !method) {
      return res.status(400).json({ error: 'booking_id and method are required' });
    }

    const paymentStatus = method === 'cash' ? 'cash_due' : 'collection_pending';
    const bookingStatus = method === 'cash' ? 'confirmed' : 'pending';
    const txRef = transaction_id || `AFAT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: booking, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('id, operator_id, price_paid, payment_status')
      .eq('id', booking_id)
      .single();

    if (bookingFetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({
        status: bookingStatus,
        payment_status: paymentStatus,
        transaction_id: txRef,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id);

    if (bookingUpdateError) throw bookingUpdateError;

    res.status(200).json({
      success: true,
      booking_id,
      transaction_id: txRef,
      payment_status: paymentStatus,
      status: bookingStatus,
      awaiting_callback: method !== 'cash'
    });
  } catch (error: any) {
    console.error('Payment finalize error:', error);
    res.status(500).json({ error: error.message || 'Payment finalization failed' });
  }
});

// ── SEAT HOLDS ───────────────────────────────────────────────────────────────
router.post('/booking/seat-hold', async (req: Request, res: Response) => {
  try {
    const { passenger_id, operator_id, route_id, seat_label, hold_minutes } = req.body;

    if (!passenger_id || !route_id || !seat_label) {
      return res.status(400).json({ error: 'passenger_id, route_id and seat_label are required' });
    }

    await expireSeatHolds(route_id, seat_label);

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('route_id', route_id)
      .eq('seat_label', seat_label)
      .in('status', ['pending', 'accepted', 'confirmed', 'completed'])
      .maybeSingle();

    if (existingBooking) {
      return res.status(409).json({ error: 'Seat is already booked' });
    }

    const { data: activeHold } = await supabase
      .from('seat_holds')
      .select('id, passenger_id, expires_at')
      .eq('route_id', route_id)
      .eq('seat_label', seat_label)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (activeHold && activeHold.passenger_id !== passenger_id) {
      return res.status(409).json({ error: 'Seat is temporarily held by another commuter' });
    }

    if (activeHold && activeHold.passenger_id === passenger_id) {
      return res.status(200).json({ success: true, hold: activeHold });
    }

    const expiresAt = new Date(Date.now() + (hold_minutes || 8) * 60 * 1000).toISOString();
    const { data: hold, error } = await supabase
      .from('seat_holds')
      .insert({
        passenger_id,
        operator_id: operator_id || null,
        route_id,
        seat_label,
        status: 'active',
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, hold });
  } catch (error: any) {
    console.error('Seat hold error:', error);
    res.status(500).json({ error: error.message || 'Seat hold failed' });
  }
});

router.post('/booking/seat-hold/release', async (req: Request, res: Response) => {
  try {
    const { hold_id } = req.body;

    if (!hold_id) {
      return res.status(400).json({ error: 'hold_id required' });
    }

    const { error } = await supabase
      .from('seat_holds')
      .update({ status: 'released', updated_at: new Date().toISOString() })
      .eq('id', hold_id)
      .eq('status', 'active');

    if (error) throw error;

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Seat hold release error:', error);
    res.status(500).json({ error: error.message || 'Seat hold release failed' });
  }
});

router.post('/booking/create-from-hold', async (req: Request, res: Response) => {
  try {
    const { hold_id, passenger_id, final_price } = req.body;

    if (!hold_id || !passenger_id || !final_price) {
      return res.status(400).json({ error: 'hold_id, passenger_id and final_price are required' });
    }

    const { data: hold, error: holdError } = await supabase
      .from('seat_holds')
      .select('*')
      .eq('id', hold_id)
      .eq('passenger_id', passenger_id)
      .eq('status', 'active')
      .single();

    if (holdError || !hold) {
      return res.status(404).json({ error: 'Seat hold not found' });
    }

    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      await supabase
        .from('seat_holds')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', hold_id);
      return res.status(409).json({ error: 'Seat hold expired' });
    }

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('route_id', hold.route_id)
      .eq('seat_label', hold.seat_label)
      .in('status', ['pending', 'accepted', 'confirmed', 'completed'])
      .maybeSingle();

    if (existingBooking) {
      return res.status(409).json({ error: 'Seat was booked while hold was being processed' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        passenger_id,
        operator_id: hold.operator_id || null,
        route_id: hold.route_id,
        seat_label: hold.seat_label,
        status: 'pending',
        payment_status: 'unpaid',
        price_paid: final_price,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    await supabase
      .from('seat_holds')
      .update({ status: 'converted', booking_id: booking.id, updated_at: new Date().toISOString() })
      .eq('id', hold_id);

    res.status(201).json({ success: true, booking });
  } catch (error: any) {
    console.error('Create booking from hold error:', error);
    res.status(500).json({ error: error.message || 'Booking creation from seat hold failed' });
  }
});

// ── WALLET WITHDRAWAL REQUESTS ──────────────────────────────────────────────
router.post('/wallet/withdraw', async (req: Request, res: Response) => {
  try {
    const { operator_id, amount } = req.body;

    if (!operator_id || !amount) {
      return res.status(400).json({ error: 'operator_id and amount are required' });
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
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id required' });
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
    const { ticket, operator_id } = req.body;

    if (!ticket?.t || !ticket?.s || !operator_id) {
      return res.status(400).json({ error: 'ticket and operator_id required' });
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

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'boarded', updated_at: new Date().toISOString() })
      .eq('id', decoded.bid)
      .eq('operator_id', operator_id);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      booking_id: decoded.bid,
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
    const { booking_id, driver_id, rating, feedback } = req.body;

    if (!booking_id || !driver_id) {
      return res.status(400).json({ error: 'booking_id and driver_id required' });
    }

    // 1. Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'completed', 
        rating, 
        feedback,
        completed_at: new Date().toISOString() 
      })
      .eq('id', booking_id);

    if (updateError) throw updateError;

    // 2. Trigger Async DNA Pipeline
    await dnaQueue.add(`dna-update-${booking_id}`, { driverId: driver_id, tripId: booking_id });

    res.status(200).json({ 
      success: true, 
      message: 'Trip completed. DriverDNA update queued.' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── WHATSAPP WEBHOOK (Twilio Integration) ──────────────────────────────
router.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const reply = await waBridge.handleWebhook(req.body);
    
    // Twilio expects TwiML response
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);
  } catch (error: any) {
    console.error('❌ WhatsApp Webhook Error:', error);
    res.status(500).send('Webhook Error');
  }
});

// ── HEALTH CHECK ─────────────────────────────────────────────────────────
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'online', 
    service: 'AFAT OS Sentinel', 
    timestamp: new Date().toISOString() 
  });
});

export default router;
