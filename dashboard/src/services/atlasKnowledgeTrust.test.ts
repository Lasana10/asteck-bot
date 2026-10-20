import {describe,it,expect} from 'vitest';
import {reviewedAtlasItems,provisionalAtlasItems,atlasKnowledgeHeadline} from './atlasKnowledgeTrust';

const nodes=[
  {id:'p',name:'Provisional market',confidence:98,evidence_status:'provisional'},
  {id:'r',name:'Reviewed market',confidence:62,evidence_status:'corroborated'},
  {id:'v',name:'Verified building',confidence:80,evidence_status:'verified'},
  {id:'x',name:'Unknown',confidence:100,evidence_status:'candidate'},
];
describe('Find → Understand evidence classification',()=>{
 it('never upgrades provisional high-confidence knowledge to reviewed truth',()=>{
  expect(reviewedAtlasItems(nodes).map(x=>x.id)).toEqual(['r','v']);
  expect(provisionalAtlasItems(nodes).map(x=>x.id)).toEqual(['p']);
 });
 it('does not treat nearby road evidence as proof of a connected route',()=>{
  expect(atlasKnowledgeHeadline(1,1,1)).toContain('connected route is not yet confirmed');
 });
 it('provides a useful but accurately qualified fallback when nothing is reviewed',()=>{
  expect(atlasKnowledgeHeadline(0,0,5)).toContain('Provisional');
  expect(atlasKnowledgeHeadline(0,0,0)).toContain('field verification');
 });
});
