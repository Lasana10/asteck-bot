create or replace function public.afat_seed_provider_payment_on_closure()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_payment_status text; v_transaction_id text; v_updated_at timestamptz;
begin
  if new.booking_id is null then return new; end if;
  select b.payment_status, b.transaction_id, b.updated_at into v_payment_status, v_transaction_id, v_updated_at
  from public.bookings b where b.id = new.booking_id;
  if v_payment_status in ('paid','paid_momo') and nullif(v_transaction_id,'') is not null then
    new.payment_state := 'paid';
    new.payment_verification := 'provider_confirmed';
    new.payment_reference := v_transaction_id;
    new.payment_confirmed_at := coalesce(v_updated_at, now());
    new.payment_confirmed_by := null;
  end if;
  return new;
end; $$;
drop trigger if exists afat_closure_seed_provider_payment on public.afat_journey_closures;
create trigger afat_closure_seed_provider_payment before insert on public.afat_journey_closures for each row execute function public.afat_seed_provider_payment_on_closure();

create or replace function public.afat_sync_provider_payment_to_closure()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.payment_status in ('paid','paid_momo') and nullif(new.transaction_id,'') is not null
     and (old.payment_status is distinct from new.payment_status or old.transaction_id is distinct from new.transaction_id) then
    update public.afat_journey_closures
       set payment_state='paid', payment_verification='provider_confirmed', payment_reference=new.transaction_id,
           payment_confirmed_by=null, payment_confirmed_at=coalesce(new.updated_at,now()),
           state_version=state_version+1, updated_at=now()
     where booking_id=new.id and payment_verification <> 'provider_confirmed';
  end if;
  return new;
end; $$;
drop trigger if exists afat_booking_provider_payment_sync on public.bookings;
create trigger afat_booking_provider_payment_sync after update of payment_status, transaction_id on public.bookings for each row execute function public.afat_sync_provider_payment_to_closure();
revoke all on function public.afat_seed_provider_payment_on_closure() from public, anon, authenticated;
revoke all on function public.afat_sync_provider_payment_to_closure() from public, anon, authenticated;
grant execute on function public.afat_seed_provider_payment_on_closure() to service_role;
grant execute on function public.afat_sync_provider_payment_to_closure() to service_role;
