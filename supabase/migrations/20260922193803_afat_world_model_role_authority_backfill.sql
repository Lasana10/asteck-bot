insert into public.profile_role_assignments(profile_id,role_key,status,source,reason,metadata)
select p.id,'platform_admin','active','migration','Backfill active legacy AFAT admin into capability authorization',
       jsonb_build_object('legacy_role',p.role,'migration','afat_world_model_role_authority_backfill')
from public.profiles p
where p.is_active=true and lower(p.role)='admin'
and not exists(
  select 1 from public.profile_role_assignments pra
  where pra.profile_id=p.id and pra.role_key='platform_admin' and pra.status='active'
);

insert into public.profile_role_assignments(profile_id,role_key,status,source,reason,metadata)
select p.id,r.role_key,'active','migration','Backfill active legacy AFAT planner into capability authorization',
       jsonb_build_object('legacy_role',p.role,'migration','afat_world_model_role_authority_backfill')
from public.profiles p
cross join (values('afat_operational_planner'::text),('data_steward'::text)) r(role_key)
where p.is_active=true and lower(p.role)='planner'
and not exists(
  select 1 from public.profile_role_assignments pra
  where pra.profile_id=p.id and pra.role_key=r.role_key and pra.status='active'
);
