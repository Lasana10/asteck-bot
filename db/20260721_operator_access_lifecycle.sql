begin;

alter table public.profiles
  add column if not exists operator_application_status text default 'APPLICATION_STARTED',
  add column if not exists operator_application_submitted_at timestamptz,
  add column if not exists operator_approved_at timestamptz,
  add column if not exists operator_review_notes text;

update public.profiles
set
  operator_application_status = case
    when role = 'operator' and coalesce(is_active, false) = true then 'APPROVED'
    when role = 'operator' and verification_status = 'verified' then 'UNDER_REVIEW'
    when role = 'operator' and (national_id_number is not null or license_number is not null) then 'DOCUMENTS_PENDING'
    when role = 'operator' then 'APPLICATION_STARTED'
    else operator_application_status
  end,
  operator_application_submitted_at = coalesce(operator_application_submitted_at, created_at, now()),
  operator_approved_at = case
    when role = 'operator' and coalesce(is_active, false) = true then coalesce(operator_approved_at, updated_at, now())
    else operator_approved_at
  end
where role = 'operator';

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles
for update
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
  )
);

commit;
