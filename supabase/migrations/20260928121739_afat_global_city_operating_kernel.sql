
-- AFAT global city operating kernel.
-- Makes AFAT city/country portable without manufacturing integrations or map truth.

create table if not exists public.afat_country_packs (
  country_code text primary key check (char_length(country_code)=2),
  country_name text not null,
  default_timezone text,
  currency_code text,
  supported_languages text[] not null default '{}'::text[],
  default_transport_modes jsonb not null default '[]'::jsonb,
  interoperability_standards text[] not null default array['geojson']::text[],
  policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','preview','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.afat_country_packs enable row level security;
revoke all on public.afat_country_packs from anon,authenticated;

create table if not exists public.afat_adapter_registry (
  adapter_key text primary key,
  adapter_type text not null check (adapter_type in ('source','authority','transit','payment')),
  display_name text not null,
  protocol text not null,
  standards text[] not null default '{}'::text[],
  capabilities jsonb not null default '{}'::jsonb,
  data_policy jsonb not null default '{}'::jsonb,
  status text not null default 'unconfigured'
    check (status in ('available','unconfigured','needs_credentials','partner_required','reference_only','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.afat_adapter_registry enable row level security;
revoke all on public.afat_adapter_registry from anon,authenticated;

create table if not exists public.afat_city_operating_packs (
  city_profile_id uuid primary key references public.afat_city_profiles(id) on delete cascade,
  country_code text not null references public.afat_country_packs(country_code),
  bootstrap_stage text not null default 'registered'
    check (bootstrap_stage in ('registered','sources_seeded','learning','operational','paused')),
  capabilities jsonb not null default jsonb_build_object(
    'atlas',true,'reachability',true,'routing',true,'booking',true,'journey_learning',true,
    'evidence',true,'missions',true,'transit',true,'authority_interop',true
  ),
  standards text[] not null default array['geojson','gtfs','gtfs-realtime','gbfs']::text[],
  policy jsonb not null default jsonb_build_object(
    'automatic_truth',false,
    'external_data_requires_provenance',true,
    'authority_data_requires_permission',true,
    'journey_learning_requires_privacy_gate',true
  ),
  metadata jsonb not null default '{}'::jsonb,
  last_cycle_at timestamptz,
  last_cycle_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.afat_city_operating_packs enable row level security;
revoke all on public.afat_city_operating_packs from anon,authenticated;

create table if not exists public.afat_city_adapter_bindings (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  adapter_key text not null references public.afat_adapter_registry(adapter_key) on delete cascade,
  binding_state text not null default 'unconfigured'
    check (binding_state in ('ready','unconfigured','needs_credentials','partner_required','reference_only','disabled','error')),
  priority numeric not null default 50 check (priority between 0 and 100),
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_profile_id,adapter_key)
);
create index if not exists afat_city_adapter_bindings_city_state_idx
  on public.afat_city_adapter_bindings(city_profile_id,binding_state,priority desc);
alter table public.afat_city_adapter_bindings enable row level security;
revoke all on public.afat_city_adapter_bindings from anon,authenticated;

-- Country identity is safe to bootstrap from an already-registered city profile.
-- Jurisdiction-specific legal/authority rules remain explicitly unverified until configured.
insert into public.afat_country_packs(
  country_code,country_name,default_timezone,currency_code,supported_languages,
  default_transport_modes,interoperability_standards,policy,metadata,status,updated_at
)
select distinct on (upper(c.country_code))
  upper(c.country_code),coalesce(nullif(c.country_name,''),upper(c.country_code)),
  c.timezone,c.currency_code,c.supported_languages,c.transport_modes,
  array['geojson','gtfs','gtfs-realtime','gbfs']::text[],
  jsonb_build_object('jurisdiction_rules_verified',false,'authority_access_assumed',false),
  jsonb_build_object('bootstrapped_from_city_profile',true,'automatic_truth',false),
  'active',now()
from public.afat_city_profiles c
where c.status='active'
order by upper(c.country_code),c.created_at
on conflict(country_code) do update set
  country_name=excluded.country_name,
  default_timezone=coalesce(public.afat_country_packs.default_timezone,excluded.default_timezone),
  currency_code=coalesce(public.afat_country_packs.currency_code,excluded.currency_code),
  supported_languages=case when cardinality(public.afat_country_packs.supported_languages)=0 then excluded.supported_languages else public.afat_country_packs.supported_languages end,
  updated_at=now();

-- Standards/adapters are capability contracts, not claims that a city has an active feed.
insert into public.afat_adapter_registry(adapter_key,adapter_type,display_name,protocol,standards,capabilities,data_policy,status,metadata,updated_at)
values
 ('transit.gtfs','transit','GTFS static feed','gtfs',array['gtfs'],jsonb_build_object('routes',true,'stops',true,'schedules',true),jsonb_build_object('requires_feed_rights',true),'unconfigured',jsonb_build_object('automatic_truth',false),now()),
 ('transit.gtfs_realtime','transit','GTFS Realtime feed','protobuf',array['gtfs-realtime'],jsonb_build_object('vehicle_positions',true,'trip_updates',true,'alerts',true),jsonb_build_object('requires_feed_rights',true),'unconfigured',jsonb_build_object('automatic_truth',false),now()),
 ('mobility.gbfs','transit','GBFS shared mobility feed','json',array['gbfs'],jsonb_build_object('stations',true,'vehicle_status',true),jsonb_build_object('requires_feed_rights',true),'unconfigured',jsonb_build_object('automatic_truth',false),now()),
 ('source.geojson','source','GeoJSON / open geodata import','geojson',array['geojson'],jsonb_build_object('roads',true,'places',true,'boundaries',true),jsonb_build_object('license_must_be_recorded',true),'available',jsonb_build_object('automatic_truth',false),now()),
 ('authority.partner','authority','Authorized authority / municipality partner interface','partner_api',array[]::text[],jsonb_build_object('identity',true,'transport',true,'infrastructure',true,'planning',true),jsonb_build_object('permission_required',true,'public_access_not_assumed',true),'partner_required',jsonb_build_object('automatic_truth',false),now()),
 ('payment.gateway','payment','Jurisdiction payment gateway interface','rpc',array[]::text[],jsonb_build_object('quote',true,'payment',true,'reconciliation',true),jsonb_build_object('provider_contract_required',true),'unconfigured',jsonb_build_object('automatic_truth',false),now())
on conflict(adapter_key) do update set
  display_name=excluded.display_name,protocol=excluded.protocol,standards=excluded.standards,
  capabilities=excluded.capabilities,data_policy=excluded.data_policy,
  metadata=public.afat_adapter_registry.metadata||excluded.metadata,updated_at=now();

-- Register the real source adapters already configured in AFAT.
insert into public.afat_adapter_registry(adapter_key,adapter_type,display_name,protocol,standards,capabilities,data_policy,status,metadata,updated_at)
select
  'source.'||p.source_key,'source',s.display_name,
  coalesce(nullif(a.acquisition_mode,''),'rpc'),
  case when p.source_key='openstreetmap' then array['osm','geojson']::text[]
       when p.source_key='overture_maps' then array['overture','geojson']::text[]
       else array['geojson']::text[] end,
  jsonb_build_object('feature_classes',p.feature_classes,'source_key',p.source_key),
  jsonb_build_object(
    'durable_storage_allowed',coalesce(cp.durable_storage_allowed,false),
    'data_mode',cp.data_mode,
    'legal_state',a.legal_state,
    'automatic_truth',false
  ),
  case p.plan_state
    when 'ready' then 'available'
    when 'needs_credentials' then 'needs_credentials'
    when 'reference_only' then 'reference_only'
    when 'disabled' then 'disabled'
    else 'unconfigured' end,
  jsonb_build_object('native_adapter_key',p.adapter_key,'source_plan_backed',true),
  now()
from public.afat_city_source_plans p
join public.afat_geo_sources s on s.source_key=p.source_key
join public.afat_source_capability_profiles cp on cp.source_key=p.source_key
left join public.afat_source_acquisition_profiles a on a.source_key=p.source_key
group by p.source_key,s.display_name,a.acquisition_mode,p.feature_classes,cp.durable_storage_allowed,cp.data_mode,a.legal_state,p.plan_state,p.adapter_key
on conflict(adapter_key) do update set
  capabilities=excluded.capabilities,data_policy=excluded.data_policy,status=excluded.status,
  metadata=public.afat_adapter_registry.metadata||excluded.metadata,updated_at=now();

insert into public.afat_city_operating_packs(city_profile_id,country_code,bootstrap_stage,metadata,updated_at)
select c.id,upper(c.country_code),
  case when exists(select 1 from public.afat_city_source_plans p where p.city_profile_id=c.id) then 'sources_seeded' else 'registered' end,
  jsonb_build_object('created_from_existing_city',true,'automatic_truth',false),now()
from public.afat_city_profiles c
where c.status='active'
on conflict(city_profile_id) do nothing;

insert into public.afat_city_adapter_bindings(city_profile_id,adapter_key,binding_state,priority,config,updated_at)
select p.city_profile_id,'source.'||p.source_key,
  case p.plan_state when 'ready' then 'ready' when 'needs_credentials' then 'needs_credentials'
    when 'reference_only' then 'reference_only' when 'disabled' then 'disabled' else 'unconfigured' end,
  p.priority,
  jsonb_build_object('source_key',p.source_key,'native_adapter_key',p.adapter_key,'feature_classes',p.feature_classes,'automatic_truth',false),
  now()
from public.afat_city_source_plans p
where exists(select 1 from public.afat_city_profiles c where c.id=p.city_profile_id and c.status='active')
on conflict(city_profile_id,adapter_key) do update set
  binding_state=excluded.binding_state,priority=excluded.priority,
  config=public.afat_city_adapter_bindings.config||excluded.config,updated_at=now();

-- Standards are present but remain unconfigured until a real feed/provider/authority agreement exists.
insert into public.afat_city_adapter_bindings(city_profile_id,adapter_key,binding_state,priority,config,updated_at)
select c.id,a.adapter_key,
  case a.adapter_key when 'source.geojson' then 'ready' when 'authority.partner' then 'partner_required' else 'unconfigured' end,
  case a.adapter_key when 'source.geojson' then 80 when 'authority.partner' then 65 else 55 end,
  jsonb_build_object('city_key',c.city_key,'automatic_truth',false,'connection_claimed',false),now()
from public.afat_city_profiles c
cross join public.afat_adapter_registry a
where c.status='active' and a.adapter_key in ('transit.gtfs','transit.gtfs_realtime','mobility.gbfs','source.geojson','authority.partner','payment.gateway')
on conflict(city_profile_id,adapter_key) do nothing;

create or replace function public.afat_seed_city_operating_pack(p_city_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_country text;
  v_source_count int:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure'))
    then raise exception 'City operating configuration permission required'; end if;

  select * into v_city from public.afat_city_profiles where city_key=lower(trim(p_city_key)) and status='active';
  if not found then raise exception 'Active city profile required'; end if;
  v_country:=upper(v_city.country_code);

  insert into public.afat_country_packs(
    country_code,country_name,default_timezone,currency_code,supported_languages,
    default_transport_modes,interoperability_standards,policy,metadata,status,updated_at
  ) values(
    v_country,coalesce(nullif(v_city.country_name,''),v_country),v_city.timezone,v_city.currency_code,
    v_city.supported_languages,v_city.transport_modes,array['geojson','gtfs','gtfs-realtime','gbfs']::text[],
    jsonb_build_object('jurisdiction_rules_verified',false,'authority_access_assumed',false),
    jsonb_build_object('bootstrapped_from_city_profile',true,'automatic_truth',false),
    'active',now()
  )
  on conflict(country_code) do nothing;

  insert into public.afat_city_operating_packs(city_profile_id,country_code,bootstrap_stage,metadata,updated_at)
  values(v_city.id,v_country,
    case when exists(select 1 from public.afat_city_source_plans p where p.city_profile_id=v_city.id) then 'sources_seeded' else 'registered' end,
    jsonb_build_object('seeded_by',v_uid,'automatic_truth',false),now())
  on conflict(city_profile_id) do update set country_code=excluded.country_code,updated_at=now();

  insert into public.afat_adapter_registry(adapter_key,adapter_type,display_name,protocol,standards,capabilities,data_policy,status,metadata,updated_at)
  select
    'source.'||p.source_key,'source',s.display_name,coalesce(nullif(a.acquisition_mode,''),'rpc'),
    case when p.source_key='openstreetmap' then array['osm','geojson']::text[]
         when p.source_key='overture_maps' then array['overture','geojson']::text[]
         else array['geojson']::text[] end,
    jsonb_build_object('feature_classes',p.feature_classes,'source_key',p.source_key),
    jsonb_build_object('durable_storage_allowed',coalesce(cp.durable_storage_allowed,false),'data_mode',cp.data_mode,'legal_state',a.legal_state,'automatic_truth',false),
    case p.plan_state when 'ready' then 'available' when 'needs_credentials' then 'needs_credentials'
      when 'reference_only' then 'reference_only' when 'disabled' then 'disabled' else 'unconfigured' end,
    jsonb_build_object('native_adapter_key',p.adapter_key,'source_plan_backed',true),now()
  from public.afat_city_source_plans p
  join public.afat_geo_sources s on s.source_key=p.source_key
  join public.afat_source_capability_profiles cp on cp.source_key=p.source_key
  left join public.afat_source_acquisition_profiles a on a.source_key=p.source_key
  where p.city_profile_id=v_city.id
  on conflict(adapter_key) do update set
    capabilities=excluded.capabilities,data_policy=excluded.data_policy,status=excluded.status,
    metadata=public.afat_adapter_registry.metadata||excluded.metadata,updated_at=now();

  insert into public.afat_city_adapter_bindings(city_profile_id,adapter_key,binding_state,priority,config,updated_at)
  select p.city_profile_id,'source.'||p.source_key,
    case p.plan_state when 'ready' then 'ready' when 'needs_credentials' then 'needs_credentials'
      when 'reference_only' then 'reference_only' when 'disabled' then 'disabled' else 'unconfigured' end,
    p.priority,jsonb_build_object('source_key',p.source_key,'native_adapter_key',p.adapter_key,'feature_classes',p.feature_classes,'automatic_truth',false),now()
  from public.afat_city_source_plans p where p.city_profile_id=v_city.id
  on conflict(city_profile_id,adapter_key) do update set
    binding_state=excluded.binding_state,priority=excluded.priority,
    config=public.afat_city_adapter_bindings.config||excluded.config,updated_at=now();
  get diagnostics v_source_count=row_count;

  insert into public.afat_city_adapter_bindings(city_profile_id,adapter_key,binding_state,priority,config,updated_at)
  select v_city.id,a.adapter_key,
    case a.adapter_key when 'source.geojson' then 'ready' when 'authority.partner' then 'partner_required' else 'unconfigured' end,
    case a.adapter_key when 'source.geojson' then 80 when 'authority.partner' then 65 else 55 end,
    jsonb_build_object('city_key',v_city.city_key,'automatic_truth',false,'connection_claimed',false),now()
  from public.afat_adapter_registry a
  where a.adapter_key in ('transit.gtfs','transit.gtfs_realtime','mobility.gbfs','source.geojson','authority.partner','payment.gateway')
  on conflict(city_profile_id,adapter_key) do nothing;

  update public.afat_city_operating_packs set
    bootstrap_stage=case when exists(select 1 from public.afat_city_source_plans p where p.city_profile_id=v_city.id) then 'sources_seeded' else bootstrap_stage end,
    metadata=metadata||jsonb_build_object('last_seeded_at',now(),'last_seeded_by',v_uid,'automatic_truth',false),
    updated_at=now()
  where city_profile_id=v_city.id;

  return jsonb_build_object('city_key',v_city.city_key,'country_code',v_country,'source_bindings_refreshed',v_source_count,'automatic_truth',false);
end; $$;
revoke all on function public.afat_seed_city_operating_pack(text) from public,anon;
grant execute on function public.afat_seed_city_operating_pack(text) to authenticated;

create or replace function public.afat_city_operating_snapshot(p_city_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_pack public.afat_city_operating_packs%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'City operating visibility permission required'; end if;

  select * into v_city from public.afat_city_profiles where city_key=lower(trim(p_city_key)) and status='active';
  if not found then raise exception 'Active city profile required'; end if;
  select * into v_pack from public.afat_city_operating_packs where city_profile_id=v_city.id;

  return jsonb_build_object(
    'city',jsonb_build_object(
      'city_key',v_city.city_key,'city_name',v_city.city_name,'country_code',upper(v_city.country_code),
      'learning_stage',v_city.learning_stage,'operational_confidence',v_city.operational_confidence,
      'transport_modes',v_city.transport_modes
    ),
    'pack',case when v_pack.city_profile_id is null then null else jsonb_build_object(
      'bootstrap_stage',v_pack.bootstrap_stage,'capabilities',v_pack.capabilities,'standards',v_pack.standards,
      'policy',v_pack.policy,'last_cycle_at',v_pack.last_cycle_at,'last_cycle_result',v_pack.last_cycle_result
    ) end,
    'adapters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'adapter_key',b.adapter_key,'type',a.adapter_type,'name',a.display_name,'protocol',a.protocol,
        'standards',a.standards,'binding_state',b.binding_state,'priority',b.priority,
        'last_success_at',b.last_success_at,'connection_claimed',coalesce((b.config->>'connection_claimed')::boolean,b.binding_state='ready' and a.adapter_type='source')
      ) order by b.priority desc,a.display_name)
      from public.afat_city_adapter_bindings b join public.afat_adapter_registry a on a.adapter_key=b.adapter_key
      where b.city_profile_id=v_city.id
    ),'[]'::jsonb),
    'loop',jsonb_build_object(
      'places',(select count(*) from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'),
      'reachable_places',(select count(*) from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired' and p.reachability_state in ('usable','verified')),
      'transit_nodes',(select count(*) from public.afat_transit_nodes n where n.city_profile_id=v_city.id and n.active=true),
      'transit_lines',(select count(*) from public.afat_transit_lines l where l.city_profile_id=v_city.id and l.active=true),
      'open_missions',(select count(*) from public.afat_micro_missions m where lower(m.city)=lower(v_city.city_name) and m.status in ('open','claimed')),
      'submitted_evidence',(select count(*) from public.afat_micro_missions m where lower(m.city)=lower(v_city.city_name) and m.status='submitted'),
      'source_bindings_ready',(select count(*) from public.afat_city_adapter_bindings b join public.afat_adapter_registry a on a.adapter_key=b.adapter_key where b.city_profile_id=v_city.id and a.adapter_type='source' and b.binding_state='ready'),
      'authority_connections_ready',(select count(*) from public.afat_city_adapter_bindings b join public.afat_adapter_registry a on a.adapter_key=b.adapter_key where b.city_profile_id=v_city.id and a.adapter_type='authority' and b.binding_state='ready'),
      'automatic_truth',false
    ),
    'automatic_truth',false
  );
end; $$;
revoke all on function public.afat_city_operating_snapshot(text) from public,anon;
grant execute on function public.afat_city_operating_snapshot(text) to authenticated;

create or replace function public.afat_run_city_operating_cycle(
  p_city_key text,
  p_mission_limit integer default 24
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_seed jsonb;
  v_sources jsonb;
  v_source_intelligence jsonb;
  v_operational jsonb;
  v_reachability jsonb;
  v_learning jsonb;
  v_stage text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'City operating permission required'; end if;

  select * into v_city from public.afat_city_profiles where city_key=lower(trim(p_city_key)) and status='active';
  if not found then raise exception 'Active city profile required'; end if;
  p_mission_limit:=greatest(2,least(coalesce(p_mission_limit,24),100));

  v_seed:=public.afat_seed_city_operating_pack(v_city.city_key);
  v_sources:=public.afat_refresh_city_source_relevance(v_city.city_key);
  v_source_intelligence:=public.afat_refresh_source_intelligence(v_city.city_key,p_mission_limit);
  v_operational:=public.afat_refresh_operational_map_learning(v_city.city_key);
  v_reachability:=public.afat_refresh_reachability_city(v_city.city_key,p_mission_limit);
  v_learning:=public.afat_refresh_city_learning(v_city.city_key);

  select * into v_city from public.afat_city_profiles where id=v_city.id;
  v_stage:=case
    when coalesce(v_city.operational_confidence,0)>=60
      and exists(select 1 from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired')
      and exists(select 1 from public.afat_city_source_plans p where p.city_profile_id=v_city.id and p.plan_state='ready')
      then 'operational'
    when exists(select 1 from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired')
      or exists(select 1 from public.afat_micro_missions m where lower(m.city)=lower(v_city.city_name))
      then 'learning'
    when exists(select 1 from public.afat_city_source_plans p where p.city_profile_id=v_city.id)
      then 'sources_seeded'
    else 'registered' end;

  v_result:=jsonb_build_object(
    'city_key',v_city.city_key,'stage',v_stage,'seed',v_seed,'source_relevance',v_sources,
    'source_intelligence',v_source_intelligence,'operational_learning',v_operational,
    'reachability',v_reachability,'city_learning',v_learning,'automatic_truth',false
  );

  update public.afat_city_operating_packs
  set bootstrap_stage=v_stage,last_cycle_at=now(),last_cycle_result=v_result,
      metadata=metadata||jsonb_build_object('last_cycle_by',v_uid),updated_at=now()
  where city_profile_id=v_city.id;

  return v_result;
end; $$;
revoke all on function public.afat_run_city_operating_cycle(text,integer) from public,anon;
grant execute on function public.afat_run_city_operating_cycle(text,integer) to authenticated;

-- Keep city registration portable even if a city is created outside the dashboard.
create or replace function public.afat_seed_city_operating_pack_on_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.afat_country_packs(
    country_code,country_name,default_timezone,currency_code,supported_languages,
    default_transport_modes,interoperability_standards,policy,metadata,status,updated_at
  ) values(
    upper(new.country_code),coalesce(nullif(new.country_name,''),upper(new.country_code)),
    new.timezone,new.currency_code,new.supported_languages,new.transport_modes,
    array['geojson','gtfs','gtfs-realtime','gbfs']::text[],
    jsonb_build_object('jurisdiction_rules_verified',false,'authority_access_assumed',false),
    jsonb_build_object('bootstrapped_from_city_profile',true,'automatic_truth',false),
    'active',now()
  ) on conflict(country_code) do nothing;

  insert into public.afat_city_operating_packs(city_profile_id,country_code,bootstrap_stage,metadata,updated_at)
  values(new.id,upper(new.country_code),'registered',jsonb_build_object('automatic_truth',false),now())
  on conflict(city_profile_id) do nothing;
  return new;
end; $$;
revoke all on function public.afat_seed_city_operating_pack_on_insert() from public,anon,authenticated;

drop trigger if exists trg_afat_city_operating_pack_on_insert on public.afat_city_profiles;
create trigger trg_afat_city_operating_pack_on_insert
after insert on public.afat_city_profiles
for each row execute function public.afat_seed_city_operating_pack_on_insert();
