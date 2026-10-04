alter table public.service_requests add column if not exists city_key text references public.afat_city_profiles(city_key) on update cascade on delete set null;
alter table public.dispatch_assignments add column if not exists city_key text references public.afat_city_profiles(city_key) on update cascade on delete set null;
alter table public.bookings add column if not exists city_key text references public.afat_city_profiles(city_key) on update cascade on delete set null;
alter table public.wallet_ledger add column if not exists city_key text references public.afat_city_profiles(city_key) on update cascade on delete set null;
alter table public.vehicles add column if not exists city_key text references public.afat_city_profiles(city_key) on update cascade on delete set null;
create index if not exists service_requests_city_status_idx on public.service_requests(city_key,status,created_at desc);
create index if not exists dispatch_assignments_city_status_idx on public.dispatch_assignments(city_key,status,created_at desc);
create index if not exists bookings_city_status_idx on public.bookings(city_key,status,created_at desc);
create index if not exists wallet_ledger_city_time_idx on public.wallet_ledger(city_key,created_at desc);
create index if not exists vehicles_city_availability_idx on public.vehicles(city_key,is_available,last_ping_at desc);

create or replace function public.afat_apply_service_request_city()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_candidate text;
begin
  if new.city_key is null then
    v_candidate:=nullif(trim(coalesce(new.metadata->>'city_key','')),'');
    if v_candidate is not null and exists(select 1 from public.afat_city_profiles c where c.city_key=v_candidate and c.status='active') then new.city_key:=v_candidate; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_afat_service_request_city on public.service_requests;
create trigger trg_afat_service_request_city before insert or update of metadata,city_key on public.service_requests for each row execute function public.afat_apply_service_request_city();

create or replace function public.afat_apply_dispatch_city()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_candidate text;
begin
  if new.city_key is null and new.service_request_id is not null then select city_key into new.city_key from public.service_requests where id=new.service_request_id; end if;
  if new.city_key is null and new.booking_id is not null then select city_key into new.city_key from public.bookings where id=new.booking_id; end if;
  if new.city_key is null then
    v_candidate:=coalesce(nullif(trim(new.evidence_context->>'city_key'),''),nullif(trim(new.atlas_context->>'city_key'),''));
    if v_candidate is not null and exists(select 1 from public.afat_city_profiles c where c.city_key=v_candidate and c.status='active') then new.city_key:=v_candidate; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_afat_dispatch_city on public.dispatch_assignments;
create trigger trg_afat_dispatch_city before insert or update of service_request_id,booking_id,evidence_context,atlas_context,city_key on public.dispatch_assignments for each row execute function public.afat_apply_dispatch_city();

create or replace function public.afat_propagate_dispatch_city()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
begin
  if new.city_key is not null then
    if new.booking_id is not null then update public.bookings set city_key=coalesce(city_key,new.city_key) where id=new.booking_id; end if;
    if new.service_request_id is not null then update public.service_requests set city_key=coalesce(city_key,new.city_key) where id=new.service_request_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_afat_dispatch_city_propagate on public.dispatch_assignments;
create trigger trg_afat_dispatch_city_propagate after insert or update of city_key on public.dispatch_assignments for each row execute function public.afat_propagate_dispatch_city();

create or replace function public.afat_apply_wallet_city()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
begin
  if new.city_key is null and new.booking_id is not null then select city_key into new.city_key from public.bookings where id=new.booking_id; end if;
  return new;
end $$;
drop trigger if exists trg_afat_wallet_city on public.wallet_ledger;
create trigger trg_afat_wallet_city before insert or update of booking_id,city_key on public.wallet_ledger for each row execute function public.afat_apply_wallet_city();

create or replace function public.afat_apply_vehicle_city_from_profile()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_pref text; v_candidate text;
begin
  if new.city_key is null then
    select preferred_city into v_pref from public.profiles where id=new.operator_id;
    if nullif(trim(v_pref),'') is not null then
      v_candidate:=lower(trim(v_pref));
      if v_candidate not like '%-%' then v_candidate:='cm-'||replace(v_candidate,' ','-'); end if;
      if exists(select 1 from public.afat_city_profiles c where c.city_key=v_candidate and c.status='active') then new.city_key:=v_candidate; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_afat_vehicle_city on public.vehicles;
create trigger trg_afat_vehicle_city before insert or update of operator_id,city_key on public.vehicles for each row execute function public.afat_apply_vehicle_city_from_profile();

update public.vehicles v set city_key=('cm-'||replace(lower(trim(p.preferred_city)),' ','-')) from public.profiles p where p.id=v.operator_id and v.city_key is null and nullif(trim(p.preferred_city),'') is not null and exists(select 1 from public.afat_city_profiles c where c.city_key=('cm-'||replace(lower(trim(p.preferred_city)),' ','-')) and c.status='active');
