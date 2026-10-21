/**
 * Deterministic Atlas understanding when reviewed graph knowledge is absent.
 * Source-licensed POI records are useful for discovery but cannot establish
 * road access, a safe entrance, operating hours or passability.
 * No generative model is permitted to promote these records to field truth.
 */
export type AtlasSourcePlace={
  id:string;name:string;place_type:string;source_key:'overture_maps'|'openstreetmap';
  evidence_status:'limited'|'corroborated'|'verified'|'field_verified';
  distance_m:number;latitude:number;longitude:number;verified_access:false;
};
type Context={status:'source_context';text:string;advisory_only:true;
  evidence:[];source_places:AtlasSourcePlace[];source_context_only:true;
  message:string;};
const allowedSources=new Set(['overture_maps','openstreetmap']);
const allowedStatuses=new Set(['limited','corroborated','verified','field_verified']);
const clean=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function atlasSourcePlaces(result:unknown):AtlasSourcePlace[]{
 if(!Array.isArray(result))return [];
 const out:AtlasSourcePlace[]=[];
 const seen=new Set<string>();
 for(const row of result.slice(0,30)){
  if(!row||typeof row!=='object')continue;
  const item=row as Record<string,unknown>;
  const id=typeof item.id==='string'?item.id:'';
  const name=typeof item.name==='string'?clean(item.name,120):'';
  const latitude=item.latitude,longitude=item.longitude,distance=item.distance_m;
  if(!id||id.length>128||seen.has(id)||!name||!allowedSources.has(String(item.source_key))||
   !allowedStatuses.has(String(item.evidence_status))||item.verified_access!==false||
   typeof latitude!=='number'||!Number.isFinite(latitude)||Math.abs(latitude)>90||
   typeof longitude!=='number'||!Number.isFinite(longitude)||Math.abs(longitude)>180||
   typeof distance!=='number'||!Number.isFinite(distance)||distance<0||distance>10000)continue;
  seen.add(id);
  out.push({id,name,latitude,longitude,distance_m:distance,
    place_type:typeof item.place_type==='string'?clean(item.place_type,48):'place',
    source_key:item.source_key as AtlasSourcePlace['source_key'],
    evidence_status:item.evidence_status as AtlasSourcePlace['evidence_status'],verified_access:false});
  if(out.length===8)break;
 }
 return out;
}
export function sourceBackedAtlasUnderstanding(rows:unknown,question:'overview'|'access'|'roads'):Context|null{
 const places=atlasSourcePlaces(rows);
 if(!places.length)return null;
 const typeName=(raw:string)=>raw.replace(/_/g,' ').toLowerCase();
 const preview=places.slice(0,5).map(p=>`${p.name} (${typeName(p.place_type)}, approx. ${Math.round(p.distance_m)} m from the search point)`).join('; ');
 const text=question==='overview'
  ? `Nearby source-mapped places include: ${preview}. These are mapped candidates from licensed geographic datasets, not independently field-verified AFAT locations. Their entrances, accessibility, current operation and road connections have not been confirmed.`
  : question==='access'
   ? `AFAT has source-mapped places nearby, including ${places.slice(0,3).map(p=>p.name).join(', ')}, but no independently reviewed entrance or accessibility observations for this location. A map pin is not proof of an entrance or safe access.`
   : `AFAT has source-mapped places nearby, but no independently reviewed road or passability evidence for this location. The presence of map records does not prove a connected or currently usable road.`;
 return {status:'source_context',text,advisory_only:true,evidence:[],source_places:places,
  source_context_only:true,message:'Source-mapped locations only; reviewed road/entrance evidence unavailable.'};
}
