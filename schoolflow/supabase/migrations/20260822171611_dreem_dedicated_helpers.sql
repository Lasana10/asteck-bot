-- DREEM operational expansion for the shared TSIDKENU project.
-- All new objects are DREEM-prefixed; existing legal-domain tables are untouched.

create schema if not exists private;

-- Dedicated DREEM projects do not have TSIDKENU's public.profiles table.
-- Link learner self-service accounts directly to auth.users instead.
alter table public.students
  add column if not exists profile_id uuid references auth.users(id) on delete set null;

create unique index if not exists dreem_students_school_profile_idx
  on public.students(school_id, profile_id)
  where profile_id is not null;

create or replace function private.dreem_is_member(p_school_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.dreem_school_memberships m
    where m.school_id=p_school_id and m.profile_id=(select auth.uid()) and m.status='approved'
  );
$$;

create or replace function private.dreem_has_role(p_school_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.dreem_school_memberships m
    where m.school_id=p_school_id and m.profile_id=(select auth.uid()) and m.status='approved' and m.role=any(p_roles)
  );
$$;

create or replace function private.dreem_can_view_student(p_school_id uuid,p_student_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    private.dreem_has_role(p_school_id,array['leadership','support','bursar','teacher'])
    or exists(select 1 from public.students s where s.id=p_student_id and s.school_id=p_school_id
      and (s.profile_id=(select auth.uid()) or (select auth.uid())=any(coalesce(s.parent_user_ids,array[]::uuid[]))) )
  );
$$;

revoke all on function private.dreem_is_member(uuid) from public;
revoke all on function private.dreem_has_role(uuid,text[]) from public;
revoke all on function private.dreem_can_view_student(uuid,uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.dreem_is_member(uuid),private.dreem_has_role(uuid,text[]),private.dreem_can_view_student(uuid,uuid) to authenticated;

create table public.dreem_school_brands (
  school_id uuid primary key references public.schools(id) on delete cascade,
  short_name text not null, motto text not null default '', city text not null default '',
  subsystem text not null default 'bilingual' check(subsystem in ('anglophone','francophone','bilingual')),
  primary_color text not null default '#123b2c', accent_color text not null default '#c9df83', logo_url text,
  receipt_prefix text not null, student_id_prefix text not null, timezone text not null default 'Africa/Douala', currency text not null default 'XAF',
  updated_at timestamptz not null default now()
);

create table public.dreem_guardians (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, full_name text not null, phone text, email text,
  preferred_language text not null default 'en' check(preferred_language in ('en','fr')),
  created_at timestamptz not null default now(), unique(school_id,user_id)
);
create table public.dreem_student_guardians (
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.dreem_guardians(id) on delete cascade,
  relationship text not null, is_primary boolean not null default false, can_collect boolean not null default false,
  receives_finance boolean not null default true, primary key(student_id,guardian_id)
);
create table public.dreem_student_credentials (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, token_hash text not null unique,
  issued_at timestamptz not null default now(), valid_until date not null, status text not null default 'active' check(status in ('active','expired','revoked')),
  revoked_at timestamptz, revoked_by uuid references auth.users(id), metadata jsonb not null default '{}'::jsonb
);
create table public.dreem_growth_snapshots (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, snapshot_date date not null,
  mastery numeric(5,2) not null check(mastery between 0 and 100), attendance numeric(5,2) not null check(attendance between 0 and 100),
  engagement numeric(5,2) not null check(engagement between 0 and 100), wellbeing numeric(5,2) not null check(wellbeing between 0 and 100),
  evidence jsonb not null default '{}'::jsonb, recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(student_id,snapshot_date)
);
create table public.dreem_interventions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, title text not null, hypothesis text not null, action_plan text not null,
  owner_user_id uuid not null references auth.users(id), starts_on date not null, review_on date not null,
  status text not null default 'planned' check(status in ('planned','active','review_due','successful','adjusted','closed','cancelled')),
  baseline jsonb not null default '{}'::jsonb, outcome jsonb, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.dreem_teacher_growth_snapshots (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id), subject_name text not null, snapshot_date date not null,
  learner_growth numeric(6,2) not null, curriculum_coverage numeric(5,2) not null check(curriculum_coverage between 0 and 100),
  mastery numeric(5,2) not null check(mastery between 0 and 100), workload text not null check(workload in ('balanced','high','critical')),
  next_support text not null, evidence jsonb not null default '{}'::jsonb, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(teacher_user_id,subject_name,snapshot_date)
);
create table public.dreem_community_signals (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  source_user_id uuid not null default auth.uid() references auth.users(id), source_role text not null check(source_role in ('parent','student','teacher','staff')),
  source_name text not null, subject_type text not null check(subject_type in ('student','teacher','school','service')), subject_name text not null,
  category text not null, message text not null check(char_length(message) between 10 and 1200),
  severity text not null default 'normal' check(severity in ('normal','important','urgent','safeguarding')),
  status text not null default 'new' check(status in ('new','triaged','assigned','in_progress','resolved','closed')),
  assigned_role text not null, assigned_user_id uuid references auth.users(id), resolution text,
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.dreem_signal_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  signal_id uuid not null references public.dreem_community_signals(id) on delete cascade, event_type text not null,
  from_status text, to_status text, note text, actor_user_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.dreem_cashier_sessions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  cashier_user_id uuid not null references auth.users(id), opened_at timestamptz not null default now(), closed_at timestamptz,
  opening_float numeric(14,2) not null default 0 check(opening_float>=0), declared_cash numeric(14,2), expected_cash numeric(14,2),
  status text not null default 'open' check(status in ('open','submitted','approved','rejected'))
);
create unique index dreem_one_open_cashier_session on public.dreem_cashier_sessions(school_id,cashier_user_id) where status='open';
create table public.dreem_financial_payments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id), fee_account_id uuid references public.fee_accounts(id),
  cashier_session_id uuid references public.dreem_cashier_sessions(id), receipt_number text not null,
  method text not null check(method in ('cash','momo','bank_transfer','card','cheque')), amount numeric(14,2) not null check(amount>0),
  external_reference text, idempotency_key text not null, payer_name text not null,
  received_by uuid not null references auth.users(id), received_at timestamptz not null default now(),
  reverses_payment_id uuid references public.dreem_financial_payments(id), metadata jsonb not null default '{}'::jsonb,
  unique(school_id,receipt_number), unique(school_id,idempotency_key), unique(school_id,method,external_reference),
  check(method<>'cash' or cashier_session_id is not null)
);
create table public.dreem_payment_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payment_id uuid not null references public.dreem_financial_payments(id), event_type text not null check(event_type in ('recorded','confirmed','reconciled','reversed','refunded','disputed')),
  actor_user_id uuid not null default auth.uid() references auth.users(id), note text, evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.dreem_reconciliation_reviews (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  cashier_session_id uuid not null references public.dreem_cashier_sessions(id), submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id), status text not null default 'pending' check(status in ('pending','approved','rejected')),
  variance numeric(14,2) not null, explanation text, evidence jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(), reviewed_at timestamptz,
  check(reviewed_by is null or reviewed_by<>submitted_by), check(status='pending' or (reviewed_by is not null and reviewed_at is not null))
);

create or replace function private.dreem_prevent_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception '% records are immutable; use a reversal or event',tg_table_name; return null; end $$;
create trigger dreem_financial_payments_immutable before update or delete on public.dreem_financial_payments for each row execute function private.dreem_prevent_mutation();
create trigger dreem_payment_events_immutable before update or delete on public.dreem_payment_events for each row execute function private.dreem_prevent_mutation();

create or replace function private.dreem_audit_row() returns trigger language plpgsql security definer set search_path='' as $$
declare v_school uuid; v_entity uuid;
begin
  v_school=coalesce((to_jsonb(new)->>'school_id')::uuid,(to_jsonb(old)->>'school_id')::uuid,(to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
  v_entity=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
  insert into public.audit_events(school_id,actor_id,action,entity_type,entity_id,detail)
  values(v_school,(select auth.uid()),tg_op,tg_table_name,v_entity,jsonb_build_object('old',case when tg_op='INSERT' then null else to_jsonb(old) end,'new',case when tg_op='DELETE' then null else to_jsonb(new) end));
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger dreem_audit_signals after insert or update or delete on public.dreem_community_signals for each row execute function private.dreem_audit_row();
create trigger dreem_audit_reconciliation after insert or update or delete on public.dreem_reconciliation_reviews for each row execute function private.dreem_audit_row();
create trigger dreem_audit_school_brand after update on public.dreem_school_brands for each row execute function private.dreem_audit_row();

do $$ declare t text; begin foreach t in array array['dreem_school_brands','dreem_guardians','dreem_student_guardians','dreem_student_credentials','dreem_growth_snapshots','dreem_interventions','dreem_teacher_growth_snapshots','dreem_community_signals','dreem_signal_events','dreem_cashier_sessions','dreem_financial_payments','dreem_payment_events','dreem_reconciliation_reviews'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy dreem_school_brands_read on public.dreem_school_brands for select to authenticated using ((select private.dreem_is_member(school_id)));
create policy dreem_school_brands_manage on public.dreem_school_brands for all to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_guardians_read on public.dreem_guardians for select to authenticated using (user_id=(select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership','support','teacher'])));
create policy dreem_guardians_manage on public.dreem_guardians for all to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_student_guardians_read on public.dreem_student_guardians for select to authenticated using ((select private.dreem_can_view_student(school_id,student_id)));
create policy dreem_student_guardians_manage on public.dreem_student_guardians for all to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
do $$ declare t text; begin foreach t in array array['dreem_student_credentials','dreem_growth_snapshots','dreem_interventions'] loop
  execute format('create policy dreem_student_record_read on public.%I for select to authenticated using ((select private.dreem_can_view_student(school_id,student_id)))',t);
  execute format('create policy dreem_student_record_write on public.%I for all to authenticated using ((select private.dreem_has_role(school_id,array[''leadership'',''support'',''teacher'']))) with check ((select private.dreem_has_role(school_id,array[''leadership'',''support'',''teacher''])))',t);
end loop; end $$;
create policy dreem_teacher_growth_read on public.dreem_teacher_growth_snapshots for select to authenticated using (teacher_user_id=(select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership','support','teacher'])));
create policy dreem_teacher_growth_write on public.dreem_teacher_growth_snapshots for all to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_signals_read on public.dreem_community_signals for select to authenticated using (source_user_id=(select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership','support','bursar','teacher'])));
create policy dreem_signals_create on public.dreem_community_signals for insert to authenticated with check (source_user_id=(select auth.uid()) and (select private.dreem_is_member(school_id)));
create policy dreem_signals_manage on public.dreem_community_signals for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support','bursar']))) with check ((select private.dreem_has_role(school_id,array['leadership','support','bursar'])));
create policy dreem_signal_events_read on public.dreem_signal_events for select to authenticated using (exists(select 1 from public.dreem_community_signals s where s.id=signal_id and (s.source_user_id=(select auth.uid()) or (select private.dreem_has_role(s.school_id,array['leadership','support','bursar','teacher'])))));
create policy dreem_signal_events_write on public.dreem_signal_events for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support','bursar','teacher'])));
do $$ declare t text; begin foreach t in array array['dreem_cashier_sessions','dreem_financial_payments','dreem_payment_events','dreem_reconciliation_reviews'] loop execute format('create policy dreem_finance_read on public.%I for select to authenticated using ((select private.dreem_has_role(school_id,array[''leadership'',''bursar''])))',t); end loop; end $$;
create policy dreem_cashier_open on public.dreem_cashier_sessions for insert to authenticated with check (cashier_user_id=(select auth.uid()) and (select private.dreem_has_role(school_id,array['bursar'])));
create policy dreem_cashier_update on public.dreem_cashier_sessions for update to authenticated using (cashier_user_id=(select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership']))) with check (cashier_user_id=(select auth.uid()) or (select private.dreem_has_role(school_id,array['leadership'])));
create policy dreem_financial_payments_create on public.dreem_financial_payments for insert to authenticated with check (received_by=(select auth.uid()) and (select private.dreem_has_role(school_id,array['bursar'])));
create policy dreem_payment_events_create on public.dreem_payment_events for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','bursar'])));
create policy dreem_reconciliation_submit on public.dreem_reconciliation_reviews for insert to authenticated with check (submitted_by=(select auth.uid()) and status='pending' and reviewed_by is null and (select private.dreem_has_role(school_id,array['bursar'])));
create policy dreem_reconciliation_review on public.dreem_reconciliation_reviews for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership']))) with check (reviewed_by=(select auth.uid()) and reviewed_by<>submitted_by and (select private.dreem_has_role(school_id,array['leadership'])));

revoke all on public.dreem_school_brands,public.dreem_guardians,public.dreem_student_guardians,public.dreem_student_credentials,public.dreem_growth_snapshots,public.dreem_interventions,public.dreem_teacher_growth_snapshots,public.dreem_community_signals,public.dreem_signal_events,public.dreem_cashier_sessions,public.dreem_financial_payments,public.dreem_payment_events,public.dreem_reconciliation_reviews from anon,authenticated;
grant select,insert,update,delete on public.dreem_school_brands,public.dreem_guardians,public.dreem_student_guardians,public.dreem_student_credentials,public.dreem_growth_snapshots,public.dreem_interventions,public.dreem_teacher_growth_snapshots,public.dreem_community_signals,public.dreem_signal_events,public.dreem_cashier_sessions,public.dreem_financial_payments,public.dreem_payment_events,public.dreem_reconciliation_reviews to authenticated;
