import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),getSession:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{rpc:mocks.rpc,auth:{getUser:mocks.getUser,getSession:mocks.getSession}}}));
import {submitAccessEvidence,flushMobilityEvidenceQueue} from './mobilityEvidenceClient';
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
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({data:{status:'pending'},error:null});
  const result=await submitAccessEvidence({placeId:'31c823cc-453b-40e2-87f9-bb828d6abe9f',accessType:'pedestrian',latitude:3.85,longitude:11.51});
  const id=(result.data as any)?.queue_id;
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(mocks.rpc.mock.calls[0][0]).toBe('afat_submit_mobility_evidence_once');
  expect(mocks.rpc.mock.calls[0][1].p_idempotency_key).toBe(id);
  const synced=await flushMobilityEvidenceQueue();
  expect(synced).toEqual({synced:1,pending:0});
  expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).toBe(id);
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
