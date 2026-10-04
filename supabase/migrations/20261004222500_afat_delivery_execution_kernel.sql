create table if not exists public.afat_delivery_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','assigned','pickup_verified','picked_up','in_transit','dropoff_verified','delivered','failed','cancelled','proof_added')),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_m numeric check (accuracy_m is null or accuracy_m between 0 and 1000),
  proof_url text,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now()
);
create index if not exists afat_delivery_events_request_time_idx on public.afat_delivery_events(service_request_id,created_at desc);
alter table public.afat_delivery_events enable row level security;
revoke insert,update,delete on public.afat_delivery_events from anon,authenticated;
grant select on public.afat_delivery_events to authenticated;
drop policy if exists afat_delivery_events_participant_read on public.afat_delivery_events;
create policy afat_delivery_events_participant_read on public.afat_delivery_events for select to authenticated using (
  exists(select 1 from public.service_requests sr where sr.id=service_request_id and (
    sr.requester_id=auth.uid() or sr.operator_id=auth.uid() or exists(select 1 from public.dispatch_assignments da where da.id=sr.dispatch_assignment_id and da.operator_id=auth.uid())
  )) or public.afat_has_permission('system.configure')
);
drop policy if exists "service assigned operator can read requests" on public.service_requests;
create policy "service assigned operator can read requests" on public.service_requests for select to authenticated using (
  operator_id=auth.uid() or exists(select 1 from public.dispatch_assignments da where da.id=dispatch_assignment_id and da.operator_id=auth.uid())
);

create or replace function public.afat_create_delivery_request(
  p_origin text,p_destination text,p_pickup_lat double precision,p_pickup_lng double precision,
  p_dropoff_lat double precision,p_dropoff_lng double precision,p_package_count integer default 1,
  p_recipient_name text default null,p_recipient_phone text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_pickup_code text; v_dropoff_code text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_pickup_lat not between -90 and 90 or p_dropoff_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 or p_dropoff_lng not between -180 and 180 then raise exception 'VALID_COORDINATES_REQUIRED'; end if;
  if coalesce(p_package_count,0)<1 or p_package_count>50 then raise exception 'PACKAGE_COUNT_INVALID'; end if;
  v_pickup_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  v_dropoff_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.service_requests(requester_id,service_type,origin,destination,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,passenger_count,package_count,priority,status,notes,contact_name,contact_phone,metadata)
  values(v_uid,'delivery',nullif(trim(p_origin),''),nullif(trim(p_destination),''),p_pickup_lat,p_pickup_lng,p_dropoff_lat,p_dropoff_lng,0,p_package_count,'normal','queued',nullif(trim(p_notes),''),nullif(trim(p_recipient_name),''),nullif(trim(p_recipient_phone),''),jsonb_build_object(
    'automatic_truth',false,'delivery_state','queued','pickup_code_hash',encode(digest(v_pickup_code,'sha256'),'hex'),'dropoff_code_hash',encode(digest(v_dropoff_code,'sha256'),'hex'),'recipient_confirmation_required',true
  )) returning id into v_id;
  insert into public.afat_delivery_events(service_request_id,actor_profile_id,event_type,evidence) values(v_id,v_uid,'created',jsonb_build_object('automatic_truth',false,'package_count',p_package_count));
  return jsonb_build_object('id',v_id,'status','queued','pickup_code',v_pickup_code,'recipient_code',v_dropoff_code,'message','Codes are returned once and stored only as hashes.');
end $$;

create or replace function public.afat_delivery_operator_action(
  p_request_id uuid,p_action text,p_code text default null,p_latitude double precision default null,p_longitude double precision default null,p_accuracy_m numeric default null,p_proof_url text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_req public.service_requests%rowtype; v_assigned boolean:=false; v_expected text; v_hash text; v_next text; v_event text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_req from public.service_requests where id=p_request_id and service_type='delivery' for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  v_assigned := v_req.operator_id=v_uid or exists(select 1 from public.dispatch_assignments da where da.id=v_req.dispatch_assignment_id and da.operator_id=v_uid and da.status not in ('cancelled','failed','declined'));
  if not v_assigned then raise exception 'DELIVERY_OPERATOR_NOT_ASSIGNED'; end if;
  if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>1000) then raise exception 'INVALID_ACCURACY'; end if;
  if p_action='pickup' then
    if v_req.status not in ('assigned','offered') then raise exception 'DELIVERY_PICKUP_STATE_INVALID'; end if;
    if nullif(trim(p_code),'') is null then raise exception 'PICKUP_CODE_REQUIRED'; end if;
    v_expected:=v_req.metadata->>'pickup_code_hash'; v_hash:=encode(digest(upper(trim(p_code)),'sha256'),'hex');
    if v_expected is null or v_hash<>v_expected then raise exception 'PICKUP_CODE_INVALID'; end if;
    v_next:='in_progress'; v_event:='pickup_verified';
  elsif p_action='deliver' then
    if v_req.status<>'in_progress' then raise exception 'DELIVERY_DROPOFF_STATE_INVALID'; end if;
    if nullif(trim(p_code),'') is null then raise exception 'RECIPIENT_CODE_REQUIRED'; end if;
    v_expected:=v_req.metadata->>'dropoff_code_hash'; v_hash:=encode(digest(upper(trim(p_code)),'sha256'),'hex');
    if v_expected is null or v_hash<>v_expected then raise exception 'RECIPIENT_CODE_INVALID'; end if;
    v_next:='completed'; v_event:='dropoff_verified';
  elsif p_action='fail' then
    if v_req.status not in ('assigned','offered','in_progress') then raise exception 'DELIVERY_FAILURE_STATE_INVALID'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'FAILURE_REASON_REQUIRED'; end if;
    v_next:='failed'; v_event:='failed';
  else raise exception 'DELIVERY_ACTION_INVALID'; end if;
  update public.service_requests set operator_id=coalesce(operator_id,v_uid),status=v_next,metadata=metadata||jsonb_build_object('delivery_state',v_next,'last_operator_action',p_action,'last_operator_action_at',now(),'automatic_truth',false),updated_at=now() where id=v_req.id;
  insert into public.afat_delivery_events(service_request_id,actor_profile_id,event_type,latitude,longitude,accuracy_m,proof_url,evidence)
  values(v_req.id,v_uid,v_event,p_latitude,p_longitude,p_accuracy_m,nullif(trim(p_proof_url),''),jsonb_build_object('automatic_truth',false,'code_verified',p_action in ('pickup','deliver'),'reason',nullif(trim(p_reason),'')));
  if p_action='pickup' then insert into public.afat_delivery_events(service_request_id,actor_profile_id,event_type,evidence) values(v_req.id,v_uid,'picked_up',jsonb_build_object('automatic_truth',false,'based_on','pickup_code_verified')); end if;
  if p_action='deliver' then insert into public.afat_delivery_events(service_request_id,actor_profile_id,event_type,evidence) values(v_req.id,v_uid,'delivered',jsonb_build_object('automatic_truth',false,'based_on','recipient_code_verified')); end if;
  return jsonb_build_object('id',v_req.id,'status',v_next,'action',p_action,'code_verified',p_action in ('pickup','deliver'));
end $$;

create or replace function public.afat_cancel_delivery(p_request_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_req public.service_requests%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_req from public.service_requests where id=p_request_id and service_type='delivery' for update;
  if not found or v_req.requester_id<>v_uid then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_req.status not in ('queued','offered','assigned') then raise exception 'DELIVERY_CANNOT_BE_CANCELLED_AFTER_PICKUP'; end if;
  update public.service_requests set status='cancelled',metadata=metadata||jsonb_build_object('delivery_state','cancelled','cancelled_at',now(),'automatic_truth',false),updated_at=now() where id=v_req.id;
  insert into public.afat_delivery_events(service_request_id,actor_profile_id,event_type,evidence) values(v_req.id,v_uid,'cancelled',jsonb_build_object('automatic_truth',false,'reason',nullif(trim(p_reason),'')));
  return jsonb_build_object('id',v_req.id,'status','cancelled');
end $$;

revoke all on function public.afat_create_delivery_request(text,text,double precision,double precision,double precision,double precision,integer,text,text,text) from public,anon;
revoke all on function public.afat_delivery_operator_action(uuid,text,text,double precision,double precision,numeric,text,text) from public,anon;
revoke all on function public.afat_cancel_delivery(uuid,text) from public,anon;
grant execute on function public.afat_create_delivery_request(text,text,double precision,double precision,double precision,double precision,integer,text,text,text) to authenticated;
grant execute on function public.afat_delivery_operator_action(uuid,text,text,double precision,double precision,numeric,text,text) to authenticated;
grant execute on function public.afat_cancel_delivery(uuid,text) to authenticated;
