import { createClient } from '@supabase/supabase-js';

const REQUIRED_RENDER_API_URL = 'https://asteck-bot.onrender.com';
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim() || 'https://placeholder.supabase.co';
const supabaseAnonKey =
  String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim() ||
  String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() ||
  'placeholder-key';

const liveApiBaseUrl = REQUIRED_RENDER_API_URL;
const apiOverrideStorageKey = 'afat_api_base_override';
const localRuntimeHosts = new Set(['localhost', '127.0.0.1']);

function normalizeApiUrl(url?: string | null) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/i, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function canUseWindow() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function isLocalAppRuntime() {
  if (!canUseWindow()) return false;
  return localRuntimeHosts.has(window.location.hostname);
}

function isProductionAfatRuntime() {
  if (!canUseWindow()) return false;
  const hostname = window.location.hostname.toLowerCase();
  if (localRuntimeHosts.has(hostname)) return false;
  return hostname.endsWith('.pages.dev') || hostname.endsWith('.workers.dev') || hostname === 'dashboard.afat.cm';
}

function isFrontendHostingUrl(url?: string | null) {
  const normalized = normalizeApiUrl(url);
  if (!normalized) return false;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname.endsWith('.pages.dev') || hostname.endsWith('.workers.dev') || hostname === 'dashboard.afat.cm';
  } catch {
    return false;
  }
}

function isLocalApiUrl(url?: string | null) {
  const normalized = normalizeApiUrl(url);
  if (!normalized) return false;
  try {
    return localRuntimeHosts.has(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

function getStoredApiOverride() {
  if (!canUseWindow()) return null;
  if (!isLocalAppRuntime()) {
    localStorage.removeItem(apiOverrideStorageKey);
    return null;
  }
  const normalized = normalizeApiUrl(localStorage.getItem(apiOverrideStorageKey));
  if (!normalized) {
    localStorage.removeItem(apiOverrideStorageKey);
    return null;
  }
  if (isLocalApiUrl(normalized) || isFrontendHostingUrl(normalized)) {
    localStorage.removeItem(apiOverrideStorageKey);
    return null;
  }
  return normalized;
}

function resolveApiBaseUrl() {
  const envApiBaseUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  if (envApiBaseUrl === REQUIRED_RENDER_API_URL) {
    return envApiBaseUrl;
  }

  const localOverride = getStoredApiOverride();
  if (localOverride) {
    return localOverride;
  }

  return REQUIRED_RENDER_API_URL;
}

export const apiBaseUrl = resolveApiBaseUrl();

export function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

export function setApiBaseOverride(url: string | null) {
  if (!canUseWindow()) return;
  if (!url) {
    localStorage.removeItem(apiOverrideStorageKey);
    return;
  }
  if (!isLocalAppRuntime()) {
    console.warn('Ignoring AFAT API override outside local development.');
    localStorage.removeItem(apiOverrideStorageKey);
    return;
  }
  const normalized = normalizeApiUrl(url);
  if (!normalized) {
    localStorage.removeItem(apiOverrideStorageKey);
    return;
  }
  if (isLocalApiUrl(normalized) || isFrontendHostingUrl(normalized) || normalized !== REQUIRED_RENDER_API_URL) {
    localStorage.removeItem(apiOverrideStorageKey);
    return;
  }
  localStorage.setItem(apiOverrideStorageKey, normalized);
}

async function readApiJson(res: Response, fallback: string) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await res.text().catch(() => '');
    const preview = body.replace(/\s+/g, ' ').slice(0, 120);
    return {
      data: null,
      error: {
        message: `${fallback} API returned ${res.status} ${res.statusText || ''} as ${contentType || 'unknown content type'}${preview ? `: ${preview}` : ''}`,
      },
    };
  }

  try {
    return { data: await res.json(), error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || fallback } };
  }
}

type ApiHealthCheckResult = {
  healthy: boolean;
  contractHealthy: boolean;
  reason?: string;
};

export type AfatBackendDiagnosticEntry = {
  candidate: string;
  contract: {
    ok: boolean;
    status: number;
    reason: string;
  };
  health: {
    ok: boolean;
    status: number;
    reason: string;
  };
  authContract: {
    ok: boolean;
    status: number;
    reason: string;
  };
};

async function probeJsonEndpoint(endpoint: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        reason: `Expected JSON from ${endpoint}, received ${contentType || 'unknown content type'}${body ? `: ${body.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`,
      };
    }

    const json = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      json,
      reason: res.ok ? '' : String(json?.error || json?.message || `HTTP ${res.status}`),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      reason: err?.name === 'AbortError' ? `Timed out reaching ${endpoint}` : err?.message || `Failed to reach ${endpoint}`,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeApiHealth(url: string) {
  let lastFailure = 'AFAT backend health probe did not return a usable response.';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const contractResponse = await probeJsonEndpoint(`${url}/health/contract`, 12000 + attempt * 3000);
    if (contractResponse.ok) {
      const contract = contractResponse.json;
      const requiredRoutes = Array.isArray(contract?.required_routes) ? contract.required_routes : [];
      const hasAuthContract =
        contract?.status === 'contract_ready' &&
        requiredRoutes.includes('POST /api/auth/supabase-profile') &&
        requiredRoutes.includes('POST /api/auth/qa-bypass') &&
        requiredRoutes.includes('POST /api/onboard/passenger/register');
      if (hasAuthContract) {
        return { healthy: true, contractHealthy: true };
      }
      lastFailure = `AFAT contract probe responded without the expected auth routes at ${url}.`;
    } else if (contractResponse.reason) {
      lastFailure = contractResponse.reason;
    }

    const healthResponse = await probeJsonEndpoint(`${url}/health`, 8000 + attempt * 2000);
    if (healthResponse.ok) {
      const health = healthResponse.json;
      const basicHealthOkay =
        health?.status === 'UP' &&
        (health?.api_mount === '/api' || health?.service === 'AFAT');
      if (basicHealthOkay) {
        return {
          healthy: true,
          contractHealthy: false,
          reason: health?.api_mount === '/api'
            ? (contractResponse.reason || 'AFAT backend passed the basic health check while the contract probe was still warming up.')
            : 'Render is alive, but it is serving an older AFAT backend contract. Auth/profile routes may still need the Render backend redeploy.',
        };
      }
      lastFailure = `AFAT basic health responded unexpectedly at ${url}.`;
    } else if (healthResponse.reason) {
      lastFailure = healthResponse.reason;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1200 * (attempt + 1)));
  }

  return { healthy: false, contractHealthy: false, reason: lastFailure };
}

export async function ensureReachableApiBaseUrl() {
  const current = resolveApiBaseUrl();
  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  const candidates = [current, envUrl, liveApiBaseUrl].filter((value, index, list): value is string => {
    return Boolean(value) && list.indexOf(value) === index;
  });

  for (const candidate of candidates) {
    const health = await probeApiHealth(candidate);
    if (health.healthy) {
      const corrected = candidate !== current;
      if (corrected && canUseWindow()) {
        if (candidate === liveApiBaseUrl || candidate === envUrl) {
          localStorage.removeItem(apiOverrideStorageKey);
        } else {
          localStorage.setItem(apiOverrideStorageKey, candidate);
        }
      }

      return {
        url: candidate,
        healthy: true,
        corrected,
        contractHealthy: health.contractHealthy,
        detail: health.reason || '',
      };
    }
  }

  const failedCandidate = candidates[0] || liveApiBaseUrl;
  const failedHealth = await probeApiHealth(failedCandidate);
  return {
    url: failedCandidate,
    healthy: false,
    corrected: false,
    contractHealthy: false,
    detail: failedHealth.reason || '',
  };
}

export async function runAfatBackendDiagnostics() {
  const current = resolveApiBaseUrl();
  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  const candidates = [current, envUrl, liveApiBaseUrl].filter((value, index, list): value is string => {
    return Boolean(value) && list.indexOf(value) === index;
  });

  const entries: AfatBackendDiagnosticEntry[] = [];

  for (const candidate of candidates) {
    const contractResponse = await probeJsonEndpoint(`${candidate}/health/contract`, 12000);
    const healthResponse = await probeJsonEndpoint(`${candidate}/health`, 10000);
    const authResponse = await fetch(`${candidate}/api/auth/supabase-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      mode: 'cors',
      body: JSON.stringify({ roleIntent: 'commuter' }),
    })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        const body = contentType.toLowerCase().includes('application/json')
          ? await res.json().catch(() => null)
          : await res.text().catch(() => '');
        const reason = contentType.toLowerCase().includes('application/json')
          ? String(body?.error || body?.message || (res.status === 401 ? 'Route exists and rejected missing Supabase session as expected.' : 'OK'))
          : `Expected JSON auth response, received ${contentType || 'unknown content type'}${body ? `: ${String(body).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`;

        return {
          ok: res.status === 401 || res.ok,
          status: res.status,
          reason,
        };
      })
      .catch((err: any) => ({
        ok: false,
        status: 0,
        reason: err?.message || 'Failed to reach auth contract route.',
      }));
    entries.push({
      candidate,
      contract: {
        ok: contractResponse.ok,
        status: contractResponse.status,
        reason: contractResponse.reason || 'OK',
      },
      health: {
        ok: healthResponse.ok,
        status: healthResponse.status,
        reason: healthResponse.reason || 'OK',
      },
      authContract: {
        ok: authResponse.ok,
        status: authResponse.status,
        reason: authResponse.reason || 'OK',
      },
    });
  }

  return {
    runtimeUrl: current,
    envUrl,
    liveUrl: liveApiBaseUrl,
    entries,
  };
}

async function requestAfatApi(path: string, init: RequestInit, fallback: string) {
  const attempt = async (baseUrl: string) => {
    const endpoint = `${baseUrl}${path}`;
    try {
      const res = await fetch(endpoint, init);
      const parsed = await readApiJson(res, `${fallback} at ${endpoint}.`);
      return { endpoint, res, parsed };
    } catch (err: any) {
      return {
        endpoint,
        res: null,
        parsed: {
          data: null,
          error: { message: err?.message || `${fallback} at ${endpoint}.` },
        },
      };
    }
  };

  const firstBase = getApiBaseUrl();
  const firstAttempt = await attempt(firstBase);
  if (!firstAttempt.parsed.error) {
    return firstAttempt;
  }

  const probe = await ensureReachableApiBaseUrl();
  if (!probe.healthy) {
    return firstAttempt;
  }

  if (probe.url === firstBase) {
    const secondAttempt = await attempt(probe.url);
    return secondAttempt.parsed.error ? firstAttempt : secondAttempt;
  }

  return attempt(probe.url);
}

if (!import.meta.env.VITE_SUPABASE_URL || (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  console.warn('⚠️ Supabase env vars missing. Running in mock mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function authenticatedAccessRequest(path: string, method = 'GET', body?: object) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return { data: null, error: { message: sessionError?.message || 'A verified Supabase session is required.' } };
  }

  const result = await requestAfatApi(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, 'AFAT access request failed');
  if (result.parsed.error) return result.parsed;
  if (!result.res?.ok) {
    return {
      data: null,
      error: { message: result.parsed.data?.error || result.parsed.data?.message || 'AFAT access request failed.' },
    };
  }
  return { data: result.parsed.data, error: null };
}

export function getAfatAccessSnapshot() {
  return authenticatedAccessRequest('/api/access/me');
}

export function bootstrapAfatFounder(bootstrapCode: string) {
  return authenticatedAccessRequest('/api/access/founder/bootstrap', 'POST', { bootstrapCode });
}

export function setAfatFounderPass(founderPass: string) {
  return authenticatedAccessRequest('/api/access/founder/pass', 'PUT', { founderPass });
}

export function verifyAfatFounderPass(founderPass: string) {
  return authenticatedAccessRequest('/api/access/founder/pass/verify', 'POST', { founderPass });
}

export function createAfatStaffInvitation(input: {
  email: string;
  roleKey: string;
  companyId?: string | null;
  scopes?: Array<{ type: string; value: string }>;
  reason?: string;
}) {
  return authenticatedAccessRequest('/api/access/staff/invitations', 'POST', input);
}

export function acceptAfatStaffInvitation(invitationId: string, invitationToken: string) {
  return authenticatedAccessRequest('/api/access/staff/invitations/accept', 'POST', {
    invitationId,
    invitationToken,
  });
}

export type AfatMapSource = {
  source_key: string;
  display_name: string;
  provider_name: string;
  source_class: string;
  homepage_url: string | null;
  license_expression: string;
  attribution_text: string;
  enabled: boolean;
  candidate_counts: Record<string, number>;
  metadata?: Record<string, unknown>;
};

export type AfatMapSourceRecord = {
  id: string;
  source_key: string;
  external_feature_id: string;
  canonical_name: string;
  source_category: string | null;
  source_address: string | null;
  latitude: number;
  longitude: number;
  source_confidence: number;
  review_status: string;
  dataset_version: string;
};

export function fetchAfatMapFoundation() {
  return authenticatedAccessRequest('/api/ops/map/sources');
}

export function fetchAfatMapSourceRecords(status = 'candidate', sourceKey?: string) {
  const params = new URLSearchParams({ status, limit: '30' });
  if (sourceKey) params.set('source_key', sourceKey);
  return authenticatedAccessRequest(`/api/ops/map/source-records?${params.toString()}`);
}

export function reviewAfatMapSourceRecord(recordId: string, input: {
  decision: 'approve' | 'reject';
  reason: string;
  canonicalName?: string;
  city?: string;
  zoneLabel?: string;
  confidence?: number;
}) {
  return authenticatedAccessRequest(`/api/ops/map/source-records/${recordId}/review`, 'POST', input);
}

// ==============================================================================
// 🔐 AUTH & ROLES (Phone OTP Focus)
// ==============================================================================

export async function signInWithGoogle(options?: { roleIntent?: string }) {
  try {
    const roleIntent = options?.roleIntent || localStorage.getItem('afat_access_intent_role') || 'commuter';
    localStorage.setItem('afat_access_intent_role', roleIntent);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) return { data: null, error: { message: error.message || 'Google sign-in failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Google sign-in failed.' } };
  }
}

export async function signInAsGuest(turnstileToken: string) {
  try {
    const gateResult = await requestAfatApi('/api/auth/guest-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstileToken }),
    }, 'Guest security check failed');
    if (gateResult.parsed.error) {
      return { data: null, error: gateResult.parsed.error };
    }
    const gateData = gateResult.parsed.data || {};
    if (!gateResult.res?.ok) {
      return { data: null, error: { message: gateData.error || 'Guest security check failed.' } };
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return { data: null, error: { message: error.message || 'Guest access failed.' } };
    if (data?.user?.id) {
      localStorage.setItem('afat_local_user_id', data.user.id);
      localStorage.setItem('afat_user_id', data.user.id);
      localStorage.setItem('afat_access_intent_role', 'commuter');
      localStorage.setItem('afat_access_level', 'guest');
    }
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Guest access failed.' } };
  }
}

export async function completeGoogleAuthCallback(options?: {
  roleIntent?: string;
  accessCode?: string;
  adminCode?: string;
}) {
  try {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const authCode = url.searchParams.get('code') || hashParams.get('code');
    const errorDescription = url.searchParams.get('error_description') || url.searchParams.get('error');
    const hashError = hashParams.get('error_description') || hashParams.get('error');

    if (errorDescription || hashError) {
      return { data: null, error: { message: errorDescription || hashError || 'Google sign-in failed.' } };
    }

    if (authCode) {
      const { error } = await supabase.auth.exchangeCodeForSession(authCode);
      if (error) return { data: null, error: { message: error.message || 'Could not complete Google sign-in.' } };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return { data: null, error: { message: sessionError.message || 'Could not restore the Google session.' } };
    }

    if (!sessionData.session?.user?.id) {
      return { data: null, error: { message: 'Google sign-in returned without an active AFAT session.' } };
    }

    const profileResult = await ensureSupabaseEmailProfile({
      roleIntent: options?.roleIntent || localStorage.getItem('afat_access_intent_role') || 'commuter',
      accessCode: options?.accessCode || '',
      adminCode: options?.adminCode || '',
    });

    if (profileResult.error) return profileResult;

    return {
      data: {
        session: sessionData.session,
        profile: profileResult.data?.profile || null,
        userId: profileResult.data?.userId || sessionData.session.user.id,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Could not complete Google sign-in.' } };
  }
}

export async function sendEmailOtp(email: string, options?: { roleIntent?: string; captchaToken?: string }) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
        captchaToken: options?.captchaToken,
        data: {
          role_intent: options?.roleIntent || 'commuter',
          username: normalizedEmail.split('@')[0],
          utm_source: 'afat_email_access',
        },
      },
    });

    if (error) return { data: null, error: { message: error.message || 'Failed to send email access code.' } };
    localStorage.setItem('afat_access_email', normalizedEmail);
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function verifyEmailOtp(email: string, token: string) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: String(token || '').trim(),
      type: 'email',
    });

    if (error) return { data: null, error: { message: error.message || 'Email verification failed.' } };
    if (data?.user?.id) {
      localStorage.setItem('afat_local_user_id', data.user.id);
      localStorage.setItem('afat_user_id', data.user.id);
    }
    localStorage.setItem('afat_access_email', normalizedEmail);
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function signInOrSignUpWithEmailPassword(
  email: string,
  password: string,
  options?: { roleIntent?: string; captchaToken?: string }
) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    const signIn = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: cleanPassword,
      options: {
        captchaToken: options?.captchaToken,
      },
    });

    if (!signIn.error) {
      if (signIn.data?.user?.id) {
        localStorage.setItem('afat_local_user_id', signIn.data.user.id);
        localStorage.setItem('afat_user_id', signIn.data.user.id);
      }
      localStorage.setItem('afat_access_email', normalizedEmail);
      return { data: { ...signIn.data, mode: 'signed_in' }, error: null };
    }

    const message = signIn.error.message || '';
    const canCreate =
      message.toLowerCase().includes('invalid login') ||
      message.toLowerCase().includes('invalid credentials') ||
      message.toLowerCase().includes('email not confirmed') ||
      message.toLowerCase().includes('user not found');

    if (!canCreate) {
      return { data: null, error: { message } };
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const signUp = await supabase.auth.signUp({
      email: normalizedEmail,
      password: cleanPassword,
      options: {
        emailRedirectTo: redirectTo,
        captchaToken: options?.captchaToken,
        data: {
          role_intent: options?.roleIntent || 'commuter',
          username: normalizedEmail.split('@')[0],
          utm_source: 'afat_email_password_access',
        },
      },
    });

    if (signUp.error) {
      return { data: null, error: { message: signUp.error.message || 'Email registration failed.' } };
    }

    if (signUp.data?.user?.id) {
      localStorage.setItem('afat_local_user_id', signUp.data.user.id);
      localStorage.setItem('afat_user_id', signUp.data.user.id);
    }
    localStorage.setItem('afat_access_email', normalizedEmail);

    return {
      data: {
        ...signUp.data,
        mode: signUp.data.session ? 'signed_up' : 'confirmation_required',
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function ensureSupabaseEmailProfile(options?: {
  roleIntent?: string;
  accessCode?: string;
  adminCode?: string;
}) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { data: null, error: { message: 'No Supabase email session is active yet.' } };
    }

    const result = await requestAfatApi('/api/auth/supabase-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        roleIntent: options?.roleIntent || localStorage.getItem('afat_access_intent_role') || 'commuter',
        accessCode: options?.accessCode || '',
        adminCode: options?.adminCode || '',
      }),
    }, 'Email profile bootstrap failed');
    if (result.parsed.error) return result.parsed;
    const data = result.parsed.data;
    if (!result.res?.ok) return { data: null, error: { message: data.error || 'Email profile bootstrap failed.' } };

    if (data?.userId) {
      localStorage.setItem('afat_local_user_id', data.userId);
      localStorage.setItem('afat_user_id', data.userId);
    }
    if (data?.accessToken) localStorage.setItem('afat_access_token', data.accessToken);
    if (data?.refreshToken) localStorage.setItem('afat_refresh_token', data.refreshToken);

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function bypassAfatRole(role: string) {
  try {
    const result = await requestAfatApi('/api/auth/qa-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }, 'QA bypass failed');
    if (result.parsed.error) return result.parsed;
    const data = result.parsed.data;
    if (!result.res?.ok) return { data: null, error: { message: data.error || 'QA bypass failed.' } };

    if (data?.userId) {
      localStorage.setItem('afat_local_user_id', data.userId);
      localStorage.setItem('afat_user_id', data.userId);
    }
    if (data?.profile?.phone) {
      localStorage.setItem('afat_local_phone', data.profile.phone);
    }
    if (data?.accessToken) {
      localStorage.setItem('afat_access_token', data.accessToken);
    }
    if (data?.refreshToken) {
      localStorage.setItem('afat_refresh_token', data.refreshToken);
    }
    localStorage.setItem('afat_access_intent_role', role);

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

/**
 * Step 1: Send SMS OTP via Africa's Talking (through our Express backend)
 */
export async function sendPhoneOtp(phone: string) {
  try {
    const result = await requestAfatApi('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    }, 'Failed to send OTP');
    if (result.parsed.error) return result.parsed;
    const data = result.parsed.data;
    if (!result.res?.ok) return { data: null, error: { message: data.error || 'Failed to send OTP.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

/**
 * Step 2: Verify OTP code via our Express backend
 * On success, sign the user into Supabase with the returned userId.
 */
export async function verifyPhoneOtp(phone: string, token: string, options?: { roleIntent?: string; adminCode?: string; accessCode?: string }) {
  try {
    const result = await requestAfatApi('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        code: token,
        roleIntent: options?.roleIntent,
        adminCode: options?.adminCode,
        accessCode: options?.accessCode,
      }),
    }, 'Phone verification failed');
    if (result.parsed.error) return result.parsed;
    const data = result.parsed.data;
    if (!result.res?.ok) return { data: null, error: { message: data.error || 'Verification failed.' } };

    if (data?.userId) {
      localStorage.setItem('afat_local_user_id', data.userId);
      localStorage.setItem('afat_local_phone', phone);
    }
    if (data?.accessToken) {
      localStorage.setItem('afat_access_token', data.accessToken);
    }
    if (data?.refreshToken) {
      localStorage.setItem('afat_refresh_token', data.refreshToken);
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function refreshAfatSession() {
  try {
    const refreshToken = localStorage.getItem('afat_refresh_token');
    if (!refreshToken) return { data: null, error: { message: 'No refresh token available.' } };

    const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Session refresh failed.' } };

    if (data?.accessToken) localStorage.setItem('afat_access_token', data.accessToken);
    if (data?.refreshToken) localStorage.setItem('afat_refresh_token', data.refreshToken);
    if (data?.profile?.id) localStorage.setItem('afat_local_user_id', data.profile.id);
    if (data?.profile?.phone) localStorage.setItem('afat_local_phone', data.profile.phone);

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchAfatSessionProfile() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
      headers: { ...afatAuthHeaders() },
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Auth session lookup failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function signOut() {
  localStorage.removeItem('afat_access_token');
  const refreshToken = localStorage.getItem('afat_refresh_token');
  localStorage.removeItem('afat_refresh_token');
  if (refreshToken) {
    try {
      await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {}
  }
  return await supabase.auth.signOut();
}

export function afatAuthHeaders() {
  const token = localStorage.getItem('afat_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function passageAuthHeaders() {
  const localToken = localStorage.getItem('afat_access_token');
  if (localToken) return { Authorization: `Bearer ${localToken}` };
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function onboardingAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return { Authorization: `Bearer ${data.session.access_token}` };
  const localToken = localStorage.getItem('afat_access_token');
  return localToken ? { Authorization: `Bearer ${localToken}` } : {};
}

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { user: session?.user || null, error };
}

/**
 * Get the full universal profile including their ROLE (commuter, operator, planner, admin)
 */
export async function getProfile(userId: string) {
  const localAccessToken = localStorage.getItem('afat_access_token');
  if (localAccessToken) {
    const afatSession = await fetchAfatSessionProfile();
    const sessionProfile = afatSession.data?.profile;
    if (sessionProfile?.id === userId) {
      return { data: sessionProfile, error: null };
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function updateProfile(userId: string, updates: any) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ==============================================================================
// 🚨 INCIDENTS (Crowdsourced Intelligence)
// ==============================================================================

export async function fetchActiveIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*, profiles!reporter_id(full_name, avatar_url, role)')
    .in('status', ['pending', 'verified'])
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function submitIncident(incidentData: any) {
  const { data, error } = await supabase
    .from('incidents')
    .insert([incidentData])
    .select()
    .single();

  // Award 50 points via RPC if successful
  if (data && incidentData.reporter_id) {
    await supabase.rpc('award_points', {
      p_user_id: incidentData.reporter_id,
      p_amount: 50,
      p_reason: 'Submitted live incident report',
      p_ref_id: data.id
    });
  }
  return { data, error };
}

export async function sendPanicAlert(alertData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/sos/panic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'SOS dispatch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function confirmIncident(incidentId: string, userId: string, vote: 'confirm'|'deny') {
    const { data: confirmData, error: confirmErr } = await supabase
        .from('confirmations')
        .insert([{ incident_id: incidentId, user_id: userId, vote }]);
    
    if (confirmErr) return { error: confirmErr };

    if (vote === 'confirm') {
        const { data: current } = await supabase
            .from('incidents')
            .select('confirmations')
            .eq('id', incidentId)
            .single();
            
        const newConfs = (current?.confirmations || 0) + 1;
        const { data, error } = await supabase
            .from('incidents')
            .update({ 
                confirmations: newConfs,
                status: newConfs >= 2 ? 'verified' : 'pending' 
            })
            .eq('id', incidentId)
            .select()
            .single();
        return { data, error };
    }
    return { data: confirmData, error: null };
}

// ==============================================================================
// 🚕 VEHICLES & FLEET (Operators & Admins)
// ==============================================================================

export async function registerVehicle(vehicleData: any) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert([vehicleData])
    .select()
    .single();
  return { data, error };
}

export async function registerPassenger(passengerData: any) {
  try {
    const authHeaders = await onboardingAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/onboard/passenger/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(passengerData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passenger registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function registerDriver(driverData: any) {
  try {
    const authHeaders = await onboardingAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/onboard/driver/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(driverData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Driver registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function registerCompany(companyData: any) {
  try {
    const authHeaders = await onboardingAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/onboard/company/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(companyData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Company registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function getOperatorVehicles(operatorId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('operator_id', operatorId);
  return { data, error };
}

export async function updateVehicleLocation(vehicleId: string, lat: number, lng: number) {
  const { data, error } = await supabase
    .from('vehicles')
    .update({ 
      current_lat: lat, 
      current_lng: lng,
      current_location: `POINT(${lng} ${lat})`,
      last_ping_at: new Date().toISOString()
    })
    .eq('id', vehicleId);
  return { data, error };
}

export async function getAvailableVehicles(lat?: number, lng?: number, radiusKm: number = 5) {
  let query = supabase
    .from('vehicles')
    .select('*, profiles!operator_id(full_name, phone)')
    .eq('is_available', true);

  if (lat !== undefined && lng !== undefined) {
    const delta = radiusKm / 111;
    query = query
      .gte('current_lat', lat - delta)
      .lte('current_lat', lat + delta)
      .gte('current_lng', lng - delta)
      .lte('current_lng', lng + delta);
  }

  const { data, error } = await query;
  return { data, error };
}

// ==============================================================================
// 🛣️ ROUTES (Informal Paths)
// ==============================================================================

export async function saveRoute(routeData: any) {
  const { data, error } = await supabase
    .from('routes')
    .insert([routeData])
    .select()
    .single();
  return { data, error };
}

export async function getOperatorRoutes(operatorId: string) {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('operator_id', operatorId);
  return { data, error };
}

// ==============================================================================
// 📅 BOOKINGS (Commuters & Operators)
// ==============================================================================

export async function createBooking(bookingData: any) {
  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingData])
    .select()
    .single();
  return { data, error };
}

export async function createSeatHold(holdData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/booking/seat-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holdData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Seat hold failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function releaseSeatHold(holdId: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/booking/seat-hold/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hold_id: holdId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Seat hold release failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createBookingFromHold(bookingData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/booking/create-from-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Booking creation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export type NegotiationRole = 'commuter' | 'operator';
export type NegotiationStatus = 'pending' | 'accepted' | 'rejected' | 'countered';

export async function submitNegotiationOffer(payload: {
  booking_id: string;
  role: NegotiationRole;
  price: number;
  status?: NegotiationStatus;
}) {
  const { data, error } = await supabase
    .from('negotiations')
    .insert([
      {
        booking_id: payload.booking_id,
        role: payload.role,
        price: payload.price,
        status: payload.status || 'countered',
      },
    ])
    .select()
    .single();

  return { data, error };
}

export async function getOperatorWalletLedger(operatorId: string) {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data, error };
}

export async function requestOperatorWithdrawal(operatorId: string, amount: number) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator_id: operatorId, amount }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Withdrawal failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function getCompanyMembership(profileId: string) {
  const { data, error } = await supabase
    .from('company_memberships')
    .select('role, status, companies:company_id(id, name, fleet_size, contact_person)')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle();
  return { data, error };
}

export async function issueSecureTicket(bookingId: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ticket/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Ticket issuance failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createGuardianToken(bookingId: string, expiresInMinutes: number = 180) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/guardian/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: bookingId,
        expires_in_minutes: expiresInMinutes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Guardian link creation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchGuardianWatch(token: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/guardian/watch/${token}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Guardian watch lookup failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function finalizeBookingPayment(bookingId: string, method: string, transactionId?: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/payment/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify({
        booking_id: bookingId,
        transaction_id: transactionId,
        method,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Payment finalization failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchOpsReportCenter() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/report-center`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Report center fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateOpsReportStatus(reportId: string, status: string, resolverId?: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/reports/${reportId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolver_id: resolverId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Report status update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchSafetyScore(lat?: number, lng?: number, radiusKm: number = 5) {
  try {
    const params = new URLSearchParams();
    if (lat !== undefined) params.set('lat', String(lat));
    if (lng !== undefined) params.set('lng', String(lng));
    params.set('radius_km', String(radiusKm));
    const res = await fetch(`${getApiBaseUrl()}/api/ops/safety-score?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Safety score fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchDemandRadar() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/demand-radar`);
    const parsed = await readApiJson(res, 'Demand radar fetch failed.');
    if (parsed.error) return { data: null, error: parsed.error };
    const data = parsed.data;
    if (!res.ok) return { data: null, error: { message: data.error || 'Demand radar fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function publishMapSignal(signalData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/map-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(signalData),
    });
    const parsed = await readApiJson(res, 'Map signal publish failed.');
    if (parsed.error) return { data: null, error: parsed.error };
    const data = parsed.data;
    if (!res.ok) return { data: null, error: { message: data.error || 'Map signal publish failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchLiveMapOps(city: string = 'cameroon') {
  try {
    const params = new URLSearchParams({ city });
    const res = await fetch(`${getApiBaseUrl()}/api/ops/live-map?${params.toString()}`);
    const parsed = await readApiJson(res, 'Live map feed failed.');
    if (parsed.error) return { data: null, error: parsed.error };
    const data = parsed.data;
    if (!res.ok) return { data: null, error: { message: data.error || 'Live map feed failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function reviewMapSignal(reviewData: {
  movement_log_id: string;
  status: 'queued' | 'validated' | 'dismissed' | 'published';
  confidence_score?: number;
  decision_notes?: string;
  reward_points?: number;
  reviewer_id?: string;
}) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/map-signal-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(reviewData),
    });
    const parsed = await readApiJson(res, 'Map signal review failed.');
    if (parsed.error) return { data: null, error: parsed.error };
    const data = parsed.data;
    if (!res.ok) return { data: null, error: { message: data.error || 'Map signal review failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchActiveDispatches() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/dispatch/active`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Dispatch fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createDispatchAssignment(dispatchData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/dispatch/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(dispatchData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Dispatch assignment failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createServiceRequest(serviceData: any) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/service/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(serviceData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Service request failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export type AfatMeetingPoint = {
  id: string;
  name: string;
  instructions: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  access_modes: string[];
  walk_minutes: number;
  confidence: number;
  successful_pickups: number;
};

export type AfatPlaceCandidate = {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  zone_label?: string | null;
  latitude: number;
  longitude: number;
  vehicle_access: string;
  confidence: number;
  confidence_label: 'high' | 'medium' | 'low';
  successful_pickups: number;
  explanation: string[];
  meeting_points: AfatMeetingPoint[];
};

export async function resolveAfatPlace(payload: { query: string; city?: string; vehicle_type?: string }) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/place/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Place resolution failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function confirmAfatPlace(payload: {
  profile_id?: string;
  query_text: string;
  city?: string;
  place_id?: string;
  meeting_point_id?: string;
  confidence?: number;
  resolution_status?: 'selected' | 'corrected' | 'none_correct';
  feedback?: string;
}) {
  try {
    const authHeaders = await passageAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/place/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Place confirmation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createPassageIntent(payload: {
  passenger_id: string;
  origin_text?: string;
  destination_text: string;
  arrival_target?: string;
  selected_place_id?: string;
  meeting_point_id?: string;
  place_confidence?: number;
  requested_vehicle_type?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const authHeaders = await passageAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/passages/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passage intent creation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchPassageIntents(params: { passenger_id?: string; operator_id?: string; open?: boolean }) {
  try {
    const authHeaders = await passageAuthHeaders();
    const query = new URLSearchParams();
    if (params.passenger_id) query.set('passenger_id', params.passenger_id);
    if (params.operator_id) query.set('operator_id', params.operator_id);
    if (params.open) query.set('open', 'true');
    const res = await fetch(`${getApiBaseUrl()}/api/passages/intents?${query.toString()}`, {
      headers: { ...authHeaders },
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passage lookup failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updatePassageIntentStatus(
  passageId: string,
  payload: { status: string; operator_id?: string; disruption_reason?: string }
) {
  try {
    const authHeaders = await passageAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/passages/intents/${passageId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passage update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function reportPassageOutcome(
  passageId: string,
  payload: {
    outcome_type: 'successful_pickup' | 'road_inaccessible' | 'meeting_point_incorrect' | 'passenger_no_show' | 'driver_cancelled' | 'passenger_cancelled';
    responsibility?: 'driver' | 'passenger' | 'map' | 'road_condition' | 'shared' | 'unclassified';
    notes?: string;
    evidence?: Record<string, any>;
  }
) {
  try {
    const authHeaders = await passageAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/api/passages/intents/${passageId}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passage outcome failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchPaymentProviderReadiness() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/payment/provider-readiness`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Payment readiness fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchComplianceRadar() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/compliance-radar`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance radar fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchComplianceSummary(profileId: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/compliance/summary/${profileId}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance summary fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function enrollCheckpoint(payload: {
  profile_id?: string;
  checkpoint_name: string;
  city: string;
  zone_label?: string;
  latitude: number;
  longitude: number;
  checkpoint_type?: string;
  notes?: string;
}) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/checkpoints/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...afatAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Checkpoint enrollment failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateComplianceStatus(recordId: string, status: string, notes?: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/compliance/${recordId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify({ status, notes }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function sendOpsNotification(payload: {
  user_ids?: string[];
  role?: string;
  city?: string;
  channels?: Array<'in_app' | 'whatsapp' | 'email' | 'telegram'>;
  title: string;
  body: string;
  type?: string;
  reference_id?: string;
}) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Notification send failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateOperatorLifecycle(
  operatorId: string,
  payload: {
    status: 'APPLICATION_STARTED' | 'DOCUMENTS_PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
    notes?: string;
  }
) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/operators/${operatorId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Operator status update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateCompanyLifecycle(
  companyId: string,
  payload: {
    status: 'partial_intake' | 'under_review' | 'approved' | 'documents_pending' | 'rejected' | 'suspended';
    notes?: string;
    coordinator_profile_id?: string;
    grant_planner_access?: boolean;
  }
) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ops/companies/${companyId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Company status update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function getMyBookings(passengerId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, vehicles(plate_number, type), routes(name), profiles!operator_id(full_name, phone)')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getOperatorBookings(operatorId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, profiles!passenger_id(full_name, phone)')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();
  return { data, error };
}

// ==============================================================================
// 🛰️ MOVEMENT & TELEMETRY
// ==============================================================================

export async function logMovement(movementData: any) {
  const { data, error } = await supabase
    .from('movement_logs')
    .insert([movementData]);
  return { data, error };
}

// ==============================================================================
// 📋 COLLECTION CAMPAIGNS (Planners & Admins)
// ==============================================================================

export async function getActiveCampaigns() {
  const { data, error } = await supabase
    .from('collection_campaigns')
    .select('*')
    .eq('is_active', true);
  return { data, error };
}

// ==============================================================================
// ⛽ FUEL STATIONS (Crowdsourced Prices)
// ==============================================================================

export async function getFuelStations() {
  const { data, error } = await supabase
    .from('fuel_stations')
    .select('*')
    .order('last_updated', { ascending: false });
  return { data, error };
}

export async function submitFuelUpdate(fuelData: any) {
  const { data, error } = await supabase
    .from('fuel_stations')
    .insert([fuelData])
    .select()
    .single();
    
   // Auto-award 25 points via RPC
    if (data && fuelData.reporter_id) {
      await supabase.rpc('award_points', {
          p_user_id: fuelData.reporter_id,
          p_amount: 25,
          p_reason: 'Updated fuel prices at station',
          p_ref_id: data.id
      });
   }
    
  return { data, error };
}

// ==============================================================================
// 🔔 NOTIFICATIONS
// ==============================================================================

export async function getMyNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  return { error };
}

export async function getMyTrustPoints(userId: string) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('trust_points')
        .eq('id', userId)
        .single();
        
    const { data: ledger, error } = await supabase
        .from('trust_ledger')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
        
    return { points: profile?.trust_points || 0, ledger, error };
}

// ==============================================================================
// 📡 REALTIME CHANNELS
// ==============================================================================

export function subscribeToIncidents(callback: (payload: any) => void) {
  return supabase
    .channel('public:incidents')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, callback)
    .subscribe();
}

export function subscribeToVehicles(callback: (payload: any) => void) {
  return supabase
    .channel('public:vehicles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, callback)
    .subscribe();
}

export function subscribeToMovementLogs(callback: (payload: any) => void) {
  return supabase
    .channel('public:movement_logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movement_logs' }, callback)
    .subscribe();
}

export function subscribeToBookings(userId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:bookings:user=${userId}`)
    .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'bookings' 
    }, callback)
    .subscribe();
}

export function subscribeToNotifications(userId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:notifications:user=${userId}`)
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `user_id=eq.${userId}` 
    }, callback)
    .subscribe();
}

// ==============================================================================
// 🗺️ BACKEND PORTED HELPERS (To avoid cross-env imports)
// ==============================================================================



export async function verifyBoarding(bookingId: string, operatorId: string) {
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, operator_id, status, payment_status')
    .eq('id', bookingId)
    .eq('operator_id', operatorId)
    .single();

  if (fetchError || !booking) {
    return false;
  }

  const status = booking.status || '';
  const paymentStatus = booking.payment_status || '';
  const validStatus = ['confirmed', 'accepted'].includes(status);
  const validPayment = paymentStatus === 'paid' || paymentStatus === 'cash_due';

  if (!validStatus || !validPayment) {
    return false;
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'boarded', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('operator_id', operatorId)
    .select()
    .single();

  return !error && data;
}

export async function verifyBoardingToken(ticket: any, operatorId: string) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ticket/verify-boarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        operator_id: operatorId,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Ticket verification failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}
