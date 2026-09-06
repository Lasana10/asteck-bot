alter table public.passage_outcomes
  add column if not exists idempotency_key text;

create unique index if not exists passage_outcomes_idempotency_uidx
  on public.passage_outcomes (passage_intent_id, reporter_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.afat_record_passage_outcome(
  p_passage_intent_id uuid,
  p_reporter_id uuid,
  p_outcome_type text,
  p_responsibility text,
  p_notes text,
  p_evidence jsonb,
  p_expected_status text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passage public.passage_intents%rowtype;
  v_existing public.passage_outcomes%rowtype;
  v_outcome public.passage_outcomes%rowtype;
  v_successful boolean;
  v_next_status text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'idempotency_key is required and must contain at least 8 characters';
  end if;

  if p_outcome_type not in (
    'successful_pickup',
    'road_inaccessible',
    'meeting_point_incorrect',
    'passenger_no_show',
    'driver_cancelled',
    'passenger_cancelled'
  ) then
    raise exception using errcode = '22023', message = 'unsupported passage outcome';
  end if;

  select * into v_passage
  from public.passage_intents
  where id = p_passage_intent_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'passage intent not found';
  end if;

  select * into v_existing
  from public.passage_outcomes
  where passage_intent_id = p_passage_intent_id
    and reporter_id is not distinct from p_reporter_id
    and idempotency_key = trim(p_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', to_jsonb(v_existing),
      'passage_status', v_passage.status,
      'recovery_required', v_passage.status = 'recovery',
      'replayed', true
    );
  end if;

  if v_passage.status in ('completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'terminal passage cannot receive a new pickup outcome';
  end if;

  if p_expected_status is null or v_passage.status is distinct from p_expected_status then
    raise exception using errcode = '40001', message = 'passage status changed before outcome commit';
  end if;

  v_successful := p_outcome_type = 'successful_pickup';
  v_next_status := case when v_successful then 'meeting_confirmed' else 'recovery' end;

  insert into public.passage_outcomes (
    passage_intent_id,
    reporter_id,
    outcome_type,
    responsibility,
    notes,
    evidence,
    idempotency_key
  ) values (
    p_passage_intent_id,
    p_reporter_id,
    p_outcome_type,
    left(coalesce(nullif(trim(p_responsibility), ''), 'unclassified'), 100),
    case when p_notes is null then null else left(p_notes, 1000) end,
    coalesce(p_evidence, '{}'::jsonb),
    trim(p_idempotency_key)
  )
  returning * into v_outcome;

  update public.passage_intents
  set status = v_next_status,
      disruption_reason = case when v_successful then null else p_outcome_type end,
      updated_at = now()
  where id = p_passage_intent_id;

  if v_passage.meeting_point_id is not null then
    update public.afat_meeting_points
    set successful_pickups = successful_pickups + case when v_successful then 1 else 0 end,
        failed_pickups = failed_pickups + case when v_successful then 0 else 1 end,
        status = case when p_outcome_type = 'meeting_point_incorrect' then 'review' else status end,
        updated_at = now()
    where id = v_passage.meeting_point_id;
  end if;

  if v_passage.selected_place_id is not null then
    update public.afat_places
    set successful_pickups = successful_pickups + case when v_successful then 1 else 0 end,
        failed_pickups = failed_pickups + case when v_successful then 0 else 1 end,
        status = case when p_outcome_type = 'meeting_point_incorrect' then 'disputed' else status end,
        updated_at = now()
    where id = v_passage.selected_place_id;
  end if;

  return jsonb_build_object(
    'outcome', to_jsonb(v_outcome),
    'passage_status', v_next_status,
    'recovery_required', not v_successful,
    'replayed', false
  );
end;
$$;

revoke all on function public.afat_record_passage_outcome(uuid, uuid, text, text, text, jsonb, text, text) from public;
revoke all on function public.afat_record_passage_outcome(uuid, uuid, text, text, text, jsonb, text, text) from anon;
revoke all on function public.afat_record_passage_outcome(uuid, uuid, text, text, text, jsonb, text, text) from authenticated;
grant execute on function public.afat_record_passage_outcome(uuid, uuid, text, text, text, jsonb, text, text) to service_role;
