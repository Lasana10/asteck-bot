-- A real AFAT place can receive a request before a reviewed entrance exists.
-- Its mapped coordinate remains only a reference; an active meeting point is
-- used when one is actually recorded. Never promote a source pin to entrance truth.
create or replace function public.afat_create_passage_dispatch(
  p_passenger_id uuid,
  p_origin_text text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_text text,
  p_arrival_target timestamptz,
  p_selected_place_id uuid,
  p_meeting_point_id uuid,
  p_place_confidence integer,
  p_requested_vehicle_type text,
  p_metadata jsonb,
  p_request_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_place public.afat_places%rowtype;
  v_meeting public.afat_meeting_points%rowtype;
  v_passage public.passage_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch public.dispatch_assignments%rowtype;
  v_arrival_state text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service role required';
  end if;
  if p_passenger_id is null then raise exception using errcode='22023', message='passenger required'; end if;
  if length(trim(coalesce(p_destination_text,''))) < 3 then raise exception using errcode='22023', message='destination required'; end if;
  if p_origin_lat is null or p_origin_lat not between -90 and 90 or p_origin_lng is null or p_origin_lng not between -180 and 180 then
    raise exception using errcode='22023', message='verified pickup coordinates required';
  end if;
  if p_request_key is null or length(trim(p_request_key)) < 12 then raise exception using errcode='22023', message='stable request key required'; end if;

  select * into v_passage from public.passage_intents
  where passenger_id=p_passenger_id and request_key=p_request_key;
  if found then
    select * into v_booking from public.bookings where id=v_passage.booking_id;
    select * into v_dispatch from public.dispatch_assignments where booking_id=v_booking.id;
    return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',true,'arrival_access_state',v_passage.metadata->>'arrival_access_state');
  end if;

  select * into v_place from public.afat_places where id=p_selected_place_id and status not in ('disputed','retired');
  if not found then raise exception using errcode='P0002', message='trusted destination unavailable'; end if;
  if p_meeting_point_id is not null then
    select * into v_meeting from public.afat_meeting_points where id=p_meeting_point_id and place_id=v_place.id and status='active';
    if not found then raise exception using errcode='P0002', message='selected active meeting point unavailable'; end if;
  end if;
  v_arrival_state := case when v_meeting.id is null then 'mapped_place_reference_unverified_access' else 'active_meeting_point' end;

  insert into public.bookings(
    passenger_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,status,payment_status,created_at,updated_at
  ) values (
    p_passenger_id,p_origin_lat,p_origin_lng,coalesce(v_meeting.latitude,v_place.latitude),coalesce(v_meeting.longitude,v_place.longitude),'pending','pending',now(),now()
  ) returning * into v_booking;

  insert into public.passage_intents(
    passenger_id,origin_text,origin_lat,origin_lng,destination_text,arrival_target,selected_place_id,
    meeting_point_id,place_confidence,requested_vehicle_type,status,metadata,booking_id,request_key
  ) values (
    p_passenger_id,nullif(trim(coalesce(p_origin_text,'')),''),p_origin_lat,p_origin_lng,trim(p_destination_text),
    p_arrival_target,p_selected_place_id,p_meeting_point_id,p_place_confidence,p_requested_vehicle_type,'open',
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('arrival_access_state',v_arrival_state,'arrival_access_verified',false),v_booking.id,p_request_key
  ) returning * into v_passage;

  insert into public.dispatch_assignments(
    booking_id,origin,destination,priority,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
    idempotency_key,atlas_context,evidence_context,created_at,updated_at
  ) values (
    v_booking.id,coalesce(nullif(trim(coalesce(p_origin_text,'')),''),'Passenger GPS pickup'),trim(p_destination_text),
    'normal','queued',p_origin_lat,p_origin_lng,coalesce(v_meeting.latitude,v_place.latitude),coalesce(v_meeting.longitude,v_place.longitude),
    'passage:'||p_request_key,
    jsonb_build_object('selected_place_id',v_place.id,'meeting_point_id',v_meeting.id,'place_confidence',p_place_confidence,'arrival_access_state',v_arrival_state,'arrival_access_verified',false),
    jsonb_build_object('source','passage_request','passage_intent_id',v_passage.id,'origin_accuracy_m',p_metadata->'origin_accuracy_m','arrival_access_state',v_arrival_state),
    now(),now()
  ) returning * into v_dispatch;

  return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',false,'arrival_access_state',v_arrival_state);
end;
$$;

revoke all on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) to service_role;
