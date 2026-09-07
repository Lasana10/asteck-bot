alter table public.dispatch_assignments
  add column if not exists idempotency_key text,
  add column if not exists dispatch_score numeric(5,2),
  add column if not exists decision_factors jsonb not null default '{}'::jsonb,
  add column if not exists atlas_context jsonb not null default '{}'::jsonb,
  add column if not exists evidence_context jsonb not null default '{}'::jsonb,
  add column if not exists offered_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists pickup_verified_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists state_version integer not null default 0;

alter table public.dispatch_assignments
  drop constraint if exists dispatch_assignments_status_check;
alter table public.dispatch_assignments
  add constraint dispatch_assignments_status_check check (status = any (array[
    'queued'::text,'offered'::text,'accepted'::text,'assigned'::text,'en_route'::text,
    'arrived'::text,'pickup_verified'::text,'in_journey'::text,'completed'::text,
    'cancelled'::text,'declined'::text,'expired'::text,'reassigned'::text,
    'no_show'::text,'emergency'::text,'disputed'::text
  ]));

create unique index if not exists dispatch_assignments_idempotency_uq
  on public.dispatch_assignments(idempotency_key)
  where idempotency_key is not null;

create table if not exists public.dispatch_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text not null,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint dispatch_assignment_events_idempotency_uq unique(assignment_id,idempotency_key)
);

alter table public.dispatch_assignment_events enable row level security;

create index if not exists dispatch_assignment_events_assignment_created_idx
  on public.dispatch_assignment_events(assignment_id,created_at desc);

drop policy if exists dispatch_event_participant_or_staff_read on public.dispatch_assignment_events;
create policy dispatch_event_participant_or_staff_read
on public.dispatch_assignment_events for select
to authenticated
using (
  private.afat_is_staff()
  or exists (
    select 1 from public.dispatch_assignments d
    left join public.bookings b on b.id=d.booking_id
    where d.id=assignment_id
      and (
        d.operator_id=(select auth.uid())
        or d.dispatcher_id=(select auth.uid())
        or b.passenger_id=(select auth.uid())
      )
  )
);

create or replace function public.afat_transition_dispatch_assignment(
  p_assignment_id uuid,
  p_actor_profile_id uuid,
  p_expected_status text,
  p_next_status text,
  p_idempotency_key text,
  p_reason text default null,
  p_evidence jsonb default '{}'::jsonb
) returns public.dispatch_assignments
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.dispatch_assignments%rowtype;
  v_existing public.dispatch_assignment_events%rowtype;
  v_allowed boolean := false;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode='22023', message='stable dispatch idempotency key required';
  end if;

  select * into v_row from public.dispatch_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002', message='dispatch assignment not found'; end if;

  select * into v_existing from public.dispatch_assignment_events
   where assignment_id=p_assignment_id and idempotency_key=p_idempotency_key;
  if found then return v_row; end if;

  if p_expected_status is not null and v_row.status <> p_expected_status then
    raise exception using errcode='40001', message='stale dispatch state';
  end if;

  v_allowed := case v_row.status
    when 'queued' then p_next_status in ('offered','assigned','cancelled')
    when 'offered' then p_next_status in ('accepted','declined','expired','cancelled')
    when 'accepted' then p_next_status in ('assigned','en_route','cancelled','reassigned')
    when 'assigned' then p_next_status in ('en_route','reassigned','cancelled')
    when 'en_route' then p_next_status in ('arrived','reassigned','cancelled','emergency')
    when 'arrived' then p_next_status in ('pickup_verified','no_show','reassigned','cancelled','emergency')
    when 'pickup_verified' then p_next_status in ('in_journey','cancelled','emergency')
    when 'in_journey' then p_next_status in ('completed','emergency','disputed')
    when 'emergency' then p_next_status in ('in_journey','completed','cancelled','disputed')
    when 'disputed' then p_next_status in ('completed','cancelled')
    when 'reassigned' then p_next_status in ('offered','assigned','cancelled')
    else false
  end;

  if not v_allowed then
    raise exception using errcode='22023', message='invalid dispatch state transition';
  end if;

  update public.dispatch_assignments set
    status=p_next_status,
    state_version=state_version+1,
    offered_at=case when p_next_status='offered' and offered_at is null then now() else offered_at end,
    accepted_at=case when p_next_status in ('accepted','assigned') and accepted_at is null then now() else accepted_at end,
    pickup_verified_at=case when p_next_status='pickup_verified' and pickup_verified_at is null then now() else pickup_verified_at end,
    started_at=case when p_next_status='in_journey' and started_at is null then now() else started_at end,
    completed_at=case when p_next_status='completed' then now() else completed_at end,
    cancelled_at=case when p_next_status='cancelled' then now() else cancelled_at end,
    failure_reason=case when p_next_status in ('cancelled','declined','expired','no_show','disputed') then nullif(trim(coalesce(p_reason,'')),'') else failure_reason end,
    updated_at=now()
  where id=p_assignment_id
  returning * into v_row;

  insert into public.dispatch_assignment_events(
    assignment_id,actor_profile_id,event_type,from_status,to_status,reason,evidence,idempotency_key
  ) values (
    p_assignment_id,p_actor_profile_id,'dispatch.state_changed',p_expected_status,p_next_status,p_reason,coalesce(p_evidence,'{}'::jsonb),p_idempotency_key
  );

  return v_row;
end;
$$;

revoke all on function public.afat_transition_dispatch_assignment(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.afat_transition_dispatch_assignment(uuid,uuid,text,text,text,text,jsonb) to service_role;
