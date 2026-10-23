import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';
const PREFIX = 'afat_journey_sample_v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;
// Never acknowledge a dispatch observation solely because an HTTP request completed.
// Unacknowledged or aged-out samples remain visible until explicitly resolved.
export type JourneySample = { latitude: number; longitude: number; accuracy_m: number | null; speed_kph: number | null; heading: number | null; recorded_at: string; observation_id?: string };
let flushing: Promise<void> | null = null;
export function enqueueJourneySample(userId: string, assignmentId: string, sample: JourneySample) {
  if (!userId || !assignmentId) return;
  if (!Number.isFinite(Date.parse(sample.recorded_at))) throw new Error('Journey GPS sample requires a valid recorded time.');
  if (Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).length >= 1000) throw new Error('Journey GPS queue is full. Reconnect to synchronize.');
  const baseKey = `${PREFIX}${userId}:${assignmentId}:${sample.recorded_at}`;
  // Two legitimate GPS fixes may share a millisecond: never overwrite one.
  let key = baseKey;
  let suffix = 0;
  while (localStorage.getItem(key) !== null) {
    const existing = localStorage.getItem(key);
    if (existing) {
      try { if (JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(existing).sample).filter(([name]) => name !== 'observation_id'))) === JSON.stringify(sample)) return; } catch { /* preserve corrupted evidence for review */ }
    }
    key = `${baseKey}:${++suffix}`;
  }
  localStorage.setItem(key, JSON.stringify({ userId, assignmentId, sample: { ...sample, observation_id: crypto.randomUUID() } }));
}
export function pendingJourneySamples(userId: string, assignmentId: string) {
  return Object.keys(localStorage).filter(key => key.startsWith(`${PREFIX}${userId}:${assignmentId}:`)).length;
}
export function flushJourneySamples(userId: string): Promise<void> {
  if (flushing) return flushing.then(() => flushJourneySamples(userId));
  if (!navigator.onLine) return Promise.resolve();
  const run = async () => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(`${PREFIX}${userId}:`)).sort();
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let item;
      try { item = JSON.parse(raw); } catch { localStorage.removeItem(key); continue; }
      // Keep old data for explicit field review rather than silently erase evidence.
      if (!item?.sample || !Number.isFinite(Date.parse(item.sample.recorded_at)) || Date.parse(item.sample.recorded_at) < Date.now() - MAX_AGE) return;
      if (item.userId !== userId || !item.assignmentId) return;
      // Persist one stable identity when replaying evidence queued by older clients.
      if (!item.sample.observation_id) {
        item.sample.observation_id = crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify(item));
      }
      const headers = await authenticatedApiHeaders();
      const token = headers.Authorization?.replace(/^Bearer /, '');
      if (!token) return;
      // Bind replay to the identity that recorded it, including across account switches.
      try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        if (JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).sub !== item.userId) return;
      } catch { return; }
      const response = await fetch(`${getApiBaseUrl()}/api/dispatch/${encodeURIComponent(item.assignmentId)}/journey/sample`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(item.sample),
      }).catch(() => null);
      if (!response || response.status >= 500 || response.status === 429 || response.status === 401) return;
      // A 202, conflict or validation error is not proof that the GPS fix was stored.
      // Only final 2xx acknowledgement may clear the original observation.
      if (response.ok && response.status !== 202 && response.status !== 204) {
        const receipt = await response.json().catch(() => null);
        if (receipt?.accepted === true && receipt.assignment_id === item.assignmentId && receipt.sample_id && receipt.sample?.id === receipt.sample_id) {
          localStorage.removeItem(key);
          continue;
        }
      }
      return;
    }
  };
  flushing = run().finally(() => { flushing = null; });
  return flushing;
}
