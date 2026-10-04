create or replace function public.afat_request_operator_payout(p_amount_xaf integer,p_provider text,p_destination_ref text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_wallet public.operator_wallets%rowtype; v_id uuid; v_ledger uuid; v_reserved integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.afat_assert_active_profile(v_uid);
  if p_amount_xaf is null or p_amount_xaf<=0 then raise exception 'PAYOUT_AMOUNT_INVALID'; end if;
  if nullif(trim(p_provider),'') is null or nullif(trim(p_destination_ref),'') is null then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
  select * into v_wallet from public.operator_wallets where operator_id=v_uid for update;
  if not found then raise exception 'OPERATOR_WALLET_NOT_FOUND'; end if;
  select coalesce(sum(net_amount),0) into v_reserved from public.wallet_ledger where operator_id=v_uid and entry_type='withdrawal' and direction='debit' and status='requested';
  if v_wallet.balance_xaf-v_reserved < p_amount_xaf then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
  insert into public.wallet_ledger(operator_id,entry_type,direction,gross_amount,commission_amount,net_amount,status,reference)
  values(v_uid,'withdrawal','debit',p_amount_xaf,0,p_amount_xaf,'requested','PAYOUT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))) returning id into v_ledger;
  insert into public.operator_payout_requests(operator_id,amount_xaf,provider,destination_ref,status,ledger_entry_id,evidence)
  values(v_uid,p_amount_xaf,trim(p_provider),trim(p_destination_ref),'requested',v_ledger,jsonb_build_object('automatic_truth',false)) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','requested','amount_xaf',p_amount_xaf,'available_after_reserve_xaf',v_wallet.balance_xaf-v_reserved-p_amount_xaf);
end $$;
revoke all on function public.afat_request_operator_payout(integer,text,text) from public,anon;
grant execute on function public.afat_request_operator_payout(integer,text,text) to authenticated;

create or replace function public.afat_transition_operator_payout(p_payout_id uuid,p_status text,p_external_id text default null,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_row public.operator_payout_requests%rowtype; v_wallet public.operator_wallets%rowtype;
begin
  if p_status not in ('approved','processing','paid','failed','cancelled') then raise exception 'PAYOUT_STATUS_INVALID'; end if;
  select * into v_row from public.operator_payout_requests where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_row.status in ('paid','failed','cancelled') then return jsonb_build_object('id',v_row.id,'status',v_row.status,'idempotent',true); end if;
  if p_status='paid' then
    select * into v_wallet from public.operator_wallets where operator_id=v_row.operator_id for update;
    if not found or v_wallet.balance_xaf < v_row.amount_xaf then raise exception 'PAYOUT_BALANCE_CHANGED'; end if;
    update public.operator_wallets set balance_xaf=balance_xaf-v_row.amount_xaf,updated_at=now() where operator_id=v_row.operator_id;
    update public.wallet_ledger set status='posted',reference=coalesce(nullif(trim(p_external_id),''),reference),updated_at=now() where id=v_row.ledger_entry_id;
  elsif p_status in ('failed','cancelled') then
    update public.wallet_ledger set status=case when p_status='failed' then 'failed' else 'reversed' end,updated_at=now() where id=v_row.ledger_entry_id;
  end if;
  update public.operator_payout_requests set status=p_status,external_id=coalesce(nullif(trim(p_external_id),''),external_id),failure_reason=case when p_status='failed' then nullif(trim(p_failure_reason),'') else failure_reason end,updated_at=now(),completed_at=case when p_status in ('paid','failed','cancelled') then now() else completed_at end where id=v_row.id;
  return jsonb_build_object('id',v_row.id,'status',p_status,'amount_xaf',v_row.amount_xaf);
end $$;
revoke all on function public.afat_transition_operator_payout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.afat_transition_operator_payout(uuid,text,text,text) to service_role;
