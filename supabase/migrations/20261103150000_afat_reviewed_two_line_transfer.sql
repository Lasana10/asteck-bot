-- Two-line reviewed informal-transit transfer candidate. No live vehicle or schedule claims.
-- Entirely read-only; source observations must be recent and independently reviewed.
create or replace function public.afat_plan_reviewed_transfer(
  p_origin_lat double precision, p_origin_lon double precision,
  p_place_id uuid, p_at timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_city uuid;
  v_destination public.afat_places%rowtype;
  v_candidate record;
  v_start jsonb;
  v_transfer jsonb;
  v_end jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_origin_lat is null or p_origin_lon is null or
    p_origin_lat not between -90 and 90 or p_origin_lon not between -180 and 180 then
    raise exception 'Invalid origin' using errcode='22023';
  end if;
  if p_at is null or p_at < now() - interval '5 minutes' or p_at > now() + interval '5 minutes' then
    raise exception 'Current assessment time required' using errcode='22023';
  end if;
  select * into v_destination from public.afat_places
    where id=p_place_id and status <> 'retired';
  if not found then raise exception 'Destination not found' using errcode='22023'; end if;
  select id into v_city from public.afat_city_profiles
    where status='active' and lower(city_name)=lower(v_destination.city) limit 1;
  if v_city is null then
    return jsonb_build_object('status','insufficient_reviewed_transfer_evidence','transfer',null,
      'reason','No active reviewed city transit network','automatic_truth',false,'live_service_available',false);
  end if;

  -- Four reviewed stop occurrences, two distinct lines, one bounded transfer.
  -- Every intermediate stop must also have current review provenance.
  with eligible as (
    select ln.line_id, ln.stop_sequence, ln.direction, ln.source_observed_at, ln.source_reviewed_at,
           n.id node_id,n.name,n.latitude,n.longitude,n.location,
           l.name line_name,l.line_ref,l.mode,l.direction_label
      from public.afat_transit_line_nodes ln
      join public.afat_transit_lines l on l.id=ln.line_id
      join public.afat_transit_nodes n on n.id=ln.node_id
     where l.city_profile_id=v_city and n.city_profile_id=v_city
       and l.active=true and n.active=true
       and l.evidence_status in ('limited','corroborated','field_verified')
       and n.evidence_status in ('limited','corroborated','field_verified')
       and ln.evidence_status in ('limited','corroborated','field_verified')
       and ln.source_reviewed_at is not null
       and ln.source_observed_at between p_at-interval '30 days' and p_at+interval '5 minutes'
  )
  select a.*, b.node_id transfer_out_id,b.name transfer_out_name,
         b.latitude transfer_out_lat,b.longitude transfer_out_lon,b.stop_sequence transfer_out_seq,
         c.node_id transfer_in_id,c.name transfer_in_name,
         c.latitude transfer_in_lat,c.longitude transfer_in_lon,c.stop_sequence transfer_in_seq,
         c.line_id second_line_id,c.line_name second_line_name,c.line_ref second_line_ref,
         c.mode second_mode,c.direction_label second_direction,
         d.node_id alight_id,d.name alight_name,d.latitude alight_lat,d.longitude alight_lon,
         d.stop_sequence alight_seq,
         public.st_distance(a.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography) origin_straight_m,
         public.st_distance(b.location,c.location) transfer_straight_m,
         public.st_distance(d.location,v_destination.location) dest_straight_m,
         least(a.source_observed_at,b.source_observed_at,c.source_observed_at,d.source_observed_at)
           evidence_oldest_at
    into v_candidate
    from eligible a
    join eligible b on b.line_id=a.line_id and b.direction=a.direction and b.stop_sequence>a.stop_sequence
    join eligible c on c.line_id<>a.line_id
       and public.st_dwithin(b.location,c.location,250)
    join eligible d on d.line_id=c.line_id and d.direction=c.direction and d.stop_sequence>c.stop_sequence
   where public.st_dwithin(a.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography,1200)
     and public.st_dwithin(d.location,v_destination.location,1200)
     and (select count(*) from eligible x where x.line_id=a.line_id and x.direction=a.direction
         and x.stop_sequence>=a.stop_sequence and x.stop_sequence<b.stop_sequence)
          = b.stop_sequence-a.stop_sequence
     and (select count(*) from eligible x where x.line_id=c.line_id and x.direction=c.direction
         and x.stop_sequence>=c.stop_sequence and x.stop_sequence<d.stop_sequence)
          = d.stop_sequence-c.stop_sequence
   order by public.st_distance(a.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography)
        +public.st_distance(b.location,c.location)+public.st_distance(d.location,v_destination.location)
   limit 1;

  if v_candidate.line_id is null then
    return jsonb_build_object('status','insufficient_reviewed_transfer_evidence','transfer',null,
      'reason','No recent independently reviewed connected two-line transfer pattern',
      'automatic_truth',false,'live_service_available',false);
  end if;

  -- Straight-line proximity is never proof of walkability. Require all 3 foot paths.
  v_start:=public.afat_route_canonical(p_origin_lat,p_origin_lon,
    v_candidate.latitude,v_candidate.longitude,'walk',1200);
  v_transfer:=public.afat_route_canonical(v_candidate.transfer_out_lat,v_candidate.transfer_out_lon,
    v_candidate.transfer_in_lat,v_candidate.transfer_in_lon,'walk',400);
  v_end:=public.afat_route_canonical(v_candidate.alight_lat,v_candidate.alight_lon,
    v_destination.latitude,v_destination.longitude,'walk',1200);
  if v_start->>'status'<>'ok' or v_transfer->>'status'<>'ok' or v_end->>'status'<>'ok' then
    return jsonb_build_object('status','transfer_walk_access_unresolved','transfer',null,
      'reason','Transit observations exist but connected walking access is not verified by AFAT Atlas',
      'automatic_truth',false,'live_service_available',false);
  end if;
  return jsonb_build_object(
    'status','reviewed_two_line_transfer_pattern',
    'transfer',jsonb_build_object(
       'type','walk_transit_walk_transit_walk',
       'first_line',jsonb_build_object('name',v_candidate.line_name,'line_ref',v_candidate.line_ref,'mode',v_candidate.mode,
         'direction',v_candidate.direction_label),
       'second_line',jsonb_build_object('name',v_candidate.second_line_name,'line_ref',v_candidate.second_line_ref,
         'mode',v_candidate.second_mode,'direction',v_candidate.second_direction),
       'boarding',jsonb_build_object('name',v_candidate.name,'latitude',v_candidate.latitude,
         'longitude',v_candidate.longitude,'stop_sequence',v_candidate.stop_sequence),
       'transfer_out',jsonb_build_object('name',v_candidate.transfer_out_name,'latitude',v_candidate.transfer_out_lat,
         'longitude',v_candidate.transfer_out_lon,'stop_sequence',v_candidate.transfer_out_seq),
       'transfer_in',jsonb_build_object('name',v_candidate.transfer_in_name,'latitude',v_candidate.transfer_in_lat,
         'longitude',v_candidate.transfer_in_lon,'stop_sequence',v_candidate.transfer_in_seq),
       'alighting',jsonb_build_object('name',v_candidate.alight_name,'latitude',v_candidate.alight_lat,
         'longitude',v_candidate.alight_lon,'stop_sequence',v_candidate.alight_seq),
       'transfer_straight_m',round(v_candidate.transfer_straight_m::numeric,1),
       'oldest_observation_at',v_candidate.evidence_oldest_at,
       'evidence_expires_at',v_candidate.evidence_oldest_at+interval '30 days',
       'live_service_available',false,'boarding_availability_verified',false,
       'schedule_verified',false,'fare_current_verified',false,'automatic_truth',false
    ),
    'reason','Two independently reviewed line patterns with connected mapped pedestrian transfer. Live departures and fares are not confirmed.',
    'automatic_truth',false,'live_service_available',false);
end $$;
revoke all on function public.afat_plan_reviewed_transfer(double precision,double precision,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.afat_plan_reviewed_transfer(double precision,double precision,uuid,timestamptz)
  to authenticated,service_role;
