begin;

-- Public partners are entities with scoped memberships. They are not AFAT
-- platform roles and therefore never change profiles.role/access_level.
create table if not exists public.public_partner_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null default 'government',
  registration_number text,
  official_domain text,
  jurisdiction text,
  mandate_scope text,
  service_coverage text,
  contact_phone text,
  status text not null default 'under_review'
    check (status in ('partial_intake', 'under_review', 'approved', 'documents_pending', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_partner_memberships (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.public_partner_entities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'representative'
    check (role in ('representative', 'coordinator', 'analyst', 'approver')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  permission_scope text[] not null default array['aggregated_corridor_analytics','draft_public_interventions','export_aggregate_summary']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, profile_id)
);

create index if not exists idx_public_partner_memberships_profile
  on public.public_partner_memberships(profile_id, status);
create index if not exists idx_public_partner_entities_status
  on public.public_partner_entities(status);

alter table public.public_partner_entities enable row level security;
alter table public.public_partner_memberships enable row level security;

drop policy if exists public_partner_entities_member_read on public.public_partner_entities;
create policy public_partner_entities_member_read
  on public.public_partner_entities for select to authenticated
  using (
    exists (
      select 1 from public.public_partner_memberships membership
      where membership.partner_id = public_partner_entities.id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
    )
    or private.afat_is_staff()
  );

drop policy if exists public_partner_memberships_member_read on public.public_partner_memberships;
create policy public_partner_memberships_member_read
  on public.public_partner_memberships for select to authenticated
  using (profile_id = auth.uid() or private.afat_is_staff());

-- Creation and lifecycle changes remain server/service-role controlled. Revoke
-- every inherited table privilege first so operations that bypass row policies,
-- such as TRUNCATE, cannot leak through default grants.
revoke all privileges on public.public_partner_entities from anon, authenticated;
revoke all privileges on public.public_partner_memberships from anon, authenticated;
grant select on public.public_partner_entities to authenticated;
grant select on public.public_partner_memberships to authenticated;
grant all privileges on public.public_partner_entities to service_role;
grant all privileges on public.public_partner_memberships to service_role;

notify pgrst, 'reload schema';

commit;
