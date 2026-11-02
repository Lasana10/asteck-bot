-- A terminal dispatch must always have a durable receipt. The receipt remains
-- payment-neutral unless the existing provider/cash authorities prove payment.
create or replace function public.afat_seed_terminal_journey_closure()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.status in ('completed','disputed')
     and old.status is distinct from new.status then
    insert into public.afat_journey_closures(
      dispatch_assignment_id,booking_id,receipt_number,closed_by
    ) values (
      new.id,new.booking_id,
      'AFAT-'||upper(replace(new.id::text,'-','')),
      null
    )
    on conflict(dispatch_assignment_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.afat_seed_terminal_journey_closure() from public,anon,authenticated;

drop trigger if exists trg_afat_seed_terminal_journey_closure on public.dispatch_assignments;
create trigger trg_afat_seed_terminal_journey_closure
after update of status on public.dispatch_assignments
for each row execute function public.afat_seed_terminal_journey_closure();

-- A disputed journey was previously active and retains its captured samples.
-- Permit resolution to completed without weakening the same sample/accuracy/span
-- requirements. This function is still service-role-only.
create or replace function public.afat_journey_completion_readiness(p_assignment_id uuid)
returns jsonb
language sql stable security invoker set search_path=''
as $$
  with journey as (
    select id,started_at from public.afat_journeys
    where dispatch_assignment_id=p_assignment_id
      and status in ('active','disputed')
  ), samples as (
    select count(*)::integer sample_count,min(s.recorded_at) first_sample_at,max(s.recorded_at) last_sample_at
    from journey j join public.afat_journey_samples s on s.journey_id=j.id
    where s.source='browser_geolocation' and s.accuracy_m is not null and s.accuracy_m<=100
      and j.started_at is not null and s.recorded_at>=j.started_at
      and s.recorded_at between now()-interval '24 hours' and now()+interval '2 minutes'
  )
  select jsonb_build_object(
    'assignment_id',p_assignment_id,'sample_count',coalesce(sample_count,0),
    'minimum_samples',2,'minimum_span_seconds',30,
    'first_sample_at',first_sample_at,'last_sample_at',last_sample_at,
    'span_seconds',coalesce(extract(epoch from last_sample_at-first_sample_at)::integer,0),
    'ready',coalesce(sample_count,0)>=2 and last_sample_at-first_sample_at>=interval '30 seconds',
    'automatic_completion',false
  ) from samples;
$$;
revoke all on function public.afat_journey_completion_readiness(uuid) from public,anon,authenticated;
grant execute on function public.afat_journey_completion_readiness(uuid) to service_role;
