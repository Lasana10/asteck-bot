-- Founder bootstrap and school-configuration foundations for DREEM.

create table if not exists private.dreem_founder_allowlist (
  normalized_email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (normalized_email = lower(trim(normalized_email)))
);

revoke all on table private.dreem_founder_allowlist from public, anon, authenticated;

alter table public.dreem_school_brands
  add column if not exists address_line text not null default '';

create or replace function private.dreem_has_role(p_school_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  with membership as (
    select m.role
    from public.dreem_school_memberships m
    where m.school_id = p_school_id
      and m.profile_id = (select auth.uid())
      and m.status = 'approved'
  )
  select (select auth.uid()) is not null and exists(
    select 1
    from membership
    where
      role = any(p_roles)
      or ('leadership' = any(p_roles) and role = any(array['platform_founder','school_owner','principal','administrator','academic_head','accountant','auditor']))
      or ('support' = any(p_roles) and role = any(array['platform_founder','school_owner','principal','administrator','academic_head']))
      or ('bursar' = any(p_roles) and role = any(array['bursar','accountant']))
      or ('teacher' = any(p_roles) and role = any(array['teacher','tutor']))
  );
$$;

create table if not exists public.dreem_academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planning' check(status in ('planning','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,name)
);

create table if not exists public.dreem_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.dreem_academic_years(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  order_index integer not null check(order_index between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_year_id, order_index)
);

create table if not exists public.dreem_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.dreem_academic_years(id) on delete set null,
  name text not null,
  section_name text not null default '',
  stream_name text not null default '',
  level_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, academic_year_id, name)
);

create table if not exists public.dreem_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text not null,
  subsystem text not null default 'bilingual' check(subsystem in ('anglophone','francophone','bilingual')),
  grading_weight numeric(6,2) not null default 100 check(grading_weight > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, code)
);

alter table public.dreem_academic_years enable row level security;
alter table public.dreem_terms enable row level security;
alter table public.dreem_classes enable row level security;
alter table public.dreem_subjects enable row level security;

create index if not exists dreem_academic_years_school_idx on public.dreem_academic_years(school_id, status, starts_on desc);
create index if not exists dreem_terms_school_year_idx on public.dreem_terms(school_id, academic_year_id, order_index);
create index if not exists dreem_classes_school_year_idx on public.dreem_classes(school_id, academic_year_id, name);
create index if not exists dreem_subjects_school_idx on public.dreem_subjects(school_id, code);

create policy dreem_academic_years_read on public.dreem_academic_years for select to authenticated using ((select private.dreem_is_member(school_id)));
create policy dreem_academic_years_insert on public.dreem_academic_years for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_academic_years_update on public.dreem_academic_years for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_academic_years_delete on public.dreem_academic_years for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

create policy dreem_terms_read on public.dreem_terms for select to authenticated using ((select private.dreem_is_member(school_id)));
create policy dreem_terms_insert on public.dreem_terms for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_terms_update on public.dreem_terms for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_terms_delete on public.dreem_terms for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

create policy dreem_classes_read on public.dreem_classes for select to authenticated using ((select private.dreem_is_member(school_id)));
create policy dreem_classes_insert on public.dreem_classes for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_classes_update on public.dreem_classes for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_classes_delete on public.dreem_classes for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

create policy dreem_subjects_read on public.dreem_subjects for select to authenticated using ((select private.dreem_is_member(school_id)));
create policy dreem_subjects_insert on public.dreem_subjects for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_subjects_update on public.dreem_subjects for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_subjects_delete on public.dreem_subjects for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

grant select, insert, update, delete on public.dreem_academic_years, public.dreem_terms, public.dreem_classes, public.dreem_subjects to authenticated;

create trigger dreem_audit_academic_years after insert or update or delete on public.dreem_academic_years for each row execute function private.dreem_audit_row();
create trigger dreem_audit_terms after insert or update or delete on public.dreem_terms for each row execute function private.dreem_audit_row();
create trigger dreem_audit_classes after insert or update or delete on public.dreem_classes for each row execute function private.dreem_audit_row();
create trigger dreem_audit_subjects after insert or update or delete on public.dreem_subjects for each row execute function private.dreem_audit_row();

create or replace function public.dreem_bootstrap_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_membership record;
  v_founder_exists boolean;
  v_is_allowlisted boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  select m.school_id, m.role, m.status
    into v_membership
    from public.dreem_school_memberships m
   where m.profile_id = v_actor
   order by case m.status when 'approved' then 0 when 'pending' then 1 when 'suspended' then 2 else 3 end
   limit 1;

  if found then
    return jsonb_build_object(
      'mode', case when v_membership.status = 'approved' then 'approved' when v_membership.status = 'pending' then 'pending' when v_membership.status = 'rejected' then 'rejected' else 'restricted' end,
      'schoolId', v_membership.school_id,
      'role', v_membership.role,
      'status', v_membership.status,
      'canBootstrap', false
    );
  end if;

  select exists(
    select 1 from public.dreem_school_memberships m
    where m.status = 'approved' and m.role in ('platform_founder','school_owner')
  ) into v_founder_exists;

  select exists(
    select 1
      from private.dreem_founder_allowlist a
     where a.normalized_email = lower(trim(coalesce(auth.jwt()->>'email','')))
       and a.enabled
  ) into v_is_allowlisted;

  return jsonb_build_object(
    'mode', case when v_founder_exists then 'claimed' when v_is_allowlisted then 'ready' else 'restricted' end,
    'schoolId', null,
    'role', null,
    'status', null,
    'canBootstrap', (not v_founder_exists and v_is_allowlisted)
  );
end;
$$;

create or replace function public.dreem_bootstrap_school(
  p_school_name text,
  p_school_slug text,
  p_short_name text,
  p_motto text,
  p_city text,
  p_subsystem text,
  p_receipt_prefix text,
  p_student_id_prefix text,
  p_primary_color text,
  p_accent_color text
) returns table(school_id uuid, membership_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status jsonb;
  v_school_id uuid;
  v_slug text := lower(regexp_replace(coalesce(p_school_slug,''), '[^a-z0-9]+', '-', 'g'));
  v_cols text[];
  v_vals text[];
  v_sql text;
  v_existing_school uuid;
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  v_status := public.dreem_bootstrap_status();
  if coalesce(v_status->>'mode','') = 'approved' then
    school_id := (v_status->>'schoolId')::uuid;
    membership_role := coalesce(v_status->>'role','platform_founder');
    return next;
    return;
  end if;

  if coalesce((v_status->>'canBootstrap')::boolean,false) is false then
    raise exception 'Founder bootstrap is not available for this account.';
  end if;

  if nullif(trim(p_school_name),'') is null then
    raise exception 'School name is required.';
  end if;
  if v_slug = '' then
    raise exception 'School slug is required.';
  end if;
  if p_subsystem not in ('anglophone','francophone','bilingual') then
    raise exception 'Subsystem must be anglophone, francophone or bilingual.';
  end if;

  execute 'select id from public.schools where slug = $1 limit 1' into v_existing_school using v_slug;
  if v_existing_school is not null then
    v_school_id := v_existing_school;
  else
    v_cols := array['name'];
    v_vals := array['$1'];
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='schools' and column_name='slug') then
      v_cols := array_append(v_cols,'slug');
      v_vals := array_append(v_vals,'$2');
    end if;
    v_sql := format('insert into public.schools(%s) values(%s) returning id', array_to_string(v_cols,','), array_to_string(v_vals,','));
    execute v_sql into v_school_id using p_school_name, v_slug;
  end if;

  update public.dreem_school_memberships
     set role = 'platform_founder',
         status = 'approved'
   where profile_id = v_actor
     and school_id = v_school_id;

  if not found then
    insert into public.dreem_school_memberships(profile_id, school_id, role, status)
    values (v_actor, v_school_id, 'platform_founder', 'approved');
  end if;

  insert into public.dreem_school_brands(
    school_id, short_name, motto, address_line, city, subsystem, primary_color, accent_color, receipt_prefix, student_id_prefix
  ) values (
    v_school_id, p_short_name, coalesce(p_motto,''), '', coalesce(p_city,''), p_subsystem, p_primary_color, p_accent_color, p_receipt_prefix, p_student_id_prefix
  )
  on conflict (school_id) do update
  set short_name = excluded.short_name,
      motto = excluded.motto,
      address_line = excluded.address_line,
      city = excluded.city,
      subsystem = excluded.subsystem,
      primary_color = excluded.primary_color,
      accent_color = excluded.accent_color,
      receipt_prefix = excluded.receipt_prefix,
      student_id_prefix = excluded.student_id_prefix,
      updated_at = now();

  insert into public.audit_events(school_id, actor_id, action, entity_type, entity_id, detail)
  values (
    v_school_id, v_actor, 'FOUNDER_BOOTSTRAP', 'schools', v_school_id,
    jsonb_build_object('school_name', p_school_name, 'slug', v_slug, 'role', 'platform_founder')
  );

  school_id := v_school_id;
  membership_role := 'platform_founder';
  return next;
end;
$$;

revoke all on function public.dreem_bootstrap_status() from public;
revoke all on function public.dreem_bootstrap_school(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.dreem_bootstrap_status() to authenticated;
grant execute on function public.dreem_bootstrap_school(text,text,text,text,text,text,text,text,text,text) to authenticated;
