create or replace function public.afat_sync_service_request_from_dispatch_assignment()
returns trigger
language plpgsql
security definer
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_request public.service_requests%rowtype;
  v_target_status text;
  v_event_type text;
  v_event_key text;
begin
  if new.service_request_id is null then return new; end if;
  if old.operator_id is not distinct from new.operator_id
     and old.vehicle_id is not distinct from new.vehicle_id
     and old.status is not distinct from new.status then return new; end if;

  select * into v_request from public.service_requests where id=new.service_request_id for update;
  if not found then return new; end if;

  v_target_status:=case
    when new.status='offered' then 'offered'
    when new.status in ('accepted','assigned') then 'assigned'
    else null
  end;

  if v_target_status is null then
    if old.operator_id is distinct from new.operator_id or old.vehicle_id is distinct from new.vehicle_id then
      update public.service_requests
      set operator_id=new.operator_id,
          vehicle_id=new.vehicle_id,
          dispatch_assignment_id=new.id,
          updated_at=now(),
          metadata=metadata||jsonb_build_object('dispatch_assignment_id',new.id,'automatic_truth',false)
      where id=v_request.id;
    end if;
    return new;
  end if;

  if v_target_status='offered' and v_request.status not in ('queued','offered') then return new; end if;
  if v_target_status='assigned' and v_request.status not in ('queued','offered','assigned') then return new; end if;

  update public.service_requests
  set operator_id=new.operator_id,
      vehicle_id=new.vehicle_id,
      dispatch_assignment_id=new.id,
      status=v_target_status,
      updated_at=now(),
      metadata=metadata||jsonb_build_object('dispatch_assignment_id',new.id,'dispatch_status',new.status,'automatic_truth',false)
  where id=v_request.id;

  v_event_type:=case when v_target_status='offered' then 'offered' else 'assigned' end;
  v_event_key:=format('dispatch-sync:%s:%s:%s',new.id,new.state_version,new.status);
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(v_request.id,new.dispatcher_id,v_event_type,
    jsonb_build_object('automatic_truth',false,'dispatch_assignment_id',new.id,'dispatch_status',new.status,'operator_id',new.operator_id,'vehicle_id',new.vehicle_id),v_event_key)
  on conflict(service_request_id,idempotency_key) do nothing;

  return new;
end $$;

drop trigger if exists trg_afat_sync_service_request_from_dispatch on public.dispatch_assignments;
create trigger trg_afat_sync_service_request_from_dispatch
after update of operator_id,vehicle_id,status,state_version on public.dispatch_assignments
for each row execute function public.afat_sync_service_request_from_dispatch_assignment();

revoke all on function public.afat_sync_service_request_from_dispatch_assignment() from public,anon,authenticated;
