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
create policy operator_payout_owner_read on public.operator_payout_requests for select to authenticated using (operator_id=auth.uid() or public.afat_has_permission('system.configure'));
