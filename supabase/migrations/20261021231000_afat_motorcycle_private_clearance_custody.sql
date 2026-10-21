-- Complete AFAT private motorcycle compliance → independently reviewed vehicle.
-- Maintains service-role-only, invoker-security, row locks, signed evidence
-- metadata custody and staff audit; no automatic clearance.
create or replace function public.afat_staff_review_vehicle(
 p_staff_id uuid,p_vehicle_id uuid,p_decision text,p_reason text
) returns public.vehicles
language plpgsql security invoker set search_path=''
as $$
declare v public.vehicles; op public.profiles; evidence_count int; staff_role text; previous_clearance text;
begin
 select role into staff_role from public.profiles where id=p_staff_id;
 if staff_role is distinct from 'admin' and staff_role is distinct from 'planner' then raise exception 'STAFF_REVIEW_REQUIRED' using errcode='42501'; end if;
 if p_decision not in ('verified','restricted','under_review') or length(trim(coalesce(p_reason,'')))<15 then
  raise exception 'REVIEW_DECISION_AND_REASON_REQUIRED' using errcode='22023';
 end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if v.id is null then raise exception 'VEHICLE_NOT_FOUND' using errcode='P0002'; end if;
 if v.clearance_status = p_decision then raise exception 'REVIEW_ALREADY_RECORDED' using errcode='P0001'; end if;
 if p_decision='verified' then
  select * into op from public.profiles where id=v.operator_id;
  if op.id is null or op.verification_status <> 'verified' or op.operator_application_status <> 'APPROVED' then
    raise exception 'OPERATOR_NOT_APPROVED' using errcode='P0001';
  end if;
  if position(upper(v.plate_number) in upper(p_reason))=0 then
    raise exception 'PLATE_IDENTITY_REVIEW_ATTESTATION_REQUIRED' using errcode='P0001';
  end if;
  if v.capacity<1 or v.capacity>200 or length(trim(v.plate_number))<4 then
    raise exception 'VEHICLE_FACTS_INCOMPLETE' using errcode='P0001';
  end if;
  -- Motorcycle ownership is registered as bike_registration under the
  -- existing bike_rider role; other verified fleets use vehicle_registration.
  -- Only private documents bound to the exact authenticated operator/record
  -- can satisfy clearance, never unverified free-form links or AI OCR text.
  select count(distinct document_type) into evidence_count from public.compliance_records d
   where d.profile_id=v.operator_id and d.role in ('operator','bike_rider') and d.status='verified'
     and d.document_type in (case when v.type='moto' then 'bike_registration' else 'vehicle_registration' end,'insurance','helmet_compliance')
     and (d.due_at is null or d.due_at>now())
     and d.file_url like 'afat-operator-compliance/'||d.profile_id::text||'/'||d.id::text||'/%';
  if evidence_count<(case when v.type='moto' then 3 else 2 end) then
    raise exception 'VEHICLE_COMPLIANCE_DOCUMENTS_NOT_VERIFIED' using errcode='P0001';
  end if;
 end if;
 previous_clearance:=v.clearance_status;
 update public.vehicles set clearance_status=p_decision,is_available=false,updated_at=now()
 where id=p_vehicle_id returning * into v;
 insert into public.access_audit_events(actor_profile_id,event_type,target_type,target_id,reason,
 previous_state,new_state,request_context)
 values (p_staff_id,'vehicle_clearance_review','vehicle',v.id::text,trim(p_reason),
 jsonb_build_object('clearance_status',previous_clearance), 
 jsonb_build_object('decision',p_decision,'available',false),
 jsonb_build_object('source','staff_human_review','operator_id',v.operator_id));
 return v;
end;$$;

revoke all on function public.afat_staff_review_vehicle(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.afat_staff_review_vehicle(uuid,uuid,text,text) to service_role;
