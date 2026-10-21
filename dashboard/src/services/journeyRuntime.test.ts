import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{rpc:mocks.rpc,auth:{getUser:mocks.getUser}}}));
import {saveJourneyRuntime,clearJourneyRuntime,loadJourneyRuntime,reconcileJourneyRuntime} from './journeyRuntime';
const point=(time:string,latitude:number)=>({latitude,longitude:11.516,accuracy:9,speedKph:12,heading:90,recordedAt:time});
const startedAt='2026-10-21T10:00:00.000Z';
const base={profileId:'test-alice',cityKey:'cm-yaounde',placeId:'3d491f54-a75c-4887-84ed-8d88fb6078d0',placeName:'Test source-backed place',
 destinationLatitude:3.88,destinationLongitude:11.53,mode:'car',intentType:'go',routeDistanceM:1950};

beforeEach(()=>{
 localStorage.clear();mocks.rpc.mockReset();mocks.getUser.mockReset();
 mocks.getUser.mockResolvedValue({data:{user:{id:'test-alice'}},error:null});
 mocks.rpc.mockImplementation(async (name:string)=>{
  if(name==='afat_start_navigation_session_once')return {data:{id:'bed390b5-bd6c-438b-b347-0f9c61b5956e'},error:null};
  if(name==='afat_ingest_navigation_sample_v2')return {data:{accepted:true,replayed:false},error:null};
  if(name==='afat_finish_navigation_session')return {data:{status:'cancelled'},error:null};
  return {data:null,error:{message:'Unknown RPC'}};
 });
 vi.stubGlobal('navigator',{onLine:false});
});
describe('AFAT complete offline navigation session → authenticated replay → receipt',()=>{
 it('preserves GPS and cancellation when the session never started online',async()=>{
  const first=saveJourneyRuntime({...base,state:'navigating',startedAt,lastPosition:point(startedAt,3.866)});
  expect(first.clientStartKey).toMatch(/^[a-f0-9-]{36}$/i);
  saveJourneyRuntime({state:'navigating',lastPosition:point('2026-10-21T10:00:12.000Z',3.867),sampleCount:2});
  const cancelled=clearJourneyRuntime('cancelled');
  expect(cancelled.state).toBe('cancelled');
  expect(cancelled.pendingSampleCount).toBeGreaterThanOrEqual(2);
  expect(mocks.rpc).not.toHaveBeenCalled();
  vi.stubGlobal('navigator',{onLine:true});
  await reconcileJourneyRuntime();
  expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual([
    'afat_start_navigation_session_once','afat_ingest_navigation_sample_v2',
    'afat_ingest_navigation_sample_v2','afat_finish_navigation_session',
  ]);
  expect(mocks.rpc.mock.calls[0][1].p_client_start_key).toBe(first.clientStartKey);
  expect(loadJourneyRuntime()?.serverSyncState).toBe('finished');
  expect(loadJourneyRuntime()?.pendingSampleCount).toBe(0);
 });
 it('never uploads trip samples under a different signed-in account',async()=>{
  saveJourneyRuntime({...base,state:'navigating',startedAt,lastPosition:point(startedAt,3.866)});
  vi.stubGlobal('navigator',{onLine:true});
  mocks.getUser.mockResolvedValue({data:{user:{id:'test-bob'}},error:null});
  await reconcileJourneyRuntime();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(loadJourneyRuntime()?.pendingSampleCount).toBe(1);
 });
 it('retries lost server-start responses with the same client key rather than starting a new trip',async()=>{
  const first=saveJourneyRuntime({...base,state:'navigating',startedAt,lastPosition:point(startedAt,3.866)});
  mocks.rpc.mockRejectedValueOnce(new Error('Server accepted request but connection was interrupted'));
  vi.stubGlobal('navigator',{onLine:true});
  await reconcileJourneyRuntime();
  expect(loadJourneyRuntime()?.serverSyncState).toBe('failed');
  await reconcileJourneyRuntime();
  const starts=mocks.rpc.mock.calls.filter(x=>x[0]==='afat_start_navigation_session_once');
  expect(starts).toHaveLength(2);
  expect(starts[0][1].p_client_start_key).toBe(first.clientStartKey);
  expect(starts[1][1].p_client_start_key).toBe(first.clientStartKey);
  expect(loadJourneyRuntime()?.serverSessionId).toBe('bed390b5-bd6c-438b-b347-0f9c61b5956e');
 });
});
