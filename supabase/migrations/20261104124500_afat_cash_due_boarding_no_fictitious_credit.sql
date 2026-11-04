-- Fail-closed: cash_due is an obligation, never collected money.
-- Boarding signed tickets does not credit an operator wallet or mark cash paid.
-- Provider-paid bookings continue through existing signed ticket verification.
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
     or v_booking.payment_status not in ('paid', 'paid_momo') then
    raise exception 'BOOKING_NOT_BOARDABLE' using errcode = 'P0001';
  end if;

  -- Never infer cash collection or post operator earnings from a QR scan.
  -- Explicit independently reconciled cash collection must use its own flow.
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
