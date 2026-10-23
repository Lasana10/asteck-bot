import {describe,it,expect} from 'vitest';
import {selectAtlasCityKey,assessAtlasCityFootprint,type AtlasCityProfile} from './atlasCityEvidence';
const yaounde:AtlasCityProfile={city_key:'cm-yaounde',city_name:'Yaoundé',status:'active',metadata:{coverage_working_envelope:{south:3.723659,north:4.023592,west:11.413966,east:11.576568,basis:'existing reviewed working envelope',automatic_truth:false}}};
const douala:AtlasCityProfile={city_key:'cm-douala',city_name:'Douala',status:'active',metadata:{coverage_working_envelope:{south:4,north:4.2,west:9.6,east:9.9}}};
describe('multi-city GNSS Atlas evidence trust',()=>{
 it('resolves active city keys using role preference without silently reassigning another city',()=>{
  expect(selectAtlasCityKey([yaounde,douala],'Douala')).toBe('cm-douala');
  expect(selectAtlasCityKey([yaounde],'Douala')).toBe('cm-yaounde');
  expect(selectAtlasCityKey([yaounde,douala],'unknown')).toBe('');
 });
 it('accepts measured interior GNSS and does not certify administrative bounds',()=>{
  expect(assessAtlasCityFootprint(yaounde,{latitude:3.866,longitude:11.516,accuracyM:15})).toEqual({allowed:true,reason:'within_working_coverage'});
 });
 it('rejects Douala GPS misattributed to a Yaoundé recording',()=>{
  expect(assessAtlasCityFootprint(yaounde,{latitude:4.0511,longitude:9.7679,accuracyM:14}).reason).toBe('outside_working_coverage');
 });
 it('refuses stale/missing working envelopes rather than falling back to center pins',()=>{
  expect(assessAtlasCityFootprint({...douala,metadata:null},{latitude:4.05,longitude:9.78,accuracyM:9}).reason).toBe('coverage_unconfigured');
 });
 it('requires GPS uncertainty to be strictly inside the working area',()=>{
  expect(assessAtlasCityFootprint(yaounde,{latitude:3.7237,longitude:11.5,accuracyM:30}).reason).toBe('uncertain_at_city_edge');
 });
 it('rejects anomalous/absent accuracy and inactive profiles',()=>{
  expect(assessAtlasCityFootprint(yaounde,{latitude:3.85,longitude:11.5,accuracyM:121}).allowed).toBe(false);
  expect(assessAtlasCityFootprint({...yaounde,status:'paused'},{latitude:3.85,longitude:11.5,accuracyM:10}).reason).toBe('city_unavailable');
 });
});
