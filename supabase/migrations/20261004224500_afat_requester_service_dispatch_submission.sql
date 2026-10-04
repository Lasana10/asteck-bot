create or replace function public.afat_submit_own_service_request_for_dispatch(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_req public.service_requests%rowtype; v_assignment public.dispatch_assignments%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_req from public.service_requests where id=p_request_id and requester_id=v_uid for update;
  if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if v_req.status not in ('queued','offered') then raise exception 'SERVICE_REQUEST_STATE_INVALID'; end if;
  if v_req.service_type not in ('ride','taxi_hire','bike_pickup','delivery','agency_booking','charter','airport','special_needs') then raise exception 'SERVICE_TYPE_NOT_DISPATCHABLE'; end if;
  if v_req.pickup_lat is null or v_req.pickup_lng is null or v_req.dropoff_lat is null or v_req.dropoff_lng is null then
    return jsonb_build_object('request_id',v_req.id,'dispatch_created',false,'status',v_req.status,'reason','pickup_and_dropoff_coordinates_required');
  end if;
  select * into v_assignment from public.dispatch_assignments where service_request_id=v_req.id and status not in ('completed','cancelled','declined','expired','no_show') order by created_at desc limit 1;
  if found then return jsonb_build_object('request_id',v_req.id,'dispatch_created',false,'assignment_id',v_assignment.id,'status',v_assignment.status,'idempotent',true); end if;
  insert into public.dispatch_assignments(service_request_id,origin,destination,priority,status,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,idempotency_key,decision_factors,evidence_context)
  values(v_req.id,v_req.origin,v_req.destination,v_req.priority,'queued',v_req.pickup_lat,v_req.pickup_lng,v_req.dropoff_lat,v_req.dropoff_lng,'service:'||v_req.id::text,jsonb_build_object('service_type',v_req.service_type,'requester_submitted',true),jsonb_build_object('automatic_truth',false,'source','requester_service_request')) returning * into v_assignment;
  update public.service_requests set dispatch_assignment_id=v_assignment.id,updated_at=now() where id=v_req.id;
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(v_req.id,v_uid,'offered',jsonb_build_object('automatic_truth',false,'dispatch_assignment_id',v_assignment.id,'meaning','submitted_to_dispatch_queue'),'dispatch-submit:'||v_req.id::text)
  on conflict(service_request_id,idempotency_key) do nothing;
  return jsonb_build_object('request_id',v_req.id,'dispatch_created',true,'assignment_id',v_assignment.id,'status','queued');
end $$;
revoke all on function public.afat_submit_own_service_request_for_dispatch(uuid) from public,anon;
grant execute on function public.afat_submit_own_service_request_for_dispatch(uuid) to authenticated;
