import { describe,it,expect,vi } from 'vitest';
import {enqueueMobilityEvidence,readPendingMobilityEvidence,acknowledgeMobilityEvidence,markMobilityEvidenceAttempt,pendingMobilityEvidenceForUser} from './mobilityEvidenceQueue';

function memoryStorage(): Storage {
 const values=new Map<string,string>();
 return {get length(){return values.size;},clear(){values.clear();},getItem(k){return values.get(k)??null;},key(i){return [...values.keys()][i]??null;},removeItem(k){values.delete(k);},setItem(k,v){values.set(k,String(v));}} as Storage;
}
describe('offline entrance, transit and mobility evidence custody',()=>{
 it('never exposes another account queue or legacy unowned records',()=>{
  const s=memoryStorage();
  s.setItem('afat_mobility_evidence_queue_v1',JSON.stringify([{kind:'access'}]));
  enqueueMobilityEvidence(s,'alice','access',{place:'A'},'a1');
  enqueueMobilityEvidence(s,'bob','transit',{stop:'B'},'b1');
  expect(readPendingMobilityEvidence(s,'alice').map(x=>x.id)).toEqual(['a1']);
  expect(readPendingMobilityEvidence(s,'bob').map(x=>x.id)).toEqual(['b1']);
  expect(readPendingMobilityEvidence(s,'')).toEqual([]);
 });
 it('keeps new evidence during an in-flight replay and preserves failures',()=>{
  const s=memoryStorage();
  const first=enqueueMobilityEvidence(s,'alice','access',{entrance:1},'a1');
  enqueueMobilityEvidence(s,'alice','gap',{missing:2},'a2');
  const snapshot=readPendingMobilityEvidence(s,'alice');
  enqueueMobilityEvidence(s,'alice','transit',{line:'new'},'a3');
  acknowledgeMobilityEvidence(s,first);
  markMobilityEvidenceAttempt(s,snapshot[1]);
  expect(readPendingMobilityEvidence(s,'alice').map(x=>x.id)).toEqual(['a2','a3']);
  expect(readPendingMobilityEvidence(s,'alice')[0].attempts).toBe(1);
 });
 it('enforces hard queue capacity instead of silently discarding observations',()=>{
  const s=memoryStorage();
  for(let i=0;i<120;i++)enqueueMobilityEvidence(s,'alice','gap',{i},String(i));
  expect(()=>enqueueMobilityEvidence(s,'alice','gap',{},'overflow')).toThrow('full');
  expect(pendingMobilityEvidenceForUser(s,'alice')).toBe(120);
 });
});
