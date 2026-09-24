create or replace function public.afat_create_transit_line(
  p_city_key text,
  p_name text,
  p_mode text,
  p_node_ids uuid[],
  p_direction_label text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_line_id uuid;
  v_ref text;
  v_count int;
  v_idx int:=1;
  v_node_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then
    raise exception 'Planning permission required';
  end if;
  if trim(coalesce(p_name,''))='' then raise exception 'Line name required'; end if;
  if p_mode not in ('bus','minibus','shared_taxi','moto_taxi','ferry','rail','other') then raise exception 'Unsupported transit mode'; end if;
  if coalesce(cardinality(p_node_ids),0)<2 then raise exception 'At least two transit nodes are required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  select count(*) into v_count from public.afat_transit_nodes
    where id=any(p_node_ids) and city_profile_id=v_city.id and active=true;
  if v_count<>cardinality(p_node_ids) then raise exception 'All transit nodes must be active and belong to this city'; end if;

  v_ref:='AFAT-T-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.afat_transit_lines(city_profile_id,line_ref,name,mode,direction_label,confidence,evidence_status,evidence)
  values(v_city.id,v_ref,trim(p_name),p_mode,nullif(trim(coalesce(p_direction_label,'')),''),
         35,'limited',jsonb_build_object('source','planner_assembled_from_reviewed_nodes','created_by',v_uid,'automatic_truth',false))
  returning id into v_line_id;

  foreach v_node_id in array p_node_ids loop
    insert into public.afat_transit_line_nodes(line_id,node_id,stop_sequence,direction,evidence)
    values(v_line_id,v_node_id,v_idx,'forward',jsonb_build_object('source','planner_sequence','created_by',v_uid));
    v_idx:=v_idx+1;
  end loop;

  return jsonb_build_object('line_id',v_line_id,'line_ref',v_ref,'evidence_status','limited','automatic_truth',false);
end; $$;
revoke all on function public.afat_create_transit_line(text,text,text,uuid[],text) from public,anon;
grant execute on function public.afat_create_transit_line(text,text,text,uuid[],text) to authenticated;

create or replace function public.afat_review_transit_line(
  p_line_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_state text; v_active boolean:=true;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;
  if p_decision='corroborate' then v_state:='corroborated';
  elsif p_decision='dispute' then v_state:='disputed';
  elsif p_decision='retire' then v_state:='stale';v_active:=false;
  else raise exception 'Unsupported review decision'; end if;

  update public.afat_transit_lines
  set evidence_status=v_state,active=v_active,updated_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
        'last_review',jsonb_build_object('decision',p_decision,'notes',p_notes,'reviewed_by',v_uid,'reviewed_at',now())
      )
  where id=p_line_id;
  if not found then raise exception 'Transit line not found'; end if;
  return jsonb_build_object('line_id',p_line_id,'evidence_status',v_state,'active',v_active);
end; $$;
revoke all on function public.afat_review_transit_line(uuid,text,text) from public,anon;
grant execute on function public.afat_review_transit_line(uuid,text,text) to authenticated;

create table if not exists public.afat_transit_line_observations(
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.afat_transit_lines(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  journey_id uuid references public.afat_journeys(id) on delete set null,
  observation_type text not null check(observation_type in ('traversal','boarding','alighting','sequence_check','fare_observation','service_seen')),
  observed_at timestamptz not null default now(),
  node_id uuid references public.afat_transit_nodes(id) on delete set null,
  value jsonb not null default '{}'::jsonb,
  evidence_status text not null default 'observed' check(evidence_status in ('observed','reviewed','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists afat_transit_observations_line_time_idx on public.afat_transit_line_observations(line_id,observed_at desc);
create index if not exists afat_transit_observations_contributor_idx on public.afat_transit_line_observations(contributor_id,observed_at desc);
create index if not exists afat_transit_observations_journey_idx on public.afat_transit_line_observations(journey_id) where journey_id is not null;
create index if not exists afat_transit_observations_node_idx on public.afat_transit_line_observations(node_id) where node_id is not null;
alter table public.afat_transit_line_observations enable row level security;
revoke all on public.afat_transit_line_observations from anon,authenticated;
