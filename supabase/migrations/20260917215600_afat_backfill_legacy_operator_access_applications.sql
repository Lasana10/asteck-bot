insert into public.access_applications (
  profile_id,
  capability_key,
  requested_role_key,
  status,
  application_type,
  reason,
  requested_scope,
  evidence_summary,
  submitted_at,
  created_at,
  updated_at
)
select
  p.id,
  'operator',
  'operator_applicant',
  case
    when upper(p.operator_application_status) = 'UNDER_REVIEW' then 'under_review'
    else 'needs_information'
  end,
  'self_service',
  'Legacy AFAT operator intake migrated into the canonical capability review lifecycle.',
  jsonb_strip_nulls(jsonb_build_object(
    'preferred_city', p.preferred_city
  )),
  jsonb_build_object(
    'legacy_application_status', p.operator_application_status,
    'verification_status', coalesce(p.verification_status, 'unknown'),
    'national_id_present', p.national_id_number is not null,
    'license_present', p.license_number is not null
  ),
  coalesce(p.operator_application_submitted_at, p.created_at, now()),
  now(),
  now()
from public.profiles p
where p.operator_application_status is not null
  and upper(p.operator_application_status) not in ('APPROVED','REJECTED','SUSPENDED')
  and not exists (
    select 1
    from public.access_applications a
    where a.profile_id = p.id
      and a.capability_key = 'operator'
      and a.status in ('draft','submitted','under_review','needs_information')
  );
