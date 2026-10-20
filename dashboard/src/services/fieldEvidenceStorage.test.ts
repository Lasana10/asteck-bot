import {describe,expect,it,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({upload:vi.fn(),list:vi.fn(),from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{storage:{from:mocks.from},auth:{getUser:vi.fn()}}}));
import {uploadFieldEvidence} from './fieldMappingQueue';
const user='22222222-2222-4222-8222-222222222222',path=`${user}/11111111-1111-4111-8111-111111111111.jpg`;
const photo={type:'image/jpeg',size:20} as File;
beforeEach(()=>{vi.clearAllMocks();mocks.from.mockReturnValue({upload:mocks.upload,list:mocks.list});});
describe('AFAT immutable evidence storage replay',()=>{
 it('uploads with insert-only permission, never requesting UPDATE',async()=>{
  mocks.upload.mockResolvedValue({error:null});
  expect(await uploadFieldEvidence(user,path,photo)).toBe(true);
  expect(mocks.upload).toHaveBeenCalledWith(path,photo,{upsert:false,contentType:'image/jpeg'});
  expect(mocks.list).not.toHaveBeenCalled();
 });
 it('accepts a retry conflict only after verifying exact object ownership',async()=>{
  mocks.upload.mockResolvedValue({error:{statusCode:'409'}});
  mocks.list.mockResolvedValue({error:null,data:[{name:'11111111-1111-4111-8111-111111111111.jpg'}]});
  expect(await uploadFieldEvidence(user,path,photo)).toBe(true);
  expect(mocks.list).toHaveBeenCalledWith(user,{search:'11111111-1111-4111-8111-111111111111.jpg',limit:10});
 });
 it('rejects storage errors and unverified conflicts',async()=>{
  mocks.upload.mockResolvedValue({error:{statusCode:'409'}});
  mocks.list.mockResolvedValue({error:null,data:[{name:'some-other.jpg'}]});
  expect(await uploadFieldEvidence(user,path,photo)).toBe(false);
  mocks.upload.mockResolvedValue({error:{statusCode:'403'}});
  expect(await uploadFieldEvidence(user,path,photo)).toBe(false);
 });
 it('rejects cross-account photo paths',async()=>{
  expect(await uploadFieldEvidence(user,'33333333-3333-4333-8333-333333333333/photo.jpg',photo)).toBe(false);
  expect(mocks.upload).not.toHaveBeenCalled();
 });
});
