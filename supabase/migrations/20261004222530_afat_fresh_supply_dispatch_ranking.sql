create or replace function public.afat_rank_dispatch_candidates(
  p_assignment_id uuid,
  p_vehicle_type text default null,
  p_radius_m integer default 7000,
  p_limit integer default 12
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_origin geography;
  v_radius integer:=greatest(500,least(coalesce(p_radius_m,7000),20000));
  v_candidates jsonb:='[]'::jsonb;
begin
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id;
  if not found then raise exception 'DISPATCH_ASSIGNMENT_NOT_FOUND'; end if;
  if v_assignment.status not in ('queued','offered','reassigned') then raise exception 'DISPATCH_STATE_NOT_CANDIDATE_READY'; end if;
  if v_assignment.pickup_lat is null or v_assignment.pickup_lng is null then raise exception 'DISPATCH_PICKUP_LOCATION_REQUIRED'; end if;
  v_origin:=st_setsrid(st_makepoint(v_assignment.pickup_lng,v_assignment.pickup_lat),4326)::geography;

  with ranked as (
    select v.operator_id,v.id vehicle_id,v.type vehicle_type,v.capacity,v.rating,
      st_distance(v.current_location,v_origin) distance_m,
      greatest(0,extract(epoch from (now()-v.last_ping_at))::integer) freshness_seconds,
      coalesce(p.trust_score,50) trust_score,coalesce(p.fatigue_hours_today,0) fatigue_hours_today,
      (greatest(0,50-(st_distance(v.current_location,v_origin)/v_radius)*50)
       + greatest(0,20-(extract(epoch from (now()-v.last_ping_at))/120.0)*20)
       + least(15,greatest(0,(coalesce(v.rating,0)-3)*7.5))
       + least(15,greatest(0,(coalesce(p.trust_score,50)-50)*0.3))) dispatch_score
    from public.vehicles v join public.profiles p on p.id=v.operator_id
    where coalesce(v.is_available,false)=true and v.clearance_status='verified' and v.current_location is not null
      and v.last_ping_at>=now()-interval '120 seconds' and p.role='operator'
      and upper(coalesce(p.operator_application_status,''))='APPROVED'
      and upper(coalesce(p.verification_status,'')) in ('VERIFIED','APPROVED') and coalesce(p.is_active,false)=true
      and coalesce(p.fatigue_hours_today,0)<coalesce(p.max_daily_hours,12)
      and (p_vehicle_type is null or v.type=p_vehicle_type)
      and st_dwithin(v.current_location,v_origin,v_radius)
      and not exists(select 1 from public.dispatch_assignments da where da.operator_id=v.operator_id and da.id<>v_assignment.id and da.status in ('accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency'))
    order by dispatch_score desc limit greatest(1,least(coalesce(p_limit,12),50))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'operator_id',operator_id,'vehicle_id',vehicle_id,'vehicle_type',vehicle_type,
    'distance_m',round(distance_m::numeric,0),'freshness_seconds',freshness_seconds,'rating',rating,'capacity',capacity,
    'dispatch_score',round(dispatch_score::numeric,2),
    'decision_factors',jsonb_build_object('distance_m',round(distance_m::numeric,0),'freshness_seconds',freshness_seconds,'vehicle_rating',rating,'operator_trust_score',trust_score,'fatigue_hours_today',fatigue_hours_today,'verified_live_supply',true)
  ) order by dispatch_score desc,distance_m asc),'[]'::jsonb) into v_candidates from ranked;

  return jsonb_build_object('assignment_id',v_assignment.id,'freshness_seconds',120,'radius_m',v_radius,'candidates',v_candidates,'automatic_truth',false,'generated_at',now());
end $$;
revoke all on function public.afat_rank_dispatch_candidates(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.afat_rank_dispatch_candidates(uuid,text,integer,integer) to service_role;
