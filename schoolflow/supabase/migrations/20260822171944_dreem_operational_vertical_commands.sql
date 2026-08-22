-- DREEM vertical workflow commands: invitations, enrolment, credentials, attendance and assessments.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dreem_school_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check(role in ('platform_founder','school_owner','principal','administrator','academic_head','bursar','accountant','teacher','tutor','parent','student','auditor')),
  status text not null default 'pending' check(status in ('pending','approved','suspended','rejected')),
  invited_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, school_id)
);

alter table public.dreem_school_memberships drop constraint if exists dreem_school_memberships_role_check;
alter table public.dreem_school_memberships add constraint dreem_school_memberships_role_check check(role in ('platform_founder','school_owner','principal','administrator','academic_head','bursar','accountant','teacher','tutor','parent','student','auditor'));
alter table public.dreem_school_memberships drop constraint if exists dreem_school_memberships_status_check;
alter table public.dreem_school_memberships add constraint dreem_school_memberships_status_check check(status in ('pending','approved','suspended','rejected'));

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  matricule text not null,
  full_name text not null,
  class_name text,
  attendance_rate numeric(5,2) not null default 0,
  risk_level text not null default 'unknown',
  parent_user_ids uuid[] not null default '{}'::uuid[],
  merged_into_student_id uuid references public.students(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, matricule)
);

create table if not exists public.fee_accounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  amount_due numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students add column if not exists date_of_birth date;
alter table public.students add column if not exists sex text check(sex is null or sex in ('female','male','other'));
alter table public.students add column if not exists guardian_contact text;
alter table public.students add column if not exists medical_notes text;
alter table public.students add column if not exists consent_metadata jsonb not null default '{}'::jsonb;
alter table public.students add column if not exists welfare_restricted jsonb not null default '{}'::jsonb;
alter table public.students add column if not exists successful_methods jsonb not null default '[]'::jsonb;

create table if not exists public.dreem_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check(role in ('school_owner','principal','administrator','academic_head','bursar','accountant','teacher','tutor','auditor')),
  status text not null default 'pending' check(status in ('pending','accepted','cancelled','expired')),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, email, role)
);

create table if not exists public.dreem_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_name text not null,
  session_date date not null,
  period_label text not null default 'AM',
  captured_by uuid not null references auth.users(id),
  status text not null default 'submitted' check(status in ('draft','submitted','approved','corrected','cancelled')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, idempotency_key),
  unique(school_id, class_name, session_date, period_label)
);

create table if not exists public.dreem_attendance_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  session_id uuid not null references public.dreem_attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check(status in ('present','late','absent','excused')),
  note text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(session_id, student_id)
);

create table if not exists public.dreem_assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.dreem_subjects(id) on delete set null,
  class_name text not null,
  title text not null,
  max_score numeric(8,2) not null check(max_score > 0),
  assessment_date date not null,
  status text not null default 'draft' check(status in ('draft','submitted','approved','published','cancelled')),
  created_by uuid not null references auth.users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, idempotency_key)
);

create table if not exists public.dreem_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.dreem_assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric(8,2) not null check(score >= 0),
  comment text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(assessment_id, student_id)
);

alter table public.schools enable row level security;
alter table public.dreem_school_memberships enable row level security;
alter table public.students enable row level security;
alter table public.fee_accounts enable row level security;
alter table public.dreem_staff_invitations enable row level security;
alter table public.dreem_attendance_sessions enable row level security;
alter table public.dreem_attendance_marks enable row level security;
alter table public.dreem_assessments enable row level security;
alter table public.dreem_marks enable row level security;

drop policy if exists dreem_memberships_read on public.dreem_school_memberships;
drop policy if exists dreem_schools_read on public.schools;
drop policy if exists dreem_students_read on public.students;
drop policy if exists dreem_fee_accounts_read on public.fee_accounts;
drop policy if exists dreem_invitations_read on public.dreem_staff_invitations;
drop policy if exists dreem_attendance_read on public.dreem_attendance_sessions;
drop policy if exists dreem_attendance_marks_read on public.dreem_attendance_marks;
drop policy if exists dreem_assessments_read on public.dreem_assessments;
drop policy if exists dreem_marks_read on public.dreem_marks;

create policy dreem_memberships_read on public.dreem_school_memberships for select to authenticated using (profile_id = (select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership','auditor'])));
create policy dreem_schools_read on public.schools for select to authenticated using ((select private.dreem_is_member(id)));
create policy dreem_students_read on public.students for select to authenticated using ((select private.dreem_can_view_student(school_id,id)));
create policy dreem_fee_accounts_read on public.fee_accounts for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','bursar'])));
create policy dreem_invitations_read on public.dreem_staff_invitations for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','auditor'])));
create policy dreem_attendance_read on public.dreem_attendance_sessions for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','teacher','auditor'])));
create policy dreem_attendance_marks_read on public.dreem_attendance_marks for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','teacher','auditor'])));
create policy dreem_assessments_read on public.dreem_assessments for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','teacher','auditor'])));
create policy dreem_marks_read on public.dreem_marks for select to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','teacher','auditor'])));

grant select on public.schools, public.dreem_school_memberships, public.students, public.fee_accounts, public.dreem_staff_invitations, public.dreem_attendance_sessions, public.dreem_attendance_marks, public.dreem_assessments, public.dreem_marks to authenticated;

create trigger dreem_audit_memberships after insert or update or delete on public.dreem_school_memberships for each row execute function private.dreem_audit_row();
create trigger dreem_audit_students after insert or update or delete on public.students for each row execute function private.dreem_audit_row();
create trigger dreem_audit_fee_accounts after insert or update or delete on public.fee_accounts for each row execute function private.dreem_audit_row();
create trigger dreem_audit_staff_invitations after insert or update or delete on public.dreem_staff_invitations for each row execute function private.dreem_audit_row();
create trigger dreem_audit_attendance_sessions after insert or update or delete on public.dreem_attendance_sessions for each row execute function private.dreem_audit_row();
create trigger dreem_audit_attendance_marks after insert or update or delete on public.dreem_attendance_marks for each row execute function private.dreem_audit_row();
create trigger dreem_audit_assessments after insert or update or delete on public.dreem_assessments for each row execute function private.dreem_audit_row();
create trigger dreem_audit_marks after insert or update or delete on public.dreem_marks for each row execute function private.dreem_audit_row();

create or replace function private.dreem_active_school_for_role(p_roles text[])
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select m.school_id
  from public.dreem_school_memberships m
  where m.profile_id = (select auth.uid())
    and m.status = 'approved'
    and private.dreem_has_role(m.school_id,p_roles)
  order by m.created_at
  limit 1;
$$;

create or replace function private.dreem_write_event(p_school_id uuid, p_aggregate_type text, p_aggregate_id uuid, p_event_type text, p_idempotency_key text, p_payload jsonb)
returns void
language sql
security definer
set search_path=''
as $$
  insert into public.dreem_domain_events(school_id, aggregate_type, aggregate_id, event_type, idempotency_key, payload)
  values (p_school_id, p_aggregate_type, p_aggregate_id, p_event_type, p_idempotency_key, p_payload)
  on conflict (school_id, idempotency_key) do nothing;
$$;

create or replace function public.dreem_invite_staff(p_email text, p_full_name text, p_role text, p_idempotency_key text)
returns table(invitation_id uuid, invitation_status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_invitation_id uuid;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  v_school_id := private.dreem_active_school_for_role(array['leadership','support']);
  if v_school_id is null then raise exception 'You are not authorized to invite staff.'; end if;
  if p_role not in ('school_owner','principal','administrator','academic_head','bursar','accountant','teacher','tutor','auditor') then raise exception 'Unsupported staff role.'; end if;
  if nullif(trim(p_email),'') is null then raise exception 'Email is required.'; end if;

  insert into public.dreem_staff_invitations(school_id,email,full_name,role,invited_by,token_hash)
  values (v_school_id, lower(trim(p_email)), trim(p_full_name), p_role, v_actor, encode(public.digest(concat(p_idempotency_key,':',lower(trim(p_email))),'sha256'),'hex'))
  on conflict (school_id,email,role) do update
  set full_name = excluded.full_name, status = 'pending', updated_at = now()
  returning id, status into v_invitation_id, invitation_status;

  perform private.dreem_write_event(v_school_id,'staff_invitation',v_invitation_id,'staff.invited',concat('staff.invited:',p_idempotency_key),jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
  invitation_id := v_invitation_id;
  return next;
end;
$$;

create or replace function public.dreem_update_membership_status(p_membership_id uuid, p_status text)
returns table(membership_id uuid, membership_status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  if p_status not in ('pending','approved','suspended','rejected') then raise exception 'Unsupported membership status.'; end if;

  select m.school_id into v_school_id from public.dreem_school_memberships m where m.id = p_membership_id;
  if v_school_id is null or not private.dreem_has_role(v_school_id,array['leadership','support']) then
    raise exception 'You are not authorized to update this membership.';
  end if;

  update public.dreem_school_memberships
     set status = p_status, reviewed_by = v_actor, reviewed_at = now(), updated_at = now()
   where id = p_membership_id
   returning id, status into membership_id, membership_status;

  perform private.dreem_write_event(v_school_id,'membership',p_membership_id,'membership.status_changed',concat('membership.status:',p_membership_id,':',p_status),jsonb_build_object('status',p_status));
  return next;
end;
$$;

create or replace function public.dreem_enrol_learner(
  p_full_name text,
  p_class_name text,
  p_date_of_birth date,
  p_sex text,
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_email text,
  p_relationship text,
  p_opening_balance numeric,
  p_idempotency_key text
) returns table(student_id uuid, matricule text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_prefix text;
  v_student_id uuid;
  v_guardian_id uuid;
  v_matricule text;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  v_school_id := private.dreem_active_school_for_role(array['leadership','support']);
  if v_school_id is null then raise exception 'You are not authorized to enrol learners.'; end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'Learner name is required.'; end if;
  if p_sex is not null and p_sex not in ('female','male','other') then raise exception 'Unsupported sex value.'; end if;

  select coalesce(student_id_prefix,'DRM') into v_prefix from public.dreem_school_brands where school_id = v_school_id;
  v_matricule := concat(coalesce(v_prefix,'DRM'), '-', to_char(now(),'YY'), '-', upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)));

  insert into public.students(school_id,matricule,full_name,class_name,date_of_birth,sex,guardian_contact)
  values (v_school_id,v_matricule,trim(p_full_name),nullif(trim(p_class_name),''),p_date_of_birth,p_sex,nullif(trim(p_guardian_phone),''))
  returning id, matricule into v_student_id, matricule;

  if nullif(trim(p_guardian_name),'') is not null then
    insert into public.dreem_guardians(school_id,full_name,phone,email)
    values (v_school_id,trim(p_guardian_name),nullif(trim(p_guardian_phone),''),nullif(lower(trim(p_guardian_email)),''))
    returning id into v_guardian_id;

    insert into public.dreem_student_guardians(school_id,student_id,guardian_id,relationship,is_primary)
    values (v_school_id,v_student_id,v_guardian_id,coalesce(nullif(trim(p_relationship),''),'guardian'),true);
  end if;

  insert into public.fee_accounts(school_id,student_id,amount_due,balance_due,status)
  values (v_school_id,v_student_id,coalesce(p_opening_balance,0),coalesce(p_opening_balance,0),'open');

  perform private.dreem_write_event(v_school_id,'student',v_student_id,'learner.enrolled',concat('learner.enrolled:',p_idempotency_key),jsonb_build_object('student_id',v_student_id,'matricule',v_matricule,'class_name',p_class_name));
  student_id := v_student_id;
  return next;
end;
$$;

create or replace function public.dreem_issue_student_credential(p_student_id uuid, p_valid_until date, p_idempotency_key text)
returns table(credential_id uuid, verification_token text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_token text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  select s.school_id into v_school_id from public.students s where s.id = p_student_id;
  if v_school_id is null or not private.dreem_has_role(v_school_id,array['leadership','support']) then raise exception 'You are not authorized to issue this credential.'; end if;
  if p_valid_until is null or p_valid_until <= current_date then raise exception 'Credential expiry must be in the future.'; end if;

  update public.dreem_student_credentials
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where school_id = v_school_id and student_id = p_student_id and status = 'active';

  insert into public.dreem_student_credentials(school_id,student_id,token_hash,valid_until,status,metadata)
  values (v_school_id,p_student_id,encode(public.digest(v_token,'sha256'),'hex'),p_valid_until,'active',jsonb_build_object('issued_by',v_actor))
  returning id into credential_id;

  perform private.dreem_write_event(v_school_id,'student_credential',credential_id,'credential.issued',concat('credential.issued:',p_idempotency_key),jsonb_build_object('student_id',p_student_id,'valid_until',p_valid_until));
  verification_token := v_token;
  return next;
end;
$$;

create or replace function public.dreem_verify_student_credential(p_token text)
returns table(school_name text, school_short_name text, student_display_name text, matricule text, current_class text, valid_until date, credential_status text)
language plpgsql
security definer
set search_path=''
as $$
begin
  return query
  select sc.name, b.short_name, s.full_name, s.matricule, coalesce(s.class_name,''), c.valid_until,
         case when c.status = 'active' and c.valid_until >= current_date then 'valid' else c.status end
  from public.dreem_student_credentials c
  join public.students s on s.id = c.student_id and s.school_id = c.school_id
  join public.schools sc on sc.id = c.school_id
  left join public.dreem_school_brands b on b.school_id = c.school_id
  where c.token_hash = encode(public.digest(p_token,'sha256'),'hex')
  limit 1;
end;
$$;

create or replace function public.dreem_record_attendance(p_class_name text, p_session_date date, p_period_label text, p_marks jsonb, p_idempotency_key text)
returns table(session_id uuid, recorded_count integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_session_id uuid;
  v_count integer;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  v_school_id := private.dreem_active_school_for_role(array['leadership','support','teacher']);
  if v_school_id is null then raise exception 'You are not authorized to record attendance.'; end if;
  if p_session_date is null then raise exception 'Attendance date is required.'; end if;

  insert into public.dreem_attendance_sessions(school_id,class_name,session_date,period_label,captured_by,idempotency_key)
  values (v_school_id,trim(p_class_name),p_session_date,coalesce(nullif(trim(p_period_label),''),'AM'),v_actor,p_idempotency_key)
  on conflict (school_id,idempotency_key) do update set updated_at = now()
  returning id into v_session_id;

  insert into public.dreem_attendance_marks(school_id,session_id,student_id,status,note,recorded_by)
  select v_school_id, v_session_id, (mark->>'student_id')::uuid, mark->>'status', nullif(mark->>'note',''), v_actor
  from jsonb_array_elements(p_marks) as mark
  join public.students s on s.id = (mark->>'student_id')::uuid and s.school_id = v_school_id
  where mark->>'status' in ('present','late','absent','excused')
  on conflict (session_id, student_id) do update set status = excluded.status, note = excluded.note;

  select count(*) into v_count from public.dreem_attendance_marks where session_id = v_session_id;
  perform private.dreem_write_event(v_school_id,'attendance_session',v_session_id,'attendance.submitted',concat('attendance.submitted:',p_idempotency_key),jsonb_build_object('class_name',p_class_name,'recorded_count',v_count));
  session_id := v_session_id;
  recorded_count := v_count;
  return next;
end;
$$;

create or replace function public.dreem_record_assessment(p_subject_id uuid, p_class_name text, p_title text, p_max_score numeric, p_assessment_date date, p_marks jsonb, p_idempotency_key text)
returns table(assessment_id uuid, marks_count integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_assessment_id uuid;
  v_count integer;
  v_average numeric;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;
  v_school_id := private.dreem_active_school_for_role(array['leadership','support','teacher']);
  if v_school_id is null then raise exception 'You are not authorized to record assessments.'; end if;
  if p_max_score is null or p_max_score <= 0 then raise exception 'Maximum score must be positive.'; end if;

  insert into public.dreem_assessments(school_id,subject_id,class_name,title,max_score,assessment_date,status,created_by,idempotency_key)
  values (v_school_id,p_subject_id,trim(p_class_name),trim(p_title),p_max_score,p_assessment_date,'submitted',v_actor,p_idempotency_key)
  on conflict (school_id,idempotency_key) do update set updated_at = now()
  returning id into v_assessment_id;

  insert into public.dreem_marks(school_id,assessment_id,student_id,score,comment,recorded_by)
  select v_school_id, v_assessment_id, (mark->>'student_id')::uuid, (mark->>'score')::numeric, nullif(mark->>'comment',''), v_actor
  from jsonb_array_elements(p_marks) as mark
  join public.students s on s.id = (mark->>'student_id')::uuid and s.school_id = v_school_id
  where (mark->>'score')::numeric between 0 and p_max_score
  on conflict (assessment_id, student_id) do update set score = excluded.score, comment = excluded.comment;

  select count(*), avg(score / p_max_score * 100) into v_count, v_average from public.dreem_marks where assessment_id = v_assessment_id;
  perform private.dreem_write_event(v_school_id,'assessment',v_assessment_id,'assessment.submitted',concat('assessment.submitted:',p_idempotency_key),jsonb_build_object('class_name',p_class_name,'marks_count',v_count,'average',v_average));
  assessment_id := v_assessment_id;
  marks_count := v_count;
  return next;
end;
$$;

revoke all on function public.dreem_invite_staff(text,text,text,text) from public;
revoke all on function public.dreem_update_membership_status(uuid,text) from public;
revoke all on function public.dreem_enrol_learner(text,text,date,text,text,text,text,text,numeric,text) from public;
revoke all on function public.dreem_issue_student_credential(uuid,date,text) from public;
revoke all on function public.dreem_verify_student_credential(text) from public;
revoke all on function public.dreem_record_attendance(text,date,text,jsonb,text) from public;
revoke all on function public.dreem_record_assessment(uuid,text,text,numeric,date,jsonb,text) from public;

grant execute on function public.dreem_invite_staff(text,text,text,text) to authenticated;
grant execute on function public.dreem_update_membership_status(uuid,text) to authenticated;
grant execute on function public.dreem_enrol_learner(text,text,date,text,text,text,text,text,numeric,text) to authenticated;
grant execute on function public.dreem_issue_student_credential(uuid,date,text) to authenticated;
grant execute on function public.dreem_verify_student_credential(text) to anon, authenticated;
grant execute on function public.dreem_record_attendance(text,date,text,jsonb,text) to authenticated;
grant execute on function public.dreem_record_assessment(uuid,text,text,numeric,date,jsonb,text) to authenticated;
