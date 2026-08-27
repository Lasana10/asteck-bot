begin;

-- The deployed API promotes invited identities with these two fields. An
-- earlier migration defined them in the repository but was never applied to
-- the TRAFFIC production database, which made every role activation fail.
alter table public.profiles
  add column if not exists access_level text not null default 'verified',
  add column if not exists approval_status text not null default 'self_service',
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verification_method text,
  add column if not exists last_auth_provider text;

-- Align existing profiles without granting authority beyond their current
-- server-owned role and lifecycle state.
update public.profiles
set access_level = case
      when role in ('operator', 'planner', 'admin') then role
      else 'verified'
    end,
    approval_status = case
      when coalesce(is_active, true) = false then 'suspended'
      when role in ('planner', 'admin') then 'approved'
      when role = 'operator' and upper(coalesce(operator_application_status, '')) = 'APPROVED' then 'approved'
      when role = 'operator' then 'pending_review'
      else 'self_service'
    end;

alter table public.profiles drop constraint if exists profiles_access_level_check;
alter table public.profiles add constraint profiles_access_level_check
  check (access_level in ('guest', 'verified', 'operator', 'planner', 'moderator', 'admin'));

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('self_service', 'application_started', 'pending_review', 'approved', 'rejected', 'suspended'));

alter table public.profiles drop constraint if exists profiles_operator_application_status_check;
alter table public.profiles add constraint profiles_operator_application_status_check
  check (
    operator_application_status is null
    or operator_application_status in (
      'NOT_APPLIED', 'APPLICATION_STARTED', 'DOCUMENTS_PENDING',
      'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'
    )
  );

create index if not exists idx_profiles_access_level
  on public.profiles(access_level);
create index if not exists idx_profiles_approval_status
  on public.profiles(approval_status);
create index if not exists idx_profiles_operator_application_status
  on public.profiles(operator_application_status);

-- Keep all authority fields server-owned even if column grants change later.
create or replace function public.afat_protect_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is not null and not private.afat_is_staff() then
    new.role := old.role;
    new.access_level := old.access_level;
    new.approval_status := old.approval_status;
    new.trust_points := old.trust_points;
    new.verification_status := old.verification_status;
    new.is_active := old.is_active;
    new.compliance_status := old.compliance_status;
    new.compliance_score := old.compliance_score;
    new.operator_application_status := old.operator_application_status;
    new.operator_application_submitted_at := old.operator_application_submitted_at;
    new.operator_approved_at := old.operator_approved_at;
    new.operator_review_notes := old.operator_review_notes;
    new.identity_status := old.identity_status;
    new.training_status := old.training_status;
    new.risk_status := old.risk_status;
  end if;
  return new;
end;
$$;

revoke all on function public.afat_protect_profile_authority()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
