create or replace function public.afat_sync_dispatch_journey(
  p_assignment_id uuid,
  p_actor_profile_id uuid,
  p_status text,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_booking public.bookings%rowtype;
  v_passage public.passage_intents%rowtype;
  v_journey public.afat_journeys%rowtype;
  v_mode text;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501', message='service role required'; end if;
  if p_status not in ('in_journey','completed','cancelled','disputed') then raise exception using errcode='22023', message='unsupported journey status'; end if;

  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id;
  if not found then raise exception using errcode='P0002', message='dispatch assignment not found'; end if;

  if v_assignment.booking_id is not null then
    select * into v_booking from public.bookings where id=v_assignment.booking_id;
    select * into v_passage from public.passage_intents where booking_id=v_assignment.booking_id limit 1;
  end if;

  v_mode := case lower(coalesce(v_passage.requested_vehicle_type,''))
    when 'motorcycle' then 'moto' when 'taxi' then 'car' when 'shared_vehicle' then 'minibus'
    when 'moto' then 'moto' when 'minibus' then 'minibus' when 'bus' then 'bus'
    when 'bike' then 'bike' when 'walk' then 'walk' else 'car' end;

  insert into public.afat_journeys(
    dispatch_assignment_id,booking_id,passage_intent_id,passenger_id,operator_id,vehicle_id,vehicle_mode,status,started_at,completed_at,evidence,updated_at
  ) values (
    v_assignment.id,v_assignment.booking_id,v_passage.id,v_booking.passenger_id,v_assignment.operator_id,v_assignment.vehicle_id,v_mode,
    case when p_status='in_journey' then 'active' else p_status end,
    coalesce(v_assignment.started_at,case when p_status='in_journey' then now() end),
    case when p_status='completed' then coalesce(v_assignment.completed_at,now()) end,
    coalesce(p_evidence,'{}'::jsonb),now()
  )
  on conflict(dispatch_assignment_id) do update set
    status=excluded.status,
    passage_intent_id=coalesce(public.afat_journeys.passage_intent_id,excluded.passage_intent_id),
    passenger_id=coalesce(public.afat_journeys.passenger_id,excluded.passenger_id),
    operator_id=coalesce(excluded.operator_id,public.afat_journeys.operator_id),
    vehicle_id=coalesce(excluded.vehicle_id,public.afat_journeys.vehicle_id),
    vehicle_mode=excluded.vehicle_mode,
    started_at=coalesce(public.afat_journeys.started_at,excluded.started_at),
    completed_at=case when excluded.status='completed' then coalesce(excluded.completed_at,now()) else public.afat_journeys.completed_at end,
    evidence=coalesce(public.afat_journeys.evidence,'{}'::jsonb)||coalesce(excluded.evidence,'{}'::jsonb),
    updated_at=now()
  returning * into v_journey;

  if v_assignment.booking_id is not null then
    update public.bookings set
      status=case when p_status='completed' then 'completed' when p_status='in_journey' then 'in_progress' else status end,
      started_at=case when p_status='in_journey' then coalesce(started_at,now()) else started_at end,
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
    where id=v_assignment.booking_id;
  end if;

  return jsonb_build_object('journey',to_jsonb(v_journey),'linked_passage_intent_id',v_passage.id,'booking_id',v_assignment.booking_id);
end; $$;
revoke all on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) to service_role;


create or replace function public.afat_transition_dispatch_journey(
 p_assignment_id uuid,p_actor_profile_id uuid,p_expected_status text,p_next_status text,
 p_idempotency_key text,p_reason text default null,p_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_assignment public.dispatch_assignments%rowtype; v_journey jsonb; v_event public.dispatch_assignment_events%rowtype;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501',message='Service role required'; end if;
 select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
 if not found then raise exception using errcode='P0002',message='Dispatch assignment not found'; end if;
 select * into v_event from public.dispatch_assignment_events where assignment_id=p_assignment_id and idempotency_key=p_idempotency_key;
 if found and (v_event.actor_profile_id is distinct from p_actor_profile_id or v_event.to_status is distinct from p_next_status or v_event.from_status is distinct from p_expected_status or v_event.reason is distinct from p_reason or v_event.evidence is distinct from coalesce(p_evidence,'{}'::jsonb)) then
   raise exception using errcode='40001',message='Idempotency key already used for a different transition';
 end if;
 v_assignment := public.afat_transition_dispatch_assignment(p_assignment_id,p_actor_profile_id,p_expected_status,p_next_status,p_idempotency_key,p_reason,p_evidence);
 if v_assignment.status in ('in_journey','completed','cancelled','disputed') then
   v_journey := public.afat_sync_dispatch_journey(p_assignment_id,p_actor_profile_id,v_assignment.status,p_evidence);
 end if;
 return jsonb_build_object('assignment',to_jsonb(v_assignment),'journey',v_journey->'journey');
end; $$;
revoke all on function public.afat_transition_dispatch_journey(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_transition_dispatch_journey(uuid,uuid,text,text,text,text,jsonb) to service_role;
