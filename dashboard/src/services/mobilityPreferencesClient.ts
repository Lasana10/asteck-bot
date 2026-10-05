import { supabase } from '../supabaseClient';

export type MobilityOptimization = 'reliability'|'time'|'low_walk'|'balanced';
export type MobilityMode = 'walk'|'bike'|'moto'|'car'|'minibus';

export type MobilityPreferences = {
  preferred_modes: MobilityMode[];
  avoided_modes: MobilityMode[];
  optimization: MobilityOptimization;
  max_walk_m: number;
  accessibility: Record<string, unknown>;
  updated_at?: string;
};

export async function fetchMobilityPreferences() {
  const { data, error } = await supabase
    .from('afat_mobility_preferences')
    .select('preferred_modes,avoided_modes,optimization,max_walk_m,accessibility,updated_at')
    .maybeSingle();
  return { data: (data || null) as MobilityPreferences | null, error };
}

export async function saveMobilityPreferences(input: Partial<MobilityPreferences>) {
  const { data, error } = await supabase.rpc('afat_set_mobility_preferences', {
    p_preferred_modes: input.preferred_modes ?? [],
    p_avoided_modes: input.avoided_modes ?? [],
    p_optimization: input.optimization ?? 'reliability',
    p_max_walk_m: input.max_walk_m ?? 1200,
    p_accessibility: input.accessibility ?? {},
  });
  return { data, error };
}

export async function rankMobilityOptions(input: { placeId:string; originLatitude:number; originLongitude:number }) {
  const { data, error } = await supabase.rpc('afat_rank_mobility_options', {
    p_place_id: input.placeId,
    p_origin_lat: input.originLatitude,
    p_origin_lon: input.originLongitude,
  });
  return { data, error };
}
