create table if not exists public.afat_edge_speed_observations (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references public.afat_atlas_edges(id) on delete cascade,
  passage_outcome_id uuid references public.passage_outcomes(id) on delete set null,
  vehicle_mode text not null,
  distance_m numeric not null check (distance_m > 0),
  duration_seconds numeric not null check (duration_seconds > 0),
  observed_speed_kph numeric generated always as ((distance_m / duration_seconds) * 3.6) stored,
  quality_score numeric not null default 1 check (quality_score >= 0 and quality_score <= 1),
  observed_at timestamptz not null default now(),
  source_kind text not null default 'journey_outcome' check (source_kind in ('journey_outcome','operator_telemetry','manual_verified')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(edge_id, passage_outcome_id, vehicle_mode)
);
create index if not exists afat_edge_speed_observations_edge_mode_idx on public.afat_edge_speed_observations(edge_id,vehicle_mode,observed_at desc);
alter table public.afat_edge_speed_observations enable row level security;
revoke all on public.afat_edge_speed_observations from anon, authenticated;
grant select,insert,update,delete on public.afat_edge_speed_observations to service_role;

create or replace function public.afat_refresh_edge_speed_profile(p_edge_id uuid, p_vehicle_mode text default 'car')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_samples int; v_weighted numeric; v_p50 numeric; v_p25 numeric; v_p75 numeric; v_profile jsonb;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501', message='service role required'; end if;
  select count(*),sum(observed_speed_kph*quality_score)/nullif(sum(quality_score),0),
         percentile_cont(0.50) within group(order by observed_speed_kph),
         percentile_cont(0.25) within group(order by observed_speed_kph),
         percentile_cont(0.75) within group(order by observed_speed_kph)
  into v_samples,v_weighted,v_p50,v_p25,v_p75
  from public.afat_edge_speed_observations where edge_id=p_edge_id and vehicle_mode=p_vehicle_mode and quality_score>=0.6;
  v_profile=jsonb_build_object('mode',p_vehicle_mode,'sample_count',v_samples,'eligible_for_eta',v_samples>=5,
    'weighted_mean_kph',case when v_weighted is null then null else round(v_weighted,2) end,
    'median_kph',case when v_p50 is null then null else round(v_p50::numeric,2) end,
    'p25_kph',case when v_p25 is null then null else round(v_p25::numeric,2) end,
    'p75_kph',case when v_p75 is null then null else round(v_p75::numeric,2) end,
    'minimum_samples',5,'refreshed_at',now());
  update public.afat_atlas_edges set speed_profile=coalesce(speed_profile,'{}'::jsonb)||jsonb_build_object(p_vehicle_mode,v_profile),updated_at=now() where id=p_edge_id;
  return v_profile;
end; $$;
revoke all on function public.afat_refresh_edge_speed_profile(uuid,text) from public,anon,authenticated;
grant execute on function public.afat_refresh_edge_speed_profile(uuid,text) to service_role;

create or replace function public.afat_estimate_route_eta(p_edge_ids uuid[], p_vehicle_mode text default 'car')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total int; v_ready int; v_seconds numeric; v_missing uuid[];
begin
  if coalesce(array_length(p_edge_ids,1),0)=0 then return jsonb_build_object('available',false,'reason','no_edges'); end if;
  select count(*),count(*) filter(where coalesce((e.speed_profile->p_vehicle_mode->>'eligible_for_eta')::boolean,false)),
         sum(case when coalesce((e.speed_profile->p_vehicle_mode->>'eligible_for_eta')::boolean,false) then e.distance_m/nullif((e.speed_profile->p_vehicle_mode->>'median_kph')::numeric/3.6,0) end),
         array_agg(e.id) filter(where not coalesce((e.speed_profile->p_vehicle_mode->>'eligible_for_eta')::boolean,false))
  into v_total,v_ready,v_seconds,v_missing from public.afat_atlas_edges e where e.id=any(p_edge_ids);
  if v_total <> array_length(p_edge_ids,1) then return jsonb_build_object('available',false,'reason','unknown_edges','known_edges',v_total,'requested_edges',array_length(p_edge_ids,1)); end if;
  if v_ready <> v_total then return jsonb_build_object('available',false,'reason','insufficient_empirical_speed_evidence','ready_edges',v_ready,'total_edges',v_total,'missing_edge_ids',coalesce(to_jsonb(v_missing),'[]'::jsonb)); end if;
  return jsonb_build_object('available',true,'vehicle_mode',p_vehicle_mode,'eta_seconds',round(v_seconds),'eta_minutes',round(v_seconds/60.0,1),'method','sum_of_edge_median_empirical_speeds','edge_count',v_total);
end; $$;
revoke all on function public.afat_estimate_route_eta(uuid[],text) from public,anon,authenticated;
grant execute on function public.afat_estimate_route_eta(uuid[],text) to service_role;
