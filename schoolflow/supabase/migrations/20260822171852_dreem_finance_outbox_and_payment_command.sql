-- Move DREEM payment authority behind a trusted command and emit durable events.

create table if not exists public.dreem_domain_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','delivering','delivered','failed','dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (school_id, idempotency_key)
);

alter table public.dreem_domain_events enable row level security;

create index if not exists dreem_domain_events_pending_idx
on public.dreem_domain_events(status, created_at)
where status in ('pending','failed');

create index if not exists dreem_domain_events_school_created_idx
on public.dreem_domain_events(school_id, created_at desc);

create policy dreem_domain_events_read
on public.dreem_domain_events
for select
to authenticated
using ((select private.dreem_has_role(school_id,array['leadership','auditor'])));

revoke all on public.dreem_domain_events from anon, authenticated;
grant select on public.dreem_domain_events to authenticated;

drop policy if exists dreem_financial_payments_create on public.dreem_financial_payments;
drop policy if exists dreem_payment_events_create on public.dreem_payment_events;
grant select on public.dreem_financial_payments, public.dreem_payment_events to authenticated;

create or replace function public.dreem_record_payment(
  p_student_id uuid,
  p_fee_account_id uuid,
  p_cashier_session_id uuid,
  p_method text,
  p_amount numeric,
  p_external_reference text,
  p_idempotency_key text,
  p_payer_name text
) returns table(payment_id uuid, receipt_number text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school_id uuid;
  v_actor_id uuid := (select auth.uid());
  v_receipt_prefix text;
  v_receipt_number text;
  v_existing public.dreem_financial_payments%rowtype;
  v_payment_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive.';
  end if;

  if p_method not in ('cash','momo','bank_transfer','card','cheque') then
    raise exception 'Unsupported payment method.';
  end if;

  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'An idempotency key is required.';
  end if;

  select s.school_id
    into v_school_id
    from public.students s
   where s.id = p_student_id
     and private.dreem_has_role(s.school_id,array['bursar']);

  if v_school_id is null then
    raise exception 'No authorized DREEM bursar membership for this learner.';
  end if;

  if p_fee_account_id is not null and not exists (
    select 1 from public.fee_accounts f
    where f.id = p_fee_account_id and f.school_id = v_school_id
  ) then
    raise exception 'Fee account does not belong to this school.';
  end if;

  if p_method = 'cash' then
    if p_cashier_session_id is null then
      raise exception 'Cash payments require an open cashier session.';
    end if;

    if not exists (
      select 1 from public.dreem_cashier_sessions c
      where c.id = p_cashier_session_id
        and c.school_id = v_school_id
        and c.cashier_user_id = v_actor_id
        and c.status = 'open'
    ) then
      raise exception 'Cashier session is not open for this cashier.';
    end if;
  end if;

  select *
    into v_existing
    from public.dreem_financial_payments p
   where p.school_id = v_school_id
     and p.idempotency_key = p_idempotency_key;

  if found then
    payment_id := v_existing.id;
    receipt_number := v_existing.receipt_number;
    return next;
    return;
  end if;

  if p_external_reference is not null and exists (
    select 1 from public.dreem_financial_payments p
    where p.school_id = v_school_id
      and p.method = p_method
      and p.external_reference = p_external_reference
  ) then
    raise exception 'Duplicate external payment reference.';
  end if;

  select coalesce(b.receipt_prefix,'DRM')
    into v_receipt_prefix
    from public.dreem_school_brands b
   where b.school_id = v_school_id;

  v_receipt_number := concat(coalesce(v_receipt_prefix,'DRM'), '-', to_char(now(),'YYYYMMDD'), '-', upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));

  insert into public.dreem_financial_payments (
    school_id, student_id, fee_account_id, cashier_session_id, receipt_number,
    method, amount, external_reference, idempotency_key, payer_name, received_by
  ) values (
    v_school_id, p_student_id, p_fee_account_id, p_cashier_session_id, v_receipt_number,
    p_method, p_amount, nullif(trim(p_external_reference),''), p_idempotency_key, p_payer_name, v_actor_id
  )
  returning id into v_payment_id;

  insert into public.dreem_payment_events (
    school_id, payment_id, event_type, actor_user_id, note, evidence
  ) values (
    v_school_id, v_payment_id, 'recorded', v_actor_id, 'Payment recorded through trusted DREEM command',
    jsonb_build_object('method',p_method,'amount',p_amount,'external_reference',p_external_reference)
  );

  insert into public.dreem_domain_events (
    school_id, aggregate_type, aggregate_id, event_type, idempotency_key, payload
  ) values (
    v_school_id, 'payment', v_payment_id, 'payment.recorded',
    concat('payment.recorded:', p_idempotency_key),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'student_id', p_student_id,
      'fee_account_id', p_fee_account_id,
      'receipt_number', v_receipt_number,
      'method', p_method,
      'amount', p_amount,
      'payer_name', p_payer_name
    )
  );

  payment_id := v_payment_id;
  receipt_number := v_receipt_number;
  return next;
end;
$$;

revoke all on function public.dreem_record_payment(uuid,uuid,uuid,text,numeric,text,text,text) from public;
grant execute on function public.dreem_record_payment(uuid,uuid,uuid,text,numeric,text,text,text) to authenticated;
