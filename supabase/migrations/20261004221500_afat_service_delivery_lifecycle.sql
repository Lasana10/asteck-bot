create table if not exists public.afat_service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('request_created','offered','assigned','pickup_verified','item_collected','passenger_boarded','journey_started','delivery_proof','recipient_confirmed','completed','cancelled','failed','needs_review','note')),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  location geography(point,4326) generated always as (case when latitude is not null and longitude is not null then st_setsrid(st_makepoint(longitude,latitude),4326)::geography else null end) stored,
  accuracy_m numeric check (accuracy_m is null or accuracy_m between 0 and 1000),
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique(service_request_id,idempotency_key)
);
create index if not exists afat_service_request_events_request_time_idx on public.afat_service_request_events(service_request_id,created_at desc);
create index if not exists afat_service_request_events_location_gix on public.afat_service_request_events using gist(location);
alter table public.afat_service_request_events enable row level security;
revoke insert,update,delete on public.afat_service_request_events from anon,authenticated;
grant select on public.afat_service_request_events to authenticated;
drop policy if exists afat_service_events_participant_read on public.afat_service_request_events;
create policy afat_service_events_participant_read on public.afat_service_request_events for select to authenticated using (
  exists (select 1 from public.service_requests r where r.id=service_request_id and (r.requester_id=auth.uid() or r.operator_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('planner','admin'))))
);
revoke insert,update,delete on public.service_requests from authenticated;
drop policy if exists "service requester can create own requests" on public.service_requests;
drop policy if exists "service requester can update own requests" on public.service_requests;
drop policy if exists afat_service_operator_read on public.service_requests;
create policy afat_service_operator_read on public.service_requests for select to authenticated using (
  requester_id=auth.uid() or operator_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('planner','admin'))
);

create or replace function public.afat_create_service_request(
  p_service_type text,p_origin text default null,p_destination text default null,
  p_pickup_lat double precision default null,p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null,p_dropoff_lng double precision default null,
  p_scheduled_at timestamptz default null,p_passenger_count integer default 1,p_package_count integer default 0,
  p_priority text default 'normal',p_notes text default null,p_contact_name text default null,p_contact_phone text default null,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.afat_assert_active_profile(v_uid);
  if p_service_type not in ('ride','taxi_hire','bike_pickup','delivery','agency_booking','charter','airport','special_needs','lost_found','complaint') then raise exception 'SERVICE_TYPE_INVALID'; end if;
  if p_priority not in ('low','normal','high','emergency') then raise exception 'PRIORITY_INVALID'; end if;
  if (p_pickup_lat is null)<>(p_pickup_lng is null) or (p_dropoff_lat is null)<>(p_dropoff_lng is null) then raise exception 'COORDINATE_PAIR_REQUIRED'; end if;
  if p_pickup_lat is not null and (p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180) then raise exception 'PICKUP_COORDINATES_INVALID'; end if;
  if p_dropoff_lat is not null and (p_dropoff_lat not between -90 and 90 or p_dropoff_lng not between -180 and 180) then raise exception 'DROPOFF_COORDINATES_INVALID'; end if;
  if coalesce(p_passenger_count,0)<0 or coalesce(p_package_count,0)<0 then raise exception 'COUNT_INVALID'; end if;
  if p_service_type='delivery' and coalesce(p_package_count,0)<1 then raise exception 'DELIVERY_PACKAGE_REQUIRED'; end if;
  if p_service_type in ('ride','taxi_hire','bike_pickup','charter','airport','special_needs') and coalesce(p_passenger_count,0)<1 then raise exception 'PASSENGER_COUNT_REQUIRED'; end if;
  insert into public.service_requests(requester_id,service_type,origin,destination,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,scheduled_at,passenger_count,package_count,priority,status,notes,contact_name,contact_phone,metadata)
  values(v_uid,p_service_type,nullif(trim(p_origin),''),nullif(trim(p_destination),''),p_pickup_lat,p_pickup_lng,p_dropoff_lat,p_dropoff_lng,p_scheduled_at,coalesce(p_passenger_count,0),coalesce(p_package_count,0),p_priority,'queued',nullif(trim(p_notes),''),nullif(trim(p_contact_name),''),nullif(trim(p_contact_phone),''),coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('automatic_truth',false)) returning id into v_id;
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(v_id,v_uid,'request_created',jsonb_build_object('automatic_truth',false,'service_type',p_service_type),'create:'||v_id::text);
  return jsonb_build_object('id',v_id,'status','queued','service_type',p_service_type);
end $$;

create or replace function public.afat_assign_service_request(p_request_id uuid,p_operator_id uuid,p_vehicle_id uuid,p_dispatch_assignment_id uuid default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_role text:=auth.role(); v_req public.service_requests%rowtype; v_vehicle public.vehicles%rowtype; v_event_key text;
begin
  if v_uid is null and v_role<>'service_role' then raise exception 'Authentication required'; end if;
  if v_role<>'service_role' and not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('planner','admin')) then raise exception 'DISPATCH_AUTHORITY_REQUIRED'; end if;
  select * into v_req from public.service_requests where id=p_request_id for update;
  if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if v_req.status not in ('queued','offered') then raise exception 'SERVICE_REQUEST_STATE_INVALID'; end if;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id and operator_id=p_operator_id;
  if not found or v_vehicle.clearance_status<>'verified' then raise exception 'VERIFIED_OPERATOR_VEHICLE_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_operator_id and p.role='operator' and upper(coalesce(p.operator_application_status,''))='APPROVED' and upper(coalesce(p.verification_status,'')) in ('VERIFIED','APPROVED') and coalesce(p.is_active,false)=true) then raise exception 'OPERATOR_NOT_OPERATIONALLY_APPROVED'; end if;
  update public.service_requests set operator_id=p_operator_id,vehicle_id=p_vehicle_id,dispatch_assignment_id=coalesce(p_dispatch_assignment_id,dispatch_assignment_id),status='assigned',updated_at=now() where id=p_request_id;
  v_event_key:=coalesce(nullif(trim(p_idempotency_key),''),'assign:'||p_request_id::text||':'||p_operator_id::text);
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(p_request_id,v_uid,'assigned',jsonb_build_object('automatic_truth',false,'operator_id',p_operator_id,'vehicle_id',p_vehicle_id,'dispatch_assignment_id',p_dispatch_assignment_id),v_event_key)
  on conflict(service_request_id,idempotency_key) do nothing;
  return jsonb_build_object('id',p_request_id,'status','assigned','operator_id',p_operator_id,'vehicle_id',p_vehicle_id);
end $$;

create or replace function public.afat_transition_service_request(p_request_id uuid,p_expected_status text,p_next_status text,p_idempotency_key text,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_role text:=auth.role(); v_req public.service_requests%rowtype; v_is_admin boolean:=false; v_event text;
begin
  if v_uid is null and v_role<>'service_role' then raise exception 'Authentication required'; end if;
  select * into v_req from public.service_requests where id=p_request_id for update;
  if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  v_is_admin:=v_role='service_role' or exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('planner','admin'));
  if v_req.status is distinct from p_expected_status then raise exception 'SERVICE_REQUEST_VERSION_CONFLICT'; end if;
  if p_next_status not in ('queued','offered','assigned','in_progress','completed','cancelled','failed','needs_review') then raise exception 'SERVICE_REQUEST_STATE_INVALID'; end if;
  if v_uid=v_req.requester_id then
    if p_next_status<>'cancelled' or v_req.status not in ('queued','offered','assigned') then raise exception 'REQUESTER_TRANSITION_NOT_ALLOWED'; end if;
  elsif v_uid=v_req.operator_id then
    if not ((v_req.status='assigned' and p_next_status in ('in_progress','failed','needs_review')) or (v_req.status='in_progress' and p_next_status in ('completed','failed','needs_review'))) then raise exception 'OPERATOR_TRANSITION_NOT_ALLOWED'; end if;
  elsif not v_is_admin then raise exception 'SERVICE_REQUEST_AUTHORITY_REQUIRED'; end if;
  if v_is_admin and not (
    (v_req.status='queued' and p_next_status in ('offered','cancelled','failed')) or
    (v_req.status='offered' and p_next_status in ('queued','assigned','cancelled','failed')) or
    (v_req.status='assigned' and p_next_status in ('in_progress','cancelled','failed','needs_review')) or
    (v_req.status='in_progress' and p_next_status in ('completed','failed','needs_review')) or
    (v_req.status='needs_review' and p_next_status in ('assigned','in_progress','completed','cancelled','failed'))
  ) then raise exception 'SERVICE_REQUEST_TRANSITION_INVALID'; end if;
  update public.service_requests set status=p_next_status,updated_at=now() where id=p_request_id;
  v_event:=case p_next_status when 'offered' then 'offered' when 'assigned' then 'assigned' when 'in_progress' then 'journey_started' when 'completed' then 'completed' when 'cancelled' then 'cancelled' when 'failed' then 'failed' when 'needs_review' then 'needs_review' else 'note' end;
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,evidence,idempotency_key)
  values(p_request_id,v_uid,v_event,coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false,'from_status',v_req.status,'to_status',p_next_status),nullif(trim(p_idempotency_key),''))
  on conflict(service_request_id,idempotency_key) do nothing;
  return jsonb_build_object('id',p_request_id,'status',p_next_status,'previous_status',v_req.status);
end $$;

create or replace function public.afat_record_service_proof(p_request_id uuid,p_event_type text,p_latitude double precision default null,p_longitude double precision default null,p_accuracy_m numeric default null,p_evidence jsonb default '{}'::jsonb,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_req public.service_requests%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_event_type not in ('pickup_verified','item_collected','passenger_boarded','delivery_proof','recipient_confirmed','note') then raise exception 'SERVICE_PROOF_TYPE_INVALID'; end if;
  select * into v_req from public.service_requests where id=p_request_id;
  if not found then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if not (v_uid=v_req.operator_id or v_uid=v_req.requester_id or exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('planner','admin'))) then raise exception 'SERVICE_PROOF_AUTHORITY_REQUIRED'; end if;
  if p_event_type in ('pickup_verified','item_collected','passenger_boarded','delivery_proof') and v_uid<>v_req.operator_id and not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('planner','admin')) then raise exception 'OPERATOR_PROOF_REQUIRED'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'COORDINATE_PAIR_REQUIRED'; end if;
  insert into public.afat_service_request_events(service_request_id,actor_profile_id,event_type,latitude,longitude,accuracy_m,evidence,idempotency_key)
  values(p_request_id,v_uid,p_event_type,p_latitude,p_longitude,p_accuracy_m,coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false),nullif(trim(p_idempotency_key),''))
  on conflict(service_request_id,idempotency_key) do update set evidence=public.afat_service_request_events.evidence||excluded.evidence
  returning id into v_id;
  return jsonb_build_object('id',v_id,'service_request_id',p_request_id,'event_type',p_event_type,'automatic_truth',false);
end $$;

revoke all on function public.afat_create_service_request(text,text,text,double precision,double precision,double precision,double precision,timestamptz,integer,integer,text,text,text,text,jsonb) from public,anon;
revoke all on function public.afat_assign_service_request(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.afat_transition_service_request(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.afat_record_service_proof(uuid,text,double precision,double precision,numeric,jsonb,text) from public,anon;
grant execute on function public.afat_create_service_request(text,text,text,double precision,double precision,double precision,double precision,timestamptz,integer,integer,text,text,text,text,jsonb) to authenticated;
grant execute on function public.afat_assign_service_request(uuid,uuid,uuid,uuid,text) to service_role,authenticated;
grant execute on function public.afat_transition_service_request(uuid,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.afat_record_service_proof(uuid,text,double precision,double precision,numeric,jsonb,text) to authenticated;
