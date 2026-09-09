create or replace function public.afat_ingest_passage_speed_observations(p_passage_outcome_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evidence jsonb;
  v_mode text;
  v_item jsonb;
  v_edge_id uuid;
  v_distance_m numeric;
  v_duration_s numeric;
  v_quality numeric;
  v_speed_kph numeric;
  v_inserted int := 0;
  v_refreshed int := 0;
begin
  select evidence into v_evidence
  from public.passage_outcomes
  where id = p_passage_outcome_id;

  if not found then
    return jsonb_build_object('status','unavailable','reason','passage_outcome_not_found');
  end if;

  if jsonb_typeof(v_evidence) <> 'object' then
    return jsonb_build_object('status','unavailable','reason','evidence_not_object');
  end if;

  v_mode := lower(coalesce(v_evidence->>'vehicle_mode',''));
  if v_mode not in ('walk','bike','moto','car','minibus') then
    return jsonb_build_object('status','unavailable','reason','unsupported_or_missing_vehicle_mode');
  end if;

  if jsonb_typeof(v_evidence->'edge_observations') <> 'array' then
    return jsonb_build_object('status','unavailable','reason','edge_observations_missing');
  end if;

  for v_item in select value from jsonb_array_elements(v_evidence->'edge_observations')
  loop
    begin
      v_edge_id := nullif(v_item->>'edge_id','')::uuid;
      v_distance_m := nullif(v_item->>'distance_m','')::numeric;
      v_duration_s := nullif(v_item->>'duration_seconds','')::numeric;
      v_quality := coalesce(nullif(v_item->>'quality_score','')::numeric, 1.0);
    exception when others then
      continue;
    end;

    if v_edge_id is null or v_distance_m is null or v_duration_s is null then continue; end if;
    if v_distance_m <= 0 or v_duration_s <= 0 then continue; end if;
    if v_quality < 0 or v_quality > 1 then continue; end if;

    select (v_distance_m / v_duration_s) * 3.6 into v_speed_kph;
    if v_speed_kph < 1 or v_speed_kph > 140 then continue; end if;

    if not exists (select 1 from public.afat_atlas_edges e where e.id = v_edge_id) then continue; end if;

    insert into public.afat_edge_speed_observations(
      edge_id, passage_outcome_id, vehicle_mode, distance_m, duration_seconds,
      quality_score, observed_at, source_kind, metadata
    ) values (
      v_edge_id, p_passage_outcome_id, v_mode, v_distance_m, v_duration_s,
      v_quality, coalesce((v_item->>'observed_at')::timestamptz, now()),
      'journey_outcome',
      jsonb_build_object('ingested_from','passage_outcomes.evidence.edge_observations')
    )
    on conflict (edge_id, passage_outcome_id, vehicle_mode) do update
      set distance_m = excluded.distance_m,
          duration_seconds = excluded.duration_seconds,
          quality_score = excluded.quality_score,
          observed_at = excluded.observed_at,
          metadata = excluded.metadata;

    v_inserted := v_inserted + 1;
    perform public.afat_refresh_edge_speed_profile(v_edge_id, v_mode);
    v_refreshed := v_refreshed + 1;
  end loop;

  return jsonb_build_object(
    'status','ok',
    'passage_outcome_id',p_passage_outcome_id,
    'vehicle_mode',v_mode,
    'observations_upserted',v_inserted,
    'profiles_refreshed',v_refreshed,
    'eta_truth_rule','requires_at_least_5_quality_samples_on_every_requested_edge'
  );
end;
$$;

revoke all on function public.afat_ingest_passage_speed_observations(uuid) from public, anon, authenticated;
grant execute on function public.afat_ingest_passage_speed_observations(uuid) to service_role;
