import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../src/infra/supabase', () => ({ supabase: db }));
vi.mock('../../../src/api/routes', () => ({ requireAuthRole: vi.fn(async () => ({ profile: { id: 'passenger', role: 'commuter' } })) }));
import router from '../../../src/api/afatJourneyClosure';
let server: Server; let base: string;
beforeAll(async () => {
 const app = express(); app.use(express.json()); app.use(router);
 await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
 base = `http://127.0.0.1:${(server.address() as any).port}/dispatch/11111111-1111-4111-8111-111111111111/closure`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { db.rpc.mockReset(); db.rpc.mockResolvedValue({ data: { receipt_number: 'AFAT-STABLE' }, error: null }); });
const post = (body: unknown, key = 'request-0001') => fetch(base, { method: 'POST', headers: {'Content-Type':'application/json','Idempotency-Key':key}, body: JSON.stringify(body) });
describe('closure HTTP authority', () => {
 it('rejects client-paid assertions', async () => { expect((await post({ expected_version:0,payment_state:'paid' })).status).toBe(400); expect(db.rpc).not.toHaveBeenCalled(); });
 it('requires version and retry identity', async () => { expect((await post({ payment_state:'pending' })).status).toBe(400); expect((await post({ expected_version:0 },'')).status).toBe(400); });
 it('uses authenticated actor and ignores forged verification', async () => {
  expect((await post({ expected_version:0,rating:4,payment_verification:'provider_confirmed',receipt_number:'FAKE',actor_profile_id:'attacker' })).status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith('afat_update_journey_closure', expect.objectContaining({ p_actor_profile_id:'passenger',p_patch:{rating:4} }));
 });
 it('reports stale writes as conflicts', async () => { db.rpc.mockResolvedValue({error:{code:'40001',message:'Receipt changed'}}); expect((await post({expected_version:0})).status).toBe(409); });
});
