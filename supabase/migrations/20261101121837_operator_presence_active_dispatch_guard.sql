-- Prevent an active dispatch from being advertised again by presence refresh.
-- Preserve the existing approved operator, GPS and RLS authority.
create or replace function public.afat_update_operator_presence(
  p_vehicle_id uuid,
  p_available boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m numeric default null,
  p_heading integer default null,
  p_speed_kph integer default null
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_vehicle public.vehicles%rowtype; v_profile public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id and operator_id=v_uid for update;
  if not found then raise exception 'VEHICLE_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id=v_uid;
  if not found or v_profile.role<>'operator' or upper(coalesce(v_profile.operator_application_status,''))<>'APPROVED' or upper(coalesce(v_profile.verification_status,'')) not in ('VERIFIED','APPROVED') or coalesce(v_profile.is_active,false)=false then raise exception 'OPERATOR_NOT_OPERATIONALLY_APPROVED'; end if;
  if v_vehicle.clearance_status<>'verified' then raise exception 'VEHICLE_NOT_VERIFIED'; end if;
  if p_available and exists (select 1 from public.dispatch_assignments d where d.vehicle_id=v_vehicle.id and d.status in ('offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency')) then raise exception 'ACTIVE_DISPATCH_VEHICLE_UNAVAILABLE'; end if;
  if p_available and not public.afat_vehicle_compliance_current(v_vehicle.id) then raise exception 'VEHICLE_DOCUMENT_COMPLIANCE_EXPIRED'; end if;
  if p_available and (p_latitude is null or p_longitude is null) then raise exception 'LIVE_LOCATION_REQUIRED'; end if;
  if p_latitude is not null and p_latitude not between -90 and 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_longitude is not null and p_longitude not between -180 and 180 then raise exception 'INVALID_LONGITUDE'; end if;
  if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>500) then raise exception 'INVALID_LOCATION_ACCURACY'; end if;
  update public.vehicles
  set is_available=coalesce(p_available,false),
      current_lat=case when p_available then p_latitude else current_lat end,
      current_lng=case when p_available then p_longitude else current_lng end,
      current_location=case when p_available then st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography else current_location end,
      current_heading=case when p_available then p_heading else null end,
      current_speed=case when p_available then p_speed_kph else null end,
      last_ping_at=case when p_available then now() else last_ping_at end,
      updated_at=now()
  where id=v_vehicle.id;
  return jsonb_build_object('vehicle_id',v_vehicle.id,'available',coalesce(p_available,false),'automatic_truth',false);
end $$;

create or replace function public.afat_nearby_supply(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer default 5000,
  p_vehicle_type text default null,
  p_limit integer default 20
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_origin geography;
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid coordinates required'; end if;
  v_origin:=st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography;
  return jsonb_build_object(
    'radius_m',greatest(250,least(coalesce(p_radius_m,5000),15000)),
    'freshness_seconds',120,
    'vehicles',coalesce((
      select jsonb_agg(jsonb_build_object(
        'vehicle_type',q.type,'distance_m',round(q.distance_m::numeric,0),'capacity',q.capacity,'rating',q.rating,
        'freshness_seconds',greatest(0,extract(epoch from (now()-q.last_ping_at))::integer),'availability','live_observed'
      ) order by q.distance_m,q.rating desc)
      from (
        select v.type,v.capacity,v.rating,v.last_ping_at,st_distance(v.current_location,v_origin) distance_m
        from public.vehicles v join public.profiles p on p.id=v.operator_id
        where coalesce(v.is_available,false)=true and v.clearance_status='verified' and v.current_location is not null
          and v.last_ping_at>=now()-interval '120 seconds' and p.role='operator'
          and upper(coalesce(p.operator_application_status,''))='APPROVED'
          and upper(coalesce(p.verification_status,'')) in ('VERIFIED','APPROVED') and coalesce(p.is_active,false)=true
          and public.afat_vehicle_compliance_current(v.id)
          and not exists (select 1 from public.dispatch_assignments d where d.vehicle_id=v.id and d.status in ('offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency'))
          and (p_vehicle_type is null or v.type=p_vehicle_type)
          and st_dwithin(v.current_location,v_origin,greatest(250,least(coalesce(p_radius_m,5000),15000)))
        order by v.current_location <-> v_origin
        limit greatest(1,least(coalesce(p_limit,20),50))
      ) q
    ),'[]'::jsonb),'automatic_truth',false,'generated_at',now()
  );
end $$;

revoke all on function public.afat_update_operator_presence(uuid,boolean,double precision,double precision,numeric,integer,integer) from public,anon;
grant execute on function public.afat_update_operator_presence(uuid,boolean,double precision,double precision,numeric,integer,integer) to authenticated;
revoke all on function public.afat_nearby_supply(double precision,double precision,integer,text,integer) from public;
grant execute on function public.afat_nearby_supply(double precision,double precision,integer,text,integer) to anon,authenticated;
