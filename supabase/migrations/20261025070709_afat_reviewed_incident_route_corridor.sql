-- Aggregate passenger visibility for independently reviewed, current incidents
-- near the actual ordered route. Raw text, reporters, media and incident IDs
-- never leave the review layer. Proximity never certifies a closure or reroute.
create or replace function public.afat_reviewed_incident_route_advisory(
 p_city_key text,
 p_route_points jsonb
) returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
 v_line public.geometry;
 v_item jsonb;
 v_points public.geometry[] := array[]::public.geometry[];
 v_matched integer := 0;
 v_max_severity integer;
 v_types text[];
 v_expires timestamptz;
 v_reviewed timestamptz;
begin
 if (select auth.uid()) is null then
  raise exception 'Authenticated passenger required' using errcode='42501';
 end if;
 if not exists(select 1 from public.afat_city_profiles
   where city_key=p_city_key and status='active') then
  raise exception 'Active city not found' using errcode='P0002';
 end if;
 if jsonb_typeof(p_route_points) is distinct from 'array'
   or jsonb_array_length(p_route_points) not between 2 and 500 then
  raise exception 'Real route geometry with 2..500 points required' using errcode='22023';
 end if;
 for v_item in select value from jsonb_array_elements(p_route_points) loop
  if jsonb_typeof(v_item) is distinct from 'array'
    or jsonb_array_length(v_item)<>2
    or jsonb_typeof(v_item->0) is distinct from 'number'
    or jsonb_typeof(v_item->1) is distinct from 'number'
    or (v_item->>0)::numeric not between -180 and 180
    or (v_item->>1)::numeric not between -90 and 90 then
   raise exception 'Invalid route coordinates' using errcode='22023';
  end if;
  v_points:=array_append(v_points,public.st_makepoint(
    (v_item->>0)::double precision,(v_item->>1)::double precision));
 end loop;
 v_line:=public.st_setsrid(public.st_makeline(v_points),4326);
 if public.st_length(v_line::public.geography) < 1
   or public.st_length(v_line::public.geography) > 120000 then
  raise exception 'Route extent is outside supported corridor bounds' using errcode='22023';
 end if;

 with eligible as (
  select distinct i.id,i.type,i.severity,i.expires_at,r.reviewed_at
  from public.incidents i
  join public.map_signal_reviews r on r.movement_log_id=i.movement_log_id
  where i.status='verified' and i.verification_status='verified'
   and i.expires_at>now()
   and i.confidence_score between 60 and 100
   and r.status in ('validated','published') and r.reviewed_at is not null
   and r.confidence_score between 60 and 100
   and r.reviewer_id is not null
   and (i.reporter_id is null or r.reviewer_id<>i.reporter_id)
   and i.type in ('accident','police_control','flooding','traffic_jam','road_damage','road_works','hazard','protest','roadblock','sos','other')
   and public.st_dwithin(i.location,v_line::public.geography,100)
 )
 select count(*)::integer,max(severity),array_agg(distinct type order by type),
        min(expires_at),max(reviewed_at)
 into v_matched,v_max_severity,v_types,v_expires,v_reviewed from eligible;
 return jsonb_build_object(
  'checked',true,
  'status',case when v_matched>0 then 'reviewed_incident_proximity'
                else 'no_matching_reviewed_incidents' end,
  'matched_reviewed_incidents',v_matched,
  'max_severity',v_max_severity,
  'incident_types',coalesce(to_jsonb(v_types),'[]'::jsonb),
  'earliest_expiry',v_expires,
  'latest_reviewed_at',v_reviewed,
  'checked_at',now(),
  'route_geometry_checked',true,
  'road_blocked_verified',false,
  'provider_rerouted',false,
  'raw_incident_details_exposed',false
 );
end $$;
revoke all on function public.afat_reviewed_incident_route_advisory(text,jsonb) from public,anon;
grant execute on function public.afat_reviewed_incident_route_advisory(text,jsonb) to authenticated,service_role;
