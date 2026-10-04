create unique index if not exists wallet_ledger_one_ride_credit_per_booking_uidx
  on public.wallet_ledger(booking_id)
  where booking_id is not null and entry_type='ride_credit' and direction='credit';

create table if not exists public.operator_payout_requests (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  amount_xaf integer not null check (amount_xaf > 0),
  provider text not null,
  destination_ref text not null,
  status text not null default 'requested' check (status in ('requested','approved','processing','paid','failed','cancelled')),
  ledger_entry_id uuid references public.wallet_ledger(id) on delete set null,
  external_id text,
  failure_reason text,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists operator_payout_requests_operator_status_idx on public.operator_payout_requests(operator_id,status,requested_at desc);
create unique index if not exists operator_payout_requests_external_uidx on public.operator_payout_requests(provider,external_id) where external_id is not null;

alter table public.operator_payout_requests enable row level security;
revoke insert,update,delete on public.operator_payout_requests from anon,authenticated;
grant select on public.operator_payout_requests to authenticated;

drop policy if exists operator_payout_owner_read on public.operator_payout_requests;
create policy operator_payout_owner_read on public.operator_payout_requests for select to authenticated using (
  operator_id=auth.uid() or public.afat_has_permission('system.configure')
);

create or replace function public.afat_post_ride_credit(p_booking_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_booking public.bookings%rowtype; v_commission integer; v_net integer; v_ledger_id uuid;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.operator_id is null then raise exception 'BOOKING_OPERATOR_REQUIRED'; end if;
  if coalesce(v_booking.price_paid,0)<=0 then raise exception 'BOOKING_AMOUNT_REQUIRED'; end if;
  v_commission:=round(v_booking.price_paid*0.08);
  v_net:=v_booking.price_paid-v_commission;
  insert into public.wallet_ledger(operator_id,booking_id,entry_type,direction,gross_amount,commission_amount,net_amount,status,reference)
  values(v_booking.operator_id,v_booking.id,'ride_credit','credit',v_booking.price_paid,v_commission,v_net,'posted',p_reference)
  on conflict(booking_id) where booking_id is not null and entry_type='ride_credit' and direction='credit' do nothing
  returning id into v_ledger_id;
  if v_ledger_id is not null then
    insert into public.operator_wallets(operator_id,balance_xaf) values(v_booking.operator_id,v_net)
    on conflict(operator_id) do update set balance_xaf=public.operator_wallets.balance_xaf+excluded.balance_xaf,updated_at=now();
  end if;
  return jsonb_build_object('booking_id',v_booking.id,'ledger_entry_id',v_ledger_id,'credited_now',v_ledger_id is not null,'gross_xaf',v_booking.price_paid,'commission_xaf',v_commission,'net_xaf',v_net);
end $$;

create or replace function public.afat_confirm_mobile_payment(p_booking_id uuid,p_transaction_id text,p_provider text default 'pawapay')
returns public.bookings language plpgsql set search_path='' as $$
declare v_booking public.bookings;
begin
  if nullif(trim(p_transaction_id),'') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND' using errcode='P0001'; end if;
  if v_booking.payment_status not in ('collection_pending','paid','paid_momo') then raise exception 'BOOKING_PAYMENT_STATE_INVALID' using errcode='P0001'; end if;
  if v_booking.payment_status='collection_pending' then
    update public.bookings set status='confirmed',payment_status='paid_momo',transaction_id=p_transaction_id,updated_at=now() where id=p_booking_id returning * into v_booking;
  elsif v_booking.transaction_id is distinct from p_transaction_id then
    raise exception 'PAYMENT_REFERENCE_MISMATCH';
  end if;
  perform public.afat_post_ride_credit(v_booking.id,p_transaction_id);
  insert into public.payment_events(booking_id,provider,external_id,event_type,event_status,amount_xaf,metadata)
  values(v_booking.id,p_provider,p_transaction_id,'provider_confirmed','PAID',v_booking.price_paid,jsonb_build_object('automatic_truth',false))
  on conflict(provider,external_id) where external_id is not null do nothing;
  insert into public.trip_events(booking_id,event_type,metadata)
  select v_booking.id,'payment_confirmed',jsonb_build_object('provider',p_provider,'transaction_id',p_transaction_id)
  where not exists(select 1 from public.trip_events te where te.booking_id=v_booking.id and te.event_type='payment_confirmed' and te.metadata->>'transaction_id'=p_transaction_id);
  return v_booking;
end $$;

create or replace function public.afat_confirm_cash_collection(p_booking_id uuid,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_booking public.bookings%rowtype; v_ref text; v_credit jsonb;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.payment_status not in ('cash_due','paid_cash') then raise exception 'BOOKING_PAYMENT_STATE_INVALID'; end if;
  if v_booking.status not in ('boarded','in_progress','completed') then raise exception 'CASH_COLLECTION_NOT_YET_DUE'; end if;
  v_ref:=coalesce(nullif(trim(p_reference),''),v_booking.transaction_id,'CASH-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)));
  if v_booking.payment_status='cash_due' then
    update public.bookings set payment_status='paid_cash',transaction_id=v_ref,updated_at=now() where id=v_booking.id returning * into v_booking;
  end if;
  v_credit:=public.afat_post_ride_credit(v_booking.id,v_ref);
  insert into public.payment_events(booking_id,provider,external_id,event_type,event_status,amount_xaf,metadata)
  values(v_booking.id,'cash',v_ref,'cash_collected','PAID',v_booking.price_paid,jsonb_build_object('automatic_truth',false))
  on conflict(provider,external_id) where external_id is not null do nothing;
  return jsonb_build_object('booking_id',v_booking.id,'payment_status',v_booking.payment_status,'reference',v_ref,'credit',v_credit);
end $$;

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

revoke all on function public.afat_post_ride_credit(uuid,text) from public,anon,authenticated;
revoke all on function public.afat_confirm_cash_collection(uuid,text) from public,anon,authenticated;
revoke all on function public.afat_transition_operator_payout(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.afat_request_operator_payout(integer,text,text) from public,anon;
grant execute on function public.afat_post_ride_credit(uuid,text) to service_role;
grant execute on function public.afat_confirm_cash_collection(uuid,text) to service_role;
grant execute on function public.afat_transition_operator_payout(uuid,text,text,text) to service_role;
grant execute on function public.afat_request_operator_payout(integer,text,text) to authenticated;
