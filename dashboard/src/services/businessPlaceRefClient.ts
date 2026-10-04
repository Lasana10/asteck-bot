import { supabase } from '../supabaseClient';

export type AfatDestinationClaimType = 'business' | 'organization' | 'resident' | 'manager' | 'institution';
export type AfatPlaceProposalKind = 'entrance' | 'hours' | 'parking' | 'pickup' | 'delivery' | 'contact' | 'accessibility' | 'business_profile';

async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || `${name} failed`);
  return data as T;
}

export function submitDestinationClaim(input: {
  placeId: string;
  claimType: AfatDestinationClaimType;
  evidence?: Record<string, unknown>;
}) {
  return rpc('afat_submit_destination_claim', {
    p_place_id: input.placeId,
    p_claim_type: input.claimType,
    p_evidence: { ...(input.evidence || {}), automatic_truth: false },
  });
}

export function reviewDestinationClaim(input: {
  claimId: string;
  decision: 'approve' | 'reject' | 'review' | 'revoke';
  notes?: string | null;
}) {
  return rpc('afat_review_destination_claim', {
    p_claim_id: input.claimId,
    p_decision: input.decision,
    p_notes: input.notes ?? null,
  });
}

export function submitPlaceUpdateProposal(input: {
  claimId: string;
  proposalKind: AfatPlaceProposalKind;
  payload: Record<string, unknown>;
}) {
  return rpc('afat_submit_place_update_proposal', {
    p_claim_id: input.claimId,
    p_proposal_kind: input.proposalKind,
    p_payload: { ...input.payload, automatic_truth: false, owner_asserted: true },
  });
}

export function reviewPlaceUpdateProposal(input: {
  proposalId: string;
  decision: 'approve' | 'reject';
  notes?: string | null;
}) {
  return rpc('afat_review_place_update_proposal', {
    p_proposal_id: input.proposalId,
    p_decision: input.decision,
    p_notes: input.notes ?? null,
  });
}

export async function listMyDestinationClaims() {
  const { data, error } = await supabase
    .from('afat_destination_claims')
    .select('id,place_id,claim_type,status,evidence,reviewed_at,review_notes,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'AFAT claims could not be loaded.');
  return data || [];
}

export async function listMyPlaceUpdateProposals() {
  const { data, error } = await supabase
    .from('afat_place_update_proposals')
    .select('id,place_id,claim_id,proposal_kind,payload,status,reviewed_at,review_notes,applied_access_point_id,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'AFAT place update proposals could not be loaded.');
  return data || [];
}
