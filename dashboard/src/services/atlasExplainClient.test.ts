import {beforeEach,describe,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({headers:vi.fn()}));
vi.mock('../supabaseClient',()=>({
 authenticatedApiHeaders:auth.headers,getApiBaseUrl:()=> 'https://afat.test',
}));
import {explainReviewedAtlas} from './atlasExplainClient';
beforeEach(()=>{
 vi.restoreAllMocks();
 auth.headers.mockResolvedValue({Authorization:'Bearer verified-token'});
});
describe('source-backed Find→Understand fallback',()=>{
 it('accepts only explicitly provisional licensed place context, never a false AI review',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
   status:'source_context',text:'Nearby source-mapped places include Helios High Tech Academy.',
   source_context_only:true,advisory_only:true,evidence:[],
   source_places:[{id:'place1',name:'Helios High Tech Academy',source_key:'overture_maps',verified_access:false}],
  })}));
  expect((await explainReviewedAtlas({latitude:3.866,longitude:11.516,question:'overview'})).status).toBe('source_context');
 });
 it('rejects purported field-verified access as a source-only explanation',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
   status:'source_context',text:'Entrance verified',source_context_only:true,advisory_only:true,evidence:[],
   source_places:[{source_key:'overture_maps',verified_access:true}],
  })}));
  await expect(explainReviewedAtlas({latitude:3.866,longitude:11.516,question:'access'})).rejects.toThrow();
 });
});
describe('reviewed Atlas + shared intelligence contract',()=>{
 it('passes only intended category and geographic context with authenticated request',async()=>{
  const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'explained',text:'Reviewed landmarks exist.',evidence:[{id:'n1'}],advisory_only:true})});
  vi.stubGlobal('fetch',f);
  const r=await explainReviewedAtlas({latitude:3.866,longitude:11.516,question:'overview'});
  expect(r.status).toBe('explained');
  const [url,opts]=f.mock.calls[0];
  expect(url).toBe('https://afat.test/api/atlas/explain');
  expect(opts.headers.Authorization).toBe('Bearer verified-token');
  expect(JSON.parse(opts.body)).toEqual({latitude:3.866,longitude:11.516,question:'overview'});
 });
 it('keeps reviewed knowledge available without silently claiming model inference',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    status:'reviewed_context',ai_used:false,advisory_only:true,requires_human_review:true,
    source:'afat_reviewed_atlas',text:'Reviewed Central Market; entrance access not confirmed.',
    evidence:[{id:'market',kind:'place',name:'Central Market',confidence:80,evidence_status:'verified'}]
  })}));
  const result=await explainReviewedAtlas({latitude:3.866,longitude:11.516,question:'access'});
  expect(result.status).toBe('reviewed_context');
  expect(result.ai_used).toBe(false);
  expect(result.evidence?.[0]?.name).toBe('Central Market');
 });
 it('rejects fake grounded fallback without reviewed evidence or provenance',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    status:'reviewed_context',text:'Entrance is safe',advisory_only:true,ai_used:false,requires_human_review:true,
    evidence:[{kind:'place',name:'Unreviewed',confidence:100,evidence_status:'limited'}]
  })}));
  await expect(explainReviewedAtlas({latitude:3.866,longitude:11.516,question:'access'})).rejects.toThrow();
 });
 it('does not pretend an AI explanation exists when no reviewed evidence is found',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'insufficient_evidence',evidence:[],text:null})}));
  expect((await explainReviewedAtlas({latitude:3,longitude:11,question:'access'})).status).toBe('insufficient_evidence');
 });
 it('keeps AI unavailability explicit with evidence returned',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({status:'ai_unavailable',evidence:[{id:'e1'}],message:'AI not configured'})}));
  expect((await explainReviewedAtlas({latitude:3,longitude:11,question:'roads'})).status).toBe('ai_unavailable');
 });
 it('rejects a success response lacking advisory or evidence proof',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'explained',text:'Invented directions'})}));
  await expect(explainReviewedAtlas({latitude:3,longitude:11,question:'overview'})).rejects.toThrow();
 });
});
