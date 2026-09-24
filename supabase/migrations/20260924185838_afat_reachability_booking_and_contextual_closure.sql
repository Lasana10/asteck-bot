-- AFAT reachability booking closure + high-information contextual confirmations.
-- Production-aligned with migration 20260924185838.

alter table public.passage_intents
  add column if not exists access_point_id uuid references public.afat_access_points(id) on delete set null;
create index if not exists passage_intents_access_point_idx on public.passage_intents(access_point_id) where access_point_id is not null;

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
language plpgsql security definer set search_path=''
as $$
declare
  v_place public.afat_places%rowtype;
  v_meeting public.afat_meeting_points%rowtype;
  v_access public.afat_access_points%rowtype;
  v_access_id uuid;
  v_drop_lat double precision;
  v_drop_lng double precision;
  v_passage public.passage_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch public.dispatch_assignments%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501',message='service role required'; end if;
  if p_passenger_id is null then raise exception using errcode='22023',message='passenger required'; end if;
  if length(trim(coalesce(p_destination_text,'')))<3 then raise exception using errcode='22023',message='destination required'; end if;
  if p_origin_lat is null or p_origin_lat not between -90 and 90 or p_origin_lng is null or p_origin_lng not between -180 and 180 then
    raise exception using errcode='22023',message='verified pickup coordinates required';
  end if;
  if p_request_key is null or length(trim(p_request_key))<12 then raise exception using errcode='22023',message='stable request key required'; end if;

  select * into v_passage from public.passage_intents where passenger_id=p_passenger_id and request_key=p_request_key;
  if found then
    select * into v_booking from public.bookings where id=v_passage.booking_id;
    select * into v_dispatch from public.dispatch_assignments where booking_id=v_booking.id;
    return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',true);
  end if;

  select * into v_place from public.afat_places where id=p_selected_place_id and status not in ('disputed','retired');
  if not found then raise exception using errcode='P0002',message='destination unavailable'; end if;

  if p_metadata ? 'access_point_id'
     and nullif(trim(coalesce(p_metadata->>'access_point_id','')),'') is not null
     and (p_metadata->>'access_point_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then v_access_id:=(p_metadata->>'access_point_id')::uuid; end if;

  if p_meeting_point_id is not null then
    select * into v_meeting from public.afat_meeting_points where id=p_meeting_point_id and place_id=v_place.id and status='active';
  end if;
  if v_access_id is not null then
    select * into v_access from public.afat_access_points
    where id=v_access_id and place_id=v_place.id and active=true and evidence_status not in ('disputed','stale');
  end if;
  if v_meeting.id is null and v_access.id is null then
    raise exception using errcode='P0002',message='usable meeting or access point unavailable';
  end if;

  if v_meeting.id is not null then v_drop_lat:=v_meeting.latitude;v_drop_lng:=v_meeting.longitude;
  else v_drop_lat:=v_access.latitude;v_drop_lng:=v_access.longitude; end if;

  insert into public.bookings(passenger_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,status,payment_status,created_at,updated_at)
  values(p_passenger_id,p_origin_lat,p_origin_lng,v_drop_lat,v_drop_lng,'pending','pending',now(),now())
  returning * into v_booking;

  insert into public.passage_intents(
    passenger_id,origin_text,origin_lat,origin_lng,destination_text,arrival_target,selected_place_id,
    meeting_point_id,access_point_id,place_confidence,requested_vehicle_type,status,metadata,booking_id,request_key
  ) values(
    p_passenger_id,nullif(trim(coalesce(p_origin_text,'')),''),p_origin_lat,p_origin_lng,trim(p_destination_text),
    p_arrival_target,p_selected_place_id,v_meeting.id,v_access.id,p_place_confidence,p_requested_vehicle_type,'open',
    coalesce(p_metadata,'{}'::jsonb),v_booking.id,p_request_key
  ) returning * into v_passage;

  insert into public.dispatch_assignments(
    booking_id,origin,destination,priority,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
    idempotency_key,atlas_context,evidence_context,created_at,updated_at
  ) values(
    v_booking.id,coalesce(nullif(trim(coalesce(p_origin_text,'')),''),'Passenger GPS pickup'),trim(p_destination_text),
    'normal','queued',p_origin_lat,p_origin_lng,v_drop_lat,v_drop_lng,'passage:'||p_request_key,
    jsonb_build_object('selected_place_id',v_place.id,'meeting_point_id',v_meeting.id,'access_point_id',v_access.id,
      'place_confidence',p_place_confidence,'intent_type',coalesce(p_metadata->>'intent_type','go')),
    jsonb_build_object('source','passage_request','passage_intent_id',v_passage.id,
      'origin_accuracy_m',p_metadata->'origin_accuracy_m','automatic_truth',false),
    now(),now()
  ) returning * into v_dispatch;

  return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch),'replayed',false);
end; $$;
revoke all on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.afat_create_passage_dispatch(uuid,text,double precision,double precision,text,timestamptz,uuid,uuid,integer,text,jsonb,text) to service_role;

create or replace function public.afat_queue_contextual_confirmation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_passage public.passage_intents%rowtype;
  v_question text;v_prompt_type text;v_info numeric;v_fingerprint text;
begin
  if not (new.status in ('pickup_verified','in_journey','completed')
    or (new.pickup_verified_at is not null and old.pickup_verified_at is null)) then return new; end if;

  select * into v_passage from public.passage_intents where booking_id=new.booking_id order by created_at desc limit 1;
  if not found then return new; end if;

  if v_passage.access_point_id is not null and v_passage.meeting_point_id is null then
    select 'Did this entrance or access point work for your trip?','access_worked',
      greatest(50,least(95,100-coalesce(a.confidence,35)))
    into v_question,v_prompt_type,v_info from public.afat_access_points a where a.id=v_passage.access_point_id;
  elsif v_passage.meeting_point_id is not null then
    select 'Was this the right place to meet?','meeting_point_correct',
      greatest(50,least(95,100-coalesce(m.confidence,35)+least(20,coalesce(m.failed_pickups,0)*4)))
    into v_question,v_prompt_type,v_info from public.afat_meeting_points m where m.id=v_passage.meeting_point_id;
  else
    select 'Did AFAT send you to the correct destination?','destination_correct',
      greatest(50,least(95,100-coalesce(p.base_confidence,35)))
    into v_question,v_prompt_type,v_info from public.afat_places p where p.id=v_passage.selected_place_id;
  end if;

  if v_prompt_type is null then return new; end if;
  v_fingerprint:=md5('contextual:'||new.id::text||':'||v_prompt_type);

  insert into public.afat_contextual_confirmations(
    dispatch_id,booking_id,passenger_id,operator_id,place_id,meeting_point_id,access_point_id,
    prompt_type,question,answer_options,information_value,status,expires_at,evidence,fingerprint
  ) values(
    new.id,new.booking_id,v_passage.passenger_id,new.operator_id,v_passage.selected_place_id,
    v_passage.meeting_point_id,v_passage.access_point_id,v_prompt_type,v_question,
    '["yes","no","not_sure","better_point"]'::jsonb,coalesce(v_info,60),'open',now()+interval '7 days',
    jsonb_build_object('source','dispatch_context','dispatch_status',new.status,'passage_intent_id',v_passage.id,
      'automatic_truth',false,'purpose','high_information_value_confirmation'),
    v_fingerprint
  ) on conflict(fingerprint) do nothing;
  return new;
end; $$;
revoke all on function public.afat_queue_contextual_confirmation() from public,anon,authenticated;

drop trigger if exists afat_dispatch_contextual_confirmation on public.dispatch_assignments;
create trigger afat_dispatch_contextual_confirmation
after update of status,pickup_verified_at on public.dispatch_assignments
for each row execute function public.afat_queue_contextual_confirmation();

create or replace function public.afat_contextual_confirmation_for_dispatch(p_dispatch_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_row public.afat_contextual_confirmations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select c.* into v_row from public.afat_contextual_confirmations c
  where c.dispatch_id=p_dispatch_id and c.status='open' and c.expires_at>now()
    and (c.passenger_id=v_uid or c.operator_id=v_uid)
  order by c.information_value desc,c.created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',v_row.id,'prompt_type',v_row.prompt_type,'question',v_row.question,
    'answer_options',v_row.answer_options,'information_value',v_row.information_value,'expires_at',v_row.expires_at);
end; $$;
revoke all on function public.afat_contextual_confirmation_for_dispatch(uuid) from public,anon;
grant execute on function public.afat_contextual_confirmation_for_dispatch(uuid) to authenticated;

create or replace function public.afat_answer_contextual_confirmation(p_confirmation_id uuid,p_answer text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_row public.afat_contextual_confirmations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_answer not in ('yes','no','not_sure','better_point') then raise exception 'Unsupported answer'; end if;
  select * into v_row from public.afat_contextual_confirmations where id=p_confirmation_id for update;
  if not found then raise exception 'Confirmation not found'; end if;
  if v_row.status<>'open' or v_row.expires_at<=now() then raise exception 'Confirmation is no longer open'; end if;
  if v_row.passenger_id<>v_uid and coalesce(v_row.operator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>v_uid then
    raise exception 'Confirmation access denied';
  end if;
  update public.afat_contextual_confirmations
  set status='answered',answer=jsonb_build_object('value',p_answer,'automatic_truth',false),
      answered_by=v_uid,answered_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('answer_role','participant_observation','requires_independent_corroboration',true)
  where id=p_confirmation_id;
  return jsonb_build_object('id',p_confirmation_id,'status','answered','answer',p_answer,
    'map_truth_changed',false,'requires_independent_corroboration',true);
end; $$;
revoke all on function public.afat_answer_contextual_confirmation(uuid,text) from public,anon;
grant execute on function public.afat_answer_contextual_confirmation(uuid,text) to authenticated;
