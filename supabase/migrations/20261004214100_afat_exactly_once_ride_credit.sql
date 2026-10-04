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
revoke all on function public.afat_post_ride_credit(uuid,text) from public,anon,authenticated;
grant execute on function public.afat_post_ride_credit(uuid,text) to service_role;

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
  return v_booking;
end $$;
