create table if not exists public.access_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_key text not null check (capability_key in ('operator','planner','organization','public_partner','admin')),
  requested_role_key text references public.access_role_definitions(role_key) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'submitted'
    check (status in ('draft','submitted','under_review','needs_information','approved','restricted','rejected','withdrawn','suspended')),
  application_type text not null default 'self_service'
    check (application_type in ('self_service','invitation','organization','public_partner','internal')),
  reason text,
  requested_scope jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  review_scope jsonb not null default '{}'::jsonb,
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_applications_profile_idx
  on public.access_applications(profile_id, status, capability_key);

create index if not exists access_applications_review_idx
  on public.access_applications(status, capability_key, submitted_at desc);

create unique index if not exists access_applications_open_uidx
  on public.access_applications(profile_id, capability_key, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('draft','submitted','under_review','needs_information');

alter table public.access_applications enable row level security;

revoke all on table public.access_applications from anon;
revoke insert, update, delete on table public.access_applications from authenticated;
grant select on table public.access_applications to authenticated;
grant all on table public.access_applications to service_role;

drop policy if exists access_applications_own_read on public.access_applications;
create policy access_applications_own_read
on public.access_applications
for select
to authenticated
using ((select auth.uid()) = profile_id);

create or replace function public.afat_review_access_application(
  p_application_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_notes text default null,
  p_role_key text default null,
  p_review_scope jsonb default '{}'::jsonb
)
returns public.access_applications
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_app public.access_applications;
  v_role_key text;
  v_assignment_status text;
  v_now timestamptz := now();
  v_result public.access_applications;
begin
  if p_decision not in ('approved','restricted','needs_information','rejected','suspended') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_app
  from public.access_applications
  where id = p_application_id
  for update;

  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if p_decision in ('approved','restricted') and v_app.capability_key = 'admin' and v_app.application_type <> 'invitation' then
    raise exception 'ADMIN_INVITATION_REQUIRED';
  end if;

  v_role_key := coalesce(
    nullif(p_role_key, ''),
    v_app.requested_role_key,
    case v_app.capability_key
      when 'operator' then 'verified_operator'
      when 'planner' then 'afat_operational_planner'
      when 'organization' then 'organization_member'
      else null
    end
  );

  update public.access_applications
  set status = p_decision,
      requested_role_key = coalesce(v_role_key, requested_role_key),
      review_notes = nullif(trim(coalesce(p_notes,'')), ''),
      review_scope = coalesce(p_review_scope, '{}'::jsonb),
      reviewed_by = p_reviewer_id,
      reviewed_at = v_now,
      updated_at = v_now
  where id = p_application_id
  returning * into v_result;

  if p_decision in ('approved','restricted') and v_role_key is not null then
    v_assignment_status := case when p_decision = 'restricted' then 'provisional' else 'active' end;

    update public.profile_role_assignments
       set status = v_assignment_status,
           source = 'review',
           granted_by = p_reviewer_id,
           granted_at = v_now,
           reviewed_at = v_now,
           revoked_at = null,
           expires_at = case
             when p_decision = 'restricted' and (p_review_scope ? 'expires_at')
               then nullif(p_review_scope->>'expires_at','')::timestamptz
             else expires_at
           end,
           reason = nullif(trim(coalesce(p_notes,'')), ''),
           metadata = coalesce(metadata,'{}'::jsonb)
             || jsonb_build_object('application_id', p_application_id, 'capability_key', v_app.capability_key)
             || jsonb_build_object('review_scope', coalesce(p_review_scope,'{}'::jsonb)),
           updated_at = v_now
     where profile_id = v_app.profile_id
       and role_key = v_role_key
       and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_app.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
       and status in ('pending','provisional','active');

    if not found then
      insert into public.profile_role_assignments (
        profile_id, role_key, company_id, status, source, granted_by,
        granted_at, reviewed_at, reason, metadata
      ) values (
        v_app.profile_id, v_role_key, v_app.company_id, v_assignment_status, 'review', p_reviewer_id,
        v_now, v_now, nullif(trim(coalesce(p_notes,'')), ''),
        jsonb_build_object(
          'application_id', p_application_id,
          'capability_key', v_app.capability_key,
          'review_scope', coalesce(p_review_scope,'{}'::jsonb)
        )
      );
    end if;
  elsif p_decision in ('rejected','suspended') and v_role_key is not null then
    update public.profile_role_assignments
       set status = case when p_decision='suspended' then 'suspended' else 'revoked' end,
           revoked_at = case when p_decision='rejected' then v_now else revoked_at end,
           reviewed_at = v_now,
           reason = nullif(trim(coalesce(p_notes,'')), ''),
           updated_at = v_now
     where profile_id = v_app.profile_id
       and role_key = v_role_key
       and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_app.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
       and status in ('pending','provisional','active');
  end if;

  if v_app.capability_key = 'operator' then
    update public.profiles
       set operator_application_status = upper(
             case
               when p_decision='approved' then 'approved'
               when p_decision='restricted' then 'approved'
               when p_decision='needs_information' then 'documents_pending'
               when p_decision='rejected' then 'rejected'
               when p_decision='suspended' then 'suspended'
             end
           ),
           operator_review_notes = nullif(trim(coalesce(p_notes,'')), ''),
           operator_approved_at = case when p_decision in ('approved','restricted') then v_now else null end,
           verification_status = case when p_decision in ('approved','restricted') then 'verified' else verification_status end,
           approval_status = case
             when p_decision in ('approved','restricted') then 'approved'
             when p_decision='suspended' then 'suspended'
             when p_decision='rejected' then 'rejected'
             else approval_status
           end,
           role = case
             when p_decision in ('approved','restricted') and role='commuter' then 'operator'
             when p_decision='rejected' and role='operator' then 'commuter'
             else role
           end,
           is_active = case when p_decision='suspended' then false else is_active end,
           updated_at = v_now
     where id = v_app.profile_id;
  elsif v_app.capability_key = 'planner' and p_decision in ('approved','restricted') then
    update public.profiles
       set role = case when role='commuter' then 'planner' else role end,
           approval_status = 'approved',
           is_active = true,
           updated_at = v_now
     where id = v_app.profile_id;
  end if;

  insert into public.access_audit_events(
    actor_profile_id, event_type, target_type, target_id, company_id,
    reason, previous_state, new_state, request_context
  ) values (
    p_reviewer_id,
    'access_application_reviewed',
    'access_application',
    p_application_id::text,
    v_app.company_id,
    nullif(trim(coalesce(p_notes,'')), ''),
    jsonb_build_object('status', v_app.status, 'requested_role_key', v_app.requested_role_key),
    jsonb_build_object('status', p_decision, 'role_key', v_role_key, 'review_scope', coalesce(p_review_scope,'{}'::jsonb)),
    jsonb_build_object('capability_key', v_app.capability_key)
  );

  return v_result;
end;
$$;

revoke all on function public.afat_review_access_application(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.afat_review_access_application(uuid,uuid,text,text,text,jsonb) to service_role;

comment on table public.access_applications is
'Canonical AFAT capability application lifecycle. Basic passenger access remains self-service; elevated capabilities are reviewed and become scoped role assignments.';
