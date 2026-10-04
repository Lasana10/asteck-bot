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
revoke all on function public.afat_confirm_cash_collection(uuid,text) from public,anon,authenticated;
grant execute on function public.afat_confirm_cash_collection(uuid,text) to service_role;
