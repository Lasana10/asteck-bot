-- Keep the claim inside the same pickup geography advertised by preflight.
-- The vehicle row is locked before the dispatch/booking/passage mutation.
create or replace function public.afat_claim_passage_dispatch(
  p_passage_id uuid, p_operator_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_passage public.passage_intents%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch public.dispatch_assignments%rowtype;
  v_mode text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service role required';
  end if;
  select * into v_passage from public.passage_intents where id=p_passage_id for update;
  if not found then raise exception using errcode='P0002', message='passage not found'; end if;
  if v_passage.status not in ('open','recovery') or v_passage.operator_id is not null then
    raise exception using errcode='40001', message='passage already claimed or changed';
  end if;
  if v_passage.booking_id is null or v_passage.origin_lat is null or v_passage.origin_lng is null then
    raise exception using errcode='23514', message='dispatch booking and pickup required';
  end if;
  v_mode := lower(trim(coalesce(v_passage.requested_vehicle_type,'')));
  if v_mode not in ('car','moto','minibus') then
    raise exception using errcode='23514', message='supported vehicle mode required';
  end if;

  select * into v_vehicle from public.vehicles
  where operator_id=p_operator_id and is_available=true
    and clearance_status='verified'
    and last_ping_at between now()-interval '120 seconds' and now()
    and current_lat between -90 and 90 and current_lng between -180 and 180
    and not exists (
      select 1 from public.dispatch_assignments active
      where active.vehicle_id=vehicles.id
        and active.status in ('offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','emergency')
    )
    and case v_mode
      when 'car' then lower(type) in ('car','taxi')
      when 'moto' then lower(type) in ('moto','motorcycle','bike')
      else lower(type) in ('minibus','bus','shared') end
    and public.ST_DWithin(
      public.ST_SetSRID(public.ST_MakePoint(current_lng,current_lat),4326)::public.geography,
      public.ST_SetSRID(public.ST_MakePoint(v_passage.origin_lng,v_passage.origin_lat),4326)::public.geography,
      7000
    )
  order by public.ST_Distance(
    public.ST_SetSRID(public.ST_MakePoint(current_lng,current_lat),4326)::public.geography,
    public.ST_SetSRID(public.ST_MakePoint(v_passage.origin_lng,v_passage.origin_lat),4326)::public.geography
  ), last_ping_at desc, id limit 1 for update;
  if not found or not public.afat_vehicle_compliance_current(v_vehicle.id) then
    raise exception using errcode='23514', message='current nearby verified available vehicle required';
  end if;
  -- Take the supply out of the public feed in this same transaction. The
  -- operator must explicitly become available again after the journey.
  update public.vehicles set is_available=false,updated_at=now()
  where id=v_vehicle.id and is_available=true;

  update public.passage_intents set operator_id=p_operator_id,status='assigned',updated_at=now()
  where id=v_passage.id returning * into v_passage;
  update public.bookings set operator_id=p_operator_id,vehicle_id=v_vehicle.id,status='accepted',updated_at=now()
  where id=v_passage.booking_id and status='pending' returning * into v_booking;
  if v_booking.id is null then
    raise exception using errcode='40001', message='booking already changed';
  end if;
  update public.dispatch_assignments set operator_id=p_operator_id,vehicle_id=v_vehicle.id,
    status='accepted',accepted_at=coalesce(accepted_at,now()),
    state_version=state_version+1,updated_at=now(),
    evidence_context=coalesce(evidence_context,'{}'::jsonb) || jsonb_build_object(
      'claim_position_recorded_at',v_vehicle.last_ping_at,
      'claim_pickup_distance_m',round(public.ST_Distance(
        public.ST_SetSRID(public.ST_MakePoint(v_vehicle.current_lng,v_vehicle.current_lat),4326)::public.geography,
        public.ST_SetSRID(public.ST_MakePoint(v_passage.origin_lng,v_passage.origin_lat),4326)::public.geography
      )::numeric), 'claim_radius_m',7000)
  where booking_id=v_passage.booking_id and status in ('queued','reassigned')
  returning * into v_dispatch;
  if v_dispatch.id is null then
    raise exception using errcode='40001', message='dispatch already claimed or changed';
  end if;
  return jsonb_build_object('passage',to_jsonb(v_passage),'booking',to_jsonb(v_booking),'dispatch',to_jsonb(v_dispatch));
end;
$$;
revoke all on function public.afat_claim_passage_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_claim_passage_dispatch(uuid,uuid) to service_role;

-- Passage is the passenger-facing projection of the same dispatch transition.
-- Only the canonical, authorized service-role transition may update it.
create or replace function public.afat_sync_passage_dispatch_status(
  p_assignment_id uuid, p_dispatch_status text
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_booking_id uuid;
  v_passage public.passage_intents%rowtype;
  v_target text;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501', message='service role required'; end if;
  select booking_id into v_booking_id from public.dispatch_assignments where id=p_assignment_id;
  if v_booking_id is null then return null; end if;
  select * into v_passage from public.passage_intents where booking_id=v_booking_id for update;
  if not found then return null; end if;
  v_target := case p_dispatch_status
    when 'en_route' then 'driver_acknowledged'
    when 'arrived' then 'driver_arrived'
    when 'pickup_verified' then 'meeting_confirmed'
    when 'in_journey' then 'converted'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else null end;
  if v_target is null or v_passage.status in ('completed','cancelled') then return to_jsonb(v_passage); end if;
  -- A delayed event cannot move a passage backwards. A passenger walking to
  -- pickup may coexist with the operator going en route.
  if (v_target='driver_acknowledged' and v_passage.status not in ('assigned','recovery'))
    or (v_target='driver_arrived' and v_passage.status not in ('assigned','driver_acknowledged','passenger_walking'))
    or (v_target='meeting_confirmed' and v_passage.status not in ('assigned','driver_acknowledged','passenger_walking','driver_arrived'))
    or (v_target='converted' and v_passage.status not in ('assigned','driver_acknowledged','passenger_walking','driver_arrived','meeting_confirmed'))
    or (v_target='completed' and v_passage.status <> 'converted')
  then return to_jsonb(v_passage); end if;
  update public.passage_intents set status=v_target,updated_at=now()
    where id=v_passage.id returning * into v_passage;
  return to_jsonb(v_passage);
end;
$$;
revoke all on function public.afat_sync_passage_dispatch_status(uuid,text) from public,anon,authenticated;
grant execute on function public.afat_sync_passage_dispatch_status(uuid,text) to service_role;

-- A cancelled dispatch must not leave an accepted booking behind. Payment
-- status is deliberately untouched: a collected payment needs its existing
-- provider reconciliation/refund process, never an inferred refund.
create or replace function public.afat_sync_dispatch_journey(
  p_assignment_id uuid,p_actor_profile_id uuid,p_status text,p_evidence jsonb default '{}'::jsonb
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
  ) on conflict(dispatch_assignment_id) do update set
    status=excluded.status,
    passage_intent_id=coalesce(public.afat_journeys.passage_intent_id,excluded.passage_intent_id),
    passenger_id=coalesce(public.afat_journeys.passenger_id,excluded.passenger_id),
    operator_id=coalesce(excluded.operator_id,public.afat_journeys.operator_id),
    vehicle_id=coalesce(excluded.vehicle_id,public.afat_journeys.vehicle_id),
    vehicle_mode=excluded.vehicle_mode,
    started_at=coalesce(public.afat_journeys.started_at,excluded.started_at),
    completed_at=case when excluded.status='completed' then coalesce(excluded.completed_at,now()) else public.afat_journeys.completed_at end,
    evidence=coalesce(public.afat_journeys.evidence,'{}'::jsonb)||coalesce(excluded.evidence,'{}'::jsonb),
    updated_at=now() returning * into v_journey;
  if v_assignment.booking_id is not null then
    update public.bookings set
      status=case when p_status='completed' then 'completed'
        when p_status='in_journey' then 'in_progress'
        when p_status='cancelled' then 'cancelled' else status end,
      started_at=case when p_status='in_journey' then coalesce(started_at,now()) else started_at end,
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
    where id=v_assignment.booking_id;
  end if;
  return jsonb_build_object('journey',to_jsonb(v_journey),'linked_passage_intent_id',v_passage.id,'booking_id',v_assignment.booking_id);
end; $$;
revoke all on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) to service_role;

-- Extend the existing atomic dispatch/journey transaction; its transition
-- authority and idempotency event checks remain the single source of truth.
create or replace function public.afat_transition_dispatch_journey(
 p_assignment_id uuid,p_actor_profile_id uuid,p_expected_status text,p_next_status text,
 p_idempotency_key text,p_reason text default null,p_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_assignment public.dispatch_assignments%rowtype; v_journey jsonb; v_event public.dispatch_assignment_events%rowtype; v_passage jsonb;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501',message='Service role required'; end if;
 select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
 if not found then raise exception using errcode='P0002',message='Dispatch assignment not found'; end if;
 select * into v_event from public.dispatch_assignment_events where assignment_id=p_assignment_id and idempotency_key=p_idempotency_key;
 if found and (v_event.actor_profile_id is distinct from p_actor_profile_id or v_event.to_status is distinct from p_next_status or v_event.from_status is distinct from p_expected_status or v_event.reason is distinct from p_reason or v_event.evidence is distinct from coalesce(p_evidence,'{}'::jsonb)) then
   raise exception using errcode='40001',message='Idempotency key already used for a different transition';
 end if;
 v_assignment := public.afat_transition_dispatch_assignment(p_assignment_id,p_actor_profile_id,p_expected_status,p_next_status,p_idempotency_key,p_reason,p_evidence);
 v_passage := public.afat_sync_passage_dispatch_status(p_assignment_id,v_assignment.status);
 if v_assignment.status in ('in_journey','completed','cancelled','disputed') then
   v_journey := public.afat_sync_dispatch_journey(p_assignment_id,p_actor_profile_id,v_assignment.status,p_evidence);
 end if;
 return jsonb_build_object('assignment',to_jsonb(v_assignment),'journey',v_journey->'journey','passage',v_passage);
end; $$;
revoke all on function public.afat_transition_dispatch_journey(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_transition_dispatch_journey(uuid,uuid,text,text,text,text,jsonb) to service_role;
