create unique index if not exists dispatch_assignments_booking_uq
  on public.dispatch_assignments(booking_id)
  where booking_id is not null;

create or replace function public.afat_enqueue_booking_dispatch()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch_id uuid;
  v_status text;
  v_pickup_label text;
  v_destination_label text;
begin
  if new.status in ('cancelled','completed') then
    return new;
  end if;

  v_status := case
    when new.operator_id is not null then 'assigned'
    else 'queued'
  end;

  v_pickup_label := 'Pickup ' || round(new.pickup_lat::numeric,5)::text || ', ' || round(new.pickup_lng::numeric,5)::text;
  v_destination_label := 'Destination ' || round(new.dropoff_lat::numeric,5)::text || ', ' || round(new.dropoff_lng::numeric,5)::text;

  insert into public.dispatch_assignments(
    booking_id, route_id, operator_id, vehicle_id,
    origin, destination, priority, status,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
  ) values (
    new.id, new.route_id, new.operator_id, new.vehicle_id,
    v_pickup_label, v_destination_label,
    'normal', v_status,
    new.pickup_lat, new.pickup_lng, new.dropoff_lat, new.dropoff_lng
  )
  on conflict (booking_id) where booking_id is not null do nothing
  returning id into v_dispatch_id;

  if v_dispatch_id is not null then
    insert into public.dispatch_assignment_events(
      assignment_id, actor_profile_id, event_type, from_status, to_status,
      reason, evidence, idempotency_key
    ) values (
      v_dispatch_id,
      new.passenger_id,
      'dispatch.created_from_booking',
      null,
      v_status,
      null,
      jsonb_build_object(
        'booking_id', new.id,
        'route_id', new.route_id,
        'passenger_id', new.passenger_id,
        'pickup', jsonb_build_object('lat',new.pickup_lat,'lng',new.pickup_lng),
        'dropoff', jsonb_build_object('lat',new.dropoff_lat,'lng',new.dropoff_lng),
        'booking_status', new.status,
        'source', 'booking_trigger'
      ),
      'booking:' || new.id::text || ':dispatch-created'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.afat_enqueue_booking_dispatch() from public, anon, authenticated;

drop trigger if exists afat_booking_dispatch_enqueue on public.bookings;
create trigger afat_booking_dispatch_enqueue
after insert on public.bookings
for each row execute function public.afat_enqueue_booking_dispatch();
