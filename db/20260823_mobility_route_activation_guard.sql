-- Follow-up guard for databases where the core mobility migration was already applied.
-- An active route is a published, bookable inventory item and must therefore have
-- an approved operator, a cleared vehicle, a future departure, coordinates, and fare.

create index if not exists bookings_passenger_id_idx on public.bookings(passenger_id);
create index if not exists bookings_operator_id_idx on public.bookings(operator_id);
create index if not exists bookings_vehicle_id_idx on public.bookings(vehicle_id);
create index if not exists routes_operator_id_idx on public.routes(operator_id);
create index if not exists routes_vehicle_id_idx on public.routes(vehicle_id);
create index if not exists seat_holds_booking_id_idx on public.seat_holds(booking_id);
create index if not exists seat_holds_operator_id_idx on public.seat_holds(operator_id);
create index if not exists trip_events_actor_id_idx on public.trip_events(actor_id);

create or replace function private.afat_enforce_bookable_route()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_active then
    if new.operator_id is null
       or new.vehicle_id is null
       or coalesce(new.price_per_seat, 0) <= 0
       or coalesce(new.capacity, 0) <= 0
       or new.origin is null
       or new.destination is null
       or new.origin_lat is null
       or new.origin_lng is null
       or new.dest_lat is null
       or new.dest_lng is null
       or new.departure_time is null
       or new.departure_time <= now()
       or not exists (
         select 1 from public.profiles p
         where p.id = new.operator_id
           and p.role = 'operator'
           and p.operator_application_status = 'APPROVED'
           and p.verification_status = 'verified'
           and coalesce(p.is_active, true)
       )
       or not exists (
         select 1 from public.vehicles v
         where v.id = new.vehicle_id
           and v.operator_id = new.operator_id
           and v.clearance_status = 'verified'
           and coalesce(v.capacity, new.capacity) >= new.capacity
       ) then
      raise exception 'ROUTE_NOT_BOOKABLE' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.afat_enforce_bookable_route() from public, anon, authenticated;

update public.routes r
set is_active = false,
    updated_at = now()
where r.is_active
  and (
    r.operator_id is null
    or r.vehicle_id is null
    or coalesce(r.price_per_seat, 0) <= 0
    or coalesce(r.capacity, 0) <= 0
    or r.origin is null
    or r.destination is null
    or r.origin_lat is null
    or r.origin_lng is null
    or r.dest_lat is null
    or r.dest_lng is null
    or r.departure_time is null
    or r.departure_time <= now()
    or not exists (
      select 1 from public.profiles p
      where p.id = r.operator_id
        and p.role = 'operator'
        and p.operator_application_status = 'APPROVED'
        and p.verification_status = 'verified'
        and coalesce(p.is_active, true)
    )
    or not exists (
      select 1 from public.vehicles v
      where v.id = r.vehicle_id
        and v.operator_id = r.operator_id
        and v.clearance_status = 'verified'
        and coalesce(v.capacity, r.capacity) >= r.capacity
    )
  );

drop trigger if exists afat_routes_bookable_guard on public.routes;
create trigger afat_routes_bookable_guard
before insert or update of is_active, operator_id, vehicle_id, price_per_seat,
  capacity, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
  departure_time
on public.routes
for each row execute function private.afat_enforce_bookable_route();
