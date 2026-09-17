alter table public.afat_journey_closures
  add column if not exists state_version integer not null default 0,
  add column if not exists payment_verification text not null default 'unverified' check (payment_verification in ('unverified','cash_confirmed','provider_confirmed')),
  add column if not exists payment_confirmed_by uuid references public.profiles(id),
  add column if not exists payment_confirmed_at timestamptz;
revoke all on public.afat_journey_closures from anon, authenticated;
grant select,insert,update on public.afat_journey_closures to service_role;
create table public.afat_journey_closure_events (
  id uuid primary key default gen_random_uuid(),
  dispatch_assignment_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  patch jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(dispatch_assignment_id, idempotency_key)
);
alter table public.afat_journey_closure_events enable row level security;
revoke all on public.afat_journey_closure_events from anon, authenticated;
grant select,insert on public.afat_journey_closure_events to service_role;
create or replace function public.afat_update_journey_closure(
  p_assignment_id uuid, p_actor_profile_id uuid, p_expected_version integer,
  p_idempotency_key text, p_patch jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_closure public.afat_journey_closures%rowtype;
  v_event public.afat_journey_closure_events%rowtype;
  v_role text;
  v_passenger uuid;
  v_is_passenger boolean;
  v_is_operator boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501', message='Service role required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 or p_expected_version is null or p_expected_version < 0 then raise exception using errcode='22023', message='Valid version and idempotency key required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception using errcode='22023', message='Invalid closure update'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('payment_state','payment_reference','proof_reference','rating','dispute_reason','confirm_cash')) then raise exception using errcode='22023', message='Unsupported closure field'; end if;
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002', message='Dispatch assignment not found'; end if;
  select role into v_role from public.profiles where id=p_actor_profile_id;
  select passenger_id into v_passenger from public.bookings where id=v_assignment.booking_id;
  v_is_passenger := coalesce(v_passenger=p_actor_profile_id,false);
  v_is_operator := coalesce(v_assignment.operator_id=p_actor_profile_id,false);
  if not (v_is_passenger or v_is_operator or coalesce(v_assignment.dispatcher_id=p_actor_profile_id,false) or coalesce(v_role in ('admin','planner'),false)) then raise exception using errcode='42501', message='Only journey participants or dispatch staff may access closure'; end if;
  select * into v_event from public.afat_journey_closure_events where dispatch_assignment_id=p_assignment_id and idempotency_key=p_idempotency_key;
  if found then
    if v_event.actor_profile_id <> p_actor_profile_id or v_event.patch <> p_patch then raise exception using errcode='40001', message='Idempotency key already used for a different update'; end if;
    return v_event.result;
  end if;
  if v_assignment.status not in ('completed','disputed') then raise exception using errcode='40001', message='Complete the journey before saving its receipt'; end if;
  select * into v_closure from public.afat_journey_closures where dispatch_assignment_id=p_assignment_id;
  if coalesce(v_closure.state_version,0) <> p_expected_version then raise exception using errcode='40001', message='Receipt changed. Refresh before saving'; end if;
  if p_patch ? 'rating' then
    if not v_is_passenger then raise exception using errcode='42501', message='Only the passenger can rate this journey'; end if;
    if jsonb_typeof(p_patch->'rating') <> 'number' or (p_patch->>'rating') !~ '^[1-5]$' then raise exception using errcode='22023', message='Rating must be 1-5'; end if;
  end if;
  if p_patch ? 'dispute_reason' and not (v_is_passenger or v_is_operator) then raise exception using errcode='42501', message='Only journey participants may submit a dispute'; end if;
  if p_patch ? 'dispute_reason' and (jsonb_typeof(p_patch->'dispute_reason') <> 'string' or length(trim(p_patch->>'dispute_reason')) not between 4 and 1000) then raise exception using errcode='22023', message='A dispute reason of 4-1000 characters is required'; end if;
  if p_patch ? 'payment_state' and coalesce(p_patch->>'payment_state','') not in ('pending','cash_due','mobile_money_pending') then raise exception using errcode='22023', message='Client payment settlement is forbidden'; end if;
  if p_patch ? 'confirm_cash' and jsonb_typeof(p_patch->'confirm_cash') <> 'boolean' then raise exception using errcode='22023', message='Invalid cash confirmation'; end if;
  if (p_patch ? 'payment_reference' and (jsonb_typeof(p_patch->'payment_reference') <> 'string' or length(p_patch->>'payment_reference') > 1000)) or (p_patch ? 'proof_reference' and (jsonb_typeof(p_patch->'proof_reference') <> 'string' or length(p_patch->>'proof_reference') > 1000)) then raise exception using errcode='22023', message='Invalid payment reference'; end if;
  if coalesce(v_closure.payment_verification,'unverified') <> 'unverified' and (p_patch ?| array['payment_state','payment_reference','proof_reference','confirm_cash']) then raise exception using errcode='40001', message='Confirmed payment cannot be overwritten'; end if;
  if coalesce((p_patch->>'confirm_cash')::boolean,false) then
    if not v_is_operator or v_is_passenger then raise exception using errcode='42501', message='Only the receiving operator may confirm cash'; end if;
    if coalesce(v_closure.payment_state,'pending') <> 'cash_due' then raise exception using errcode='40001', message='Record cash due before confirming receipt'; end if;
    if p_patch ?| array['payment_state','payment_reference','proof_reference'] then raise exception using errcode='22023', message='Confirm cash separately from payment edits'; end if;
  end if;
  if v_closure.id is null then
    insert into public.afat_journey_closures(dispatch_assignment_id,booking_id,receipt_number,closed_by)
    values(p_assignment_id,v_assignment.booking_id,'AFAT-'||upper(replace(p_assignment_id::text,'-','')),p_actor_profile_id) returning * into v_closure;
  end if;
  update public.afat_journey_closures set
    payment_state=case when coalesce((p_patch->>'confirm_cash')::boolean,false) then 'paid' else coalesce(p_patch->>'payment_state',payment_state) end,
    payment_verification=case when coalesce((p_patch->>'confirm_cash')::boolean,false) then 'cash_confirmed' else payment_verification end,
    payment_confirmed_by=case when coalesce((p_patch->>'confirm_cash')::boolean,false) then p_actor_profile_id else payment_confirmed_by end,
    payment_confirmed_at=case when coalesce((p_patch->>'confirm_cash')::boolean,false) then now() else payment_confirmed_at end,
    payment_reference=case when p_patch ? 'payment_reference' then nullif(trim(p_patch->>'payment_reference'),'') else payment_reference end,
    proof_reference=case when p_patch ? 'proof_reference' then nullif(trim(p_patch->>'proof_reference'),'') else proof_reference end,
    rating=case when p_patch ? 'rating' then (p_patch->>'rating')::smallint else rating end,
    dispute_reason=case when p_patch ? 'dispute_reason' then trim(p_patch->>'dispute_reason') else dispute_reason end,
    state_version=state_version+1,updated_at=now()
  where id=v_closure.id returning * into v_closure;
  insert into public.afat_journey_closure_events(dispatch_assignment_id,actor_profile_id,idempotency_key,patch,result)
  values(p_assignment_id,p_actor_profile_id,p_idempotency_key,p_patch,to_jsonb(v_closure));
  return to_jsonb(v_closure);
end; $$;
revoke all on function public.afat_update_journey_closure(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.afat_update_journey_closure(uuid,uuid,integer,text,jsonb) to service_role;
