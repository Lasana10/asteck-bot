import { reviewedAtlasEvidence } from './reviewedAtlasEvidence';

type Reviewed=ReturnType<typeof reviewedAtlasEvidence>[number];
const clean=(value:string)=>value.replace(/[<>\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);

/**
 * An offline/degraded-AI informational projection of independently reviewed
 * Atlas records. No model inference, map matching, route or access claim.
 */
export function reviewedAtlasContext(
 evidence:Reviewed[],question:'overview'|'access'|'roads',
){
 const safe=evidence.filter(item=>item&&['place','road'].includes(item.kind)&&
   ['verified','corroborated'].includes(item.evidence_status)&&
   typeof item.name==='string'&&Number.isFinite(item.confidence)&&
   item.confidence>=0&&item.confidence<=100).slice(0,20);
 if(!safe.length)return null;
 const places=safe.filter(e=>e.kind==='place');
 const roads=safe.filter(e=>e.kind==='road');
 const describe=(rows:Reviewed[])=>rows.slice(0,5).map(e=>clean(e.name)||'Unnamed mapped reference').join(', ');
 let text:string;
 if(question==='access'){
   text=places.length
     ? `Reviewed nearby Atlas place references include: ${describe(places)}. These records do not by themselves establish an entrance, public access, wheelchair accessibility or safe passage.`
     : 'Reviewed Atlas evidence is available, but it does not establish an entrance or accessible approach at this location.';
 }else if(question==='roads'){
   text=roads.length
     ? `Reviewed Atlas road references include: ${describe(roads)}. Reviewed map records do not confirm a continuously connected, currently passable or safe road route.`
     : 'Reviewed Atlas evidence is available, but there are no reviewed road references here establishing a passable route.';
 }else{
   text=`Reviewed Atlas references nearby: ${[places.length?`${places.length} place reference(s)`:null,roads.length?`${roads.length} road reference(s)`:null].filter(Boolean).join(' and ')}. ${describe(safe)}. Current conditions, exact entrances, accessibility, traffic and safe route continuity remain unverified.`;
 }
 return {
   status:'reviewed_context' as const,
   text, evidence:safe,
   source:'afat_reviewed_atlas' as const,
   ai_used:false as const,advisory_only:true as const,requires_human_review:true as const,
   message:'Grounded Atlas summary generated without AI-CORE; only reviewed map references are described.',
 };
}
