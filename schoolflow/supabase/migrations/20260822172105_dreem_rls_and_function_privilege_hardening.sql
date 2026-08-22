-- Close the final exposed-table and function privilege gaps found by the
-- Supabase database advisor after the DREEM operational migrations.

alter table public.audit_events enable row level security;

drop policy if exists "dreem audit members can read" on public.audit_events;
create policy "dreem audit members can read"
on public.audit_events
for select
to authenticated
using (private.dreem_is_member(school_id));

do $$
declare
  function_record record;
begin
  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'dreem_%'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      function_record.nspname,
      function_record.proname,
      function_record.args
    );
  end loop;

  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname like 'dreem_%'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      function_record.nspname,
      function_record.proname,
      function_record.args
    );
  end loop;
end
$$;

grant execute on function private.dreem_is_member(uuid) to authenticated;
grant execute on function private.dreem_has_role(uuid,text[]) to authenticated;
grant execute on function private.dreem_can_view_student(uuid,uuid) to authenticated;

-- Credential verification is the only intentionally anonymous DREEM command.
grant execute on function public.dreem_verify_student_credential(text) to anon, authenticated;

