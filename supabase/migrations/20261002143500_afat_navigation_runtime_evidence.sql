create table if not exists public.afat_navigation_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  city_key text not null default 'cm-yaounde',
  place_id uuid references public.afat_places(id) on delete set null,
  access_point_id uuid references public.afat_access_points(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  intent_type text not null default 'go',
  movement_mode text not null default 'car',
  status text not null default 'active' check (status in ('active','arrived','cancelled','failed')),
  destination_latitude double precision not null,
  destination_longitude double precision not null,
  route_distance_m numeric,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sample_count integer not null default 0,
  last_latitude double precision,
  last_longitude double precision,
  last_accuracy_m numeric,
  last_recorded_at timestamptz,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false,'runtime','browser_geolocation'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_navigation_samples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.afat_navigation_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m numeric,
  speed_kph numeric,
  heading numeric,
  recorded_at timestamptz not null default now(),
  source text not null default 'browser_geolocation',
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now()
);

create index if not exists afat_navigation_sessions_profile_status_idx on public.afat_navigation_sessions(profile_id,status,started_at desc);
create index if not exists afat_navigation_samples_session_time_idx on public.afat_navigation_samples(session_id,recorded_at);

alter table public.afat_navigation_sessions enable row level security;
alter table public.afat_navigation_samples enable row level security;

drop policy if exists afat_navigation_sessions_owner_select on public.afat_navigation_sessions;
create policy afat_navigation_sessions_owner_select on public.afat_navigation_sessions for select to authenticated using (profile_id=auth.uid());
drop policy if exists afat_navigation_samples_owner_select on public.afat_navigation_samples;
create policy afat_navigation_samples_owner_select on public.afat_navigation_samples for select to authenticated using (profile_id=auth.uid());

revoke insert,update,delete on public.afat_navigation_sessions from authenticated,anon;
revoke insert,update,delete on public.afat_navigation_samples from authenticated,anon;
grant select on public.afat_navigation_sessions to authenticated;
grant select on public.afat_navigation_samples to authenticated;

create or replace function public.afat_start_navigation_session(
  p_city_key text,
  p_place_id uuid,
  p_access_point_id uuid,
  p_meeting_point_id uuid,
  p_intent_type text,
  p_movement_mode text,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_route_distance_m numeric default null
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_row public.afat_navigation_sessions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_destination_latitude not between -90 and 90 or p_destination_longitude not between -180 and 180 then raise exception 'Valid destination coordinates required'; end if;
  if lower(coalesce(p_movement_mode,'')) not in ('walk','bike','moto','car','minibus') then raise exception 'Unsupported movement mode'; end if;
  update public.afat_navigation_sessions set status='cancelled',completed_at=now(),updated_at=now(),evidence=evidence||jsonb_build_object('superseded_by_new_session',true) where profile_id=v_uid and status='active';
  insert into public.afat_navigation_sessions(profile_id,city_key,place_id,access_point_id,meeting_point_id,intent_type,movement_mode,destination_latitude,destination_longitude,route_distance_m,evidence)
  values(v_uid,coalesce(nullif(trim(p_city_key),''),'cm-yaounde'),p_place_id,p_access_point_id,p_meeting_point_id,coalesce(nullif(trim(p_intent_type),''),'go'),lower(p_movement_mode),p_destination_latitude,p_destination_longitude,p_route_distance_m,jsonb_build_object('automatic_truth',false,'runtime','browser_geolocation','arrival_requires_distance_check',true)) returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.afat_ingest_navigation_sample(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_kph numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_session public.afat_navigation_sessions%rowtype; v_sample_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.afat_navigation_sessions where id=p_session_id and profile_id=v_uid for update;
  if not found then raise exception 'Navigation session not found'; end if;
  if v_session.status<>'active' then raise exception 'Navigation session is not active'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid sample coordinates required'; end if;
  if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>1000) then raise exception 'Invalid GPS accuracy'; end if;
  insert into public.afat_navigation_samples(session_id,profile_id,latitude,longitude,accuracy_m,speed_kph,heading,recorded_at,evidence)
  values(p_session_id,v_uid,p_latitude,p_longitude,p_accuracy_m,p_speed_kph,p_heading,coalesce(p_recorded_at,now()),jsonb_build_object('automatic_truth',false,'source','browser_geolocation')) returning id into v_sample_id;
  update public.afat_navigation_sessions set sample_count=sample_count+1,last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy_m=p_accuracy_m,last_recorded_at=coalesce(p_recorded_at,now()),updated_at=now() where id=p_session_id;
  return jsonb_build_object('sample_id',v_sample_id,'session_id',p_session_id,'accepted',true);
end $$;

create or replace function public.afat_finish_navigation_session(
  p_session_id uuid,
  p_outcome text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m numeric default null
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_session public.afat_navigation_sessions%rowtype; v_distance numeric; v_threshold numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.afat_navigation_sessions where id=p_session_id and profile_id=v_uid for update;
  if not found then raise exception 'Navigation session not found'; end if;
  if v_session.status<>'active' then return to_jsonb(v_session); end if;
  if p_outcome not in ('arrived','cancelled','failed') then raise exception 'Unsupported navigation outcome'; end if;
  if p_outcome='arrived' then
    if p_latitude is null or p_longitude is null then raise exception 'Arrival position required'; end if;
    v_distance:=extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(v_session.destination_longitude,v_session.destination_latitude),4326)::extensions.geography);
    v_threshold:=greatest(35,least(100,coalesce(p_accuracy_m,0)*1.5));
    if v_distance>v_threshold then raise exception 'Arrival position is outside the accepted distance threshold'; end if;
    update public.afat_navigation_sessions set status='arrived',completed_at=now(),last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy_m=p_accuracy_m,last_recorded_at=now(),updated_at=now(),evidence=evidence||jsonb_build_object('arrival_distance_m',round(v_distance,1),'arrival_threshold_m',round(v_threshold,1),'arrival_server_verified',true,'automatic_truth',false) where id=p_session_id returning * into v_session;
  else
    update public.afat_navigation_sessions set status=p_outcome,completed_at=now(),updated_at=now(),evidence=evidence||jsonb_build_object('arrival_server_verified',false,'automatic_truth',false) where id=p_session_id returning * into v_session;
  end if;
  return to_jsonb(v_session);
end $$;

revoke all on function public.afat_start_navigation_session(text,uuid,uuid,uuid,text,text,double precision,double precision,numeric) from public,anon;
revoke all on function public.afat_ingest_navigation_sample(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz) from public,anon;
revoke all on function public.afat_finish_navigation_session(uuid,text,double precision,double precision,numeric) from public,anon;
grant execute on function public.afat_start_navigation_session(text,uuid,uuid,uuid,text,text,double precision,double precision,numeric) to authenticated;
grant execute on function public.afat_ingest_navigation_sample(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.afat_finish_navigation_session(uuid,text,double precision,double precision,numeric) to authenticated;