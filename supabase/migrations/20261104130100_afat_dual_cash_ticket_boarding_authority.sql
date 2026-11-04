-- Cash-paid boarding is allowed only after both parties independently attest
-- the same server-priced booking; still no wallet/provider settlement credit.
CREATE OR REPLACE FUNCTION public.afat_board_booking(p_operator_id uuid, p_booking_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_booking public.bookings;
  v_operator public.profiles;
begin
  v_operator := private.afat_assert_active_profile(p_operator_id);
  if v_operator.role <> 'operator'
     or coalesce(v_operator.operator_application_status, '') <> 'APPROVED'
     or coalesce(v_operator.verification_status, '') <> 'verified' then
    raise exception 'VERIFIED_OPERATOR_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.operator_id <> p_operator_id then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('confirmed', 'accepted')
     or v_booking.payment_status not in ('paid', 'paid_momo', 'paid_cash') then
    raise exception 'BOOKING_NOT_BOARDABLE' using errcode = 'P0001';
  end if;

  -- Never infer cash collection or post operator earnings from a QR scan.
  -- Explicit independently reconciled cash collection must use its own flow.
  if v_booking.payment_status = 'paid_cash' and not exists (
    select 1 from public.afat_cash_handover_evidence e
    where e.booking_id=p_booking_id and e.passenger_id=v_booking.passenger_id
      and e.operator_id=v_booking.operator_id
      and e.amount_xaf=v_booking.price_paid
      and e.passenger_attested_at is not null and e.operator_attested_at is not null
      and e.dual_attested_at is not null
  ) then
    raise exception 'DUAL_CASH_HANDOVER_EVIDENCE_REQUIRED' using errcode='P0001';
  end if;

  update public.bookings
  set status = 'boarded',
      boarded_at = now(), started_at = now(), updated_at = now()
  where id = p_booking_id returning * into v_booking;

  update public.dispatch_assignments set status = 'en_route', updated_at = now()
  where booking_id = p_booking_id;
  insert into public.trip_events(booking_id, actor_id, event_type)
  values (p_booking_id, p_operator_id, 'boarded');
  return v_booking;
end;
$function$
;
revoke all on function public.afat_board_booking(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_board_booking(uuid,uuid) to service_role;
