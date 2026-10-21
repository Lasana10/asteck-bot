-- AFAT verified operator departure → passenger seat hold → booking integrity.
-- Preserve original authenticated function signatures, invoker privileges, RLS,
-- row locks, advisory seat locks, idempotency, existing events and payment ledger.
-- No synthetic bookings, operator approvals, seats or monetary records are inserted.
CREATE OR REPLACE FUNCTION public.afat_hold_seat(p_passenger_id uuid, p_route_id uuid, p_seat_label text, p_hold_minutes integer DEFAULT 8)
 RETURNS seat_holds
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_route public.routes;
  v_hold public.seat_holds;
  v_verified_capacity integer;
  v_seat text := upper(trim(p_seat_label));
  v_minutes integer := least(greatest(coalesce(p_hold_minutes, 8), 2), 10);
begin
  perform private.afat_assert_active_profile(p_passenger_id);
  perform pg_advisory_xact_lock(hashtextextended(p_route_id::text || ':' || v_seat, 0));

  select * into v_route from public.routes where id = p_route_id and is_active for update;
  if v_route.id is null then
    raise exception 'ROUTE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_route.operator_id is null or v_route.price_per_seat is null or v_route.price_per_seat <= 0 then
    raise exception 'ROUTE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  if v_route.departure_time is null or v_route.departure_time <= now() then
    raise exception 'DEPARTURE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  select least(v_route.capacity, v.capacity) into v_verified_capacity
  from public.vehicles v join public.profiles p on p.id = v_route.operator_id
  where v.id = v_route.vehicle_id
    and p.operator_application_status = 'APPROVED'
    and p.verification_status = 'verified'
    and v.clearance_status = 'verified';
  if v_verified_capacity is null or v_verified_capacity < 1 then
    raise exception 'ROUTE_OPERATOR_OR_VEHICLE_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  if v_seat !~ '^([A-Z])?[0-9]{1,2}$'
     or regexp_replace(v_seat, '[^0-9]', '', 'g')::integer < 1
     or regexp_replace(v_seat, '[^0-9]', '', 'g')::integer > v_verified_capacity then
    raise exception 'INVALID_SEAT_LABEL' using errcode = 'P0001';
  end if;

  update public.seat_holds
  set status = 'expired', updated_at = now()
  where route_id = p_route_id and seat_label = v_seat
    and status = 'active' and expires_at <= now();

  if exists (
    select 1 from public.bookings
    where route_id = p_route_id and seat_label = v_seat
      and status in ('pending', 'accepted', 'confirmed', 'boarded', 'in_progress')
  ) then
    raise exception 'SEAT_ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  select * into v_hold
  from public.seat_holds
  where route_id = p_route_id and seat_label = v_seat and status = 'active';

  if v_hold.id is not null and v_hold.passenger_id <> p_passenger_id then
    raise exception 'SEAT_TEMPORARILY_HELD' using errcode = 'P0001';
  end if;

  if v_hold.id is not null then
    update public.seat_holds
    set expires_at = now() + make_interval(mins => v_minutes), updated_at = now()
    where id = v_hold.id
    returning * into v_hold;
    return v_hold;
  end if;

  insert into public.seat_holds (
    passenger_id, operator_id, route_id, seat_label, status, expires_at
  ) values (
    p_passenger_id, v_route.operator_id, p_route_id, v_seat,
    'active', now() + make_interval(mins => v_minutes)
  ) returning * into v_hold;

  return v_hold;
end;
$function$


CREATE OR REPLACE FUNCTION public.afat_create_booking_from_hold(p_passenger_id uuid, p_hold_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_hold public.seat_holds;
  v_route public.routes;
  v_booking public.bookings;
  v_verified_capacity integer;
begin
  perform private.afat_assert_active_profile(p_passenger_id);

  select * into v_hold from public.seat_holds where id = p_hold_id for update;
  if v_hold.id is null or v_hold.passenger_id <> p_passenger_id
     or v_hold.status <> 'active' or v_hold.expires_at <= now() then
    raise exception 'ACTIVE_HOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_hold.route_id::text || ':' || v_hold.seat_label, 0));
  select * into v_route from public.routes where id = v_hold.route_id and is_active for update;
  if v_route.id is null or v_route.operator_id is null or coalesce(v_route.price_per_seat, 0) <= 0 then
    raise exception 'ROUTE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  if v_route.departure_time is null or v_route.departure_time <= now() then
    raise exception 'DEPARTURE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  select least(v_route.capacity, v.capacity) into v_verified_capacity
  from public.vehicles v join public.profiles p on p.id = v_route.operator_id
  where v.id = v_route.vehicle_id
    and p.operator_application_status = 'APPROVED'
    and p.verification_status = 'verified'
    and v.clearance_status = 'verified';
  if v_verified_capacity is null or v_verified_capacity < 1 then
    raise exception 'ROUTE_OPERATOR_OR_VEHICLE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if regexp_replace(v_hold.seat_label, '[^0-9]', '', 'g')::integer > v_verified_capacity then
    raise exception 'SEAT_CAPACITY_CHANGED' using errcode = 'P0001';
  end if;


  insert into public.bookings (
    passenger_id, operator_id, vehicle_id, route_id,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    status, price_xaf, price_paid, payment_status, seat_label
  ) values (
    p_passenger_id, v_route.operator_id, v_route.vehicle_id, v_route.id,
    v_route.origin_lat, v_route.origin_lng, v_route.dest_lat, v_route.dest_lng,
    'pending', v_route.price_per_seat, v_route.price_per_seat, 'unpaid', v_hold.seat_label
  ) returning * into v_booking;

  update public.seat_holds
  set status = 'converted', booking_id = v_booking.id, updated_at = now()
  where id = v_hold.id;

  insert into public.trip_events(booking_id, actor_id, event_type, metadata)
  values (v_booking.id, p_passenger_id, 'booking_created', jsonb_build_object('seat', v_hold.seat_label));
  return v_booking;
end;
$function$

