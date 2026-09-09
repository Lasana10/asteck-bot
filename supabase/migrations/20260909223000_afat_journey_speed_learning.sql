alter table public.afat_edge_speed_observations
  add column if not exists journey_id uuid references public.afat_journeys(id) on delete set null;

create unique index if not exists afat_edge_speed_observations_journey_uidx
  on public.afat_edge_speed_observations(edge_id, journey_id, vehicle_mode)
  where journey_id is not null;

create or replace function public.afat_ingest_journey_speed_observations(
  p_journey_id uuid,
  p_edge_observations jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_journey public.afat_journeys%rowtype;
  v_item jsonb;
  v_edge_id uuid;
  v_distance numeric;
  v_duration numeric;
  v_quality numeric;
  v_observed_at timestamptz;
  v_speed numeric;
  v_inserted integer := 0;
  v_rejected integer := 0;
  v_edges uuid[] := array[]::uuid[];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service role required';
  end if;

  select * into v_journey from public.afat_journeys where id=p_journey_id;
  if not found then
    return jsonb_build_object('status','unavailable','reason','journey_not_found','inserted',0,'rejected',0);
  end if;
  if v_journey.status <> 'completed' then
    return jsonb_build_object('status','unavailable','reason','journey_not_completed','inserted',0,'rejected',0);
  end if;
  if jsonb_typeof(p_edge_observations) <> 'array' or jsonb_array_length(p_edge_observations)=0 then
    return jsonb_build_object('status','unavailable','reason','no_edge_observations','inserted',0,'rejected',0);
  end if;

  for v_item in select value from jsonb_array_elements(p_edge_observations)
  loop
    begin
      v_edge_id := nullif(v_item->>'edge_id','')::uuid;
      v_distance := nullif(v_item->>'distance_m','')::numeric;
      v_duration := nullif(v_item->>'duration_seconds','')::numeric;
      v_quality := coalesce(nullif(v_item->>'quality_score','')::numeric, 0.5);
      v_observed_at := coalesce(nullif(v_item->>'observed_at','')::timestamptz, v_journey.completed_at, now());
      if v_edge_id is null or v_distance is null or v_duration is null or v_distance <= 0 or v_duration <= 0 then
        v_rejected := v_rejected + 1; continue;
      end if;
      if v_quality < 0 or v_quality > 1 then v_rejected := v_rejected + 1; continue; end if;
      v_speed := (v_distance / v_duration) * 3.6;
      if v_speed < 1 or v_speed > 140 then v_rejected := v_rejected + 1; continue; end if;
      if not exists(select 1 from public.afat_atlas_edges where id=v_edge_id) then
        v_rejected := v_rejected + 1; continue;
      end if;

      insert into public.afat_edge_speed_observations(
        edge_id, journey_id, passage_outcome_id, vehicle_mode, distance_m, duration_seconds,
        quality_score, observed_at, source_kind, metadata
      ) values (
        v_edge_id, v_journey.id, null, v_journey.vehicle_mode, v_distance, v_duration,
        v_quality, v_observed_at, 'operator_telemetry',
        jsonb_build_object('journey_id',v_journey.id,'dispatch_assignment_id',v_journey.dispatch_assignment_id)
      )
      on conflict (edge_id, journey_id, vehicle_mode) where journey_id is not null
      do update set
        distance_m=excluded.distance_m,
        duration_seconds=excluded.duration_seconds,
        quality_score=excluded.quality_score,
        observed_at=excluded.observed_at,
        metadata=excluded.metadata;

      v_inserted := v_inserted + 1;
      if not v_edge_id = any(v_edges) then v_edges := array_append(v_edges,v_edge_id); end if;
    exception when others then
      v_rejected := v_rejected + 1;
    end;
  end loop;

  if array_length(v_edges,1) is not null then
    for v_edge_id in select unnest(v_edges)
    loop
      perform public.afat_refresh_edge_speed_profile(v_edge_id, v_journey.vehicle_mode);
    end loop;
  end if;

  return jsonb_build_object(
    'status',case when v_inserted > 0 then 'accepted' else 'unavailable' end,
    'inserted',v_inserted,
    'rejected',v_rejected,
    'journey_id',v_journey.id,
    'vehicle_mode',v_journey.vehicle_mode
  );
end;
$$;

revoke all on function public.afat_ingest_journey_speed_observations(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.afat_ingest_journey_speed_observations(uuid,jsonb) to service_role;
