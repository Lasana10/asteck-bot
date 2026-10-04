create or replace function public.afat_operator_collect_service_request(p_assignment_id uuid,p_latitude double precision default null,p_longitude double precision default null,p_accuracy_m numeric default null,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_assignment public.dispatch_assignments%rowtype; v_req public.service_requests%rowtype; v_transition jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found or v_assignment.operator_id<>v_uid then raise exception 'ASSIGNED_OPERATOR_REQUIRED'; end if;
  if v_assignment.service_request_id is null then raise exception 'SERVICE_REQUEST_LINK_REQUIRED'; end if;
  if v_assignment.status<>'arrived' then raise exception 'DISPATCH_NOT_AT_PICKUP'; end if;
  select * into v_req from public.service_requests where id=v_assignment.service_request_id for update;
  if not found or v_req.service_type<>'delivery' then raise exception 'DELIVERY_REQUEST_REQUIRED'; end if;
  if v_req.status not in ('assigned','offered','queued') then raise exception 'SERVICE_REQUEST_STATE_INVALID'; end if;
  perform public.afat_record_service_proof(v_req.id,'item_collected',p_latitude,p_longitude,p_accuracy_m,coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('dispatch_assignment_id',v_assignment.id),'delivery-pickup:'||v_assignment.id::text);
  update public.service_requests set status='in_progress',updated_at=now(),metadata=metadata||jsonb_build_object('item_collected_at',now(),'automatic_truth',false) where id=v_req.id;
  v_transition:=public.afat_transition_dispatch_assignment(v_assignment.id,v_uid,'arrived','pickup_verified','delivery-pickup:'||v_assignment.id::text,'Delivery item collected',jsonb_build_object('service_request_id',v_req.id,'automatic_truth',false));
  return jsonb_build_object('assignment_id',v_assignment.id,'service_request_id',v_req.id,'dispatch_status','pickup_verified','service_status','in_progress','transition',v_transition);
end $$;

create or replace function public.afat_operator_prove_service_delivery(p_assignment_id uuid,p_latitude double precision default null,p_longitude double precision default null,p_accuracy_m numeric default null,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_assignment public.dispatch_assignments%rowtype; v_req public.service_requests%rowtype; v_transition jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found or v_assignment.operator_id<>v_uid then raise exception 'ASSIGNED_OPERATOR_REQUIRED'; end if;
  if v_assignment.service_request_id is null then raise exception 'SERVICE_REQUEST_LINK_REQUIRED'; end if;
  if v_assignment.status<>'in_journey' then raise exception 'DELIVERY_NOT_IN_JOURNEY'; end if;
  select * into v_req from public.service_requests where id=v_assignment.service_request_id for update;
  if not found or v_req.service_type<>'delivery' or v_req.status<>'in_progress' then raise exception 'DELIVERY_REQUEST_STATE_INVALID'; end if;
  perform public.afat_record_service_proof(v_req.id,'delivery_proof',p_latitude,p_longitude,p_accuracy_m,coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('dispatch_assignment_id',v_assignment.id),'delivery-proof:'||v_assignment.id::text);
  update public.service_requests set updated_at=now(),metadata=metadata||jsonb_build_object('operator_delivery_proof_at',now(),'recipient_confirmation_pending',true,'automatic_truth',false) where id=v_req.id;
  v_transition:=public.afat_transition_dispatch_assignment(v_assignment.id,v_uid,'in_journey','completed','delivery-proof:'||v_assignment.id::text,'Operator submitted delivery proof',jsonb_build_object('service_request_id',v_req.id,'recipient_confirmation_pending',true,'automatic_truth',false));
  return jsonb_build_object('assignment_id',v_assignment.id,'service_request_id',v_req.id,'dispatch_status','completed','service_status','in_progress','recipient_confirmation_pending',true,'transition',v_transition);
end $$;

create or replace function public.afat_confirm_service_receipt(p_request_id uuid,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_req public.service_requests%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_req from public.service_requests where id=p_request_id and requester_id=v_uid for update;
  if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if v_req.service_type<>'delivery' or v_req.status<>'in_progress' then raise exception 'DELIVERY_REQUEST_STATE_INVALID'; end if;
  if not exists(select 1 from public.afat_service_request_events e where e.service_request_id=v_req.id and e.event_type='delivery_proof') then raise exception 'DELIVERY_PROOF_REQUIRED'; end if;
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(v_req.id,v_uid,'recipient_confirmed',coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false),'recipient-confirmed:'||v_req.id::text)
  on conflict(service_request_id,idempotency_key) do nothing;
  update public.service_requests set status='completed',updated_at=now(),metadata=(metadata-'recipient_confirmation_pending')||jsonb_build_object('recipient_confirmed_at',now(),'automatic_truth',false) where id=v_req.id;
  return jsonb_build_object('request_id',v_req.id,'status','completed','recipient_confirmed',true);
end $$;

revoke all on function public.afat_operator_collect_service_request(uuid,double precision,double precision,numeric,jsonb) from public,anon;
revoke all on function public.afat_operator_prove_service_delivery(uuid,double precision,double precision,numeric,jsonb) from public,anon;
revoke all on function public.afat_confirm_service_receipt(uuid,jsonb) from public,anon;
grant execute on function public.afat_operator_collect_service_request(uuid,double precision,double precision,numeric,jsonb) to authenticated;
grant execute on function public.afat_operator_prove_service_delivery(uuid,double precision,double precision,numeric,jsonb) to authenticated;
grant execute on function public.afat_confirm_service_receipt(uuid,jsonb) to authenticated;
