-- Real cash handover requires independent passenger AND verified operator attestations.
-- The operator holds the physical cash; AFAT does NOT receive, settle or credit it.
create table if not exists public.afat_cash_handovers(
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 passenger_id uuid not null references public.profiles(id),
 operator_id uuid not null references public.profiles(id),
 amount_xaf integer not null check(amount_xaf>0),
 passenger_confirmed_at timestamptz,
 operator_confirmed_at timestamptz,
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint afat_cash_handover_both_required
   check(confirmed_at is null or (passenger_confirmed_at is not null and operator_confirmed_at is not null))
);
alter table public.afat_cash_handovers enable row level security;
revoke all on public.afat_cash_handovers from public,anon,authenticated;
grant select,insert,update on public.afat_cash_handovers to service_role;

create or replace function public.afat_attest_cash_handover(
 p_booking_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $afat$
declare
 v_booking public.bookings%rowtype;
 v_cash public.afat_cash_handovers%rowtype;
 v_changed boolean:=false;
 v_finished boolean:=false;
begin
 if p_booking_id is null or p_actor_id is null then
   raise exception 'Booking and verified actor required' using errcode='22023';
 end if;
 -- This RPC is server-only. Actor identity MUST come from a verified JWT at API.
 perform private.afat_assert_active_profile(p_actor_id);
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
 if p_actor_id<>v_booking.passenger_id and p_actor_id<>v_booking.operator_id then
   raise exception 'CASH_HANDOVER_PARTICIPANT_REQUIRED' using errcode='42501';
 end if;
 if v_booking.status not in ('confirmed','accepted') or
    v_booking.boarded_at is not null or v_booking.started_at is not null or
    v_booking.completed_at is not null or
    v_booking.payment_status not in ('cash_due','paid_cash') then
   raise exception 'CASH_HANDOVER_NOT_ELIGIBLE' using errcode='P0001';
 end if;
 if not exists(
   select 1 from public.profiles p
   where p.id=v_booking.operator_id and p.role='operator'
     and p.operator_application_status='APPROVED' and
     p.verification_status='verified' and p.is_active is true
 ) then raise exception 'VERIFIED_OPERATOR_REQUIRED' using errcode='42501'; end if;
 if coalesce(v_booking.price_paid,0)<1 or
    v_booking.transaction_id is null or
    v_booking.transaction_id not like 'CASH-%' then
   raise exception 'VALID_CASH_OBLIGATION_REQUIRED' using errcode='P0001';
 end if;
 insert into public.afat_cash_handovers(booking_id,passenger_id,operator_id,amount_xaf)
 values(v_booking.id,v_booking.passenger_id,v_booking.operator_id,v_booking.price_paid)
 on conflict(booking_id) do nothing;
 select * into v_cash from public.afat_cash_handovers where booking_id=v_booking.id for update;
 if v_cash.passenger_id<>v_booking.passenger_id or
    v_cash.operator_id<>v_booking.operator_id or
    v_cash.amount_xaf<>v_booking.price_paid then
   raise exception 'CASH_HANDOVER_CONTEXT_CHANGED' using errcode='P0001';
 end if;
 if v_booking.payment_status='paid_cash' then
   if v_cash.confirmed_at is null then
     raise exception 'CASH_PAYMENT_LACKS_TWO_PARTY_PROOF' using errcode='P0001';
   end if;
   return jsonb_build_object('booking_id',v_booking.id,'status','confirmed',
     'changed',false,'passenger_attested',true,'operator_attested',true,
     'operator_holds_cash',true,'platform_holds_cash',false,
     'provider_settled',false,'operator_wallet_credited',false);
 end if;
 if p_actor_id=v_booking.passenger_id and v_cash.passenger_confirmed_at is null then
   update public.afat_cash_handovers
   set passenger_confirmed_at=now(),updated_at=now() where booking_id=v_booking.id;
   v_changed:=true;
 elsif p_actor_id=v_booking.operator_id and v_cash.operator_confirmed_at is null then
   update public.afat_cash_handovers
   set operator_confirmed_at=now(),updated_at=now() where booking_id=v_booking.id;
   v_changed:=true;
 end if;
 select * into v_cash from public.afat_cash_handovers where booking_id=v_booking.id for update;
 if v_cash.passenger_confirmed_at is not null and
    v_cash.operator_confirmed_at is not null and v_cash.confirmed_at is null then
   update public.afat_cash_handovers set confirmed_at=now(),updated_at=now()
     where booking_id=v_booking.id;
   update public.bookings set payment_status='paid_cash',updated_at=now()
     where id=v_booking.id and payment_status='cash_due';
   insert into public.trip_events(booking_id,actor_id,event_type,metadata)
    values(v_booking.id,p_actor_id,'payment_confirmed',jsonb_build_object(
      'source','independent_passenger_and_operator_cash_attestations',
      'amount_xaf',v_booking.price_paid,
      'operator_holds_cash',true,'platform_holds_cash',false,
      'provider_settled',false,'operator_wallet_credited',false));
   insert into public.payment_events(booking_id,provider,external_id,event_type,event_status,amount_xaf,metadata)
   values(v_booking.id,'cash',v_booking.transaction_id||':two_party',
     'two_party_cash_handover','PAID',v_booking.price_paid,jsonb_build_object(
       'operator_holds_cash',true,'platform_holds_cash',false,
       'provider_settled',false,'operator_wallet_credited',false));
   v_finished:=true;
 end if;
 return jsonb_build_object('booking_id',v_booking.id,
  'status',case when v_finished then 'confirmed' else 'awaiting_other_party' end,
  'changed',v_changed,'passenger_attested',v_cash.passenger_confirmed_at is not null,
  'operator_attested',v_cash.operator_confirmed_at is not null,
  'operator_holds_cash',v_finished,'platform_holds_cash',false,
  'provider_settled',false,'operator_wallet_credited',false);
end;
$afat$;
revoke all on function public.afat_attest_cash_handover(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_attest_cash_handover(uuid,uuid) to service_role;
