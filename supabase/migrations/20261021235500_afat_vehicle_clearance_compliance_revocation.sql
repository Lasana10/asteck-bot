-- AFAT compliance → actual mobility supply safety interlock.
-- A verified operator document cannot be replaced/rejected/expired while
-- previously cleared vehicles silently remain eligible for passengers.
-- Actual reviewer decisions remain human; this only restricts unsafe supply.
create or replace function public.afat_restrict_vehicles_on_document_change()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare affected record; invalidated boolean:=false;
begin
 if tg_op = 'DELETE' then
   if old.profile_id is null or old.status <> 'verified' then return old; end if;
   invalidated:=true;
 else
   if old.profile_id is null or old.status <> 'verified' then return new; end if;
   invalidated:= new.status is distinct from 'verified'
       or new.file_url is distinct from old.file_url
       or new.verified_at is distinct from old.verified_at
       or (new.due_at is not null and new.due_at<=now());
 end if;
 if not invalidated or old.role not in ('operator','bike_rider')
    or old.document_type not in ('vehicle_registration','bike_registration','insurance','helmet_compliance')
 then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 for affected in
   update public.vehicles
      set clearance_status='restricted',is_available=false,updated_at=now()
    where operator_id=old.profile_id and clearance_status='verified'
      and (case when type='moto'
                then old.document_type in ('bike_registration','insurance','helmet_compliance')
                else old.document_type in ('vehicle_registration','insurance') end)
    returning id,operator_id,plate_number
 loop
   insert into public.access_audit_events(
     actor_profile_id,event_type,target_type,target_id,reason,previous_state,new_state,request_context
   ) values (
     auth.uid(),'vehicle_clearance_auto_restricted','vehicle',affected.id::text,
     'Previously verified operator credential changed or expired; physical transport supply restricted until new human review',
     jsonb_build_object('clearance_status','verified'),
     jsonb_build_object('clearance_status','restricted','is_available',false),
     jsonb_build_object('source','operator_compliance_revocation',
                        'evidence_record_id',old.id,'document_type',old.document_type,
                        'operator_id',old.profile_id,'plate_number',affected.plate_number)
   );
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end;$$;
revoke all on function public.afat_restrict_vehicles_on_document_change() from public,anon,authenticated;
drop trigger if exists afat_restrict_vehicle_on_document_update on public.compliance_records;
create trigger afat_restrict_vehicle_on_document_update
after update of status,file_url,due_at,verified_at on public.compliance_records
for each row execute function public.afat_restrict_vehicles_on_document_change();
drop trigger if exists afat_restrict_vehicle_on_document_delete on public.compliance_records;
create trigger afat_restrict_vehicle_on_document_delete
after delete on public.compliance_records
for each row execute function public.afat_restrict_vehicles_on_document_change();
