begin;

-- AFAT identity and access foundation.
-- This migration is additive: legacy profiles.role continues to drive the
-- current dashboards while new authorization moves to assignments,
-- permissions, scopes, and progressive clearance records.

alter table public.profiles
  add column if not exists identity_status text not null default 'basic',
  add column if not exists training_status text not null default 'not_started',
  add column if not exists risk_status text not null default 'normal';

alter table public.profiles drop constraint if exists profiles_identity_status_check;
alter table public.profiles add constraint profiles_identity_status_check
  check (identity_status in ('anonymous', 'basic', 'identified', 'verified', 'challenged', 'suspended', 'revoked'));

alter table public.profiles drop constraint if exists profiles_training_status_check;
alter table public.profiles add constraint profiles_training_status_check
  check (training_status in ('not_started', 'in_progress', 'completed', 'expired'));

alter table public.profiles drop constraint if exists profiles_risk_status_check;
alter table public.profiles add constraint profiles_risk_status_check
  check (risk_status in ('normal', 'challenged', 'restricted', 'frozen', 'investigating', 'revoked'));

alter table public.companies
  add column if not exists organization_type text not null default 'fleet_company',
  add column if not exists clearance_level text not null default 'O0',
  add column if not exists clearance_status text not null default 'active_limited',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.companies drop constraint if exists companies_organization_type_check;
alter table public.companies add constraint companies_organization_type_check
  check (organization_type in (
    'fleet_company', 'transport_union', 'government_authority',
    'emergency_partner', 'institution', 'independent_operator'
  ));

alter table public.companies drop constraint if exists companies_clearance_level_check;
alter table public.companies add constraint companies_clearance_level_check
  check (clearance_level in ('O0', 'O1', 'O2', 'O3', 'O4', 'O5'));

alter table public.companies drop constraint if exists companies_clearance_status_check;
alter table public.companies add constraint companies_clearance_status_check
  check (clearance_status in ('active_limited', 'under_review', 'active', 'restricted', 'suspended', 'revoked'));

alter table public.company_memberships drop constraint if exists company_memberships_role_check;
alter table public.company_memberships add constraint company_memberships_role_check
  check (role in (
    'owner', 'admin', 'fleet_manager', 'dispatcher', 'compliance_officer',
    'finance_officer', 'operator', 'analyst', 'auditor', 'member'
  ));

alter table public.company_memberships drop constraint if exists company_memberships_status_check;
alter table public.company_memberships add constraint company_memberships_status_check
  check (status in ('pending', 'invited', 'provisional', 'active', 'suspended', 'revoked', 'expired'));

alter table public.vehicles
  add column if not exists clearance_status text not null default 'unreviewed';

alter table public.vehicles drop constraint if exists vehicles_clearance_status_check;
alter table public.vehicles add constraint vehicles_clearance_status_check
  check (clearance_status in ('unreviewed', 'partial', 'under_review', 'verified', 'restricted', 'suspended', 'expired'));

create table if not exists public.access_role_definitions (
  role_key text primary key,
  display_name text not null,
  role_family text not null,
  privilege_rank integer not null default 0 check (privilege_rank between 0 and 100),
  grant_ceiling integer not null default 0 check (grant_ceiling between 0 and 100),
  staff_only boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_role_family_check check (
    role_family in ('community', 'transport', 'organization', 'intelligence', 'safety', 'governance')
  )
);

create table if not exists public.access_permissions (
  permission_key text primary key,
  permission_family text not null,
  display_name text not null,
  description text,
  requires_aal2 boolean not null default false,
  critical boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.access_role_permissions (
  role_key text not null references public.access_role_definitions(role_key) on delete cascade,
  permission_key text not null references public.access_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.profile_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.access_role_definitions(role_key),
  company_id uuid references public.companies(id) on delete cascade,
  status text not null default 'active',
  source text not null default 'migration',
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_role_assignment_status_check check (
    status in ('pending', 'provisional', 'active', 'suspended', 'revoked', 'expired')
  ),
  constraint profile_role_assignment_source_check check (
    source in ('automatic', 'application', 'invitation', 'review', 'founder_bootstrap', 'migration', 'system')
  )
);

create unique index if not exists profile_role_assignments_active_uidx
  on public.profile_role_assignments (
    profile_id,
    role_key,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('pending', 'provisional', 'active');

create index if not exists profile_role_assignments_profile_idx
  on public.profile_role_assignments (profile_id, status, role_key);
create index if not exists profile_role_assignments_company_idx
  on public.profile_role_assignments (company_id, status, role_key)
  where company_id is not null;

create table if not exists public.access_scopes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.profile_role_assignments(id) on delete cascade,
  scope_type text not null,
  scope_value text not null,
  created_at timestamptz not null default now(),
  constraint access_scope_type_check check (
    scope_type in ('platform', 'organization', 'country', 'region', 'city', 'district', 'corridor', 'route', 'terminal', 'resource')
  ),
  unique (assignment_id, scope_type, scope_value)
);

create index if not exists access_scopes_assignment_idx
  on public.access_scopes (assignment_id);
create index if not exists access_scopes_lookup_idx
  on public.access_scopes (scope_type, scope_value);

create table if not exists public.clearance_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  track text not null,
  level text not null,
  status text not null default 'active_limited',
  available_capabilities text[] not null default '{}',
  restricted_capabilities text[] not null default '{}',
  restriction_reasons jsonb not null default '{}'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clearance_single_subject_check check (num_nonnulls(profile_id, company_id, vehicle_id) = 1),
  constraint clearance_track_check check (track in ('identity', 'operator', 'organization', 'vehicle', 'training', 'risk')),
  constraint clearance_status_check check (
    status in ('active_limited', 'under_review', 'active', 'restricted', 'suspended', 'revoked', 'expired')
  )
);

create unique index if not exists clearance_profile_track_uidx
  on public.clearance_records (profile_id, track) where profile_id is not null;
create unique index if not exists clearance_company_track_uidx
  on public.clearance_records (company_id, track) where company_id is not null;
create unique index if not exists clearance_vehicle_track_uidx
  on public.clearance_records (vehicle_id, track) where vehicle_id is not null;

create table if not exists public.profile_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.access_permissions(permission_key),
  allowed boolean not null,
  reason text not null,
  granted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, permission_key)
);

create index if not exists profile_capability_overrides_profile_idx
  on public.profile_capability_overrides (profile_id, permission_key);

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_key text not null references public.access_role_definitions(role_key),
  company_id uuid references public.companies(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  token_hash text not null unique,
  requested_scopes jsonb not null default '[]'::jsonb,
  invitation_context jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_invitation_email_normalized_check check (email = lower(btrim(email))),
  constraint staff_invitation_status_check check (
    status in ('pending', 'sent', 'accepted', 'revoked', 'expired', 'failed')
  )
);

create unique index if not exists staff_invitations_open_uidx
  on public.staff_invitations (
    email,
    role_key,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('pending', 'sent');
create index if not exists staff_invitations_expiry_idx
  on public.staff_invitations (status, expires_at);

create table if not exists public.access_audit_events (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id text,
  company_id uuid references public.companies(id) on delete set null,
  reason text,
  previous_state jsonb,
  new_state jsonb,
  request_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_audit_events_actor_idx
  on public.access_audit_events (actor_profile_id, created_at desc);
create index if not exists access_audit_events_target_idx
  on public.access_audit_events (target_type, target_id, created_at desc);
create index if not exists access_audit_events_company_idx
  on public.access_audit_events (company_id, created_at desc)
  where company_id is not null;

create table if not exists public.founder_bootstrap_control (
  singleton boolean primary key default true check (singleton),
  bootstrap_used boolean not null default false,
  founder_profile_id uuid references public.profiles(id) on delete restrict,
  founder_email text,
  bootstrapped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.founder_bootstrap_control (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.founder_credentials (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  pass_salt text not null,
  pass_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.access_role_definitions (
  role_key, display_name, role_family, privilege_rank, grant_ceiling, staff_only, description
) values
  ('commuter', 'Commuter', 'community', 5, 0, false, 'Passenger and community member.'),
  ('community_contributor', 'Community Contributor', 'community', 5, 0, false, 'Universal reporting and local intelligence contributor.'),
  ('guardian', 'Guardian', 'community', 8, 0, false, 'Linked safety contact.'),
  ('operator_applicant', 'AFAT Member', 'transport', 10, 0, false, 'Operator intake started; safe services are immediately available.'),
  ('provisional_operator', 'Emerging Operator', 'transport', 20, 0, false, 'Capability-limited operator progressing through clearance.'),
  ('verified_operator', 'Verified Operator', 'transport', 30, 0, false, 'Operator cleared for approved transport services.'),
  ('trusted_operator', 'Trusted Operator', 'transport', 35, 0, false, 'High-trust operator with additional service opportunities.'),
  ('fleet_lead', 'AFAT Fleet Leader', 'transport', 40, 20, false, 'Operator supervisor within an assigned fleet.'),
  ('vehicle_owner', 'Vehicle Owner', 'transport', 15, 0, false, 'Vehicle owner, distinct from the assigned driver.'),
  ('conductor', 'Conductor', 'transport', 15, 0, false, 'Vehicle or route assistant.'),
  ('terminal_agent', 'Terminal Agent', 'transport', 20, 5, false, 'Terminal operations contributor.'),
  ('organization_member', 'Organization Member', 'organization', 10, 0, false, 'Base membership in an AFAT organization.'),
  ('organization_owner', 'Organization Owner', 'organization', 45, 40, true, 'Controls only the assigned organization.'),
  ('organization_admin', 'Organization Admin', 'organization', 40, 35, true, 'Administers only the assigned organization.'),
  ('fleet_manager', 'Fleet Manager', 'organization', 35, 25, true, 'Manages assigned fleet operations.'),
  ('dispatcher', 'Dispatcher', 'organization', 30, 15, true, 'Coordinates approved dispatch operations.'),
  ('compliance_officer', 'Compliance Officer', 'organization', 35, 20, true, 'Coordinates document and compliance progress.'),
  ('finance_officer', 'Finance Officer', 'organization', 35, 15, true, 'Views and manages assigned organization finance workflows.'),
  ('analyst', 'Organization Analyst', 'organization', 25, 0, true, 'Reads assigned aggregate operational data.'),
  ('auditor', 'Organization Auditor', 'organization', 30, 0, true, 'Read-only audit access for an assigned organization.'),
  ('trusted_verifier', 'Trusted Verifier', 'intelligence', 25, 0, false, 'Confirms or disputes field intelligence.'),
  ('route_scout', 'Route Scout', 'intelligence', 20, 0, false, 'Records roads, stops, aliases, and route truth.'),
  ('field_enumerator', 'Field Enumerator', 'intelligence', 20, 0, false, 'Performs structured field collection.'),
  ('transport_observer', 'Transport Observer', 'intelligence', 20, 0, false, 'Records fares, service patterns, and transport conditions.'),
  ('sensor_custodian', 'Sensor Custodian', 'intelligence', 20, 0, false, 'Maintains an approved AFAT field node.'),
  ('field_coordinator', 'Field Coordinator', 'intelligence', 40, 25, true, 'Coordinates field missions and coverage.'),
  ('data_steward', 'Data Steward', 'intelligence', 45, 20, true, 'Reviews quality, classification, and duplicates.'),
  ('fleet_planner', 'Fleet Planner', 'intelligence', 45, 25, true, 'Plans within an assigned fleet.'),
  ('afat_operational_planner', 'AFAT Operational Planner', 'intelligence', 55, 30, true, 'Plans AFAT operations within assigned scope.'),
  ('municipal_planner', 'Municipal Planner', 'intelligence', 55, 20, true, 'Uses anonymized intelligence within assigned territory.'),
  ('government_planner', 'Government Planner', 'intelligence', 60, 20, true, 'Uses approved aggregate intelligence for public planning.'),
  ('emergency_planner', 'Emergency Planner', 'safety', 60, 25, true, 'Coordinates emergency planning within assigned scope.'),
  ('support_agent', 'Support Agent', 'governance', 45, 15, true, 'Assists users with masked information.'),
  ('safety_moderator', 'Safety Moderator', 'safety', 55, 20, true, 'Reviews and resolves safety intelligence.'),
  ('emergency_responder', 'Emergency Responder', 'safety', 60, 20, true, 'Responds to assigned emergency events.'),
  ('incident_investigator', 'Incident Investigator', 'safety', 60, 15, true, 'Investigates assigned evidence with audit controls.'),
  ('operator_reviewer', 'Operator Reviewer', 'governance', 55, 25, true, 'Reviews operator and vehicle clearance.'),
  ('organization_reviewer', 'Organization Reviewer', 'governance', 55, 25, true, 'Reviews organization clearance.'),
  ('fraud_risk_analyst', 'Fraud & Risk Analyst', 'governance', 60, 20, true, 'Reviews anomalous and abusive activity.'),
  ('data_protection_officer', 'Data Protection Officer', 'governance', 70, 20, true, 'Oversees privacy, access, and data rights.'),
  ('finance_reconciliation_officer', 'Finance & Reconciliation Officer', 'governance', 65, 25, true, 'Controls platform reconciliation workflows.'),
  ('operations_admin', 'Operations Admin', 'governance', 70, 55, true, 'Administers AFAT operations without security ownership.'),
  ('security_admin', 'Security Admin', 'governance', 85, 70, true, 'Controls security, sessions, and access reviews.'),
  ('platform_admin', 'Platform Admin', 'governance', 90, 85, true, 'Controls platform configuration below Founder authority.'),
  ('founder_owner', 'Founder Owner', 'governance', 100, 100, true, 'Permanent Founder command authority.')
on conflict (role_key) do update set
  display_name = excluded.display_name,
  role_family = excluded.role_family,
  privilege_rank = excluded.privilege_rank,
  grant_ceiling = excluded.grant_ceiling,
  staff_only = excluded.staff_only,
  description = excluded.description,
  updated_at = now();

insert into public.access_permissions (
  permission_key, permission_family, display_name, description, requires_aal2, critical
) values
  ('report.create', 'community_safety', 'Create report', 'Create a mobility or safety report.', false, false),
  ('report.confirm', 'community_safety', 'Confirm report', 'Confirm or dispute a nearby report.', false, false),
  ('report.verify', 'community_safety', 'Verify report', 'Apply trusted field verification.', false, false),
  ('report.resolve', 'community_safety', 'Resolve report', 'Resolve or archive operational intelligence.', true, true),
  ('field.mission.join', 'intelligence_planning', 'Join field mission', 'Participate in an assigned collection mission.', false, false),
  ('field.mission.manage', 'intelligence_planning', 'Manage field missions', 'Create and coordinate field collection.', true, false),
  ('planning.aggregate.view', 'intelligence_planning', 'View aggregate planning data', 'View anonymized planning intelligence.', false, false),
  ('planning.export', 'intelligence_planning', 'Export planning data', 'Export approved aggregate datasets.', true, true),
  ('trip.request', 'mobility_operations', 'Request trip', 'Request an AFAT transport service.', false, false),
  ('trip.accept', 'mobility_operations', 'Accept trip', 'Accept a trip when operator clearance permits.', false, false),
  ('vehicle.prepare', 'mobility_operations', 'Prepare vehicle profile', 'Prepare vehicle information before verification.', false, false),
  ('vehicle.operate', 'mobility_operations', 'Operate vehicle', 'Operate an approved vehicle through AFAT.', false, true),
  ('training.join', 'mobility_operations', 'Join training', 'Join AFAT safety and operations training.', false, false),
  ('organization.profile.prepare', 'mobility_operations', 'Prepare organization profile', 'Complete an organization profile while clearance progresses.', false, false),
  ('organization.roster.prepare', 'mobility_operations', 'Prepare organization roster', 'Prepare a scoped organization roster before full clearance.', false, false),
  ('organization.people.manage', 'mobility_operations', 'Manage organization people', 'Invite and manage members below the grant ceiling.', true, true),
  ('operator.review', 'mobility_operations', 'Review operators', 'Review operator and vehicle clearance.', true, true),
  ('organization.review', 'finance_compliance', 'Review organizations', 'Review organization clearance.', true, true),
  ('compliance.manage', 'finance_compliance', 'Manage compliance', 'Review compliance records and next steps.', true, true),
  ('finance.reconcile', 'finance_compliance', 'Reconcile finance', 'Perform reconciliation workflows.', true, true),
  ('access.people.view', 'platform_security', 'View people access', 'View assigned people and access records.', true, true),
  ('access.staff.invite', 'platform_security', 'Invite staff', 'Invite staff below the inviter grant ceiling.', true, true),
  ('access.role.grant', 'platform_security', 'Grant roles', 'Grant roles below the actor grant ceiling.', true, true),
  ('access.audit.view', 'platform_security', 'View access audit', 'View authorized access audit events.', true, true),
  ('system.configure', 'platform_security', 'Configure platform', 'Change protected platform configuration.', true, true),
  ('system.freeze', 'platform_security', 'Freeze operations', 'Freeze a compromised organization or platform capability.', true, true),
  ('founder.command', 'platform_security', 'Founder command', 'Access Founder-only command operations.', true, true)
on conflict (permission_key) do update set
  permission_family = excluded.permission_family,
  display_name = excluded.display_name,
  description = excluded.description,
  requires_aal2 = excluded.requires_aal2,
  critical = excluded.critical;

-- Safe universal and progressive capabilities.
insert into public.access_role_permissions (role_key, permission_key) values
  ('commuter', 'report.create'), ('commuter', 'report.confirm'), ('commuter', 'trip.request'),
  ('community_contributor', 'report.create'), ('community_contributor', 'report.confirm'),
  ('operator_applicant', 'report.create'), ('operator_applicant', 'report.confirm'),
  ('operator_applicant', 'field.mission.join'), ('operator_applicant', 'vehicle.prepare'),
  ('operator_applicant', 'training.join'),
  ('provisional_operator', 'report.create'), ('provisional_operator', 'report.confirm'),
  ('provisional_operator', 'field.mission.join'), ('provisional_operator', 'vehicle.prepare'),
  ('verified_operator', 'report.create'), ('verified_operator', 'report.confirm'),
  ('verified_operator', 'field.mission.join'), ('verified_operator', 'vehicle.prepare'),
  ('verified_operator', 'vehicle.operate'), ('verified_operator', 'trip.accept'),
  ('trusted_operator', 'report.create'), ('trusted_operator', 'report.confirm'),
  ('trusted_operator', 'report.verify'), ('trusted_operator', 'field.mission.join'),
  ('trusted_operator', 'vehicle.prepare'), ('trusted_operator', 'vehicle.operate'),
  ('trusted_operator', 'trip.accept'),
  ('trusted_verifier', 'report.create'), ('trusted_verifier', 'report.confirm'),
  ('trusted_verifier', 'report.verify'),
  ('route_scout', 'report.create'), ('route_scout', 'report.confirm'), ('route_scout', 'field.mission.join'),
  ('field_enumerator', 'report.create'), ('field_enumerator', 'field.mission.join'),
  ('transport_observer', 'report.create'), ('transport_observer', 'field.mission.join'),
  ('field_coordinator', 'report.create'), ('field_coordinator', 'report.verify'),
  ('field_coordinator', 'field.mission.manage'), ('field_coordinator', 'planning.aggregate.view'),
  ('data_steward', 'report.verify'), ('data_steward', 'report.resolve'),
  ('data_steward', 'field.mission.manage'), ('data_steward', 'planning.aggregate.view'),
  ('fleet_planner', 'field.mission.manage'), ('fleet_planner', 'planning.aggregate.view'),
  ('afat_operational_planner', 'field.mission.manage'), ('afat_operational_planner', 'planning.aggregate.view'),
  ('municipal_planner', 'field.mission.manage'), ('municipal_planner', 'planning.aggregate.view'),
  ('government_planner', 'field.mission.manage'), ('government_planner', 'planning.aggregate.view'),
  ('emergency_planner', 'field.mission.manage'), ('emergency_planner', 'planning.aggregate.view'),
  ('safety_moderator', 'report.verify'), ('safety_moderator', 'report.resolve'),
  ('operator_reviewer', 'operator.review'), ('operator_reviewer', 'compliance.manage'),
  ('organization_reviewer', 'organization.review'), ('organization_reviewer', 'compliance.manage'),
  ('organization_member', 'organization.profile.prepare'), ('organization_member', 'training.join'),
  ('organization_owner', 'organization.profile.prepare'), ('organization_owner', 'organization.roster.prepare'),
  ('organization_owner', 'training.join'), ('organization_owner', 'organization.people.manage'), ('organization_owner', 'access.people.view'),
  ('organization_admin', 'organization.profile.prepare'), ('organization_admin', 'organization.roster.prepare'),
  ('organization_admin', 'training.join'), ('organization_admin', 'organization.people.manage'), ('organization_admin', 'access.people.view'),
  ('fleet_manager', 'organization.profile.prepare'), ('fleet_manager', 'organization.roster.prepare'),
  ('fleet_manager', 'training.join'), ('fleet_manager', 'organization.people.manage'), ('fleet_manager', 'access.people.view'),
  ('compliance_officer', 'compliance.manage'),
  ('finance_reconciliation_officer', 'finance.reconcile'),
  ('operations_admin', 'access.people.view'), ('operations_admin', 'access.staff.invite'),
  ('operations_admin', 'access.role.grant'), ('operations_admin', 'access.audit.view'),
  ('security_admin', 'access.people.view'), ('security_admin', 'access.staff.invite'),
  ('security_admin', 'access.role.grant'), ('security_admin', 'access.audit.view'),
  ('security_admin', 'system.freeze'),
  ('platform_admin', 'access.people.view'), ('platform_admin', 'access.staff.invite'),
  ('platform_admin', 'access.role.grant'), ('platform_admin', 'access.audit.view'),
  ('platform_admin', 'system.configure'), ('platform_admin', 'system.freeze'),
  ('founder_owner', 'founder.command')
on conflict (role_key, permission_key) do nothing;

-- Legacy users receive additive assignments without changing their current UI role.
insert into public.profile_role_assignments (profile_id, role_key, status, source, reason)
select p.id, 'commuter', 'active', 'migration', 'Existing AFAT identity baseline'
from public.profiles p
on conflict do nothing;

insert into public.profile_role_assignments (profile_id, role_key, status, source, reason)
select
  p.id,
  case
    when p.role = 'operator' and p.operator_application_status = 'APPROVED' then 'verified_operator'
    when p.role = 'operator' then 'operator_applicant'
    when p.role = 'planner' then 'afat_operational_planner'
    when p.role = 'admin' then 'operations_admin'
  end,
  'active',
  'migration',
  'Mapped from legacy profiles.role'
from public.profiles p
where p.role in ('operator', 'planner', 'admin')
on conflict do nothing;

insert into public.profile_role_assignments (profile_id, role_key, company_id, status, source, reason)
select
  cm.profile_id,
  case cm.role
    when 'owner' then 'organization_owner'
    when 'manager' then 'fleet_manager'
    when 'fleet_manager' then 'fleet_manager'
    when 'dispatcher' then 'dispatcher'
    when 'compliance_officer' then 'compliance_officer'
    when 'finance_officer' then 'finance_officer'
    when 'analyst' then 'analyst'
    when 'auditor' then 'auditor'
    else 'organization_member'
  end,
  cm.company_id,
  'active',
  'migration',
  'Mapped from company membership'
from public.company_memberships cm
where cm.status <> 'revoked'
on conflict do nothing;

insert into public.clearance_records (
  profile_id, track, level, status, available_capabilities, restricted_capabilities, restriction_reasons, next_steps
)
select
  p.id,
  'operator',
  case when p.operator_application_status = 'APPROVED' then 'D3' else 'D0' end,
  case when p.operator_application_status = 'APPROVED' then 'active' else 'active_limited' end,
  array['report.create', 'report.confirm', 'field.mission.join', 'vehicle.prepare'],
  case when p.operator_application_status = 'APPROVED' then '{}'::text[] else array['trip.accept', 'vehicle.operate'] end,
  case when p.operator_application_status = 'APPROVED' then '{}'::jsonb else '{"trip.accept":"Operator clearance is not complete.","vehicle.operate":"Vehicle and operator clearance are required."}'::jsonb end,
  case when p.operator_application_status = 'APPROVED' then '[]'::jsonb else '[{"action":"complete_operator_clearance"}]'::jsonb end
from public.profiles p
where p.role = 'operator' or p.operator_application_status is not null
on conflict (profile_id, track) where profile_id is not null do nothing;

insert into public.clearance_records (
  company_id, track, level, status, available_capabilities, restricted_capabilities, next_steps
)
select
  c.id,
  'organization',
  case when c.clearance_status = 'active' then 'O3' else 'O0' end,
  c.clearance_status,
  array['organization.profile.prepare', 'organization.roster.prepare', 'training.join'],
  case when c.clearance_status = 'active' then '{}'::text[] else array['organization.full_operations'] end,
  case when c.clearance_status = 'active' then '[]'::jsonb else '[{"action":"complete_organization_clearance"}]'::jsonb end
from public.companies c
on conflict (company_id, track) where company_id is not null do nothing;

create or replace function public.afat_has_permission(
  p_permission_key text,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.profile_capability_overrides denied
      where denied.profile_id = (select auth.uid())
        and denied.permission_key = p_permission_key
        and denied.allowed = false
        and (denied.expires_at is null or denied.expires_at > now())
        and not exists (
          select 1
          from public.profile_role_assignments permanent_founder
          where permanent_founder.profile_id = (select auth.uid())
            and permanent_founder.role_key = 'founder_owner'
            and permanent_founder.status = 'active'
        )
    )
    and exists (
      select 1
      from public.access_permissions required_permission
      where required_permission.permission_key = p_permission_key
        and (
          not required_permission.requires_aal2
          or coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
        )
        and (
          exists (
            select 1
            from public.profile_role_assignments founder_assignment
            where founder_assignment.profile_id = (select auth.uid())
              and founder_assignment.role_key = 'founder_owner'
              and founder_assignment.status = 'active'
          )
          or exists (
            select 1
            from public.profile_role_assignments pra
            join public.access_role_permissions arp on arp.role_key = pra.role_key
            where pra.profile_id = (select auth.uid())
              and pra.status = 'active'
              and (pra.expires_at is null or pra.expires_at > now())
              and arp.permission_key = p_permission_key
              and (p_company_id is null or pra.company_id is null or pra.company_id = p_company_id)
          )
          or exists (
            select 1
            from public.profile_capability_overrides allowed_override
            where allowed_override.profile_id = (select auth.uid())
              and allowed_override.permission_key = p_permission_key
              and allowed_override.allowed = true
              and (allowed_override.expires_at is null or allowed_override.expires_at > now())
          )
        )
    );
$$;

revoke all on function public.afat_has_permission(text, uuid) from public, anon;
grant execute on function public.afat_has_permission(text, uuid) to authenticated, service_role;

create or replace function public.afat_bootstrap_founder(
  p_profile_id uuid,
  p_email text,
  p_request_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_row public.founder_bootstrap_control%rowtype;
  assignment_id uuid;
begin
  if p_profile_id is null or nullif(lower(btrim(coalesce(p_email, ''))), '') is null then
    raise exception 'Founder profile and verified email are required';
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'AFAT profile not found';
  end if;

  select * into bootstrap_row
  from public.founder_bootstrap_control
  where singleton = true
  for update;

  if bootstrap_row.bootstrap_used then
    raise exception 'Founder bootstrap has already been used';
  end if;

  if exists (
    select 1 from public.profile_role_assignments
    where role_key = 'founder_owner' and status = 'active'
  ) then
    raise exception 'An active Founder already exists';
  end if;

  insert into public.profile_role_assignments (
    profile_id, role_key, status, source, granted_by, reason, metadata
  ) values (
    p_profile_id, 'founder_owner', 'active', 'founder_bootstrap', p_profile_id,
    'One-time protected Founder bootstrap', jsonb_build_object('verified_email', lower(btrim(p_email)))
  ) returning id into assignment_id;

  insert into public.access_scopes (assignment_id, scope_type, scope_value)
  values (assignment_id, 'platform', '*');

  update public.founder_bootstrap_control
  set bootstrap_used = true,
      founder_profile_id = p_profile_id,
      founder_email = lower(btrim(p_email)),
      bootstrapped_at = now(),
      updated_at = now()
  where singleton = true;

  update public.profiles
  set role = 'admin', access_level = 'admin', identity_status = 'verified', updated_at = now()
  where id = p_profile_id;

  insert into public.access_audit_events (
    actor_profile_id, event_type, target_type, target_id, reason, new_state, request_context
  ) values (
    p_profile_id, 'founder.bootstrap', 'profile', p_profile_id::text,
    'One-time Founder authority established',
    jsonb_build_object('role_key', 'founder_owner', 'assignment_id', assignment_id),
    coalesce(p_request_context, '{}'::jsonb)
  );

  return assignment_id;
end;
$$;

revoke all on function public.afat_bootstrap_founder(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.afat_bootstrap_founder(uuid, text, jsonb) to service_role;

create or replace function public.afat_accept_staff_invitation(
  p_invitation_id uuid,
  p_profile_id uuid,
  p_email text,
  p_token_hash text,
  p_request_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.staff_invitations%rowtype;
  assignment_row public.profile_role_assignments%rowtype;
  requested_scope jsonb;
begin
  select * into invitation_row
  from public.staff_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if invitation_row.status not in ('pending', 'sent') then raise exception 'Invitation is no longer active'; end if;
  if invitation_row.expires_at <= now() then
    update public.staff_invitations set status = 'expired', updated_at = now() where id = p_invitation_id;
    raise exception 'Invitation has expired';
  end if;
  if invitation_row.email <> lower(btrim(coalesce(p_email, ''))) then raise exception 'Invitation email does not match'; end if;
  if invitation_row.token_hash <> p_token_hash then raise exception 'Invalid invitation token'; end if;

  select * into assignment_row
  from public.profile_role_assignments
  where profile_id = p_profile_id
    and role_key = invitation_row.role_key
    and company_id is not distinct from invitation_row.company_id
    and status in ('pending', 'provisional', 'active')
  limit 1
  for update;

  if assignment_row.id is null then
    insert into public.profile_role_assignments (
      profile_id, role_key, company_id, status, source, granted_by, reason, metadata
    ) values (
      p_profile_id, invitation_row.role_key, invitation_row.company_id, 'active',
      'invitation', invitation_row.invited_by, 'Accepted protected staff invitation',
      jsonb_build_object('invitation_id', invitation_row.id)
    ) returning * into assignment_row;
  else
    update public.profile_role_assignments
    set status = 'active', source = 'invitation', granted_by = invitation_row.invited_by,
        reviewed_at = now(), updated_at = now()
    where id = assignment_row.id
    returning * into assignment_row;
  end if;

  for requested_scope in select * from jsonb_array_elements(invitation_row.requested_scopes)
  loop
    insert into public.access_scopes (assignment_id, scope_type, scope_value)
    values (
      assignment_row.id,
      requested_scope->>'type',
      requested_scope->>'value'
    )
    on conflict (assignment_id, scope_type, scope_value) do nothing;
  end loop;

  update public.staff_invitations
  set status = 'accepted', accepted_by = p_profile_id, accepted_at = now(), updated_at = now()
  where id = p_invitation_id;

  if invitation_row.company_id is not null then
    insert into public.company_memberships (
      company_id, profile_id, role, status, created_at, updated_at
    ) values (
      invitation_row.company_id,
      p_profile_id,
      case assignment_row.role_key
        when 'organization_owner' then 'owner'
        when 'organization_admin' then 'admin'
        when 'fleet_manager' then 'fleet_manager'
        when 'dispatcher' then 'dispatcher'
        when 'compliance_officer' then 'compliance_officer'
        when 'finance_officer' then 'finance_officer'
        when 'analyst' then 'analyst'
        when 'auditor' then 'auditor'
        when 'verified_operator' then 'operator'
        else 'member'
      end,
      'active',
      now(),
      now()
    )
    on conflict (company_id, profile_id) do update
      set role = excluded.role, status = 'active', updated_at = now();
  end if;

  if assignment_row.role_key in (
    'fleet_planner', 'afat_operational_planner', 'municipal_planner',
    'government_planner', 'emergency_planner'
  ) then
    update public.profiles set role = 'planner', access_level = 'planner', updated_at = now()
    where id = p_profile_id;
  elsif assignment_row.role_key in ('operations_admin', 'security_admin', 'platform_admin') then
    update public.profiles set role = 'admin', access_level = 'admin', updated_at = now()
    where id = p_profile_id;
  end if;

  insert into public.access_audit_events (
    actor_profile_id, event_type, target_type, target_id, company_id, reason, new_state, request_context
  ) values (
    p_profile_id, 'staff.invitation.accepted', 'role_assignment', assignment_row.id::text,
    invitation_row.company_id, 'Protected staff invitation accepted',
    jsonb_build_object('role_key', assignment_row.role_key, 'invitation_id', invitation_row.id),
    coalesce(p_request_context, '{}'::jsonb)
  );

  return assignment_row.id;
end;
$$;

revoke all on function public.afat_accept_staff_invitation(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.afat_accept_staff_invitation(uuid, uuid, text, text, jsonb) to service_role;

create or replace function public.reject_access_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AFAT access audit events are append-only';
end;
$$;

drop trigger if exists access_audit_events_append_only on public.access_audit_events;
create trigger access_audit_events_append_only
before update or delete on public.access_audit_events
for each row execute function public.reject_access_audit_mutation();

-- New identities always start safely. Role intent is processed by protected
-- onboarding and never trusted from user-editable metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, phone, username, full_name, avatar_url, role, attribution_source,
    identity_status, training_status, risk_status
  ) values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    'commuter',
    coalesce(new.raw_user_meta_data->>'utm_source', 'organic'),
    case when coalesce(new.raw_user_meta_data->>'is_anonymous', 'false') = 'true' then 'anonymous' else 'basic' end,
    'not_started',
    'normal'
  )
  on conflict (id) do nothing;

  insert into public.profile_role_assignments (profile_id, role_key, status, source, reason)
  values (new.id, 'commuter', 'active', 'automatic', 'Safe default AFAT identity')
  on conflict do nothing;

  insert into public.profile_role_assignments (profile_id, role_key, status, source, reason)
  values (new.id, 'community_contributor', 'active', 'automatic', 'Universal reporting capability')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- RLS and explicit Data API grants. Server-owned invitation and Founder
-- credential tables remain inaccessible to browser roles.
alter table public.access_role_definitions enable row level security;
alter table public.access_permissions enable row level security;
alter table public.access_role_permissions enable row level security;
alter table public.profile_role_assignments enable row level security;
alter table public.access_scopes enable row level security;
alter table public.clearance_records enable row level security;
alter table public.profile_capability_overrides enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.access_audit_events enable row level security;
alter table public.founder_bootstrap_control enable row level security;
alter table public.founder_credentials enable row level security;

revoke all on public.access_role_definitions from public, anon, authenticated;
revoke all on public.access_permissions from public, anon, authenticated;
revoke all on public.access_role_permissions from public, anon, authenticated;
revoke all on public.profile_role_assignments from public, anon, authenticated;
revoke all on public.access_scopes from public, anon, authenticated;
revoke all on public.clearance_records from public, anon, authenticated;
revoke all on public.profile_capability_overrides from public, anon, authenticated;
revoke all on public.staff_invitations from public, anon, authenticated;
revoke all on public.access_audit_events from public, anon, authenticated;
revoke all on public.founder_bootstrap_control from public, anon, authenticated;
revoke all on public.founder_credentials from public, anon, authenticated;

grant select on public.access_role_definitions to authenticated;
grant select on public.access_permissions to authenticated;
grant select on public.access_role_permissions to authenticated;
grant select on public.profile_role_assignments to authenticated;
grant select on public.access_scopes to authenticated;
grant select on public.clearance_records to authenticated;
grant select on public.profile_capability_overrides to authenticated;
grant select on public.access_audit_events to authenticated;

grant all on public.access_role_definitions to service_role;
grant all on public.access_permissions to service_role;
grant all on public.access_role_permissions to service_role;
grant all on public.profile_role_assignments to service_role;
grant all on public.access_scopes to service_role;
grant all on public.clearance_records to service_role;
grant all on public.profile_capability_overrides to service_role;
grant all on public.staff_invitations to service_role;
grant select, insert on public.access_audit_events to service_role;
grant all on public.founder_bootstrap_control to service_role;
grant all on public.founder_credentials to service_role;
grant usage, select on sequence public.access_audit_events_id_seq to service_role;

drop policy if exists access_definitions_read on public.access_role_definitions;
create policy access_definitions_read on public.access_role_definitions
for select to authenticated using (true);

drop policy if exists access_permissions_read on public.access_permissions;
create policy access_permissions_read on public.access_permissions
for select to authenticated using (true);

drop policy if exists access_role_permissions_read on public.access_role_permissions;
create policy access_role_permissions_read on public.access_role_permissions
for select to authenticated using (true);

drop policy if exists own_role_assignments_read on public.profile_role_assignments;
create policy own_role_assignments_read on public.profile_role_assignments
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (select public.afat_has_permission('access.people.view', company_id))
);

drop policy if exists own_access_scopes_read on public.access_scopes;
create policy own_access_scopes_read on public.access_scopes
for select to authenticated
using (
  exists (
    select 1 from public.profile_role_assignments pra
    where pra.id = assignment_id and pra.profile_id = (select auth.uid())
  )
  or (select public.afat_has_permission('access.people.view', null))
);

drop policy if exists own_clearance_read on public.clearance_records;
create policy own_clearance_read on public.clearance_records
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (company_id is not null and (select public.afat_has_permission('access.people.view', company_id)))
);

drop policy if exists own_capability_overrides_read on public.profile_capability_overrides;
create policy own_capability_overrides_read on public.profile_capability_overrides
for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists own_access_audit_read on public.access_audit_events;
create policy own_access_audit_read on public.access_audit_events
for select to authenticated
using (
  actor_profile_id = (select auth.uid())
  or (select public.afat_has_permission('access.audit.view', company_id))
);

commit;
