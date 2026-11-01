-- Filter open passenger requests by current eligible fleet before limiting.
-- The backend supplies only vehicles that passed the existing compliance authority.
create or replace function public.afat_nearby_claimable_passages(p_vehicles jsonb, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if jsonb_typeof(p_vehicles) <> 'array' or jsonb_array_length(p_vehicles)>30 then
    raise exception 'Eligible fleet payload invalid';
  end if;
  with fleet as (
    select lower(trim(v.type)) as type,v.lat,v.lng
    from jsonb_to_recordset(p_vehicles) as v(type text,lat double precision,lng double precision)
    where v.type in ('car','taxi','moto','motorcycle','bike','minibus','bus','shared')
      and v.lat between -90 and 90 and v.lng between -180 and 180
  ), nearby as (
    select p.id,p.origin_text,p.origin_lat,p.origin_lng,p.destination_text,p.arrival_target,
      p.requested_vehicle_type,p.place_confidence,p.status,p.created_at,
      place.canonical_name as place_name,meeting.name as meeting_name,
      meeting.instructions as meeting_instructions,meeting.walk_minutes,meeting.confidence as meeting_confidence
    from public.passage_intents p
    left join public.afat_places place on place.id=p.selected_place_id
    left join public.afat_meeting_points meeting on meeting.id=p.meeting_point_id
    where p.status in ('open','recovery') and p.operator_id is null
      and p.origin_lat between -90 and 90 and p.origin_lng between -180 and 180
      and exists (
        select 1 from fleet f where
          ((lower(trim(p.requested_vehicle_type))='car' and f.type in ('car','taxi'))
            or (lower(trim(p.requested_vehicle_type))='moto' and f.type in ('moto','motorcycle','bike'))
            or (lower(trim(p.requested_vehicle_type))='minibus' and f.type in ('minibus','bus','shared')))
          and public.st_dwithin(
            public.st_setsrid(public.st_makepoint(p.origin_lng,p.origin_lat),4326)::public.geography,
            public.st_setsrid(public.st_makepoint(f.lng,f.lat),4326)::public.geography,7000)
      )
    order by p.created_at desc,p.id desc
    limit least(greatest(coalesce(p_limit,30),1),30)
  )
  select coalesce(jsonb_agg(to_jsonb(n)-'place_name'-'meeting_name'-'meeting_instructions'-'walk_minutes'-'meeting_confidence'
    ||jsonb_build_object('afat_places',case when n.place_name is null then null else jsonb_build_object('canonical_name',n.place_name) end,
      'afat_meeting_points',case when n.meeting_name is null then null else jsonb_build_object('name',n.meeting_name,'instructions',n.meeting_instructions,'walk_minutes',n.walk_minutes,'confidence',n.meeting_confidence) end)
    order by n.created_at desc,n.id desc),'[]'::jsonb) into v_result from nearby n;
  return v_result;
end $$;
revoke all on function public.afat_nearby_claimable_passages(jsonb,integer) from public,anon,authenticated;
grant execute on function public.afat_nearby_claimable_passages(jsonb,integer) to service_role;
