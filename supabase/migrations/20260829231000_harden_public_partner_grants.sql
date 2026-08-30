begin;

-- The initial workspace migration can inherit broad schema-level default
-- privileges. Reset them so browser clients can only read through RLS and all
-- lifecycle changes remain behind the AFAT API service role.
revoke all privileges on public.public_partner_entities from anon, authenticated;
revoke all privileges on public.public_partner_memberships from anon, authenticated;

grant select on public.public_partner_entities to authenticated;
grant select on public.public_partner_memberships to authenticated;

grant all privileges on public.public_partner_entities to service_role;
grant all privileges on public.public_partner_memberships to service_role;

notify pgrst, 'reload schema';

commit;
