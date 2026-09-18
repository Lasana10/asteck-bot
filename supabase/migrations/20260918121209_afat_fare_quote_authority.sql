create table if not exists public.afat_fare_quotes (
  id uuid primary key default gen_random_uuid(),
  dispatch_assignment_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  operator_id uuid references public.profiles(id) on delete set null,
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  amount_xaf integer not null check (amount_xaf between 50 and 10000000),
  currency text not null default 'XAF' check (currency = 'XAF'),
  fare_source text not null check (fare_source in ('operator_quote','regulated_tariff','zone_rule','institution_contract','manual_dispatch')),
  rationale text,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','expired','superseded')),
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_fare_quotes_dispatch_idx on public.afat_fare_quotes(dispatch_assignment_id, created_at desc);
create index if not exists afat_fare_quotes_booking_idx on public.afat_fare_quotes(booking_id, created_at desc);
create index if not exists afat_fare_quotes_passenger_idx on public.afat_fare_quotes(passenger_id, created_at desc);
create unique index if not exists afat_fare_quotes_open_dispatch_uidx on public.afat_fare_quotes(dispatch_assignment_id) where status='proposed';
alter table public.afat_fare_quotes enable row level security;
revoke all on table public.afat_fare_quotes from anon;
revoke insert, update, delete on table public.afat_fare_quotes from authenticated;
grant select on table public.afat_fare_quotes to authenticated;
grant all on table public.afat_fare_quotes to service_role;
drop policy if exists afat_fare_quotes_participant_read on public.afat_fare_quotes;
create policy afat_fare_quotes_participant_read on public.afat_fare_quotes for select to authenticated using (
  (select auth.uid()) = passenger_id
  or (select auth.uid()) = operator_id
  or exists (select 1 from public.dispatch_assignments da where da.id=afat_fare_quotes.dispatch_assignment_id and da.dispatcher_id=(select auth.uid()))
);
comment on table public.afat_fare_quotes is 'Explicit fare-authority record for AFAT dispatches. A fare is payable only after Passenger acceptance; source records whether it came from an operator quote, tariff, zone rule, contract or accountable dispatch override.';
