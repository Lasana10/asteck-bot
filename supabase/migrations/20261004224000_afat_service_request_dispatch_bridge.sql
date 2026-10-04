create unique index if not exists dispatch_assignments_one_open_service_request_uidx on public.dispatch_assignments(service_request_id) where service_request_id is not null and status not in ('completed','cancelled','declined','expired','no_show');

create or replace function public.afat_enqueue_service_request_dispatch(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_role text:=auth.role(); v_req public.service_requests%rowtype; v_assignment public.dispatch_assignments%rowtype;
begin
  if v_uid is null and v_role<>'service_role' then raise exception 'Authentication required'; end if;
  if v_role<>'service_role' and not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('planner','admin')) then raise exception 'DISPATCH_AUTHORITY_REQUIRED'; end if;
  select * into v_req from public.service_requests where id=p_request_id for update; if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if v_req.status not in ('queued','offered') then raise exception 'SERVICE_REQUEST_STATE_INVALID'; end if;
  if v_req.service_type not in ('ride','taxi_hire','bike_pickup','delivery','agency_booking','charter','airport','special_needs') then raise exception 'SERVICE_TYPE_NOT_DISPATCHABLE'; end if;
  if v_req.pickup_lat is null or v_req.pickup_lng is null or v_req.dropoff_lat is null or v_req.dropoff_lng is null then
    update public.service_requests set status='needs_review',updated_at=now(),metadata=metadata||jsonb_build_object('dispatch_blocked_reason','pickup_and_dropoff_coordinates_required','automatic_truth',false) where id=v_req.id;
    insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key) values(v_req.id,v_uid,'needs_review',jsonb_build_object('automatic_truth',false,'reason','pickup_and_dropoff_coordinates_required'),'dispatch-blocked:'||v_req.id::text) on conflict(service_request_id,idempotency_key) do nothing;
    return jsonb_build_object('request_id',v_req.id,'dispatch_created',false,'status','needs_review','reason','pickup_and_dropoff_coordinates_required');
  end if;
  select * into v_assignment from public.dispatch_assignments where service_request_id=v_req.id and status not in ('completed','cancelled','declined','expired','no_show') order by created_at desc limit 1;
  if found then return jsonb_build_object('request_id',v_req.id,'dispatch_created',false,'assignment_id',v_assignment.id,'status',v_assignment.status,'idempotent',true); end if;
  insert into public.dispatch_assignments(service_request_id,origin,destination,priority,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,idempotency_key,decision_factors,evidence_context)
  values(v_req.id,v_req.origin,v_req.destination,v_req.priority,'queued',v_req.pickup_lat,v_req.pickup_lng,v_req.dropoff_lat,v_req.dropoff_lng,'service:'||v_req.id::text,jsonb_build_object('service_type',v_req.service_type),jsonb_build_object('automatic_truth',false,'source','service_request')) returning * into v_assignment;
  update public.service_requests set dispatch_assignment_id=v_assignment.id,updated_at=now() where id=v_req.id;
  return jsonb_build_object('request_id',v_req.id,'dispatch_created',true,'assignment_id',v_assignment.id,'status',v_assignment.status);
end $$;
revoke all on function public.afat_enqueue_service_request_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.afat_enqueue_service_request_dispatch(uuid) to service_role,authenticated;
