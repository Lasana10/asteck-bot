/** AFAT incident-review authority is independent of client-reported severity.
 * Pending reports remain available to staff review but cannot become trusted
 * passenger alerts, public-agency actions, or unreviewed route-safety claims.
 */
export type IncidentReviewRecord={status?:string|null;verification_status?:string|null;severity?:number|null;created_at?:string|null};
const trusted=new Set(['verified','validated','confirmed']);
const excluded=new Set(['false','dismissed','expired','rejected','resolved']);
export function isReviewedIncident(incident:IncidentReviewRecord):boolean{
 const status=String(incident.status||'').toLowerCase(),review=String(incident.verification_status||'').toLowerCase();
 if(excluded.has(status)||excluded.has(review))return false;
 return trusted.has(review);
}
export function reviewedSafetyFeed<T extends IncidentReviewRecord>(items:T[]):T[]{
 return items.filter(isReviewedIncident);
}
export function urgentReviewedAlerts<T extends IncidentReviewRecord>(items:T[]):T[]{
 return reviewedSafetyFeed(items).filter(x=>Number(x.severity||0)>=4);
}
export function incidentReviewLabel(record:IncidentReviewRecord):'verified'|'needs_human_review'|'not_publishable'{
 if(isReviewedIncident(record))return 'verified';
 if(excluded.has(String(record.status||'').toLowerCase())||excluded.has(String(record.verification_status||'').toLowerCase()))return 'not_publishable';
 return 'needs_human_review';
}
