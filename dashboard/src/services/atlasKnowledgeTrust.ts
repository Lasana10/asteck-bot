import type {AtlasNode,AtlasEdge} from './atlasClient';

export function reviewedAtlasItems<T extends AtlasNode|AtlasEdge>(items:readonly T[]):T[]{
  return items.filter(item=>['verified','corroborated'].includes(String(item.evidence_status||'').toLowerCase()));
}
export function provisionalAtlasItems<T extends AtlasNode|AtlasEdge>(items:readonly T[]):T[]{
  return items.filter(item=>String(item.evidence_status||'').toLowerCase()==='provisional');
}
export function atlasKnowledgeHeadline(reviewedRoads:number,reviewedPlaces:number,provisionalPlaces:number):string{
  if(reviewedRoads>0)return 'Reviewed road evidence exists nearby; a connected route is not yet confirmed';
  if(reviewedPlaces>0)return 'Reviewed landmarks exist; route connectivity still needs confirmation';
  if(provisionalPlaces>0)return 'Provisional landmarks recorded; independent verification is still needed';
  return 'Local geographic knowledge still needs field verification';
}
