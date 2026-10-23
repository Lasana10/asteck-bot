-- AFAT vehicle-specific private compliance. Unbound legacy evidence remains intact
-- but can never automatically clear a different vehicle.
alter table public.compliance_records
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete restrict;
create index if not exists afat_compliance_vehicle_lookup
  on public.compliance_records(vehicle_id,document_type,status);
create unique index if not exists afat_compliance_vehicle_required_once
  on public.compliance_records(vehicle_id,document_type)
  where vehicle_id is not null and document_type in
    ('vehicle_registration','bike_registration','insurance','helmet_compliance');
-- Never trust a client-supplied vehicle binding.
create or replace function public.afat_guard_vehicle_compliance_owner()
returns trigger language plpgsql set search_path='' as $$
declare v_operator uuid;
begin
 if new.vehicle_id is not null then
  select operator_id into v_operator from public.vehicles where id=new.vehicle_id;
  if v_operator is distinct from new.profile_id or new.role not in ('operator','bike_rider')
    or new.document_type not in ('vehicle_registration','bike_registration','insurance','helmet_compliance') then
    raise exception 'VEHICLE_COMPLIANCE_OWNER_OR_TYPE_INVALID' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists afat_guard_vehicle_compliance_owner_trigger on public.compliance_records;
create trigger afat_guard_vehicle_compliance_owner_trigger
before insert or update of vehicle_id,profile_id,role,document_type on public.compliance_records
for each row execute function public.afat_guard_vehicle_compliance_owner();
-- Revoking verified document custody must remove already advertised supply.
create or replace function public.afat_suspend_vehicle_on_evidence_change()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.vehicle_id is not null and old.status='verified'
   and (new.status is distinct from 'verified'
     or new.file_url is distinct from old.file_url
     or new.due_at is distinct from old.due_at) then
   update public.vehicles set clearance_status='under_review',
     is_available=false,updated_at=now()
     where id=old.vehicle_id and clearance_status='verified';
 end if;
 return new;
end $$;
drop trigger if exists afat_vehicle_evidence_revoked on public.compliance_records;
create trigger afat_vehicle_evidence_revoked
after update of status,file_url,due_at on public.compliance_records
for each row execute function public.afat_suspend_vehicle_on_evidence_change();

-- Full current-document custody always compares evidence to the specific vehicle.
create or replace function public.afat_vehicle_compliance_current(p_vehicle_id uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((
   select v.clearance_status='verified'
      and p.verification_status='verified'
      and p.operator_application_status='APPROVED'
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
   from public.vehicles v join public.profiles p on p.id=v.operator_id
   where v.id=p_vehicle_id
 ),false);
$$;

-- Human clearance is conditional on correctly bound documents and explicit
-- inspection evidence. Retain the existing audit table and existing statuses.
create or replace function public.afat_staff_review_vehicle(
 p_staff_id uuid,p_vehicle_id uuid,p_decision text,p_reason text
) returns public.vehicles
language plpgsql set search_path='' as $$
declare v public.vehicles; op public.profiles; evidence_count int;
 staff_role text; previous_clearance text;
begin
 select role into staff_role from public.profiles where id=p_staff_id and is_active=true;
 if staff_role not in ('admin','planner') or staff_role is null
   then raise exception 'STAFF_REVIEW_REQUIRED' using errcode='42501';end if;
 if p_decision not in ('verified','restricted','under_review')
   or length(trim(coalesce(p_reason,'')))<15
   then raise exception 'REVIEW_DECISION_AND_REASON_REQUIRED' using errcode='22023';end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if v.id is null then raise exception 'VEHICLE_NOT_FOUND' using errcode='P0002';end if;
 if v.clearance_status=p_decision
   then raise exception 'REVIEW_ALREADY_RECORDED' using errcode='P0001';end if;
 if p_decision='verified' then
   select * into op from public.profiles where id=v.operator_id;
   if op.id is null or op.verification_status<>'verified'
      or op.operator_application_status<>'APPROVED'
     then raise exception 'OPERATOR_NOT_APPROVED' using errcode='P0001';end if;
   if position(upper(v.plate_number) in upper(p_reason))=0
     then raise exception 'PLATE_IDENTITY_REVIEW_ATTESTATION_REQUIRED' using errcode='P0001';end if;
   if v.capacity<1 or v.capacity>200 or length(trim(v.plate_number))<4
     then raise exception 'VEHICLE_FACTS_INCOMPLETE' using errcode='P0001';end if;
   select count(distinct document_type) into evidence_count
     from public.compliance_records d
     where d.vehicle_id=v.id and d.profile_id=v.operator_id
       and d.role in ('operator','bike_rider') and d.status='verified'
       and d.verified_at is not null
       and d.document_type in (
         case when v.type='moto' then 'bike_registration' else 'vehicle_registration' end,
         'insurance','helmet_compliance')
       and (d.due_at is null or d.due_at>now())
       and d.file_url like 'afat-operator-compliance/'||d.profile_id::text||'/'||d.id::text||'/%';
   if evidence_count<(case when v.type='moto' then 3 else 2 end)
     then raise exception 'VEHICLE_COMPLIANCE_DOCUMENTS_NOT_VERIFIED' using errcode='P0001';end if;
 end if;
 previous_clearance:=v.clearance_status;
 update public.vehicles set clearance_status=p_decision,
   is_available=false,updated_at=now()
 where id=p_vehicle_id returning * into v;
 insert into public.access_audit_events
   (actor_profile_id,event_type,target_type,target_id,reason,previous_state,new_state,request_context)
 values (p_staff_id,'vehicle_clearance_review','vehicle',v.id::text,trim(p_reason),
 jsonb_build_object('clearance_status',previous_clearance),
 jsonb_build_object('decision',p_decision,'available',false),
 jsonb_build_object('source','staff_human_review','operator_id',v.operator_id));
 return v;
end $$;
