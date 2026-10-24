import { supabase } from '../supabaseClient';

export type AtlasContributionMode = 'walk' | 'moto' | 'car' | 'taxi' | 'minibus' | 'bus' | 'bike' | 'delivery' | 'other';
export type AtlasContributionPurpose = 'community_movement' | 'field_mapping' | 'fleet_observation' | 'verification_mission';
export type AtlasPrivacyMode = 'private_aggregate' | 'trusted_review' | 'public_mapping';

export async function startAtlasContributionSession(input: {
  movementMode: AtlasContributionMode;
  purpose?: AtlasContributionPurpose;
  privacyMode?: AtlasPrivacyMode;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return supabase.rpc('afat_start_contribution_session', {
    p_movement_mode: input.movementMode,
    p_purpose: input.purpose || 'community_movement',
    p_privacy_mode: input.privacyMode || 'private_aggregate',
    p_campaign_id: input.campaignId || null,
    p_metadata: input.metadata || {},
  });
}

export async function ingestAtlasContributionSample(input: {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  recordedAt?: string;
  idempotencyKey?: string;
}) {
  return supabase.rpc('afat_ingest_contribution_sample', {
    p_session_id: input.sessionId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_accuracy_m: input.accuracyM ?? null,
    p_speed_kph: input.speedKph ?? null,
    p_heading: input.heading ?? null,
    p_recorded_at: input.recordedAt || new Date().toISOString(),
    p_idempotency_key: input.idempotencyKey || null,
  });
}

export async function completeAtlasContributionSession(sessionId: string) {
  return supabase.rpc('afat_complete_contribution_session', {
    p_session_id: sessionId,
  });
}

export async function cancelAtlasContributionSession(sessionId: string, reason = 'user_cancelled') {
  return supabase.rpc('afat_cancel_contribution_session', {
    p_session_id: sessionId,
    p_reason: reason,
  });
}

export async function fetchAtlasKnowledgeGaps(limit = 50) {
  return supabase.rpc('afat_atlas_knowledge_gaps', {
    p_limit: limit,
  });
}

export async function reviewAtlasCandidate(candidateId: string, decision: 'corroborate' | 'trust' | 'reject', notes?: string) {
  return supabase.rpc('afat_review_candidate_feature', {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_notes: notes?.trim() || null,
  });
}

export async function createAtlasMappingMission(input: {
  title: string;
  description?: string;
  rewardPointsPerKm?: number;
  expiresAt?: string | null;
}) {
  return supabase.rpc('afat_create_mapping_mission', {
    p_title: input.title,
    p_description: input.description || null,
    p_reward_points_per_km: input.rewardPointsPerKm ?? 10,
    p_expires_at: input.expiresAt || null,
  });
}

export async function startCityAtlasContributionSession(input: {
  cityKey?: string;
  movementMode: AtlasContributionMode;
  purpose?: AtlasContributionPurpose;
  privacyMode?: AtlasPrivacyMode;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return supabase.rpc('afat_start_city_contribution_session', {
    p_city_key: input.cityKey || 'cm-yaounde',
    p_movement_mode: input.movementMode,
    p_purpose: input.purpose || 'community_movement',
    p_privacy_mode: input.privacyMode || 'private_aggregate',
    p_campaign_id: input.campaignId || null,
    p_metadata: input.metadata || {},
  });
}

export async function fetchAtlasCandidatePromotionReadiness(candidateId:string) {
  return supabase.rpc('afat_candidate_promotion_readiness',{p_candidate_id:candidateId});
}

export async function promoteTrustedAtlasCandidate(candidateId: string, name: string | undefined, cityKey: string) {
  if(!cityKey) return {data:null,error:{message:'An explicit active candidate city is required for promotion.'}};

  return supabase.rpc('afat_promote_trusted_candidate', {
    p_candidate_id: candidateId,
    p_name: name || null,
    p_city_key: cityKey,
  });
}

export async function resolveAtlasEvidenceConflict(conflictId: string, decision: 'resolve' | 'dismiss', notes?: string) {
  return supabase.rpc('afat_resolve_evidence_conflict', {
    p_conflict_id: conflictId,
    p_decision: decision,
    p_notes: notes || null,
  });
}

export type CrossSourceRoadCheck={
 source_record_id:string;source_key:string;feature_name:string;feature_category:string|null;
 source_confidence:number|null;dataset_version:string|null;attribution:string|null;
 latitude:number;longitude:number;discrepancy_type:string;
 nearby_source_key:string|null;nearby_category:string|null;nearest_source_distance_m:number|null;
 atlas_edge_id:string|null;atlas_edge_distance_m:number|null;
 existing_mission_id:string|null;can_request_field_check:boolean;
};
export type CrossSourceRoadReview={
 city_key:string;city_name:string;source_records_compared:number;discrepancy_count:number;
 actionable_count:number;discrepancies:CrossSourceRoadCheck[];
 automatic_truth:false;road_safety_verified:false;message:string;
};
export async function fetchCrossSourceRoadChecks(cityKey:string,limit=20){
 return supabase.rpc('afat_atlas_cross_source_road_checks',{p_city_key:cityKey,p_limit:limit});
}
export async function requestCrossSourceFieldCheck(sourceRecordId:string,cityKey:string,reviewReason:string){
 return supabase.rpc('afat_request_cross_source_field_check',{
  p_source_record_id:sourceRecordId,p_city_key:cityKey,p_review_reason:reviewReason,
 });
}

export async function fetchCrossSourceFieldReviewQueue(cityKey:string){
 return supabase.rpc('afat_cross_source_field_review_queue',{p_city_key:cityKey,p_limit:30});
}
export async function reviewCrossSourceFieldMission(missionId:string,decision:'accept'|'reject',notes:string){
 return supabase.rpc('afat_review_cross_source_field_check',{
  p_mission_id:missionId,p_decision:decision,p_notes:notes,
 });
}
