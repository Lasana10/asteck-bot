alter table public.afat_field_reports
  add column if not exists mutation_id text;

alter table public.afat_field_reports
  drop constraint if exists afat_field_reports_mutation_id_length;

alter table public.afat_field_reports
  add constraint afat_field_reports_mutation_id_length
  check (mutation_id is null or char_length(mutation_id) between 8 and 200);

create unique index if not exists afat_field_reports_reporter_mutation_uidx
  on public.afat_field_reports(reporter_profile_id, mutation_id)
  where mutation_id is not null;
