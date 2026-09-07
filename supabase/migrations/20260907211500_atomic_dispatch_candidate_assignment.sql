create or replace function public.afat_assign_dispatch_candidate(
  p_assignment_id uuid,
  p_actor_profile_id uuid,
  p_operator_id uuid,
  p_vehicle_id uuid,
  p_expected_status text,
  p_next_status text,
  p_dispatch_score numeric,
  p_decision_factors jsonb default '{}'::jsonb,
  p_atlas_context jsonb default '{}'::jsonb,
  p_evidence_context jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_reason text default null
) returns public.dispatch_assignments
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.dispatch_assignments%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_operator public.profiles%rowtype;
  v_existing public.dispatch_assignment_events%rowtype;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode='22023', message='stable dispatch idempotency key required';
  end if;
  if p_next_status not in ('offered','assigned') then
    raise exception using errcode='22023', message='candidate assignment must advance to offered or assigned';
  end if;
  if p_dispatch_score is null or p_dispatch_score < 0 or p_dispatch_score > 100 then
    raise exception using errcode='22023', message='dispatch score must be between 0 and 100';
  end if;

  select * into v_row
  from public.dispatch_assignments
  where id=p_assignment_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='dispatch assignment not found';
  end if;

  select * into v_existing
  from public.dispatch_assignment_events
  where assignment_id=p_assignment_id and idempotency_key=p_idempotency_key;
  if found then
    return v_row;
  end if;

  if p_expected_status is null or v_row.status <> p_expected_status then
    raise exception using errcode='40001', message='stale dispatch state';
  end if;
  if v_row.status not in ('queued','reassigned') then
    raise exception using errcode='22023', message='dispatch is not eligible for candidate assignment';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id=p_vehicle_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='dispatch vehicle not found';
  end if;
  if v_vehicle.operator_id is distinct from p_operator_id then
    raise exception using errcode='22023', message='vehicle does not belong to selected operator';
  end if;
  if coalesce(v_vehicle.is_available,false) is not true then
    raise exception using errcode='22023', message='selected vehicle is not available';
  end if;

  select * into v_operator
  from public.profiles
  where id=p_operator_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='dispatch operator not found';
  end if;
  if lower(coalesce(v_operator.role,'')) <> 'operator'
     or coalesce(v_operator.is_active,false) is not true
     or upper(coalesce(v_operator.operator_application_status,'')) <> 'APPROVED'
     or lower(coalesce(v_operator.verification_status,'')) <> 'verified' then
    raise exception using errcode='22023', message='selected operator is not eligible for dispatch';
  end if;
  if lower(coalesce(v_operator.risk_status,'')) in ('blocked','suspended','high') then
    raise exception using errcode='22023', message='selected operator is risk-blocked';
  end if;
  if v_operator.max_daily_hours is not null
     and coalesce(v_operator.fatigue_hours_today,0) >= v_operator.max_daily_hours then
    raise exception using errcode='22023', message='selected operator reached fatigue limit';
  end if;

  update public.dispatch_assignments
  set operator_id=p_operator_id,
      vehicle_id=p_vehicle_id,
      dispatcher_id=p_actor_profile_id,
      status=p_next_status,
      dispatch_score=round(p_dispatch_score::numeric,2),
      decision_factors=coalesce(p_decision_factors,'{}'::jsonb),
      atlas_context=coalesce(p_atlas_context,'{}'::jsonb),
      evidence_context=coalesce(p_evidence_context,'{}'::jsonb),
      state_version=state_version+1,
      offered_at=case when p_next_status='offered' and offered_at is null then now() else offered_at end,
      accepted_at=case when p_next_status='assigned' and accepted_at is null then now() else accepted_at end,
      failure_reason=null,
      updated_at=now()
  where id=p_assignment_id
  returning * into v_row;

  insert into public.dispatch_assignment_events(
    assignment_id,actor_profile_id,event_type,from_status,to_status,reason,evidence,idempotency_key
  ) values (
    p_assignment_id,
    p_actor_profile_id,
    'dispatch.candidate_assigned',
    p_expected_status,
    p_next_status,
    nullif(trim(coalesce(p_reason,'')),''),
    jsonb_build_object(
      'operator_id',p_operator_id,
      'vehicle_id',p_vehicle_id,
      'dispatch_score',round(p_dispatch_score::numeric,2),
      'decision_factors',coalesce(p_decision_factors,'{}'::jsonb),
      'atlas_context',coalesce(p_atlas_context,'{}'::jsonb),
      'evidence_context',coalesce(p_evidence_context,'{}'::jsonb)
    ),
    p_idempotency_key
  );

  return v_row;
end;
$$;

revoke all on function public.afat_assign_dispatch_candidate(uuid,uuid,uuid,uuid,text,text,numeric,jsonb,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.afat_assign_dispatch_candidate(uuid,uuid,uuid,uuid,text,text,numeric,jsonb,jsonb,jsonb,text,text) to service_role;
