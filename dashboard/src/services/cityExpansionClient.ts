import { supabase } from '../supabaseClient';

export type AfatIngestionCell = {
  id: string;
  source_key: string;
  scope_label: string;
  south: number;
  west: number;
  north: number;
  east: number;
  status: 'pending'|'running'|'completed'|'completed_with_errors'|'failed'|'skipped';
  attempt_count: number;
  import_batch_id?: string | null;
  last_error?: string | null;
  result?: any;
};

export async function seedCityExpansion(input: {
  cityKey: string;
  south: number;
  west: number;
  north: number;
  east: number;
  cellSpan?: number;
}) {
  return supabase.rpc('afat_seed_city_ingestion_cells', {
    p_city_key: input.cityKey,
    p_source_key: 'openstreetmap',
    p_south: input.south,
    p_west: input.west,
    p_north: input.north,
    p_east: input.east,
    p_cell_span: input.cellSpan ?? 0.02,
  });
}

export async function fetchCityExpansionCells(cityKey: string) {
  const { data: city, error: cityError } = await supabase
    .from('afat_city_profiles')
    .select('id')
    .eq('city_key', cityKey)
    .eq('status', 'active')
    .maybeSingle();
  if (cityError || !city?.id) return { data: [] as AfatIngestionCell[], error: cityError || new Error('Active city profile not found') };
  const { data, error } = await supabase
    .from('afat_city_ingestion_cells')
    .select('*')
    .eq('city_profile_id', city.id)
    .eq('source_key', 'openstreetmap')
    .order('created_at', { ascending: true });
  return { data: (data || []) as AfatIngestionCell[], error };
}

export async function runNextCityExpansionCell(cityKey: string) {
  const { data: claim, error: claimError } = await supabase.rpc('afat_claim_next_ingestion_cell', {
    p_city_key: cityKey,
    p_source_key: 'openstreetmap',
  });
  if (claimError) return { data: null, error: claimError };
  if (claim?.status === 'empty' || !claim?.cell) return { data: { status: 'empty' }, error: null };

  const cell = claim.cell as AfatIngestionCell;
  try {
    const { data: ingest, error: ingestError } = await supabase.functions.invoke('afat-osm-city-ingest', {
      body: {
        city_key: cityKey,
        scope_label: cell.scope_label,
        bbox: { south: cell.south, west: cell.west, north: cell.north, east: cell.east },
      },
    });
    const status = ingestError
      ? 'failed'
      : ingest?.status === 'completed_with_errors'
        ? 'completed_with_errors'
        : 'completed';
    const { data: completed, error: completeError } = await supabase.rpc('afat_complete_ingestion_cell', {
      p_cell_id: cell.id,
      p_status: status,
      p_import_batch_id: ingest?.batch_id || null,
      p_result: ingest || {},
      p_error: ingestError?.message || ingest?.error || null,
    });
    if (ingestError) return { data: completed || { cell, ingest }, error: ingestError };
    if (completeError) return { data: { cell, ingest }, error: completeError };
    return { data: { status, cell: completed, ingest }, error: null };
  } catch (error: any) {
    await supabase.rpc('afat_complete_ingestion_cell', {
      p_cell_id: cell.id,
      p_status: 'failed',
      p_import_batch_id: null,
      p_result: {},
      p_error: error?.message || 'City ingestion failed',
    });
    return { data: { cell }, error };
  }
}

export async function runCityExpansionBatch(cityKey: string, maxCells = 6) {
  const results: any[] = [];
  for (let index = 0; index < Math.max(1, Math.min(maxCells, 12)); index += 1) {
    const result = await runNextCityExpansionCell(cityKey);
    results.push(result.data);
    if (result.error || result.data?.status === 'empty') return { data: results, error: result.error || null };
  }
  return { data: results, error: null };
}
