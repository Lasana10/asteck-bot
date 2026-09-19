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
