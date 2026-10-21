import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
 getUser:vi.fn(),getSession:vi.fn(),authHeaders:vi.fn(),fetch:vi.fn(),
}));
vi.mock('../supabaseClient',()=>({
 supabase:{auth:{getUser:mocks.getUser,getSession:mocks.getSession}},
 authenticatedApiHeaders:mocks.authHeaders,
 getApiBaseUrl:()=> 'https://backend.example.test',
}));
import {offlineSync} from './offlineSync';
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
 mocks.fetch.mockResolvedValue({
  ok:true,headers:{get:()=> 'application/json'},json:async()=>({status:'pending',id:'receipt'}),
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
   return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({id:'review',status:'pending'})};
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
  expect(storage.getItem('afat_offline_sync_queue')).toBeNull();
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
