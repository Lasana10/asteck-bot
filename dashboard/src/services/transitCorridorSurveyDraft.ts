/** Local-only resumable corridor survey context.
 * Never store GPS fixes, observer identifiers, or an evidence acceptance status.
 * sessionStorage is scoped to the current browser tab and lasts through reload.
 */
export type CorridorSurveyDraft = {
  cityKey:string; lineName:string; direction:string;
  mode:'bus'|'minibus'|'shared_taxi'|'moto_taxi'|'ferry'|'rail'|'other';
  position:string; capturedAt:string;
};
const MODES=new Set<CorridorSurveyDraft['mode']>(['bus','minibus','shared_taxi','moto_taxi','ferry','rail','other']);
const PREFIX='afat_corridor_survey_draft_v1_';
const LIMIT_MS=24*60*60*1000;
const key=(city:string)=>PREFIX+city.replace(/[^a-z0-9_-]/gi,'').slice(0,60);
export function readCorridorSurveyDraft(city:string,storage:Pick<Storage,'getItem'|'removeItem'>|null,now=Date.now()):CorridorSurveyDraft|null {
  if(!storage)return null;
  try {
    const raw=storage.getItem(key(city));
    if(!raw)return null;
    const value=JSON.parse(raw);
    const age=now-Date.parse(value?.capturedAt);
    const valid=value?.cityKey===city&&typeof value.lineName==='string'&&value.lineName.length<=120&&
      typeof value.direction==='string'&&value.direction.length<=120&&MODES.has(value.mode)&&
      typeof value.position==='string'&&/^\d{1,5}$/.test(value.position)&&
      Number(value.position)<=10000&&age>=0&&age<=LIMIT_MS;
    if(!valid){storage.removeItem(key(city));return null;}
    return value as CorridorSurveyDraft;
  }catch {return null;}
}
export function writeCorridorSurveyDraft(
  draft:Omit<CorridorSurveyDraft,'capturedAt'>,storage:Pick<Storage,'setItem'>|null,
  now=Date.now(),
):boolean {
  if(!storage||!draft.cityKey||draft.lineName.length>120||draft.direction.length>120||
    !MODES.has(draft.mode)||!/^\d{1,5}$/.test(draft.position)||Number(draft.position)>10000)return false;
  try{
    storage.setItem(key(draft.cityKey),JSON.stringify({...draft,capturedAt:new Date(now).toISOString()}));
    return true;
  }catch{return false;}
}
export function clearCorridorSurveyDraft(city:string,storage:Pick<Storage,'removeItem'>|null){
  try{storage?.removeItem(key(city));}catch{}
}
