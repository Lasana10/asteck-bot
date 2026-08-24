-- AFAT production mobility vertical slice.
-- Makes route inventory, seat allocation, payment confirmation, boarding,
-- dispatch, completion, receipts, and audit events one consistent workflow.

alter table public.routes
  add column if not exists origin text,
  add column if not exists destination text,
  add column if not exists departure_time timestamptz,
  add column if not exists price_per_seat integer,
  add column if not exists capacity integer,
  add column if not exists vehicle_type text,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists is_active boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.routes
set price_per_seat = coalesce(price_per_seat, price_xaf),
    origin = coalesce(origin, name),
    destination = coalesce(destination, name),
    capacity = coalesce(capacity, 4),
    vehicle_type = coalesce(vehicle_type, 'taxi')
where price_per_seat is null
   or origin is null
   or destination is null
   or capacity is null
   or vehicle_type is null;

alter table public.bookings
  add column if not exists boarded_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists rating integer,
  add column if not exists feedback text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_rating_check'
  ) then
    alter table public.bookings
      add constraint bookings_rating_check check (rating between 1 and 5);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_holds'::regclass
      and conname = 'seat_holds_passenger_id_fkey'
  ) then
    alter table public.seat_holds
      add constraint seat_holds_passenger_id_fkey
      foreign key (passenger_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_holds'::regclass
      and conname = 'seat_holds_operator_id_fkey'
  ) then
    alter table public.seat_holds
      add constraint seat_holds_operator_id_fkey
      foreign key (operator_id) references public.profiles(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_holds'::regclass
      and conname = 'seat_holds_route_id_fkey'
  ) then
    alter table public.seat_holds
      add constraint seat_holds_route_id_fkey
      foreign key (route_id) references public.routes(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_holds'::regclass
      and conname = 'seat_holds_booking_id_fkey'
  ) then
    alter table public.seat_holds
      add constraint seat_holds_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete set null;
  end if;
end $$;

create unique index if not exists seat_holds_one_active_seat
  on public.seat_holds(route_id, seat_label)
  where status = 'active';

create unique index if not exists bookings_one_active_seat
  on public.bookings(route_id, seat_label)
  where seat_label is not null
    and status in ('pending', 'accepted', 'confirmed', 'boarded', 'in_progress');

create unique index if not exists wallet_ledger_one_ride_credit
  on public.wallet_ledger(booking_id)
  where entry_type = 'ride_credit' and status <> 'reversed';

create index if not exists bookings_passenger_id_idx on public.bookings(passenger_id);
create index if not exists bookings_operator_id_idx on public.bookings(operator_id);
create index if not exists bookings_vehicle_id_idx on public.bookings(vehicle_id);
create index if not exists routes_operator_id_idx on public.routes(operator_id);
create index if not exists routes_vehicle_id_idx on public.routes(vehicle_id);
create index if not exists seat_holds_booking_id_idx on public.seat_holds(booking_id);
create index if not exists seat_holds_operator_id_idx on public.seat_holds(operator_id);

create table if not exists public.trip_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'booking_created', 'cash_selected', 'payment_confirmed', 'dispatch_created',
    'boarded', 'trip_started', 'trip_completed', 'cancelled'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trip_events_booking_created
  on public.trip_events(booking_id, created_at);

alter table public.trip_events enable row level security;
revoke all on table public.trip_events from anon, authenticated;
grant select on table public.trip_events to authenticated;

drop policy if exists trip_events_participant_or_staff_read on public.trip_events;
create policy trip_events_participant_or_staff_read
on public.trip_events for select to authenticated
using (
  private.afat_is_staff()
  or exists (
    select 1 from public.bookings b
    where b.id = trip_events.booking_id
      and ((select auth.uid()) = b.passenger_id or (select auth.uid()) = b.operator_id)
  )
);

revoke all on table public.bookings, public.dispatch_assignments,
  public.operator_wallets, public.payment_events, public.seat_holds,
  public.wallet_ledger from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.bookings, public.dispatch_assignments, public.operator_wallets,
  public.payment_events, public.seat_holds, public.wallet_ledger
  from authenticated;

grant select on table public.bookings, public.dispatch_assignments,
  public.operator_wallets, public.payment_events, public.seat_holds,
  public.wallet_ledger to authenticated;

drop policy if exists "Auth users can create bookings" on public.bookings;
drop policy if exists "Passengers and Operators can update bookings" on public.bookings;

drop policy if exists seat_holds_participant_read on public.seat_holds;
create policy seat_holds_participant_read
on public.seat_holds for select to authenticated
using (
  passenger_id = (select auth.uid())
  or operator_id = (select auth.uid())
  or private.afat_is_staff()
);

drop policy if exists payment_events_participant_read on public.payment_events;
create policy payment_events_participant_read
on public.payment_events for select to authenticated
using (
  private.afat_is_staff()
  or exists (
    select 1 from public.bookings b
    where b.id = payment_events.booking_id
      and ((select auth.uid()) = b.passenger_id or (select auth.uid()) = b.operator_id)
  )
);

create or replace function private.afat_assert_active_profile(p_actor_id uuid)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where id = p_actor_id and coalesce(is_active, true);

  if v_profile.id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  return v_profile;
end;
$$;

create or replace function public.afat_hold_seat(
  p_passenger_id uuid,
  p_route_id uuid,
  p_seat_label text,
  p_hold_minutes integer default 8
)
returns public.seat_holds
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_route public.routes;
  v_hold public.seat_holds;
  v_seat text := upper(trim(p_seat_label));
  v_minutes integer := least(greatest(coalesce(p_hold_minutes, 8), 2), 10);
begin
  perform private.afat_assert_active_profile(p_passenger_id);
  perform pg_advisory_xact_lock(hashtextextended(p_route_id::text || ':' || v_seat, 0));

  select * into v_route from public.routes where id = p_route_id and is_active for update;
  if v_route.id is null then
    raise exception 'ROUTE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_route.operator_id is null or v_route.vehicle_id is null
     or v_route.price_per_seat is null or v_route.price_per_seat <= 0
     or v_route.departure_time is null or v_route.departure_time <= now()
     or not exists (
       select 1 from public.profiles p
       where p.id = v_route.operator_id
         and p.role = 'operator'
         and p.operator_application_status = 'APPROVED'
         and p.verification_status = 'verified'
         and coalesce(p.is_active, true)
     )
     or not exists (
       select 1 from public.vehicles v
       where v.id = v_route.vehicle_id
         and v.operator_id = v_route.operator_id
         and v.clearance_status = 'verified'
     ) then
    raise exception 'ROUTE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  if v_seat !~ '^([A-Z])?[0-9]{1,2}$'
     or regexp_replace(v_seat, '[^0-9]', '', 'g')::integer < 1
     or regexp_replace(v_seat, '[^0-9]', '', 'g')::integer > coalesce(v_route.capacity, 4) then
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
$$;

create or replace function public.afat_release_seat_hold(
  p_passenger_id uuid,
  p_hold_id uuid
)
returns public.seat_holds
language plpgsql
security invoker
set search_path = ''
as $$
declare v_hold public.seat_holds;
begin
  update public.seat_holds
  set status = 'released', updated_at = now()
  where id = p_hold_id and passenger_id = p_passenger_id and status = 'active'
  returning * into v_hold;
  if v_hold.id is null then
    raise exception 'ACTIVE_HOLD_NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_hold;
end;
$$;

create or replace function public.afat_create_booking_from_hold(
  p_passenger_id uuid,
  p_hold_id uuid
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hold public.seat_holds;
  v_route public.routes;
  v_booking public.bookings;
begin
  perform private.afat_assert_active_profile(p_passenger_id);

  select * into v_hold from public.seat_holds where id = p_hold_id for update;
  if v_hold.id is null or v_hold.passenger_id <> p_passenger_id
     or v_hold.status <> 'active' or v_hold.expires_at <= now() then
    raise exception 'ACTIVE_HOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_hold.route_id::text || ':' || v_hold.seat_label, 0));
  select * into v_route from public.routes where id = v_hold.route_id and is_active for update;
  if v_route.id is null or v_route.operator_id is null or v_route.vehicle_id is null
     or coalesce(v_route.price_per_seat, 0) <= 0
     or v_route.departure_time is null or v_route.departure_time <= now()
     or not exists (
       select 1 from public.profiles p
       where p.id = v_route.operator_id
         and p.role = 'operator'
         and p.operator_application_status = 'APPROVED'
         and p.verification_status = 'verified'
         and coalesce(p.is_active, true)
     )
     or not exists (
       select 1 from public.vehicles v
       where v.id = v_route.vehicle_id
         and v.operator_id = v_route.operator_id
         and v.clearance_status = 'verified'
     ) then
    raise exception 'ROUTE_NOT_BOOKABLE' using errcode = 'P0001';
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
$$;

create or replace function public.afat_select_cash_payment(
  p_passenger_id uuid,
  p_booking_id uuid
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.passenger_id <> p_passenger_id then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'pending' or v_booking.payment_status not in ('unpaid', 'failed') then
    raise exception 'BOOKING_PAYMENT_STATE_INVALID' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = 'confirmed', payment_status = 'cash_due',
      transaction_id = 'CASH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
      updated_at = now()
  where id = p_booking_id returning * into v_booking;

  insert into public.payment_events(
    booking_id, provider, external_id, event_type, event_status, amount_xaf, metadata
  ) values (
    v_booking.id, 'cash', v_booking.transaction_id, 'manual_finalized', 'DUE',
    v_booking.price_paid, jsonb_build_object('selected_by', p_passenger_id)
  );

  insert into public.dispatch_assignments(
    booking_id, route_id, operator_id, vehicle_id, origin, destination, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
  )
  select v_booking.id, r.id, v_booking.operator_id, v_booking.vehicle_id,
         r.origin, r.destination, 'assigned', v_booking.pickup_lat, v_booking.pickup_lng,
         v_booking.dropoff_lat, v_booking.dropoff_lng
  from public.routes r where r.id = v_booking.route_id
  on conflict do nothing;

  insert into public.trip_events(booking_id, actor_id, event_type)
  values (v_booking.id, p_passenger_id, 'cash_selected');
  return v_booking;
end;
$$;

create or replace function public.afat_confirm_mobile_payment(
  p_booking_id uuid,
  p_transaction_id text,
  p_provider text default 'pawapay'
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_commission integer;
  v_net integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.payment_status in ('paid', 'paid_momo') then return v_booking; end if;
  if v_booking.payment_status <> 'collection_pending' then
    raise exception 'BOOKING_PAYMENT_STATE_INVALID' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = 'confirmed', payment_status = 'paid_momo',
      transaction_id = p_transaction_id, updated_at = now()
  where id = p_booking_id returning * into v_booking;

  v_commission := round(coalesce(v_booking.price_paid, 0) * 0.08);
  v_net := coalesce(v_booking.price_paid, 0) - v_commission;
  insert into public.wallet_ledger(
    operator_id, booking_id, entry_type, direction, gross_amount,
    commission_amount, net_amount, status, reference
  ) values (
    v_booking.operator_id, v_booking.id, 'ride_credit', 'credit',
    v_booking.price_paid, v_commission, v_net, 'posted', p_transaction_id
  ) on conflict do nothing;
  insert into public.operator_wallets(operator_id, balance_xaf)
  values (v_booking.operator_id, v_net)
  on conflict (operator_id) do update
    set balance_xaf = public.operator_wallets.balance_xaf + excluded.balance_xaf,
        updated_at = now();

  insert into public.dispatch_assignments(
    booking_id, route_id, operator_id, vehicle_id, origin, destination, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
  )
  select v_booking.id, r.id, v_booking.operator_id, v_booking.vehicle_id,
         r.origin, r.destination, 'assigned', v_booking.pickup_lat, v_booking.pickup_lng,
         v_booking.dropoff_lat, v_booking.dropoff_lng
  from public.routes r where r.id = v_booking.route_id
  on conflict do nothing;

  insert into public.trip_events(booking_id, event_type, metadata)
  values (v_booking.id, 'payment_confirmed', jsonb_build_object('provider', p_provider, 'transaction_id', p_transaction_id));
  return v_booking;
end;
$$;

create unique index if not exists dispatch_assignments_one_per_booking
  on public.dispatch_assignments(booking_id) where booking_id is not null;

create or replace function public.afat_board_booking(
  p_operator_id uuid,
  p_booking_id uuid
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_operator public.profiles;
  v_commission integer;
  v_net integer;
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
     or v_booking.payment_status not in ('paid', 'paid_momo', 'cash_due') then
    raise exception 'BOOKING_NOT_BOARDABLE' using errcode = 'P0001';
  end if;

  if v_booking.payment_status = 'cash_due' then
    v_commission := round(coalesce(v_booking.price_paid, 0) * 0.08);
    v_net := coalesce(v_booking.price_paid, 0) - v_commission;
    insert into public.wallet_ledger(
      operator_id, booking_id, entry_type, direction, gross_amount,
      commission_amount, net_amount, status, reference
    ) values (
      p_operator_id, v_booking.id, 'ride_credit', 'credit',
      v_booking.price_paid, v_commission, v_net, 'posted', v_booking.transaction_id
    ) on conflict do nothing;
    insert into public.operator_wallets(operator_id, balance_xaf)
    values (p_operator_id, v_net)
    on conflict (operator_id) do update
      set balance_xaf = public.operator_wallets.balance_xaf + excluded.balance_xaf,
          updated_at = now();
  end if;

  update public.bookings
  set status = 'boarded',
      payment_status = case when payment_status = 'cash_due' then 'paid_cash' else payment_status end,
      boarded_at = now(), started_at = now(), updated_at = now()
  where id = p_booking_id returning * into v_booking;

  update public.dispatch_assignments set status = 'en_route', updated_at = now()
  where booking_id = p_booking_id;
  insert into public.trip_events(booking_id, actor_id, event_type)
  values (p_booking_id, p_operator_id, 'boarded');
  return v_booking;
end;
$$;

create or replace function public.afat_complete_booking(
  p_operator_id uuid,
  p_booking_id uuid,
  p_rating integer default null,
  p_feedback text default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare v_booking public.bookings;
begin
  perform private.afat_assert_active_profile(p_operator_id);
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.operator_id <> p_operator_id then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('boarded', 'in_progress') then
    raise exception 'TRIP_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = 'completed', completed_at = now(), updated_at = now(),
      rating = case when p_rating between 1 and 5 then p_rating else rating end,
      feedback = nullif(left(trim(coalesce(p_feedback, '')), 1000), '')
  where id = p_booking_id returning * into v_booking;
  update public.dispatch_assignments set status = 'completed', updated_at = now()
  where booking_id = p_booking_id;
  update public.vehicles set total_rides = coalesce(total_rides, 0) + 1, updated_at = now()
  where id = v_booking.vehicle_id;
  insert into public.trip_events(booking_id, actor_id, event_type)
  values (p_booking_id, p_operator_id, 'trip_completed');
  return v_booking;
end;
$$;

revoke all on function private.afat_assert_active_profile(uuid) from public, anon, authenticated;
revoke all on function public.afat_hold_seat(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.afat_release_seat_hold(uuid, uuid) from public, anon, authenticated;
revoke all on function public.afat_create_booking_from_hold(uuid, uuid) from public, anon, authenticated;
revoke all on function public.afat_select_cash_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.afat_confirm_mobile_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.afat_board_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.afat_complete_booking(uuid, uuid, integer, text) from public, anon, authenticated;

grant execute on function private.afat_assert_active_profile(uuid) to service_role;
grant execute on function public.afat_hold_seat(uuid, uuid, text, integer) to service_role;
grant execute on function public.afat_release_seat_hold(uuid, uuid) to service_role;
grant execute on function public.afat_create_booking_from_hold(uuid, uuid) to service_role;
grant execute on function public.afat_select_cash_payment(uuid, uuid) to service_role;
grant execute on function public.afat_confirm_mobile_payment(uuid, text, text) to service_role;
grant execute on function public.afat_board_booking(uuid, uuid) to service_role;
grant execute on function public.afat_complete_booking(uuid, uuid, integer, text) to service_role;
