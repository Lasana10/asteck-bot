import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:mock}));
import {IntelligenceEngine} from './SentinelIntelligence';
const position={latitude:3.866,longitude:11.516,observedAt:new Date().toISOString()};
function results(data:any[]){
 const terminal=vi.fn().mockResolvedValue({data,error:null});
 const chain:any={gte:vi.fn(()=>chain),lte:vi.fn(()=>chain),order:vi.fn(()=>chain),limit:terminal};
 mock.from.mockReturnValue({select:vi.fn(()=>chain)});
 return terminal;
}
describe('geographically grounded operator Sentinel alerts',()=>{
 beforeEach(()=>{mock.from.mockReset();});
 it('never declares local safety conditions without reliable recent GNSS',async()=>{
  const noGPS=await IntelligenceEngine.predict('Yaoundé','en');
  expect(noGPS).toContain('no fresh reliable position');
  const stale=await IntelligenceEngine.predict('Yaoundé','en',{...position,observedAt:'2020-01-01T00:00:00Z'});
  expect(stale).toContain('no fresh reliable position');
  expect(mock.from).not.toHaveBeenCalled();
 });
 it('does not turn remote or unverified reports into nearby warnings',async()=>{
  results([
   {type:'accident',created_at:new Date().toISOString(),status:'active',
    latitude:4.07,longitude:11.6,verification_status:'verified'},
   {type:'accident',created_at:new Date().toISOString(),status:'active',
    latitude:3.867,longitude:11.517,verification_status:'pending'},
  ]);
  const report=await IntelligenceEngine.predict('Yaoundé','en',position);
  expect(report).toContain('No recently verified incident');
  expect(report).toContain('not guaranteed safe');
 });
 it('warns only when a locally grounded independently verified incident exists',async()=>{
  results([{type:'accident',created_at:new Date().toISOString(),status:'active',
    latitude:3.867,longitude:11.517,verification_status:'verified'}]);
  const report=await IntelligenceEngine.predict('Yaoundé','en',position);
  expect(report).toContain('within 10 km');
  expect(report).toContain('accident');
 });
});
