create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid,
  company_id uuid,
  operator_id uuid,
  vehicle_id uuid,
  dispatch_assignment_id uuid,
  service_type text not null check (service_type in ('ride','taxi_hire','bike_pickup','delivery','agency_booking','charter','airport','special_needs','lost_found','complaint')),
  origin text,
  destination text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  scheduled_at timestamptz,
  passenger_count integer not null default 1 check (passenger_count >= 0),
  package_count integer not null default 0 check (package_count >= 0),
  priority text not null default 'normal' check (priority in ('low','normal','high','emergency')),
  status text not null default 'queued' check (status in ('draft','queued','offered','assigned','in_progress','completed','cancelled','failed','needs_review')),
  price_quote_xaf integer check (price_quote_xaf is null or price_quote_xaf >= 0),
  notes text,
  contact_name text,
  contact_phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dispatch_assignments add column if not exists service_request_id uuid;
create index if not exists service_requests_requester_idx on public.service_requests(requester_id, created_at desc);
create index if not exists service_requests_status_idx on public.service_requests(status, service_type, created_at desc);
create index if not exists dispatch_assignments_service_request_idx on public.dispatch_assignments(service_request_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='dispatch_assignments_service_request_id_fkey') then
    alter table public.dispatch_assignments
      add constraint dispatch_assignments_service_request_id_fkey
      foreign key (service_request_id) references public.service_requests(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='service_requests_dispatch_assignment_id_fkey') then
    alter table public.service_requests
      add constraint service_requests_dispatch_assignment_id_fkey
      foreign key (dispatch_assignment_id) references public.dispatch_assignments(id) on delete set null;
  end if;
end $$;

alter table public.service_requests enable row level security;

drop policy if exists "service requester can read own requests" on public.service_requests;
create policy "service requester can read own requests"
on public.service_requests for select to authenticated
using (
  requester_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin'))
);

drop policy if exists "service requester can create own requests" on public.service_requests;
create policy "service requester can create own requests"
on public.service_requests for insert to authenticated
with check (
  requester_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin'))
);

drop policy if exists "service requester can update own requests" on public.service_requests;
create policy "service requester can update own requests"
on public.service_requests for update to authenticated
using (
  requester_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin'))
)
with check (
  requester_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin'))
);

grant select,insert,update on public.service_requests to authenticated;
revoke all on public.service_requests from anon;

create table if not exists public.afat_fulfilment_channels (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  channel_key text not null,
  channel_type text not null check (channel_type in ('afat_network','independent_operator','cooperative','fleet','licensed_partner','public_transport')),
  display_name text not null,
  service_types text[] not null default '{}'::text[],
  transport_modes text[] not null default '{}'::text[],
  integration_mode text not null default 'native' check (integration_mode in ('native','manual_dispatch','partner_api','feed_only')),
  status text not null default 'available' check (status in ('available','pilot','needs_agreement','unconfigured','disabled')),
  authority_state text not null default 'internal' check (authority_state in ('internal','operator_verified','agreement_required','licensed','public_authority')),
  priority integer not null default 50 check (priority between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_key,channel_key)
);

alter table public.afat_fulfilment_channels enable row level security;
create index if not exists afat_fulfilment_channels_city_idx on public.afat_fulfilment_channels(city_key,status,priority desc);

drop policy if exists "authenticated can read enabled fulfilment channels" on public.afat_fulfilment_channels;
create policy "authenticated can read enabled fulfilment channels"
on public.afat_fulfilment_channels for select to authenticated
using (status in ('available','pilot'));

drop policy if exists "planner admin manage fulfilment channels" on public.afat_fulfilment_channels;
create policy "planner admin manage fulfilment channels"
on public.afat_fulfilment_channels for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin')))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin')));

grant select,insert,update,delete on public.afat_fulfilment_channels to authenticated;
revoke all on public.afat_fulfilment_channels from anon;

insert into public.afat_fulfilment_channels(
  city_key,channel_key,channel_type,display_name,service_types,transport_modes,integration_mode,status,authority_state,priority,metadata
)
select
  c.city_key,'afat-native','afat_network','AFAT native operator network',
  array['ride','taxi_hire','bike_pickup','delivery','agency_booking','charter','airport','special_needs'],
  array(select jsonb_array_elements_text(coalesce(c.transport_modes,'[]'::jsonb))),
  'native','available','internal',100,
  jsonb_build_object('automatic_truth',false,'source','AFAT operating kernel')
from public.afat_city_profiles c
where c.status='active'
on conflict(city_key,channel_key) do update
set service_types=excluded.service_types,
    transport_modes=excluded.transport_modes,
    updated_at=now();

create table if not exists public.afat_demand_signals (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  fingerprint text not null,
  signal_type text not null check (signal_type in ('unresolved_destination','supply_gap','route_failure','access_gap','transit_gap','delivery_demand','business_demand')),
  label text not null,
  intent_type text,
  requested_mode text,
  signal_count integer not null default 1 check (signal_count >= 0),
  status text not null default 'open' check (status in ('open','investigating','actioned','resolved','dismissed')),
  source_kind text not null default 'afat_observed',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_place_id uuid references public.afat_places(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique(city_key,fingerprint,signal_type)
);

alter table public.afat_demand_signals enable row level security;
create index if not exists afat_demand_signals_city_idx on public.afat_demand_signals(city_key,status,signal_count desc,last_seen_at desc);

drop policy if exists "planner admin read demand signals" on public.afat_demand_signals;
create policy "planner admin read demand signals"
on public.afat_demand_signals for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin')));

drop policy if exists "planner admin manage demand signals" on public.afat_demand_signals;
create policy "planner admin manage demand signals"
on public.afat_demand_signals for update to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin')))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('planner','admin')));

grant select,update on public.afat_demand_signals to authenticated;
revoke all on public.afat_demand_signals from anon;

create or replace function public.afat_capture_unresolved_demand_signal()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_city_key text;
begin
  select c.city_key into v_city_key
  from public.afat_city_profiles c
  where lower(c.city_name)=lower(new.city) or lower(c.city_key)=lower(new.city)
  order by case when lower(c.city_key)=lower(new.city) then 0 else 1 end
  limit 1;

  v_city_key:=coalesce(v_city_key,lower(replace(new.city,' ','-')));

  insert into public.afat_demand_signals(
    city_key,fingerprint,signal_type,label,intent_type,requested_mode,signal_count,status,source_kind,first_seen_at,last_seen_at,resolved_place_id,metadata
  ) values (
    v_city_key,new.fingerprint,'unresolved_destination',new.query_text,new.intent_type,new.requested_mode,
    greatest(new.demand_count,1),
    case when new.status='resolved' then 'resolved' else 'open' end,
    'afat_observed',new.first_seen_at,new.last_seen_at,new.resolved_place_id,
    jsonb_build_object('source_table','afat_unresolved_destination_demand','source_id',new.id,'automatic_truth',false)
  )
  on conflict(city_key,fingerprint,signal_type) do update
  set label=excluded.label,
      intent_type=excluded.intent_type,
      requested_mode=excluded.requested_mode,
      signal_count=excluded.signal_count,
      status=excluded.status,
      last_seen_at=excluded.last_seen_at,
      resolved_place_id=excluded.resolved_place_id,
      metadata=public.afat_demand_signals.metadata||excluded.metadata;
  return new;
end $$;

revoke all on function public.afat_capture_unresolved_demand_signal() from public,anon,authenticated;

drop trigger if exists afat_unresolved_demand_to_signal on public.afat_unresolved_destination_demand;
create trigger afat_unresolved_demand_to_signal
after insert or update of demand_count,status,resolved_place_id,last_seen_at
on public.afat_unresolved_destination_demand
for each row execute function public.afat_capture_unresolved_demand_signal();

insert into public.afat_demand_signals(
  city_key,fingerprint,signal_type,label,intent_type,requested_mode,signal_count,status,source_kind,first_seen_at,last_seen_at,resolved_place_id,metadata
)
select
  coalesce(c.city_key,lower(replace(d.city,' ','-'))),
  d.fingerprint,'unresolved_destination',d.query_text,d.intent_type,d.requested_mode,
  greatest(d.demand_count,1),
  case when d.status='resolved' then 'resolved' else 'open' end,
  'afat_observed',d.first_seen_at,d.last_seen_at,d.resolved_place_id,
  jsonb_build_object('source_table','afat_unresolved_destination_demand','source_id',d.id,'automatic_truth',false)
from public.afat_unresolved_destination_demand d
left join public.afat_city_profiles c on lower(c.city_name)=lower(d.city) or lower(c.city_key)=lower(d.city)
on conflict(city_key,fingerprint,signal_type) do update
set signal_count=excluded.signal_count,
    status=excluded.status,
    last_seen_at=excluded.last_seen_at,
    resolved_place_id=excluded.resolved_place_id;

create or replace function public.afat_city_mobility_evolution_snapshot(p_city_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_role text;
  v_city_name text;
  v_city_profile_id uuid;
  v_result jsonb;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role not in ('planner','admin') then raise exception 'planner_or_admin_required'; end if;

  select c.city_name,c.id into v_city_name,v_city_profile_id
  from public.afat_city_profiles c where c.city_key=p_city_key;
  if v_city_name is null then raise exception 'city_not_found'; end if;

  select jsonb_build_object(
    'city_key',p_city_key,
    'city_name',v_city_name,
    'places',(select count(*) from public.afat_places p where lower(p.city)=lower(v_city_name) or lower(p.city)=lower(p_city_key)),
    'open_demand_signals',(select count(*) from public.afat_demand_signals d where d.city_key=p_city_key and d.status in ('open','investigating')),
    'demand_volume',(select coalesce(sum(d.signal_count),0) from public.afat_demand_signals d where d.city_key=p_city_key and d.status in ('open','investigating')),
    'fulfilment_channels',(select count(*) from public.afat_fulfilment_channels f where f.city_key=p_city_key and f.status in ('available','pilot')),
    'transit_nodes',(select count(*) from public.afat_transit_nodes n where n.city_profile_id=v_city_profile_id),
    'transit_lines',(select count(*) from public.afat_transit_lines l where l.city_profile_id=v_city_profile_id),
    'service_requests',(select count(*) from public.service_requests s where lower(coalesce(s.metadata->>'city_key',''))=lower(p_city_key)),
    'deliveries',(select count(*) from public.service_requests s where s.service_type='delivery' and lower(coalesce(s.metadata->>'city_key',''))=lower(p_city_key)),
    'dispatches',(select count(*) from public.dispatch_assignments a where a.service_request_id is not null),
    'journeys',(select count(*) from public.afat_journeys),
    'automatic_truth',false
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.afat_city_mobility_evolution_snapshot(text) from public,anon;
grant execute on function public.afat_city_mobility_evolution_snapshot(text) to authenticated;
