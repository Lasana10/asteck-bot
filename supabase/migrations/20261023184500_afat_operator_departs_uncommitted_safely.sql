-- An operator may withdraw ONLY genuinely uncommitted future inventory.
-- Seat holds and booking creation lock routes FOR UPDATE; this function locks
-- the same row first, preventing cancellation/booking races.
-- All cancellations are auditable and no customer/payment record is mutated.
create table if not exists public.afat_departure_operator_events (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete restrict,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('cancelled_uncommitted')),
  reason text not null check (char_length(reason) between 12 and 500),
  created_at timestamptz not null default now()
);

create index if not exists afat_departure_operator_events_route_idx
  on public.afat_departure_operator_events(route_id,created_at desc);
alter table public.afat_departure_operator_events enable row level security;
revoke all on table public.afat_departure_operator_events from anon,authenticated;
grant select,insert on table public.afat_departure_operator_events to service_role;

create or replace function public.afat_cancel_operator_departure(
  p_operator_id uuid, p_route_id uuid, p_reason text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_route public.routes%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_operator_id is null or p_route_id is null
     or char_length(v_reason) < 12 or char_length(v_reason) > 500 then
    raise exception 'VALID_DEPARTURE_OWNER_AND_REASON_REQUIRED' using errcode='22023';
  end if;
  select * into v_route from public.routes
  where id=p_route_id for update;
  if not found or v_route.operator_id is distinct from p_operator_id then
    raise exception 'OWN_DEPARTURE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_route.is_active is not true then
    return jsonb_build_object('id',v_route.id,'status','already_inactive','changed',false);
  end if;
  if v_route.departure_time is null or v_route.departure_time <= now() then
    raise exception 'DEPARTURE_ALREADY_STARTED' using errcode='P0001';
  end if;
  -- Any booking, even cancelled, may contain financial/dispatch history:
  -- require staff intervention instead of silently withdrawing promises.
  if exists (select 1 from public.bookings where route_id=v_route.id) then
    raise exception 'DEPARTURE_HAS_BOOKING_HISTORY_REQUIRES_STAFF_REVIEW' using errcode='P0001';
  end if;
  if exists (select 1 from public.seat_holds
    where route_id=v_route.id and status='active' and expires_at>now()) then
    raise exception 'DEPARTURE_HAS_ACTIVE_SEAT_HOLDS' using errcode='P0001';
  end if;
  update public.routes set is_active=false where id=v_route.id;
  insert into public.afat_departure_operator_events(route_id,operator_id,event_type,reason)
  values(v_route.id,p_operator_id,'cancelled_uncommitted',v_reason);
  return jsonb_build_object('id',v_route.id,'status','cancelled','changed',true);
end;
$$;
revoke all on function public.afat_cancel_operator_departure(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.afat_cancel_operator_departure(uuid,uuid,text) to service_role;
