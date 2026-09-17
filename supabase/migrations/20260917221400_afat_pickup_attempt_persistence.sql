create or replace function public.afat_verify_pickup_code(
  p_assignment_id uuid,
  p_operator_id uuid,
  p_code_hash text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_challenge public.afat_pickup_challenges%rowtype;
  v_transition jsonb;
  v_attempts integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501', message='Service role required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception using errcode='22023', message='Stable idempotency key required'; end if;
  if p_code_hash is null or length(p_code_hash) <> 64 then raise exception using errcode='22023', message='Invalid pickup verification code'; end if;

  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002', message='Dispatch assignment not found'; end if;
  if v_assignment.operator_id is distinct from p_operator_id then raise exception using errcode='42501', message='Only the assigned operator may verify pickup'; end if;
  if v_assignment.status='pickup_verified' then return jsonb_build_object('assignment',to_jsonb(v_assignment),'pickup_verified',true,'already_verified',true); end if;
  if v_assignment.status<>'arrived' then raise exception using errcode='40001', message='Pickup verification is available only after operator arrival'; end if;

  select * into v_challenge from public.afat_pickup_challenges where dispatch_assignment_id=p_assignment_id for update;
  if not found then return jsonb_build_object('pickup_verified',false,'reason','challenge_missing'); end if;
  if v_challenge.verified_at is not null then return jsonb_build_object('pickup_verified',true,'already_verified',true,'assignment',to_jsonb(v_assignment)); end if;
  if v_challenge.expires_at<=now() then return jsonb_build_object('pickup_verified',false,'reason','expired'); end if;
  if v_challenge.attempts>=v_challenge.max_attempts then return jsonb_build_object('pickup_verified',false,'reason','locked','attempts_remaining',0); end if;

  if v_challenge.code_hash<>lower(p_code_hash) then
    update public.afat_pickup_challenges
       set attempts=attempts+1,updated_at=now()
     where dispatch_assignment_id=p_assignment_id
     returning attempts into v_attempts;
    return jsonb_build_object(
      'pickup_verified',false,
      'reason','code_mismatch',
      'attempts_remaining',greatest(v_challenge.max_attempts-v_attempts,0)
    );
  end if;

  update public.afat_pickup_challenges
     set verified_at=now(),verified_by=p_operator_id,updated_at=now()
   where dispatch_assignment_id=p_assignment_id;

  v_transition:=public.afat_transition_dispatch_journey(
    p_assignment_id,p_operator_id,'arrived','pickup_verified',p_idempotency_key,
    'Passenger pickup code verified',
    jsonb_build_object('method','passenger_code','challenge_verified',true)
  );
  return v_transition||jsonb_build_object('pickup_verified',true);
end;
$$;

revoke all on function public.afat_verify_pickup_code(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.afat_verify_pickup_code(uuid,uuid,text,text) to service_role;
