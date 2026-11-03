import { beforeEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:mock}));
import {decideAccessEvidence,listPendingAccessEvidence,decideTransitEvidence,listPendingTransitEvidence,accessAccuracyLabel} from './accessEvidenceReviewClient';
import {orderedPendingTransitReview,pendingTransitOrderWarning} from './transitCorridorReview';

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

describe('planner transit evidence review',()=>{
 it('only retrieves pending transit observations with account RLS',async()=>{
  const limit=vi.fn().mockResolvedValue({data:[{id:'a',status:'pending'}],error:null});
  const order=vi.fn().mockReturnValue({limit});
  const eq=vi.fn().mockReturnValue({order});
  mock.from.mockReturnValue({select:vi.fn().mockReturnValue({eq})});
  const records=await listPendingTransitEvidence();
  expect(records).toHaveLength(1);
  expect(mock.from).toHaveBeenCalledWith('afat_transit_observations');
  expect(eq).toHaveBeenCalledWith('status','pending');
 });
 it('requires explicit review receipt before accepting a transit network candidate',async()=>{
  const id='b4a4bdac-2199-4f91-a8f8-8c4e9aff6334';
  mock.rpc.mockResolvedValue({data:{id,status:'accepted',evidence_status:'limited'},error:null});
  expect((await decideTransitEvidence(id,'accept')).evidence_status).toBe('limited');
  expect(mock.rpc).toHaveBeenCalledWith('afat_review_transit_observation',{p_observation_id:id,p_decision:'accept'});
 });
});

describe('ordered transit review conflict presentation',()=>{
 const observation=(id:string,stop_sequence:number,latitude:number,longitude:number)=>({
  id,profile_id:'contributor',city_key:'cm-yaounde',line_name:'Example observed line',
  direction_label:'toward destination',mode:'minibus',observation_type:'stop',
  node_name:'Reported stop',latitude,longitude,gps_accuracy_m:20,
  wait_seconds:null,fare_xaf:null,created_at:'2026-11-03T10:00:00Z',
  evidence:{stop_sequence,observed_at:'2026-11-03T10:00:00Z'},status:'pending',
 });
 it('groups and sorts real reported stop sequence without approving it',()=>{
  const b=observation('b',2,3.862,11.518),a=observation('a',0,3.86,11.516);
  const result=orderedPendingTransitReview([b,a] as any);
  expect(result.map(x=>x.id)).toEqual(['a','b']);
  expect(result.every(x=>x.status==='pending')).toBe(true);
 });
 it('warns when two pending reports assign far apart locations to the same stop slot',()=>{
  const a=observation('a',1,3.86,11.51),b=observation('b',1,3.90,11.55);
  expect(pendingTransitOrderWarning(a as any,[a,b] as any)).toContain('different location');
  expect(pendingTransitOrderWarning(a as any,[a] as any)).toBeNull();
  expect(pendingTransitOrderWarning(a as any,[a,{...b,evidence:{stop_sequence:2}}] as any)).toBeNull();
 });
});
