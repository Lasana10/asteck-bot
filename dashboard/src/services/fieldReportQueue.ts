import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';

const PREFIX = 'afat_field_report_v1:';
const MAX_AGE = 48 * 60 * 60 * 1000;
let flushing: Promise<void> | null = null;

export type QueuedFieldReport = {
  mutation_id: string;
  report_type: 'road_obstruction' | 'crash' | 'unsafe_pickup' | 'security_concern' | 'vehicle_issue' | 'service_problem' | 'route_issue' | 'medical' | 'other';
  severity: number;
  title?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  recorded_at: string;
};

function cleanupExpired() {
  const cutoff = Date.now() - MAX_AGE;
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(PREFIX)) continue;
    try {
      const item = JSON.parse(localStorage.getItem(key) || '{}');
      if (Date.parse(item?.payload?.recorded_at || '') < cutoff) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
}

export function enqueueFieldReport(userId: string, assignmentId: string, payload: QueuedFieldReport) {
  if (!userId || !assignmentId || !payload.mutation_id) return;
  cleanupExpired();
  const pending = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
  if (pending.length >= 200) throw new Error('Field report queue is full. Reconnect to synchronize pending reports.');
  const key = `${PREFIX}${userId}:${assignmentId}:${payload.mutation_id}`;
  localStorage.setItem(key, JSON.stringify({ userId, assignmentId, payload, queued_at: new Date().toISOString() }));
}

export function pendingFieldReports(userId: string, assignmentId?: string) {
  const prefix = assignmentId ? `${PREFIX}${userId}:${assignmentId}:` : `${PREFIX}${userId}:`;
  return Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length;
}

export function flushFieldReports(userId: string): Promise<void> {
  if (flushing) return flushing.then(() => flushFieldReports(userId));
  if (!navigator.onLine) return Promise.resolve();

  const run = async () => {
    cleanupExpired();
    const keys = Object.keys(localStorage)
      .filter((key) => key.startsWith(`${PREFIX}${userId}:`))
      .sort();

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let item: any;
      try {
        item = JSON.parse(raw);
      } catch {
        localStorage.removeItem(key);
        continue;
      }

      const headers = await authenticatedApiHeaders();
      const auth = headers.Authorization;
      if (!auth) return;

      // Do not replay reports under another signed-in identity.
      try {
        const token = auth.replace(/^Bearer /, '');
        const payloadSegment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=')));
        if (payload.sub !== item.userId) return;
      } catch {
        return;
      }

      const response = await fetch(
        `${getApiBaseUrl()}/api/dispatch/${encodeURIComponent(item.assignmentId)}/field-report`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Idempotency-Key': item.payload.mutation_id,
          },
          body: JSON.stringify(item.payload),
        },
      ).catch(() => null);

      if (!response || response.status >= 500 || response.status === 429 || response.status === 401) return;

      if (response.ok || [400, 403, 404, 409].includes(response.status)) {
        localStorage.removeItem(key);
      }
    }
  };

  flushing = run().finally(() => {
    flushing = null;
  });
  return flushing;
}
