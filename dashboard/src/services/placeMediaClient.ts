import { supabase } from '../supabaseClient';

export type AfatPlaceMedia = {
  id: string;
  media_kind: 'place_photo' | 'building_photo' | 'entrance_photo' | 'street_context' | 'logo';
  storage_path?: string | null;
  external_url?: string | null;
  thumbnail_url?: string | null;
  caption?: string | null;
  alt_text?: string | null;
  rights_basis: 'first_party' | 'user_contribution' | 'open_license' | 'licensed_partner';
  source_key?: string | null;
  source_license?: string | null;
  attribution_text?: string | null;
  captured_at?: string | null;
  is_primary: boolean;
  confidence: number;
};

export async function fetchApprovedPlaceMedia(atlasNodeId: string): Promise<AfatPlaceMedia[]> {
  if (!atlasNodeId) return [];
  const { data, error } = await supabase.rpc('afat_place_media_for_node', { p_node_id: atlasNodeId });
  if (error) throw new Error(error.message || 'AFAT place imagery is unavailable.');
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    ...row,
    confidence: Number(row.confidence || 0),
    is_primary: Boolean(row.is_primary),
  })) as AfatPlaceMedia[];
}

export function resolvePlaceMediaUrl(media: AfatPlaceMedia): string | null {
  if (media.external_url) return media.external_url;
  if (!media.storage_path) return null;
  const { data } = supabase.storage.from('afat-place-media').getPublicUrl(media.storage_path);
  return data.publicUrl || null;
}
