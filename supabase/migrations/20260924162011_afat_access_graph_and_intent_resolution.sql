-- AFAT access graph and intent resolution.
-- Production-aligned with migration 20260924162011.

alter table public.afat_access_points
  add column if not exists atlas_node_id uuid references public.afat_atlas_nodes(id) on delete set null,
  add column if not exists atlas_edge_id uuid references public.afat_atlas_edges(id) on delete set null,
  add column if not exists snap_distance_m numeric;

alter table public.afat_meeting_points
  add column if not exists atlas_node_id uuid references public.afat_atlas_nodes(id) on delete set null,
  add column if not exists atlas_edge_id uuid references public.afat_atlas_edges(id) on delete set null,
  add column if not exists snap_distance_m numeric;

alter table public.afat_address_ledger
  add column if not exists place_id uuid references public.afat_places(id) on delete set null;
create index if not exists afat_address_ledger_place_idx on public.afat_address_ledger(place_id);

create table if not exists public.afat_destination_relations(
  id uuid primary key default gen_random_uuid(),
  from_place_id uuid not null references public.afat_places(id) on delete cascade,
  to_place_id uuid not null references public.afat_places(id) on delete cascade,
  relation_type text not null check(relation_type in ('inside','part_of','near','same_site','transfer_to','served_by','alternate_for')),
  confidence numeric not null default 50 check(confidence between 0 and 100),
  evidence_status text not null default 'limited' check(evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_place_id,to_place_id,relation_type),
  check(from_place_id<>to_place_id)
);
create index if not exists afat_destination_relations_from_idx on public.afat_destination_relations(from_place_id,active);
create index if not exists afat_destination_relations_to_idx on public.afat_destination_relations(to_place_id,active);
alter table public.afat_destination_relations enable row level security;
revoke all on public.afat_destination_relations from anon,authenticated;

create or replace function public.afat_refresh_access_graph(p_place_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city text; v_access int:=0; v_meeting int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then
   raise exception 'Map review permission required';
 end if;
 select city into v_city from public.afat_places where id=p_place_id and status<>'retired';
 if v_city is null then raise exception 'Destination not found'; end if;

 update public.afat_access_points a
 set atlas_edge_id=x.edge_id,atlas_node_id=x.node_id,snap_distance_m=x.distance_m,updated_at=now()
 from lateral (
   select e.id edge_id,
          case when public.st_distance(nf.location,a.location)<=public.st_distance(nt.location,a.location) then nf.id else nt.id end node_id,
          public.st_distance(e.geometry,a.location)::numeric distance_m
   from public.afat_atlas_edges e
   join public.afat_atlas_nodes nf on nf.id=e.from_node_id
   join public.afat_atlas_nodes nt on nt.id=e.to_node_id
   where e.status='active' and nf.city=v_city
     and public.st_dwithin(e.geometry,a.location,300)
     and (cardinality(a.access_modes)=0 or exists(select 1 from unnest(a.access_modes) m where m=any(e.access_modes)))
   order by public.st_distance(e.geometry,a.location)
   limit 1
 ) x
 where a.place_id=p_place_id and a.active=true;
 get diagnostics v_access=row_count;

 update public.afat_meeting_points m
 set atlas_edge_id=x.edge_id,atlas_node_id=x.node_id,snap_distance_m=x.distance_m,updated_at=now()
 from lateral (
   select e.id edge_id,
          case when public.st_distance(nf.location,m.location)<=public.st_distance(nt.location,m.location) then nf.id else nt.id end node_id,
          public.st_distance(e.geometry,m.location)::numeric distance_m
   from public.afat_atlas_edges e
   join public.afat_atlas_nodes nf on nf.id=e.from_node_id
   join public.afat_atlas_nodes nt on nt.id=e.to_node_id
   where e.status='active' and nf.city=v_city
     and public.st_dwithin(e.geometry,m.location,300)
     and (cardinality(m.access_modes)=0 or exists(select 1 from unnest(m.access_modes) mode_name where mode_name=any(e.access_modes)))
   order by public.st_distance(e.geometry,m.location)
   limit 1
 ) x
 where m.place_id=p_place_id and m.status<>'retired';
 get diagnostics v_meeting=row_count;

 return jsonb_build_object('place_id',p_place_id,'access_points_linked',v_access,'meeting_points_linked',v_meeting);
end; $$;
revoke all on function public.afat_refresh_access_graph(uuid) from public,anon;
grant execute on function public.afat_refresh_access_graph(uuid) to authenticated;

create or replace function public.afat_resolve_destination_intent(
 p_place_id uuid,
 p_intent_type text default 'go',
 p_mode text default 'car'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_place public.afat_places%rowtype; v_access jsonb; v_meeting jsonb; v_target text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_intent_type not in ('go','meet','pickup','dropoff','send','deliver','board','explore') then raise exception 'Unsupported intent'; end if;
 select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
 if not found then raise exception 'Destination not found'; end if;

 select to_jsonb(a) into v_access
 from public.afat_access_points a
 where a.place_id=p_place_id and a.active=true
   and (cardinality(a.access_modes)=0 or p_mode=any(a.access_modes)
        or (p_mode='car' and 'taxi'=any(a.access_modes))
        or (p_mode='moto' and 'motorcycle'=any(a.access_modes)))
 order by
   case
    when p_intent_type='deliver' and a.access_type='delivery' then 0
    when p_intent_type in ('pickup','dropoff') and a.access_type in ('vehicle','moto') then 0
    when p_mode='walk' and a.access_type='pedestrian' then 0
    when p_mode in ('car','minibus') and a.access_type='vehicle' then 0
    when p_mode='moto' and a.access_type='moto' then 0
    else 1 end,
   case a.evidence_status when 'field_verified' then 0 when 'corroborated' then 1 when 'limited' then 2 else 3 end,
   a.confidence desc
 limit 1;

 select to_jsonb(m) into v_meeting
 from public.afat_meeting_points m
 where m.place_id=p_place_id and m.status in ('active','review')
   and (cardinality(m.access_modes)=0 or p_mode=any(m.access_modes)
        or (p_mode='car' and 'taxi'=any(m.access_modes)))
 order by
   case
    when p_intent_type='board' and m.point_type in ('boarding','transfer') then 0
    when p_intent_type in ('meet','pickup') and m.point_type in ('pickup','waiting','entrance_meet') then 0
    when p_intent_type='dropoff' and m.point_type='dropoff' then 0
    when p_intent_type='deliver' and m.point_type='delivery' then 0
    else 1 end,
   case m.evidence_status when 'field_verified' then 0 when 'corroborated' then 1 when 'limited' then 2 else 3 end,
   (m.confidence + least(20,m.successful_pickups*2) - least(25,m.failed_pickups*3)) desc
 limit 1;

 v_target:=case when p_intent_type in ('meet','pickup','board') and v_meeting is not null then 'meeting_point'
                when v_access is not null then 'access_point'
                when v_meeting is not null then 'meeting_point'
                else 'destination' end;

 return jsonb_build_object(
  'intent_type',p_intent_type,'mode',p_mode,'target_kind',v_target,
  'place',jsonb_build_object('id',v_place.id,'place_ref',v_place.place_ref,'name',v_place.canonical_name,'latitude',v_place.latitude,'longitude',v_place.longitude,'reachability_state',v_place.reachability_state),
  'access_point',v_access,'meeting_point',v_meeting,
  'automatic_truth',false
 );
end; $$;
revoke all on function public.afat_resolve_destination_intent(uuid,text,text) from public,anon;
grant execute on function public.afat_resolve_destination_intent(uuid,text,text) to authenticated;

create or replace function public.afat_reachability_gap_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'City profile not found'; end if;
 return jsonb_build_object(
  'destinations_without_access',(select count(*) from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired' and not exists(select 1 from public.afat_access_points a where a.place_id=p.id and a.active=true)),
  'destinations_without_meeting',(select count(*) from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired' and not exists(select 1 from public.afat_meeting_points m where m.place_id=p.id and m.status='active')),
  'unresolved_demand',(select count(*) from public.afat_unresolved_destination_demand d where lower(coalesce(d.city,'')) in (lower(v_city.city_name),lower(p_city_key),'yaounde') and d.status='open'),
  'open_claims',(select count(*) from public.afat_destination_claims c join public.afat_places p on p.id=c.place_id where lower(p.city)=lower(v_city.city_name) and c.status in ('submitted','review')),
  'weak_access_links',(select count(*) from public.afat_access_points a join public.afat_places p on p.id=a.place_id where lower(p.city)=lower(v_city.city_name) and a.active=true and (a.atlas_edge_id is null or coalesce(a.snap_distance_m,9999)>120))
 );
end; $$;
revoke all on function public.afat_reachability_gap_snapshot(text) from public,anon;
grant execute on function public.afat_reachability_gap_snapshot(text) to authenticated;
