alter table public.passage_intents add column if not exists booking_id uuid references public.bookings(id) on delete set null;
create unique index if not exists passage_intents_booking_id_uidx on public.passage_intents(booking_id) where booking_id is not null;

create table if not exists public.afat_journeys (
  id uuid primary key default gen_random_uuid(),
  dispatch_assignment_id uuid not null unique references public.dispatch_assignments(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  passage_intent_id uuid references public.passage_intents(id) on delete set null,
  passenger_id uuid references public.profiles(id) on delete set null,
  operator_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_mode text not null default 'car' check (vehicle_mode in ('walk','bike','moto','car','minibus','bus')),
  status text not null default 'active' check (status in ('active','completed','cancelled','disputed')),
  started_at timestamptz,
  completed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_journeys_booking_idx on public.afat_journeys(booking_id);
create index if not exists afat_journeys_passage_idx on public.afat_journeys(passage_intent_id);
alter table public.afat_journeys enable row level security;
revoke all on public.afat_journeys from anon, authenticated;
grant select,insert,update,delete on public.afat_journeys to service_role;

create table if not exists public.afat_journey_samples (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.afat_journeys(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m numeric,
  speed_kph numeric,
  heading numeric,
  recorded_at timestamptz not null,
  source text not null default 'browser_geolocation',
  created_at timestamptz not null default now(),
  unique(journey_id, profile_id, recorded_at)
);
create index if not exists afat_journey_samples_journey_time_idx on public.afat_journey_samples(journey_id, recorded_at);
alter table public.afat_journey_samples enable row level security;
revoke all on public.afat_journey_samples from anon, authenticated;
grant select,insert,update,delete on public.afat_journey_samples to service_role;

create or replace function public.afat_sync_dispatch_journey(
  p_assignment_id uuid,
  p_actor_profile_id uuid,
  p_status text,
  p_evidence jsonb default '{}'::jsonb
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
  )
  on conflict(dispatch_assignment_id) do update set
    status=excluded.status,
    passage_intent_id=coalesce(public.afat_journeys.passage_intent_id,excluded.passage_intent_id),
    passenger_id=coalesce(public.afat_journeys.passenger_id,excluded.passenger_id),
    operator_id=coalesce(excluded.operator_id,public.afat_journeys.operator_id),
    vehicle_id=coalesce(excluded.vehicle_id,public.afat_journeys.vehicle_id),
    vehicle_mode=excluded.vehicle_mode,
    started_at=coalesce(public.afat_journeys.started_at,excluded.started_at),
    completed_at=case when excluded.status='completed' then coalesce(excluded.completed_at,now()) else public.afat_journeys.completed_at end,
    evidence=coalesce(public.afat_journeys.evidence,'{}'::jsonb)||coalesce(excluded.evidence,'{}'::jsonb),
    updated_at=now()
  returning * into v_journey;

  if v_assignment.booking_id is not null then
    update public.bookings set
      status=case when p_status='completed' then 'completed' when p_status='in_journey' then 'in_journey' else status end,
      started_at=case when p_status='in_journey' then coalesce(started_at,now()) else started_at end,
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
    where id=v_assignment.booking_id;
  end if;

  return jsonb_build_object('journey',to_jsonb(v_journey),'linked_passage_intent_id',v_passage.id,'booking_id',v_assignment.booking_id);
end; $$;
revoke all on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_sync_dispatch_journey(uuid,uuid,text,jsonb) to service_role;
