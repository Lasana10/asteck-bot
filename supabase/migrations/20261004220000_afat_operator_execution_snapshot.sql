create or replace function public.afat_operator_execution_snapshot()
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_balance integer:=0; v_reserved integer:=0; v_vehicle jsonb; v_payouts jsonb; v_ledger jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.afat_assert_active_profile(v_uid);
  select coalesce(balance_xaf,0) into v_balance from public.operator_wallets where operator_id=v_uid;
  select coalesce(sum(net_amount),0) into v_reserved from public.wallet_ledger where operator_id=v_uid and entry_type='withdrawal' and direction='debit' and status='requested';
  select to_jsonb(v) - 'operator_id' - 'current_location' - 'current_lat' - 'current_lng' into v_vehicle
  from (
    select id,plate_number,type,capacity,is_available,current_heading,current_speed,last_ping_at,rating,total_rides,clearance_status,updated_at
    from public.vehicles where operator_id=v_uid order by updated_at desc nulls last,created_at desc limit 1
  ) v;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount_xaf',p.amount_xaf,'provider',p.provider,'destination_ref',p.destination_ref,'status',p.status,'external_id',p.external_id,'failure_reason',p.failure_reason,'requested_at',p.requested_at,'updated_at',p.updated_at,'completed_at',p.completed_at) order by p.requested_at desc),'[]'::jsonb)
  into v_payouts from (select * from public.operator_payout_requests where operator_id=v_uid order by requested_at desc limit 12) p;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'booking_id',l.booking_id,'entry_type',l.entry_type,'direction',l.direction,'gross_amount',l.gross_amount,'commission_amount',l.commission_amount,'net_amount',l.net_amount,'status',l.status,'reference',l.reference,'created_at',l.created_at) order by l.created_at desc),'[]'::jsonb)
  into v_ledger from (select * from public.wallet_ledger where operator_id=v_uid order by created_at desc limit 25) l;
  return jsonb_build_object(
    'operator_id',v_uid,'vehicle',v_vehicle,
    'wallet',jsonb_build_object('balance_xaf',v_balance,'reserved_xaf',v_reserved,'available_xaf',greatest(0,v_balance-v_reserved)),
    'payouts',v_payouts,'ledger',v_ledger,'generated_at',now()
  );
end $$;
revoke all on function public.afat_operator_execution_snapshot() from public,anon;
grant execute on function public.afat_operator_execution_snapshot() to authenticated;
