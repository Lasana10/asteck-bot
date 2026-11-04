-- Dual human attestations establish cash handover, not bank/provider settlement.
-- The operator wallet is NEVER credited by this flow.
create table if not exists public.afat_cash_handover_evidence(
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id),
  operator_id uuid not null references public.profiles(id),
  amount_xaf integer not null check (amount_xaf>0),
  passenger_attested_at timestamptz,
  operator_attested_at timestamptz,
  dual_attested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.afat_cash_handover_evidence enable row level security;
revoke all on public.afat_cash_handover_evidence from public,anon,authenticated;
grant select,insert,update on public.afat_cash_handover_evidence to service_role;

create or replace function public.afat_attest_cash_handover(
 p_actor_id uuid,p_booking_id uuid,p_side text
) returns jsonb language plpgsql
set search_path='' as $afat$
declare
  v_booking public.bookings%rowtype;
  v_route public.routes%rowtype;
  v_evidence public.afat_cash_handover_evidence%rowtype;
begin
  perform private.afat_assert_active_profile(p_actor_id);
  if p_side not in ('passenger','operator') then
    raise exception 'INVALID_CASH_ATTESTATION_SIDE' using errcode='22023';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if (p_side='passenger' and v_booking.passenger_id is distinct from p_actor_id) or
     (p_side='operator' and v_booking.operator_id is distinct from p_actor_id) then
    raise exception 'CASH_ATTESTATION_PARTICIPANT_REQUIRED' using errcode='42501';
  end if;
  if v_booking.status<>'confirmed' or
     v_booking.payment_status not in ('cash_due','paid_cash') or
     coalesce(v_booking.transaction_id,'') not like 'CASH-%' then
    raise exception 'CASH_HANDOVER_BOOKING_NOT_ELIGIBLE' using errcode='P0001';
  end if;
  select * into v_route from public.routes where id=v_booking.route_id;
  if not found or v_route.departure_time<now()-interval '2 hours' then
    raise exception 'CASH_HANDOVER_DEPARTURE_EXPIRED' using errcode='P0001';
  end if;
  if v_booking.price_paid is null or v_booking.price_paid<=0 then
    raise exception 'SERVER_CASH_AMOUNT_NOT_VERIFIED' using errcode='P0001';
  end if;
  insert into public.afat_cash_handover_evidence(
    booking_id,passenger_id,operator_id,amount_xaf)
  values(p_booking_id,v_booking.passenger_id,v_booking.operator_id,v_booking.price_paid)
  on conflict(booking_id) do nothing;
  select * into v_evidence from public.afat_cash_handover_evidence
    where booking_id=p_booking_id for update;
  if v_evidence.passenger_id<>v_booking.passenger_id or
     v_evidence.operator_id<>v_booking.operator_id or
     v_evidence.amount_xaf<>v_booking.price_paid then
    raise exception 'CASH_HANDOVER_EVIDENCE_CONFLICT' using errcode='P0001';
  end if;
  if p_side='passenger' and v_evidence.passenger_attested_at is null then
    update public.afat_cash_handover_evidence
      set passenger_attested_at=now(),updated_at=now()
    where booking_id=p_booking_id;
  elsif p_side='operator' and v_evidence.operator_attested_at is null then
    update public.afat_cash_handover_evidence
      set operator_attested_at=now(),updated_at=now()
    where booking_id=p_booking_id;
  end if;
  select * into v_evidence from public.afat_cash_handover_evidence
    where booking_id=p_booking_id;
  if v_evidence.passenger_attested_at is not null and
     v_evidence.operator_attested_at is not null then
    update public.afat_cash_handover_evidence
      set dual_attested_at=coalesce(dual_attested_at,now()),updated_at=now()
    where booking_id=p_booking_id;
    update public.bookings
      set payment_status='paid_cash',updated_at=now()
    where id=p_booking_id and payment_status='cash_due';
  end if;
  return jsonb_build_object(
    'booking_id',p_booking_id,'amount_xaf',v_booking.price_paid,
    'passenger_attested',v_evidence.passenger_attested_at is not null,
    'operator_attested',v_evidence.operator_attested_at is not null,
    'dual_attested',v_evidence.passenger_attested_at is not null
      and v_evidence.operator_attested_at is not null,
    'bank_or_provider_settlement_verified',false,
    'operator_wallet_credited',false,
    'cash_handover_evidence','two_party_attestation');
end;
$afat$;

create or replace function public.afat_read_cash_handover(
 p_actor_id uuid,p_booking_id uuid
) returns jsonb language plpgsql stable
set search_path='' as $afat$
declare v_booking public.bookings%rowtype;
        v_evidence public.afat_cash_handover_evidence%rowtype;
begin
  perform private.afat_assert_active_profile(p_actor_id);
  select * into v_booking from public.bookings where id=p_booking_id;
  if not found or (v_booking.passenger_id is distinct from p_actor_id and
      v_booking.operator_id is distinct from p_actor_id) then
    raise exception 'BOOKING_PARTICIPANT_REQUIRED' using errcode='42501';
  end if;
  select * into v_evidence from public.afat_cash_handover_evidence
    where booking_id=p_booking_id;
  return jsonb_build_object(
    'booking_id',p_booking_id,'payment_status',v_booking.payment_status,
    'amount_xaf',v_booking.price_paid,
    'passenger_attested',v_evidence.passenger_attested_at is not null,
    'operator_attested',v_evidence.operator_attested_at is not null,
    'dual_attested',v_evidence.dual_attested_at is not null,
    'bank_or_provider_settlement_verified',false,
    'operator_wallet_credited',false);
end;
$afat$;

revoke all on function public.afat_attest_cash_handover(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.afat_attest_cash_handover(uuid,uuid,text) to service_role;
revoke all on function public.afat_read_cash_handover(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_read_cash_handover(uuid,uuid) to service_role;
