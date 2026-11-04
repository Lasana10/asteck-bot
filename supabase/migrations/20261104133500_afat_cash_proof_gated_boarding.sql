-- Preserve approved signed boarding: cash requires independent two-party proof.
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

  if v_booking.payment_status='paid_cash' and not exists (
    select 1 from public.afat_cash_handovers h
    where h.booking_id=v_booking.id and h.operator_id=v_booking.operator_id
      and h.passenger_id=v_booking.passenger_id and h.amount_xaf=v_booking.price_paid
      and h.passenger_confirmed_at is not null and h.operator_confirmed_at is not null
      and h.confirmed_at is not null
  ) then
    raise exception 'CASH_HANDOVER_NOT_VERIFIED_BY_BOTH_PARTIES' using errcode='P0001';
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
