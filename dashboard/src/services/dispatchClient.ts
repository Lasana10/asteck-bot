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

type ApiResult<T> = { data: T | null; error: { message: string } | null };

async function authHeaders(extra?: HeadersInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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

export function makeDispatchMutationKey(assignmentId: string, nextStatus: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dispatch:${assignmentId}:${nextStatus}:${random}`;
}
