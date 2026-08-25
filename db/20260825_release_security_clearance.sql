-- AFAT release security clearance.
-- Keeps legacy Telegram identities behind the backend service boundary.
-- Browser clients use authenticated profiles and AFAT APIs.

begin;

-- The legacy Telegram user repository is written by the Render backend with
-- a service-role key. Browser clients must never mutate or enumerate it.
revoke all privileges on table public.users from anon, authenticated;

drop policy if exists "Anyone Insert Users" on public.users;
drop policy if exists "Anyone Update Users" on public.users;
drop policy if exists "Public Read Users" on public.users;
drop policy if exists "Public users insert" on public.users;
drop policy if exists "Public users read" on public.users;
drop policy if exists "Public users update" on public.users;
drop policy if exists "Service can insert users" on public.users;
drop policy if exists "Service can update users" on public.users;
drop policy if exists "Users are publicly readable" on public.users;

-- spatial_ref_sys and st_estimatedextent are owned and permission-managed by
-- Supabase's PostGIS extension. AFAT does not query either object through the
-- browser client; their advisor notices must be handled through Supabase's
-- managed extension path rather than an application migration.

commit;
