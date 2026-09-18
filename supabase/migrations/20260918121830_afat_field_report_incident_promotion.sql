alter table public.afat_field_reports
  add column if not exists promoted_incident_id uuid references public.incidents(id) on delete set null;
create index if not exists afat_field_reports_promoted_incident_idx on public.afat_field_reports(promoted_incident_id) where promoted_incident_id is not null;
