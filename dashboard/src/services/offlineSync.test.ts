import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
 getUser:vi.fn(),getSession:vi.fn(),authHeaders:vi.fn(),fetch:vi.fn(),onAuthStateChange:vi.fn(),
}));
vi.mock('../supabaseClient',()=>({
 supabase:{auth:{getUser:mocks.getUser,getSession:mocks.getSession,onAuthStateChange:mocks.onAuthStateChange}},
 authenticatedApiHeaders:mocks.authHeaders,
 getApiBaseUrl:()=> 'https://backend.example.test',
}));
import {offlineSync,isAcknowledgedMapSignal} from './offlineSync';
function memory():Storage{
 const values=new Map<string,string>();
 return {get length(){return values.size},clear(){values.clear()},getItem(k){return values.get(k)??null},
 setItem(k,v){values.set(k,String(v))},removeItem(k){values.delete(k)},
 key(i){return [...values.keys()][i]??null}} as Storage;
}
let storage:Storage;
const account=(id:string)=>({data:{user:{id}},error:null});
const incident=(description:string)=>({type:'road_hazard',description,latitude:3.866,longitude:11.516});
beforeEach(()=>{
 vi.restoreAllMocks();vi.clearAllMocks();
 storage=memory();
 vi.stubGlobal('localStorage',storage);
 vi.stubGlobal('navigator',{onLine:true});
 mocks.getUser.mockResolvedValue(account('alice'));
 mocks.getSession.mockResolvedValue({data:{session:{user:{id:'alice'}}},error:null});
 mocks.authHeaders.mockResolvedValue({authorization:'Bearer opaque-alice-token'});
 mocks.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
 mocks.fetch.mockImplementation(async (_url:string,options:{body:string})=>{
  const sent=JSON.parse(options.body);
  const key=sent.metadata?.offline_mutation_id;
  const receipt=String(_url).endsWith('/api/booking/complete')
   ?{success:true,booking:{id:sent.booking_id,status:'completed'}}
   :{success:true,accepted:true,movement:{id:'movement-1',idempotency_key:key},
     ...(sent.signal_type==='incident'?{incident:{id:'incident-1',movement_log_id:'movement-1',verification_status:'pending'}}:{})};
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>receipt};
 });
 vi.stubGlobal('fetch',mocks.fetch);
});
describe('AFAT account-owned offline operational replay',()=>{
 it('captures while offline using the current signed-in local session and replays only as that authenticated user',async()=>{
  vi.stubGlobal('navigator',{onLine:false});
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Actual pothole reported'));
  expect(mocks.getSession).toHaveBeenCalled();
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toContain('Actual pothole');
  vi.stubGlobal('navigator',{onLine:true});
  await offlineSync.flush();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toBe('[]');
 });
 it('never assigns a former account’s queued observations to a new login',async()=>{
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Owned by Alice'));
  mocks.getUser.mockResolvedValue(account('bob'));
  await offlineSync.flush();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toContain('Owned by Alice');
 });
 it('preserves observations captured concurrently with a successful replay',async()=>{
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Original'));
  mocks.fetch.mockImplementationOnce(async()=>{
   await offlineSync.enqueue('INSERT_INCIDENT',incident('New after replay started'));
   const id=JSON.parse(mocks.fetch.mock.calls[0][1].body).metadata.offline_mutation_id;
   return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({
     success:true,accepted:true,movement:{id:'m1',idempotency_key:id},
     incident:{id:'i1',movement_log_id:'m1',verification_status:'pending'}
   })};
  });
  await offlineSync.flush();
  const remaining=JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]');
  expect(remaining).toHaveLength(1);
  expect(remaining[0].payload.description).toBe('New after replay started');
 });
 it('stops mid-replay on an account switch and preserves unsent records',async()=>{
  await offlineSync.enqueue('INSERT_INCIDENT',incident('First'));
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Second'));
  mocks.getUser.mockResolvedValueOnce(account('alice'))
   .mockResolvedValueOnce(account('alice'))
   .mockResolvedValueOnce(account('bob'));
  await offlineSync.flush();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const remaining=JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]');
  expect(remaining).toHaveLength(1);
  expect(remaining[0].payload.description).toBe('Second');
 });
 it('will never replay a legacy global queue under whichever account signs in',async()=>{
  storage.setItem('afat_offline_sync_queue',JSON.stringify([{id:'legacy',type:'INSERT_INCIDENT',payload:incident('Unowned'),timestamp:Date.now()}]));
  await offlineSync.flush();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(storage.getItem('afat_offline_sync_queue')).toContain('Unowned');
 });
 it('restarts owner-scoped replay after auth restoration without syncing on logout',async()=>{
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Authenticated reconnect'));
  const listeners:Record<string,()=>void>={};
  vi.stubGlobal('window',{addEventListener:(name:string,cb:()=>void)=>{listeners[name]=cb;}});
  offlineSync.init();
  // First online boot may flush automatically; capture a second mutation to
  // distinguish SIGNED_OUT from SIGNED_IN state transitions.
  await vi.waitFor(()=>expect(mocks.fetch).toHaveBeenCalledTimes(1));
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Wait for login'));
  const authCallback=mocks.onAuthStateChange.mock.calls[0]?.[0];
  expect(authCallback).toBeTypeOf('function');
  authCallback('SIGNED_OUT',null);
  await Promise.resolve();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  authCallback('SIGNED_IN',{user:{id:'alice'}});
  await vi.waitFor(()=>expect(mocks.fetch).toHaveBeenCalledTimes(2));
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toBe('[]');
  expect(listeners.online).toBeTypeOf('function');
 });

 it('keeps passive ingestion HTTP 202 and partial HTTP 200 incidents queued',async()=>{
  await offlineSync.enqueue('INSERT_INCIDENT',incident('Report not yet accepted'));
  mocks.fetch.mockResolvedValueOnce({ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({success:true,accepted:false,reason:'telemetry_staged_passive'})});
  await offlineSync.flush();
  expect(JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]')).toHaveLength(1);
  mocks.fetch.mockResolvedValueOnce({ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({success:true,accepted:true,movement:{id:'m1',idempotency_key:'wrong-key'}})});
  await offlineSync.flush();
  expect(JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]')).toHaveLength(1);
 });
 it('retains telemetry when accepted flag or exact movement receipt is missing',async()=>{
  await offlineSync.enqueue('INSERT_TELEMETRY',{latitude:3.866,longitude:11.516,speed:0});
  mocks.fetch.mockResolvedValueOnce({ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({success:true,accepted:false,reason:'telemetry_staged_passive'})});
  await offlineSync.flush();
  expect(JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]')).toHaveLength(1);
  await offlineSync.flush();
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toBe('[]');
 });
 it('refuses multiple telemetry samples sharing one idempotency key',async()=>{
  await offlineSync.enqueue('INSERT_TELEMETRY',[{latitude:3.866,longitude:11.516},
    {latitude:3.867,longitude:11.517}]);
  await offlineSync.flush();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]')).toHaveLength(1);
 });
 it('never treats an HTTP 200 as completed booking without matching server receipt',async()=>{
  await offlineSync.enqueue('UPDATE_BOOKING',{id:'booking-1',action:'complete'});
  mocks.fetch.mockResolvedValueOnce({ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({success:true,booking:{id:'another-booking',status:'completed'}})});
  await offlineSync.flush();
  expect(JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]')).toHaveLength(1);
  await offlineSync.flush();
  expect(storage.getItem('afat_offline_sync_queue_v2:alice')).toBe('[]');
 });
 it('requires independent incident and movement receipts linked to the original idempotency key',()=>{
  const ok={success:true,accepted:true,movement:{id:'movement-1',idempotency_key:'original'},
   incident:{id:'incident-1',movement_log_id:'movement-1',verification_status:'pending'}};
  expect(isAcknowledgedMapSignal(ok,'incident','original')).toBe(true);
  expect(isAcknowledgedMapSignal({...ok,incident:null},'incident','original')).toBe(false);
  expect(isAcknowledgedMapSignal({...ok,movement:{id:'movement-1',idempotency_key:'other'}},'movement','original')).toBe(false);
  expect(isAcknowledgedMapSignal({...ok,accepted:false},'incident','original')).toBe(false);
  expect(isAcknowledgedMapSignal({...ok,incident:{...ok.incident,verification_status:'unverified'}},'incident','original')).toBe(false);
 });
 it('retains unsupported voice evidence and rejects oversized observations',async()=>{
  await offlineSync.enqueue('VOICE_REPORT_UPLOAD',{audio_id:'pending-review'});
  await offlineSync.flush();
  const remaining=JSON.parse(storage.getItem('afat_offline_sync_queue_v2:alice')||'[]');
  expect(remaining).toHaveLength(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
  await expect(offlineSync.enqueue('INSERT_INCIDENT',incident('X'.repeat(40_000)))).rejects.toThrow(/storage limit/);
 });
});
