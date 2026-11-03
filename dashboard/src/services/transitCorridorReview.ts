import type {PendingTransitEvidence} from './accessEvidenceReviewClient';

/** Consistent reviewer queue ordering; evidence remains independently pending. */
export function transitCorridorIdentity(item:PendingTransitEvidence):string {
  return [item.city_key,item.line_name?.trim().toLowerCase()||'',
    item.mode||'',item.direction_label?.trim().toLowerCase()||''].join(' / ');
}
export function orderedPendingTransitReview(items:PendingTransitEvidence[]):PendingTransitEvidence[]{
  return [...items].sort((a,b)=>{
    const group=transitCorridorIdentity(a).localeCompare(transitCorridorIdentity(b));
    if(group)return group;
    const x=a.evidence?.stop_sequence,y=b.evidence?.stop_sequence;
    if(Number.isInteger(x)&&Number.isInteger(y)&&x!==y)return Number(x)-Number(y);
    if(Number.isInteger(x)!==Number.isInteger(y))return Number.isInteger(x)?-1:1;
    return a.created_at.localeCompare(b.created_at);
  });
}
function distanceMeters(a:PendingTransitEvidence,b:PendingTransitEvidence){
  if(a.latitude==null||a.longitude==null||b.latitude==null||b.longitude==null ||
    ![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite))return null;
  const rad=Math.PI/180;
  const dlat=(a.latitude-b.latitude)*rad,dlon=(a.longitude-b.longitude)*rad;
  const h=Math.sin(dlat/2)**2+
    Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
  return 2*6371000*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function pendingTransitOrderWarning(item:PendingTransitEvidence,items:PendingTransitEvidence[]):string|null{
  if(!Number.isInteger(item.evidence?.stop_sequence))return null;
  for(const other of items){
    if(other.id===item.id||transitCorridorIdentity(other)!==transitCorridorIdentity(item)||
      other.evidence?.stop_sequence!==item.evidence?.stop_sequence)continue;
    const m=distanceMeters(item,other);
    if(m!==null&&m>120)
      return 'Another pending observation assigns this stop order to a substantially different location. Verify both field reports; neither is automatically reliable.';
    return 'Another pending observation reports this same corridor stop order. Compare independent evidence before accepting.';
  }
  return null;
}
