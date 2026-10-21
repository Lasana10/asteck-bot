import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),getSession:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{rpc:mocks.rpc,auth:{getUser:mocks.getUser,getSession:mocks.getSession}}}));
import {submitAccessEvidence,submitTransitObservation,flushMobilityEvidenceQueue,resolveJourneyMobilityIntelligence} from './mobilityEvidenceClient';
function makeStorage():Storage{
 const values=new Map<string,string>();
 return {get length(){return values.size;},clear(){values.clear();},key(i){return [...values.keys()][i]??null;},getItem(k){return values.get(k)??null;},setItem(k,v){values.set(k,String(v));},removeItem(k){values.delete(k)}} as Storage;
}
beforeEach(()=>{
 vi.restoreAllMocks();mocks.rpc.mockReset();mocks.getUser.mockReset();mocks.getSession.mockReset();
 vi.stubGlobal('navigator',{onLine:true});
 vi.stubGlobal('window',{localStorage:makeStorage(),dispatchEvent:vi.fn()});
 vi.stubGlobal('CustomEvent',class{constructor(public type:string,public options:any){}});
 mocks.getUser.mockResolvedValue({data:{user:{id:'alice'}},error:null});
});
describe('server idempotent mobility evidence replay',()=>{
 it('reuses the identical receipt key after a lost online response',async()=>{
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({data:{id:'receipt-1',status:'pending',automatic_truth:false},error:null});
  const result=await submitAccessEvidence({placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',accessType:'pedestrian',latitude:3.85,longitude:11.51});
  const id=(result.data as any)?.queue_id;
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(mocks.rpc.mock.calls[0][0]).toBe('afat_submit_mobility_evidence_once');
  expect(mocks.rpc.mock.calls[0][1].p_idempotency_key).toBe(id);
  const synced=await flushMobilityEvidenceQueue();
  expect(synced).toEqual({synced:1,pending:0});
  expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).toBe(id);
 });

 it('keeps unacknowledged field observations queued despite HTTP-level success',async()=>{
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce({data:{status:'ok'},error:null});
  const result=await submitAccessEvidence({placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',
    accessType:'pedestrian',latitude:3.85,longitude:11.51,
    observedAt:'2026-10-21T10:00:00.000Z'});
  expect((result.data as any)?.queued).toBe(true);
  const sync=await flushMobilityEvidenceQueue();
  expect(sync).toEqual({synced:0,pending:1});
  expect(mocks.rpc.mock.calls[0][1].p_payload.p_observed_at).toBe('2026-10-21T10:00:00.000Z');
  expect(mocks.rpc.mock.calls[1][1].p_payload.p_observed_at).toBe('2026-10-21T10:00:00.000Z');
 });
 it('preserves evidence provenance on retry until the review receipt is issued',async()=>{
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce({data:{id:'review-2',status:'pending',automatic_truth:false},error:null});
  const result=await submitAccessEvidence({placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',
    accessType:'pedestrian',latitude:3.85,longitude:11.51,
    observedAt:'2026-10-21T10:01:00.000Z'});
  const id=(result.data as any).queue_id;
  const sync=await flushMobilityEvidenceQueue();
  expect(sync).toEqual({synced:1,pending:0});
  expect(mocks.rpc.mock.calls[0][1].p_idempotency_key).toBe(id);
  expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).toBe(id);
 });
 it('keeps GNSS time unverified inside replayed transit review evidence',async()=>{
  vi.stubGlobal('navigator',{onLine:false});
  mocks.getSession.mockResolvedValue({data:{session:{user:{id:'alice'}}}});
  const submitted=await submitTransitObservation({
    cityKey:'cm-yaounde',observationType:'stop',mode:'minibus',
    latitude:3.866,longitude:11.516,gpsAccuracyM:18,
    observedAt:'2026-10-21T10:07:00.000Z',
    evidence:{place_id:'known-destination'}
  });
  expect((submitted.data as any)?.queued).toBe(true);
  vi.stubGlobal('navigator',{onLine:true});
  mocks.rpc.mockResolvedValueOnce({data:{id:'reviewed-pending',status:'pending',automatic_truth:false},error:null});
  await flushMobilityEvidenceQueue();
  const replay=mocks.rpc.mock.calls[0][1];
  expect(replay.p_kind).toBe('transit');
  expect(replay.p_payload.p_evidence).toMatchObject({
    observed_at:'2026-10-21T10:07:00.000Z',
    observation_time_source:'device_reported_gnss',
    observation_time_verified:false,automatic_truth:false,
  });
 });
 it('never submits queued evidence under another account',async()=>{
  vi.stubGlobal('navigator',{onLine:false});
  mocks.getSession.mockResolvedValue({data:{session:{user:{id:'alice'}}}});
  const result=await submitAccessEvidence({placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',accessType:'pedestrian',latitude:3.85,longitude:11.51});
  expect((result.data as any)?.queued).toBe(true);
  vi.stubGlobal('navigator',{onLine:true});
  mocks.getUser.mockResolvedValue({data:{user:{id:'bob'}},error:null});
  await flushMobilityEvidenceQueue();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});

describe('connected passenger reachability and informal transit',()=>{
 const args={placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',originLatitude:3.866,originLongitude:11.516,mode:'minibus'};
 it('keeps real transit observations when live reachability cannot be assessed',async()=>{
  mocks.rpc.mockImplementation((name:string)=>{
   if(name==='afat_assess_place_reachability')return Promise.reject(new Error('atlas temporarily unavailable'));
   if(name==='afat_plan_multimodal_journey')return Promise.resolve({data:{place_id:args.placeId,multimodal_chain_status:'observed',multimodal_chain:{line:{name:'shared taxi'}}},error:null});
   throw Error('unexpected RPC '+name);
  });
  const result=await resolveJourneyMobilityIntelligence(args);
  expect(result.partial).toBe(true);
  expect(result.assessment).toBeNull();
  expect(result.plan?.multimodal_chain?.line?.name).toBe('shared taxi');
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
 });
 it('keeps reachability when transit observation service is unavailable',async()=>{
  mocks.rpc.mockImplementation((name:string)=>{
   if(name==='afat_assess_place_reachability')return Promise.resolve({data:{place_id:args.placeId,state:'reachable_with_uncertainty',reliability_score:50},error:null});
   if(name==='afat_plan_multimodal_journey')return Promise.resolve({data:null,error:{message:'transit unavailable'}});
   throw Error('unexpected RPC '+name);
  });
  const result=await resolveJourneyMobilityIntelligence(args);
  expect(result.partial).toBe(true);
  expect(result.assessment?.state).toBe('reachable_with_uncertainty');
  expect(result.plan).toBeNull();
 });
 it('never invents a transport option if both operational RPCs fail',async()=>{
  mocks.rpc.mockRejectedValue(new Error('offline'));
  expect(await resolveJourneyMobilityIntelligence(args)).toEqual({assessment:null,plan:null,partial:true});
 });
 it('keeps both successful evidence projections distinct',async()=>{
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({error:null,data:name==='afat_assess_place_reachability'
   ?{place_id:args.placeId,state:'not_confirmed',reliability_score:0}
   :{place_id:args.placeId,multimodal_chain_status:'insufficient_transit_evidence',multimodal_chain:null}}));
  const result=await resolveJourneyMobilityIntelligence(args);
  expect(result.partial).toBe(false);
  expect(result.assessment?.state).toBe('not_confirmed');
  expect(result.plan?.multimodal_chain_status).toBe('insufficient_transit_evidence');
 });
});
