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

export async function fetchAtlasKnowledgeGaps(limit = 50) {
  return supabase.rpc('afat_atlas_knowledge_gaps', {
    p_limit: limit,
  });
}


export async function reviewAtlasCandidate(candidateId: string, decision: 'corroborate' | 'trust' | 'reject', notes?: string) {
  return supabase.rpc('afat_review_candidate_feature', {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_notes: notes || null,
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

export async function promoteTrustedAtlasCandidate(candidateId: string, name?: string, cityKey = 'cm-yaounde') {
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
