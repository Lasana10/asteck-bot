-- Minimal shared-table guards required before DREEM-specific migrations run.
-- These are intentionally conservative because DREEM is sharing a Supabase project for now.

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
  role text not null,
  status text not null default 'pending',
  invited_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, school_id)
);

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
