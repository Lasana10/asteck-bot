import { authenticatedApiHeaders, getApiBaseUrl } from '../supabaseClient';
const PREFIX = 'afat_journey_sample_v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;
export type JourneySample = { latitude: number; longitude: number; accuracy_m: number | null; speed_kph: number | null; heading: number | null; recorded_at: string };
let flushing: Promise<void> | null = null;
export function enqueueJourneySample(userId: string, assignmentId: string, sample: JourneySample) {
  if (!userId || !assignmentId) return;
  const keys = Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).sort();
  for (const key of keys) {
    try { if (Date.parse(JSON.parse(localStorage.getItem(key)!).sample.recorded_at) < Date.now() - MAX_AGE) localStorage.removeItem(key); } catch { localStorage.removeItem(key); }
  }
  if (Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).length >= 1000) throw new Error('Journey GPS queue is full. Reconnect to synchronize.');
  localStorage.setItem(`${PREFIX}${userId}:${assignmentId}:${sample.recorded_at}`, JSON.stringify({ userId, assignmentId, sample }));
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
      if (Date.parse(item.sample.recorded_at) < Date.now() - MAX_AGE) { localStorage.removeItem(key); continue; }
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
      if (response.ok || [400,403,404,409].includes(response.status)) localStorage.removeItem(key);
    }
  };
  flushing = run().finally(() => { flushing = null; });
  return flushing;
}
