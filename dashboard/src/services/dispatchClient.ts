import { getApiBaseUrl, supabase } from '../supabaseClient';

export type DispatchAssignment = {
  id: string;
  booking_id?: string | null;
  route_id?: string | null;
  operator_id?: string | null;
  vehicle_id?: string | null;
  dispatcher_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  priority?: string | null;
  status: string;
  notes?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  dispatch_score?: number | null;
  decision_factors?: Record<string, unknown> | null;
  atlas_context?: Record<string, unknown> | null;
  evidence_context?: Record<string, unknown> | null;
  state_version?: number | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  pickup_verified_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  failure_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DispatchEvent = {
  id: string;
  assignment_id: string;
  actor_profile_id?: string | null;
  event_type: string;
  from_status?: string | null;
  to_status: string;
  reason?: string | null;
  evidence?: Record<string, unknown> | null;
  idempotency_key: string;
  created_at: string;
};

export type DispatchCandidate = {
  vehicle_id: string;
  operator_id: string;
  vehicle_type?: string | null;
  capacity?: number | null;
  score: number;
  straight_line_distance_km: number;
  eta: null;
  eta_status: string;
  telemetry_age_minutes?: number | null;
  factors: Record<string, number>;
  evidence: {
    verified_pickup_incidents: string[];
    atlas_records_considered: number;
    atlas_average_confidence?: number | null;
    signal_missing: string[];
  };
};

type ApiResult<T> = { data: T | null; error: { message: string } | null };

function decodeJwtSubject(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof window === 'undefined') return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = JSON.parse(window.atob(padded));
    if (json?.exp && Number(json.exp) * 1000 <= Date.now()) return null;
    return String(json?.sub || '').trim() || null;
  } catch {
    return null;
  }
}

function boundAfatToken() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('afat_access_token');
  const owner = String(localStorage.getItem('afat_access_token_user_id') || '').trim();
  const currentUser = String(localStorage.getItem('afat_user_id') || localStorage.getItem('afat_local_user_id') || '').trim();
  if (!token || !owner || !currentUser || owner !== currentUser) return null;
  const subject = decodeJwtSubject(token);
  if (!subject || subject !== owner) return null;
  return token;
}

async function authHeaders(extra?: HeadersInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || boundAfatToken();
  if (!token) throw new Error('Your AFAT session has expired. Sign in again to continue.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(extra || {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: await authHeaders(init?.headers),
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    if (!response.ok) return { data: null, error: { message: String(payload?.error || `Dispatch request failed (${response.status}).`) } };
    return { data: payload as T, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error?.message || 'AFAT dispatch service is unavailable.' } };
  }
}

export async function fetchAuthoritativeDispatches(options?: { includeTerminal?: boolean; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.includeTerminal) params.set('include_terminal', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  const suffix = params.toString() ? `?${params}` : '';
  return request<{ dispatches: DispatchAssignment[]; role: string; active_states: string[] }>(`/dispatch${suffix}`);
}

export async function fetchDispatchCandidates(assignmentId: string) {
  const params = new URLSearchParams({ assignment_id: assignmentId });
  return request<{
    assignment_id: string | null;
    pickup: { latitude: number; longitude: number };
    scoring_contract: {
      deterministic: boolean;
      route_eta_used: boolean;
      straight_line_distance_only: boolean;
      evidence_decay_note: string;
    };
    candidates: DispatchCandidate[];
  }>(`/dispatch/candidates?${params}`);
}

export async function fetchDispatchDetail(assignmentId: string) {
  return request<{ assignment: DispatchAssignment; events: DispatchEvent[] }>(`/dispatch/${encodeURIComponent(assignmentId)}`);
}

export async function transitionDispatch(input: {
  assignmentId: string;
  expectedStatus: string;
  nextStatus: string;
  reason?: string;
  evidence?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return request<{ assignment: DispatchAssignment; idempotency_key: string }>(`/dispatch/${encodeURIComponent(input.assignmentId)}/transition`, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      expected_status: input.expectedStatus,
      next_status: input.nextStatus,
      reason: input.reason || null,
      evidence: input.evidence || {},
    }),
  });
}
