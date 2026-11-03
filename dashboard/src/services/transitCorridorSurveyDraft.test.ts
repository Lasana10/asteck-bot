import {describe,expect,it} from 'vitest';
import {readCorridorSurveyDraft,writeCorridorSurveyDraft,clearCorridorSurveyDraft} from './transitCorridorSurveyDraft';
function storage(){
  const map=new Map<string,string>();
  return {getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>{map.set(k,v)},
    removeItem:(k:string)=>{map.delete(k)},map};
}
const draft={cityKey:'cm-yaounde',lineName:'Actual survey corridor',direction:'to city',
  mode:'minibus' as const,position:'4'};
describe('private transient corridor survey continuity',()=>{
 it('restores only route context for the original city and tab',()=>{
  const tab=storage(),now=Date.parse('2026-11-03T14:00:00Z');
  expect(writeCorridorSurveyDraft(draft,tab,now)).toBe(true);
  expect(readCorridorSurveyDraft('cm-yaounde',tab,now+1000)).toMatchObject(draft);
  expect(readCorridorSurveyDraft('cm-douala',tab,now+1000)).toBeNull();
  const serialized=[...tab.map.values()].join(' ');
  expect(serialized).not.toMatch(/latitude|longitude|gps|profile_id|accepted/);
 });
 it('fails closed for stale, future or malformed sequence, with explicit clear',()=>{
  const tab=storage(),now=Date.parse('2026-11-03T14:00:00Z');
  expect(writeCorridorSurveyDraft({...draft,position:'10001'},tab,now)).toBe(false);
  writeCorridorSurveyDraft(draft,tab,now);
  expect(readCorridorSurveyDraft(draft.cityKey,tab,now+86400000+1)).toBeNull();
  writeCorridorSurveyDraft(draft,tab,now);
  expect(readCorridorSurveyDraft(draft.cityKey,tab,now-1000)).toBeNull();
  writeCorridorSurveyDraft(draft,tab,now);
  clearCorridorSurveyDraft(draft.cityKey,tab);
  expect(readCorridorSurveyDraft(draft.cityKey,tab,now)).toBeNull();
 });
});
