-- Read-only evidence readiness for human-directed transit network activation.
-- Counts are aggregate, city-scoped and never proof of live vehicle operation.
create or replace function public.afat_city_transit_readiness(
  p_city_key text default 'cm-yaounde'
) returns jsonb
language plpgsql stable security definer set search_path='' as $afat$
declare
  v_uid uuid := (select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_pending bigint := 0;
  v_accepted bigint := 0;
  v_active_nodes bigint := 0;
  v_active_lines bigint := 0;
  v_recent_ordered bigint := 0;
  v_reviewed_patterns bigint := 0;
  v_transfer_proximity_pairs bigint := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not (
    public.afat_has_permission('map.evidence.review') or
    public.afat_has_permission('planning.aggregate.view') or
    public.afat_has_permission('system.configure')
  ) then raise exception 'Transit planning or evidence review permission required' using errcode='42501'; end if;
  select * into v_city from public.afat_city_profiles
    where city_key=p_city_key and status='active';
  if not found then raise exception 'Active city not found' using errcode='22023'; end if;
  select count(*) filter(where status='pending'),
         count(*) filter(where status='accepted')
    into v_pending,v_accepted
    from public.afat_transit_observations where city_key=p_city_key;
  select count(*) into v_active_nodes from public.afat_transit_nodes n
    where n.city_profile_id=v_city.id and n.active;
  select count(*) into v_active_lines from public.afat_transit_lines l
    where l.city_profile_id=v_city.id and l.active;
  select count(*) into v_recent_ordered
    from public.afat_transit_line_nodes ln
    join public.afat_transit_lines l on l.id=ln.line_id
    join public.afat_transit_nodes n on n.id=ln.node_id
   where l.city_profile_id=v_city.id and n.city_profile_id=v_city.id
     and l.active and n.active
     and l.evidence_status in ('limited','corroborated','field_verified')
     and n.evidence_status in ('limited','corroborated','field_verified')
     and ln.evidence_status in ('limited','corroborated','field_verified')
     and ln.source_reviewed_at is not null
     and ln.source_observed_at between now()-interval '30 days' and now()+interval '5 minutes';
  -- Count only contiguous ordered sequences backed by recent independent review.
  with reviewed as (
    select ln.line_id,ln.direction,ln.stop_sequence
      from public.afat_transit_line_nodes ln
      join public.afat_transit_lines l on l.id=ln.line_id
      join public.afat_transit_nodes n on n.id=ln.node_id
     where l.city_profile_id=v_city.id and n.city_profile_id=v_city.id
       and l.active and n.active
       and l.evidence_status in ('limited','corroborated','field_verified')
       and n.evidence_status in ('limited','corroborated','field_verified')
       and ln.evidence_status in ('limited','corroborated','field_verified')
       and ln.source_reviewed_at is not null
       and ln.source_observed_at between now()-interval '30 days' and now()+interval '5 minutes'
  ), patterns as (
    select line_id,direction from reviewed
    group by line_id,direction
    having count(distinct stop_sequence)>=2
       and count(distinct stop_sequence)=max(stop_sequence)-min(stop_sequence)+1
  )
  select count(*) into v_reviewed_patterns from patterns;

  -- Spatial proximity is an opportunity for field review, not a confirmed transfer.
  select count(*) into v_transfer_proximity_pairs
    from public.afat_transit_nodes a
    join public.afat_transit_nodes b on b.city_profile_id=a.city_profile_id and b.id>a.id
   where a.city_profile_id=v_city.id and a.active and b.active
     and a.evidence_status in ('limited','corroborated','field_verified')
     and b.evidence_status in ('limited','corroborated','field_verified')
     and public.st_dwithin(a.location,b.location,250)
     and exists (select 1 from public.afat_transit_line_nodes la
       join public.afat_transit_lines l on l.id=la.line_id
       where la.node_id=a.id and l.active and l.city_profile_id=v_city.id
         and la.source_reviewed_at is not null
         and la.source_observed_at>now()-interval '30 days')
     and exists (select 1 from public.afat_transit_line_nodes lb
       join public.afat_transit_lines l on l.id=lb.line_id
       where lb.node_id=b.id and l.active and l.city_profile_id=v_city.id
         and lb.source_reviewed_at is not null
         and lb.source_observed_at>now()-interval '30 days'
         and not exists(select 1 from public.afat_transit_line_nodes la where la.node_id=a.id and la.line_id=lb.line_id));
  return jsonb_build_object(
    'city_key',v_city.city_key,'city_name',v_city.city_name,
    'pending_observations',v_pending,'accepted_observations',v_accepted,
    'active_nodes',v_active_nodes,'active_lines',v_active_lines,
    'recent_reviewed_ordered_stops',v_recent_ordered,
    'recent_contiguous_line_patterns',v_reviewed_patterns,
    'potential_transfer_stop_pairs',v_transfer_proximity_pairs,
    'transfer_service_verified',false,'current_fares_verified',false,
    'automatic_truth',false,'generated_at',now()
  );
end;
$afat$;
revoke all on function public.afat_city_transit_readiness(text) from public,anon,authenticated;
grant execute on function public.afat_city_transit_readiness(text) to authenticated,service_role;
