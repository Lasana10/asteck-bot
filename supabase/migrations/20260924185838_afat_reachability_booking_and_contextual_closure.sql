-- AFAT reachability booking and contextual closure.
-- Production-aligned with migration 20260924185838.

alter table public.passage_intents
  add column if not exists access_point_id uuid references public.afat_access_points(id) on delete set null;
create index if not exists passage_intents_access_point_idx on public.passage_intents(access_point_id) where access_point_id is not null;

create or replace function public.afat_contextual_confirmation_for_dispatch(p_dispatch_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_row public.afat_contextual_confirmations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select c.* into v_row
  from public.afat_contextual_confirmations c
  where c.dispatch_id=p_dispatch_id
    and c.status='open'
    and c.expires_at>now()
    and (c.passenger_id=v_uid or c.operator_id=v_uid)
  order by c.information_value desc,c.created_at desc
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id',v_row.id,'prompt_type',v_row.prompt_type,'question',v_row.question,
    'answer_options',v_row.answer_options,'information_value',v_row.information_value,'expires_at',v_row.expires_at
  );
end; $$;

create or replace function public.afat_answer_contextual_confirmation(p_confirmation_id uuid,p_answer text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_row public.afat_contextual_confirmations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_answer not in ('yes','no','not_sure','better_point') then raise exception 'Unsupported answer'; end if;
  select * into v_row from public.afat_contextual_confirmations where id=p_confirmation_id for update;
  if not found then raise exception 'Confirmation not found'; end if;
  if v_row.status<>'open' or v_row.expires_at<=now() then raise exception 'Confirmation is no longer open'; end if;
  if v_row.passenger_id<>v_uid and coalesce(v_row.operator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>v_uid then
    raise exception 'Confirmation access denied';
  end if;
  update public.afat_contextual_confirmations
  set status='answered',answer=jsonb_build_object('value',p_answer,'automatic_truth',false),
      answered_by=v_uid,answered_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('answer_role','participant_observation','requires_independent_corroboration',true)
  where id=p_confirmation_id;
  return jsonb_build_object('id',p_confirmation_id,'status','answered','answer',p_answer,'map_truth_changed',false,'requires_independent_corroboration',true);
end; $$;

create or replace function public.afat_queue_contextual_confirmation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_passage public.passage_intents%rowtype; v_question text; v_prompt_type text; v_info numeric; v_fingerprint text;
begin
  if not (
    new.status in ('pickup_verified','in_journey','completed')
    or (new.pickup_verified_at is not null and old.pickup_verified_at is null)
  ) then return new; end if;

  select * into v_passage from public.passage_intents
  where booking_id=new.booking_id order by created_at desc limit 1;
  if not found then return new; end if;

  if v_passage.access_point_id is not null and v_passage.meeting_point_id is null then
    select 'Did this entrance or access point work for your trip?','access_worked',
      greatest(50,least(95,100-coalesce(a.confidence,35)))
    into v_question,v_prompt_type,v_info from public.afat_access_points a where a.id=v_passage.access_point_id;
  elsif v_passage.meeting_point_id is not null then
    select 'Was this the right place to meet?','meeting_point_correct',
      greatest(50,least(95,100-coalesce(m.confidence,35)+least(20,coalesce(m.failed_pickups,0)*4)))
    into v_question,v_prompt_type,v_info from public.afat_meeting_points m where m.id=v_passage.meeting_point_id;
  else
    select 'Did AFAT send you to the correct destination?','destination_correct',
      greatest(50,least(95,100-coalesce(p.base_confidence,35)))
    into v_question,v_prompt_type,v_info from public.afat_places p where p.id=v_passage.selected_place_id;
  end if;

  if v_prompt_type is null then return new; end if;
  v_fingerprint:=md5('contextual:'||new.id::text||':'||v_prompt_type);
  insert into public.afat_contextual_confirmations(
    dispatch_id,booking_id,passenger_id,operator_id,place_id,meeting_point_id,access_point_id,
    prompt_type,question,answer_options,information_value,status,expires_at,evidence,fingerprint
  ) values(
    new.id,new.booking_id,v_passage.passenger_id,new.operator_id,v_passage.selected_place_id,
    v_passage.meeting_point_id,v_passage.access_point_id,v_prompt_type,v_question,
    '["yes","no","not_sure","better_point"]'::jsonb,coalesce(v_info,60),'open',now()+interval '7 days',
    jsonb_build_object('source','dispatch_context','dispatch_status',new.status,'passage_intent_id',v_passage.id,'automatic_truth',false,'purpose','high_information_value_confirmation'),
    v_fingerprint
  ) on conflict(fingerprint) do nothing;
  return new;
end; $$;

drop trigger if exists afat_dispatch_contextual_confirmation on public.dispatch_assignments;
create trigger afat_dispatch_contextual_confirmation
after update of status,pickup_verified_at on public.dispatch_assignments
for each row execute function public.afat_queue_contextual_confirmation();

revoke all on function public.afat_contextual_confirmation_for_dispatch(uuid) from public,anon;
grant execute on function public.afat_contextual_confirmation_for_dispatch(uuid) to authenticated;
revoke all on function public.afat_answer_contextual_confirmation(uuid,text) from public,anon;
grant execute on function public.afat_answer_contextual_confirmation(uuid,text) to authenticated;
revoke all on function public.afat_queue_contextual_confirmation() from public,anon,authenticated;

-- The atomic passage dispatcher was replaced in production in this migration so
-- the chosen access point can be the authoritative drop target when no active
-- meeting point exists. Its service-role-only definition is maintained in
-- production and exercised by the API contract tests.
