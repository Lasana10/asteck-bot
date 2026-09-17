import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock('../supabaseClient', () => ({ authenticatedApiHeaders: auth.headers, getApiBaseUrl: () => 'https://afat.test' }));
import { enqueueJourneySample, flushJourneySamples, pendingJourneySamples } from './journeyTelemetryQueue';
const token = (sub: string) => `x.${btoa(JSON.stringify({sub}))}.x`;
const sample = () => ({ latitude: 3.86, longitude: 11.50, accuracy_m: 8, speed_kph: null, heading: null, recorded_at: new Date().toISOString() });
beforeEach(() => {
 const storage: Record<string, any> = {};
 Object.defineProperties(storage, { getItem: { value: (k: string) => storage[k] ?? null }, setItem: { value: (k: string, v: string) => { storage[k] = v; } }, removeItem: { value: (k: string) => { delete storage[k]; } } });
 vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { onLine: true });
 auth.headers.mockResolvedValue({ Authorization: `Bearer ${token('passenger-a')}` });
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));
});
describe('journey GPS replay', () => {
 it('deduplicates a sample and drains it after acceptance', async () => {
  const point = sample(); enqueueJourneySample('passenger-a','journey-a',point); enqueueJourneySample('passenger-a','journey-a',point);
  expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
  await flushJourneySamples('passenger-a'); expect(fetch).toHaveBeenCalledTimes(1); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(0);
 });
 it('does not replay across account switches', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample()); auth.headers.mockResolvedValue({ Authorization: `Bearer ${token('passenger-b')}` });
  await flushJourneySamples('passenger-a'); expect(fetch).not.toHaveBeenCalled(); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
 });
 it('retains samples across offline and server failure', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample()); (navigator as any).onLine = false;
  await flushJourneySamples('passenger-a'); expect(fetch).not.toHaveBeenCalled();
  (navigator as any).onLine = true; vi.mocked(fetch).mockResolvedValue({ok:false,status:503} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
 });
 it('preserves new samples queued during upload', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample());
  vi.mocked(fetch).mockImplementationOnce(async () => { enqueueJourneySample('passenger-a','journey-b',sample()); return {ok:true,status:202} as Response; });
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-b')).toBe(1);
 });
});
