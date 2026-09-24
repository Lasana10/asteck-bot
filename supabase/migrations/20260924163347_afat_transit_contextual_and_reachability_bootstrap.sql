create table if not exists public.afat_transit_nodes(
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  place_id uuid references public.afat_places(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  node_type text not null check(node_type in ('boarding','transfer','terminus','informal_stop','station','other')),
  name text not null,
  local_name text,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  location public.geography generated always as (
    public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography
  ) stored,
  access_modes text[] not null default '{}',
  confidence numeric not null default 35 check(confidence between 0 and 100),
  evidence_status text not null default 'limited' check(evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  active boolean not null default true,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists afat_transit_nodes_meeting_uidx on public.afat_transit_nodes(meeting_point_id) where meeting_point_id is not null and active=true;
create index if not exists afat_transit_nodes_city_idx on public.afat_transit_nodes(city_profile_id,active,evidence_status);
create index if not exists afat_transit_nodes_place_idx on public.afat_transit_nodes(place_id) where place_id is not null;
create index if not exists afat_transit_nodes_location_gix on public.afat_transit_nodes using gist(location);
alter table public.afat_transit_nodes enable row level security;
revoke all on public.afat_transit_nodes from anon,authenticated;

create table if not exists public.afat_transit_lines(
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  source_route_id uuid references public.routes(id) on delete set null,
  line_ref text not null unique,
  name text not null,
  mode text not null check(mode in ('bus','minibus','shared_taxi','moto_taxi','ferry','rail','other')),
  direction_label text,
  service_pattern jsonb not null default '{}'::jsonb,
  confidence numeric not null default 35 check(confidence between 0 and 100),
  evidence_status text not null default 'limited' check(evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  active boolean not null default true,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_transit_lines_city_idx on public.afat_transit_lines(city_profile_id,active,mode);
create index if not exists afat_transit_lines_source_route_idx on public.afat_transit_lines(source_route_id) where source_route_id is not null;
alter table public.afat_transit_lines enable row level security;
revoke all on public.afat_transit_lines from anon,authenticated;

create table if not exists public.afat_transit_line_nodes(
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.afat_transit_lines(id) on delete cascade,
  node_id uuid not null references public.afat_transit_nodes(id) on delete cascade,
  stop_sequence integer not null check(stop_sequence>=0),
  direction text not null default 'forward',
  observed_travel_seconds integer check(observed_travel_seconds is null or observed_travel_seconds>=0),
  dwell_seconds integer check(dwell_seconds is null or dwell_seconds>=0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(line_id,direction,stop_sequence),
  unique(line_id,direction,node_id)
);
create index if not exists afat_transit_line_nodes_node_idx on public.afat_transit_line_nodes(node_id);
alter table public.afat_transit_line_nodes enable row level security;
revoke all on public.afat_transit_line_nodes from anon,authenticated;

create table if not exists public.afat_contextual_confirmations(
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  passenger_id uuid references public.profiles(id) on delete set null,
  operator_id uuid references public.profiles(id) on delete set null,
  place_id uuid references public.afat_places(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  access_point_id uuid references public.afat_access_points(id) on delete set null,
  prompt_type text not null check(prompt_type in ('meeting_point_correct','access_worked','destination_correct','road_access','boarding_point_correct')),
  question text not null,
  answer_options jsonb not null default '[]'::jsonb,
  information_value numeric not null default 50 check(information_value between 0 and 100),
  status text not null default 'open' check(status in ('open','answered','expired','dismissed')),
  answer jsonb,
  answered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  expires_at timestamptz not null default (now()+interval '14 days'),
  evidence jsonb not null default '{}'::jsonb,
  fingerprint text not null unique
);
create index if not exists afat_contextual_confirmations_dispatch_idx on public.afat_contextual_confirmations(dispatch_id,status,created_at desc);
create index if not exists afat_contextual_confirmations_place_idx on public.afat_contextual_confirmations(place_id,status) where place_id is not null;
create index if not exists afat_contextual_confirmations_answered_by_idx on public.afat_contextual_confirmations(answered_by) where answered_by is not null;
alter table public.afat_contextual_confirmations enable row level security;
revoke all on public.afat_contextual_confirmations from anon,authenticated;

create or replace function public.afat_transit_graph_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'City profile not found'; end if;
 return jsonb_build_object(
   'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name),
   'nodes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'place_id',n.place_id,'meeting_point_id',n.meeting_point_id,'node_type',n.node_type,
      'name',n.name,'local_name',n.local_name,'latitude',n.latitude,'longitude',n.longitude,
      'access_modes',n.access_modes,'confidence',n.confidence,'evidence_status',n.evidence_status
   )) from public.afat_transit_nodes n where n.city_profile_id=v_city.id and n.active=true),'[]'::jsonb),
   'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'line_ref',l.line_ref,'name',l.name,'mode',l.mode,'direction_label',l.direction_label,
      'confidence',l.confidence,'evidence_status',l.evidence_status,
      'nodes',coalesce((select jsonb_agg(jsonb_build_object(
          'node_id',ln.node_id,'stop_sequence',ln.stop_sequence,'direction',ln.direction,
          'observed_travel_seconds',ln.observed_travel_seconds,'dwell_seconds',ln.dwell_seconds
        ) order by ln.stop_sequence) from public.afat_transit_line_nodes ln where ln.line_id=l.id),'[]'::jsonb)
   )) from public.afat_transit_lines l where l.city_profile_id=v_city.id and l.active=true),'[]'::jsonb)
 );
end; $$;
revoke all on function public.afat_transit_graph_snapshot(text) from public,anon;
grant execute on function public.afat_transit_graph_snapshot(text) to authenticated;

create or replace function public.afat_promote_meeting_to_transit_node(
 p_meeting_point_id uuid,
 p_node_type text default 'boarding'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_meeting public.afat_meeting_points%rowtype; v_place public.afat_places%rowtype; v_city public.afat_city_profiles%rowtype; v_id uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;
 if p_node_type not in ('boarding','transfer','terminus','informal_stop','station','other') then raise exception 'Unsupported node type'; end if;
 select * into v_meeting from public.afat_meeting_points where id=p_meeting_point_id and status in ('active','review');
 if not found then raise exception 'Meeting point not found'; end if;
 if v_meeting.evidence_status not in ('corroborated','field_verified') then raise exception 'Meeting point must be corroborated before transit promotion'; end if;
 select * into v_place from public.afat_places where id=v_meeting.place_id;
 select * into v_city from public.afat_city_profiles where lower(city_name)=lower(v_place.city) and status='active' limit 1;
 if not found then raise exception 'City profile not found'; end if;
 insert into public.afat_transit_nodes(city_profile_id,place_id,meeting_point_id,node_type,name,latitude,longitude,access_modes,confidence,evidence_status,evidence)
 values(v_city.id,v_place.id,v_meeting.id,p_node_type,v_meeting.name,v_meeting.latitude,v_meeting.longitude,v_meeting.access_modes,v_meeting.confidence,v_meeting.evidence_status,
   jsonb_build_object('meeting_point_id',v_meeting.id,'promoted_by',v_uid,'promoted_at',now()))
 on conflict(meeting_point_id) where meeting_point_id is not null and active=true
 do update set node_type=excluded.node_type,name=excluded.name,confidence=greatest(public.afat_transit_nodes.confidence,excluded.confidence),evidence_status=excluded.evidence_status,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('transit_node_id',v_id,'automatic_truth',false);
end; $$;
revoke all on function public.afat_promote_meeting_to_transit_node(uuid,text) from public,anon;
grant execute on function public.afat_promote_meeting_to_transit_node(uuid,text) to authenticated;

create or replace function public.afat_generate_reachability_missions(p_city_key text default 'cm-yaounde',p_limit integer default 24)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_added int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'City profile not found'; end if;

 insert into public.afat_micro_missions(city,mission_type,title,question,target_place_id,priority,required_mode,status,expires_at,evidence)
 select v_city.city_name,'entrance_check','Find the usable entrance','Which entrance actually works for this destination?',p.id,
        greatest(50,least(95,100-coalesce(p.base_confidence,35))),'walk','open',now()+interval '21 days',
        jsonb_build_object('source','reachability_bootstrap','gap','missing_access','place_ref',p.place_ref)
 from public.afat_places p
 where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'
   and not exists(select 1 from public.afat_access_points a where a.place_id=p.id and a.active=true)
   and not exists(select 1 from public.afat_micro_missions m where m.target_place_id=p.id and m.mission_type='entrance_check' and m.status in ('open','claimed'))
 order by coalesce(p.successful_pickups,0) desc,coalesce(p.base_confidence,35) asc
 limit greatest(0,p_limit/2);
 get diagnostics v_added=row_count;

 insert into public.afat_micro_missions(city,mission_type,title,question,target_place_id,priority,required_mode,status,expires_at,evidence)
 select v_city.city_name,'meeting_point_check','Confirm a practical meeting point','Where can a passenger and operator reliably meet here?',p.id,
        greatest(50,least(95,100-coalesce(p.base_confidence,35))),'taxi','open',now()+interval '21 days',
        jsonb_build_object('source','reachability_bootstrap','gap','missing_meeting','place_ref',p.place_ref)
 from public.afat_places p
 where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'
   and not exists(select 1 from public.afat_meeting_points m where m.place_id=p.id and m.status='active')
   and not exists(select 1 from public.afat_micro_missions m where m.target_place_id=p.id and m.mission_type='meeting_point_check' and m.status in ('open','claimed'))
 order by coalesce(p.successful_pickups,0) desc,coalesce(p.base_confidence,35) asc
 limit greatest(0,p_limit-v_added);

 return jsonb_build_object('city_key',p_city_key,'missions_created',v_added + (
   select count(*) from public.afat_micro_missions m where m.city=v_city.city_name and m.status='open' and m.evidence->>'source'='reachability_bootstrap' and m.created_at>now()-interval '1 minute'
 ));
end; $$;
revoke all on function public.afat_generate_reachability_missions(text,integer) from public,anon;
grant execute on function public.afat_generate_reachability_missions(text,integer) to authenticated;
