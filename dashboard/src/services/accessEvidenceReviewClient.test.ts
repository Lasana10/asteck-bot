import { beforeEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:mock}));
import {decideAccessEvidence,listPendingAccessEvidence,accessAccuracyLabel} from './accessEvidenceReviewClient';

beforeEach(()=>{mock.from.mockReset();mock.rpc.mockReset();});
describe('reviewed entrance evidence lifecycle',()=>{
 it('fetches only pending evidence through account-scoped PostgREST RLS',async()=>{
  const limit=vi.fn().mockResolvedValue({data:[{id:'a',status:'pending'}],error:null});
  const order=vi.fn().mockReturnValue({limit});
  const eq=vi.fn().mockReturnValue({order});
  const select=vi.fn().mockReturnValue({eq});
  mock.from.mockReturnValue({select});
  const result=await listPendingAccessEvidence(30);
  expect(mock.from).toHaveBeenCalledWith('afat_access_evidence_submissions');
  expect(eq).toHaveBeenCalledWith('status','pending');
  expect(result).toHaveLength(1);
 });
 it('uses protected review RPC and requires acknowledged decision',async()=>{
  const id='b4a4bdac-2199-4f91-a8f8-8c4e9aff6334';
  mock.rpc.mockResolvedValueOnce({data:{id,status:'accepted',evidence_status:'limited'},error:null})
    .mockResolvedValueOnce({data:{id,status:'pending'},error:null});
  const accepted=await decideAccessEvidence(id,'accept');
  expect(accepted.evidence_status).toBe('limited');
  expect(mock.rpc.mock.calls[0]).toEqual(['afat_review_access_evidence',{p_submission_id:id,p_decision:'accept'}]);
  await expect(decideAccessEvidence(id,'reject')).rejects.toThrow('not confirmed');
 });
 it('does not claim precise positioning from absent GNSS accuracy',()=>{
  expect(accessAccuracyLabel(null)).toBe('Accuracy not supplied');
  expect(accessAccuracyLabel(130)).toBe('Uncertain GPS');
  expect(accessAccuracyLabel(24.7)).toContain('25');
 });
});
