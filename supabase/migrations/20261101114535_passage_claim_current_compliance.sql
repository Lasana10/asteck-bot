-- Claim the same cleared, recently present supply that passenger preflight may
-- show. Keep passage, booking and dispatch transitions in one transaction.
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
  if v_passage.booking_id is null then
    raise exception using errcode='23514', message='passage has no dispatch booking';
  end if;
  v_mode := lower(trim(coalesce(v_passage.requested_vehicle_type,'')));
  if v_mode not in ('car','moto','minibus') then
    raise exception using errcode='23514', message='supported vehicle mode required';
  end if;

  select * into v_vehicle from public.vehicles
  where operator_id=p_operator_id and is_available=true
    and clearance_status='verified'
    and last_ping_at between now()-interval '120 seconds' and now()
    and case v_mode
      when 'car' then lower(type) in ('car','taxi')
      when 'moto' then lower(type) in ('moto','motorcycle','bike')
      else lower(type) in ('minibus','bus','shared') end
  order by last_ping_at desc, id limit 1 for update;
  if not found or not public.afat_vehicle_compliance_current(v_vehicle.id) then
    raise exception using errcode='23514', message='current verified available vehicle required';
  end if;

  update public.passage_intents set operator_id=p_operator_id,status='assigned',updated_at=now()
  where id=v_passage.id returning * into v_passage;
  update public.bookings set operator_id=p_operator_id,vehicle_id=v_vehicle.id,status='accepted',updated_at=now()
  where id=v_passage.booking_id and status='pending' returning * into v_booking;
  if v_booking.id is null then
    raise exception using errcode='40001', message='booking already changed';
  end if;
  update public.dispatch_assignments set operator_id=p_operator_id,vehicle_id=v_vehicle.id,
    status='accepted',accepted_at=coalesce(accepted_at,now()),
    state_version=state_version+1,updated_at=now()
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
