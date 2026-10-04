import { supabase } from '../supabaseClient';

export type AfatCityPriority = {
  signal_id: string;
  signal_type: string;
  label: string;
  requested_mode?: string | null;
  signal_count: number;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_place_id?: string | null;
  priority_score: number;
  recommended_action: 'mapping_verification' | 'operator_recruitment' | 'transit_research' | 'delivery_capacity' | 'business_onboarding';
  has_action: boolean;
  action_status?: string | null;
};

export type AfatCityActionSnapshot = {
  city_key: string;
  city_name: string;
  demand_counts: Record<string, number>;
  priorities: AfatCityPriority[];
  ingestion_cells: Record<string, number>;
  network_counts: {
    places: number;
    atlas_nodes: number;
    atlas_edges: number;
    access_points: number;
    transit_nodes: number;
    transit_lines: number;
  };
  privacy: string;
  generated_at: string;
};

export async function fetchCityActionSnapshot(cityKey = 'cm-yaounde', limit = 24): Promise<AfatCityActionSnapshot> {
  const { data, error } = await supabase.rpc('afat_city_action_snapshot', {
    p_city_key: cityKey,
    p_limit: limit,
  });
  if (error) throw new Error(error.message || 'AFAT city action snapshot unavailable.');
  return data as AfatCityActionSnapshot;
}

export async function openCityAction(signalId: string, notes?: string | null) {
  const { data, error } = await supabase.rpc('afat_open_city_action', {
    p_signal_id: signalId,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message || 'AFAT could not open this city action.');
  return data;
}

export async function transitionCityAction(actionId: string, status: 'open' | 'in_progress' | 'completed' | 'dismissed', notes?: string | null) {
  const { data, error } = await supabase.rpc('afat_transition_city_action', {
    p_action_id: actionId,
    p_status: status,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message || 'AFAT could not update this city action.');
  return data;
}
