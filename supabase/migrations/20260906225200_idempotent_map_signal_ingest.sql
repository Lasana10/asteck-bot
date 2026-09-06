alter table public.movement_logs
  add column if not exists idempotency_key text;

create unique index if not exists movement_logs_user_idempotency_uidx
  on public.movement_logs(user_id, idempotency_key)
  where user_id is not null and idempotency_key is not null;

alter table public.incidents
  add column if not exists movement_log_id uuid references public.movement_logs(id) on delete set null;

create unique index if not exists incidents_movement_log_uidx
  on public.incidents(movement_log_id)
  where movement_log_id is not null;

create index if not exists movement_logs_user_idx on public.movement_logs(user_id);
create index if not exists incidents_reporter_idx on public.incidents(reporter_id);
create index if not exists incidents_resolver_idx on public.incidents(resolver_id);
