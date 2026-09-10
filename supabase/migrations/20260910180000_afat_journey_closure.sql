create table if not exists public.afat_journey_closures (
  id uuid primary key default gen_random_uuid(),
  dispatch_assignment_id uuid not null unique references public.dispatch_assignments(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  payment_state text not null default 'pending' check (payment_state in ('pending','cash_due','mobile_money_pending','paid','failed','waived')),
  payment_reference text,
  proof_reference text,
  receipt_number text not null unique,
  rating smallint check (rating between 1 and 5),
  dispute_reason text,
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_journey_closures_booking_idx on public.afat_journey_closures(booking_id);
alter table public.afat_journey_closures enable row level security;
comment on table public.afat_journey_closures is 'Truth-preserving AFAT journey closure record. Payment state is operational evidence and does not imply a live provider settlement unless a provider reference/proof is recorded.';
