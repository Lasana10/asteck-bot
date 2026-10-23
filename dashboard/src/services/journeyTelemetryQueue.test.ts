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
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ accepted: true, assignment_id: 'journey-a', sample_id: 'sample-server-1', sample: { id: 'sample-server-1' } }) }));
});
describe('journey GPS replay', () => {
 it('deduplicates a sample and drains it after acceptance', async () => {
  const point = sample(); enqueueJourneySample('passenger-a','journey-a',point); enqueueJourneySample('passenger-a','journey-a',point);
  expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
  await flushJourneySamples('passenger-a'); expect(fetch).toHaveBeenCalledTimes(1); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(0);
 });
 it('preserves distinct fixes sharing a timestamp instead of overwriting evidence', () => {
  const point = sample(); enqueueJourneySample('passenger-a','journey-a',point);
  enqueueJourneySample('passenger-a','journey-a',{...point, longitude: 11.51});
  expect(pendingJourneySamples('passenger-a','journey-a')).toBe(2);
 });
 it('never deletes a rejected GPS fix or passive 202 upload', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample());
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:400} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
  vi.mocked(fetch).mockResolvedValueOnce({ok:true,status:202} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
 });
 it('rejects receipts for another assignment or without matching persisted sample', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample());
  vi.mocked(fetch).mockResolvedValueOnce({ok:true,status:200,json:async()=>({accepted:true,assignment_id:'journey-b',sample_id:'sample-server-1',sample:{id:'sample-server-1'}})} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
  vi.mocked(fetch).mockResolvedValueOnce({ok:true,status:200,json:async()=>({accepted:true,assignment_id:'journey-a',sample_id:'sample-server-1',sample:{id:'wrong'}})} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
 });
 it('never deletes an HTTP 200 without a durable receipt', async () => {
  enqueueJourneySample('passenger-a','journey-a',sample());
  vi.mocked(fetch).mockResolvedValueOnce({ok:true,status:200,json:async()=>({success:true,accepted:false})} as Response);
  await flushJourneySamples('passenger-a'); expect(pendingJourneySamples('passenger-a','journey-a')).toBe(1);
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
