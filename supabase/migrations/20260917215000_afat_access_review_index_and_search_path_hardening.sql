create index if not exists access_applications_company_idx
  on public.access_applications(company_id)
  where company_id is not null;

create index if not exists access_applications_requested_role_idx
  on public.access_applications(requested_role_key)
  where requested_role_key is not null;

create index if not exists access_applications_reviewer_idx
  on public.access_applications(reviewed_by)
  where reviewed_by is not null;

alter function public.afat_routing_evidence_allowed(text)
  set search_path = public, pg_temp;
