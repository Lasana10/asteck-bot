-- Staff-cleared vehicle supply must retain independently reviewed operator ID and licence.
-- The identity record belongs to THIS operator and THIS vehicle's evidence bundle.
create or replace function public.afat_operator_credential_evidence_current(p_vehicle_id uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((
  select count(distinct d.document_type)=2
  from public.vehicles v
  join public.compliance_records d on d.vehicle_id=v.id and d.profile_id=v.operator_id
  where v.id=p_vehicle_id and d.role in ('operator','bike_rider')
    and d.document_type in ('national_id','license')
    and d.status='verified' and d.verified_at is not null
    and (d.due_at is null or d.due_at>now())
    and d.file_url like 'afat-operator-compliance/'||d.profile_id::text||'/'||d.id::text||'/%'
 ),false);
$$;
revoke all on function public.afat_operator_credential_evidence_current(uuid) from public,anon,authenticated;
grant execute on function public.afat_operator_credential_evidence_current(uuid) to service_role;

-- Gate independent review itself. An operator cannot be marked cleared without
-- current owner-specific identity and driving-licence evidence.
create or replace function public.afat_guard_operator_identity_vehicle_clearance()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.clearance_status='verified' and old.clearance_status is distinct from 'verified'
    and not public.afat_operator_credential_evidence_current(new.id) then
   raise exception using errcode='23514',message='OPERATOR_ID_LICENSE_NOT_VERIFIED';
 end if;
 return new;
end; $$;
drop trigger if exists trg_afat_vehicle_operator_credentials on public.vehicles;
create trigger trg_afat_vehicle_operator_credentials
before update of clearance_status on public.vehicles
for each row execute function public.afat_guard_operator_identity_vehicle_clearance();
revoke all on function public.afat_guard_operator_identity_vehicle_clearance() from public,anon,authenticated;
grant execute on function public.afat_guard_operator_identity_vehicle_clearance() to service_role;

-- Ongoing passenger availability must also fail closed when those documents
-- expire or their review is revoked after vehicle clearance.
create or replace function public.afat_vehicle_compliance_current(p_vehicle_id uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((
  select v.clearance_status='verified'
    and p.verification_status='verified'
    and p.operator_application_status='APPROVED'
    and public.afat_operator_credential_evidence_current(v.id)
    and (
      select count(distinct d.document_type)
      from public.compliance_records d
      where d.vehicle_id=v.id and d.profile_id=v.operator_id
        and d.role in ('operator','bike_rider') and d.status='verified'
        and d.verified_at is not null
        and (d.due_at is null or d.due_at>now())
        and d.file_url like 'afat-operator-compliance/'||d.profile_id::text||'/'||d.id::text||'/%'
        and d.document_type in (
          case when v.type='moto' then 'bike_registration' else 'vehicle_registration' end,
          'insurance','helmet_compliance')
    ) >= (case when v.type='moto' then 3 else 2 end)
  from public.vehicles v
  join public.profiles p on p.id=v.operator_id
  where v.id=p_vehicle_id
 ),false);
$$;
revoke all on function public.afat_vehicle_compliance_current(uuid) from public,anon,authenticated;
grant execute on function public.afat_vehicle_compliance_current(uuid) to service_role;