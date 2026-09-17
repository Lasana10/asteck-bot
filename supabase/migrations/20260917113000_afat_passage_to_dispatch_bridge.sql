alter table public.passage_intents
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists request_key text;

create unique index if not exists passage_intents_passenger_request_key_uidx
  on public.passage_intents(passenger_id, request_key)
  where request_key is not null;

create unique index if not exists dispatch_assignments_booking_uidx
  on public.dispatch_assignments(booking_id)
  where booking_id is not null;

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
    return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',true);
  end if;

  select * into v_place from public.afat_places where id=p_selected_place_id and status <> 'disputed';
  if not found then raise exception using errcode='P0002', message='trusted destination unavailable'; end if;
  select * into v_meeting from public.afat_meeting_points where id=p_meeting_point_id and place_id=v_place.id and status='active';
  if not found then raise exception using errcode='P0002', message='trusted meeting point unavailable'; end if;

  insert into public.bookings(
    passenger_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,status,payment_status,created_at,updated_at
  ) values (
    p_passenger_id,p_origin_lat,p_origin_lng,v_meeting.latitude,v_meeting.longitude,'pending','pending',now(),now()
  ) returning * into v_booking;

  insert into public.passage_intents(
    passenger_id,origin_text,origin_lat,origin_lng,destination_text,arrival_target,selected_place_id,
    meeting_point_id,place_confidence,requested_vehicle_type,status,metadata,booking_id,request_key
  ) values (
    p_passenger_id,nullif(trim(coalesce(p_origin_text,'')),''),p_origin_lat,p_origin_lng,trim(p_destination_text),
    p_arrival_target,p_selected_place_id,p_meeting_point_id,p_place_confidence,p_requested_vehicle_type,'open',
    coalesce(p_metadata,'{}'::jsonb),v_booking.id,p_request_key
  ) returning * into v_passage;

  insert into public.dispatch_assignments(
    booking_id,origin,destination,priority,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
    idempotency_key,atlas_context,evidence_context,created_at,updated_at
  ) values (
    v_booking.id,coalesce(nullif(trim(coalesce(p_origin_text,'')),''),'Passenger GPS pickup'),trim(p_destination_text),
    'normal','queued',p_origin_lat,p_origin_lng,v_meeting.latitude,v_meeting.longitude,
    'passage:'||p_request_key,
    jsonb_build_object('selected_place_id',v_place.id,'meeting_point_id',v_meeting.id,'place_confidence',p_place_confidence),
    jsonb_build_object('source','passage_request','passage_intent_id',v_passage.id,'origin_accuracy_m',p_metadata->'origin_accuracy_m'),
    now(),now()
  ) returning * into v_dispatch;

  return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',false);
end;
$$;

create or replace function public.afat_claim_passage_dispatch(
  p_passage_id uuid,
  p_operator_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_passage public.passage_intents%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch public.dispatch_assignments%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501', message='service role required'; end if;

  select * into v_passage from public.passage_intents where id=p_passage_id for update;
  if not found then raise exception using errcode='P0002', message='passage not found'; end if;
  if v_passage.status not in ('open','recovery') or v_passage.operator_id is not null then
    raise exception using errcode='40001', message='passage already claimed or changed';
  end if;
  if v_passage.booking_id is null then raise exception using errcode='23514', message='passage has no dispatch booking'; end if;

  select * into v_vehicle from public.vehicles
  where operator_id=p_operator_id and is_available=true and clearance_status='approved'
  order by updated_at desc nulls last limit 1;
  if not found then raise exception using errcode='23514', message='approved available vehicle required'; end if;

  update public.passage_intents set operator_id=p_operator_id,status='assigned',updated_at=now()
  where id=v_passage.id returning * into v_passage;
  update public.bookings set operator_id=p_operator_id,vehicle_id=v_vehicle.id,status='accepted',updated_at=now()
  where id=v_passage.booking_id returning * into v_booking;
  update public.dispatch_assignments set operator_id=p_operator_id,vehicle_id=v_vehicle.id,status='accepted',accepted_at=coalesce(accepted_at,now()),state_version=state_version+1,updated_at=now()
  where booking_id=v_passage.booking_id and status in ('queued','reassigned') returning * into v_dispatch;
  if v_dispatch.id is null then raise exception using errcode='40001', message='dispatch already claimed or changed'; end if;

  return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch));
end;
$$;

revoke all on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) to service_role;
revoke all on function public.afat_claim_passage_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_claim_passage_dispatch(uuid,uuid) to service_role;
