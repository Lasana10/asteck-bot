create table if not exists public.afat_atlas_topology_nodes (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.afat_geo_sources(source_key) on delete restrict,
  external_node_id text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location geography(point,4326) not null,
  first_import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  last_import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  review_status text not null default 'candidate' check (review_status in ('candidate','review','approved','rejected','stale')),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_key, external_node_id)
);

create table if not exists public.afat_atlas_topology_segments (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.afat_geo_sources(source_key) on delete restrict,
  source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
  import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  segment_index integer not null check (segment_index >= 0),
  from_topology_node_id uuid not null references public.afat_atlas_topology_nodes(id) on delete cascade,
  to_topology_node_id uuid not null references public.afat_atlas_topology_nodes(id) on delete cascade,
  geometry geography(linestring,4326) not null,
  distance_m numeric(12,2) not null check (distance_m >= 0),
  highway_class text,
  one_way boolean not null default false,
  access_modes text[] not null default array['walk']::text[],
  source_properties jsonb not null default '{}'::jsonb,
  review_status text not null default 'candidate' check (review_status in ('candidate','review','approved','rejected','stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_record_id, segment_index),
  check (from_topology_node_id <> to_topology_node_id)
);

create index if not exists afat_topology_nodes_location_gix on public.afat_atlas_topology_nodes using gist(location);
create index if not exists afat_topology_nodes_review_idx on public.afat_atlas_topology_nodes(source_key, review_status);
create index if not exists afat_topology_segments_geometry_gix on public.afat_atlas_topology_segments using gist(geometry);
create index if not exists afat_topology_segments_batch_idx on public.afat_atlas_topology_segments(import_batch_id, review_status);

alter table public.afat_atlas_topology_nodes enable row level security;
alter table public.afat_atlas_topology_segments enable row level security;
revoke all on public.afat_atlas_topology_nodes from anon, authenticated;
revoke all on public.afat_atlas_topology_segments from anon, authenticated;
grant select, insert, update, delete on public.afat_atlas_topology_nodes to service_role;
grant select, insert, update, delete on public.afat_atlas_topology_segments to service_role;

create or replace function public.afat_prepare_osm_topology(p_import_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.afat_geo_import_batches%rowtype;
  v_record public.afat_geo_source_records%rowtype;
  v_geom public.geometry;
  v_n integer;
  v_i integer;
  v_external text;
  v_prev_external text;
  v_point public.geometry;
  v_prev_point public.geometry;
  v_node_id uuid;
  v_prev_node_id uuid;
  v_nodes integer := 0;
  v_segments integer := 0;
  v_skipped integer := 0;
  v_tags jsonb;
  v_modes text[];
  v_oneway boolean;
begin
  select * into v_batch from public.afat_geo_import_batches where id = p_import_batch_id;
  if not found or v_batch.source_key <> 'openstreetmap' then
    raise exception using errcode='22023', message='A valid OpenStreetMap import batch is required';
  end if;

  for v_record in
    select * from public.afat_geo_source_records
    where last_import_batch_id = p_import_batch_id
      and source_key = 'openstreetmap'
      and source_feature_kind = 'line'
  loop
    if coalesce((v_record.source_properties->>'topology_aligned')::boolean, false) is not true
       or jsonb_typeof(v_record.source_properties->'osm_node_ids') <> 'array' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_geom := v_record.source_geometry::public.geometry;
    v_n := public.st_npoints(v_geom);
    if v_n < 2 or jsonb_array_length(v_record.source_properties->'osm_node_ids') <> v_n then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_tags := coalesce(v_record.source_properties->'tags','{}'::jsonb);
    v_oneway := lower(coalesce(v_tags->>'oneway','')) in ('yes','true','1');
    v_modes := case
      when lower(coalesce(v_tags->>'highway','')) in ('footway','pedestrian','steps') then array['walk']::text[]
      when lower(coalesce(v_tags->>'highway','')) in ('cycleway') then array['walk','bike']::text[]
      when lower(coalesce(v_tags->>'highway','')) in ('motorway','motorway_link') then array['car','minibus']::text[]
      else array['walk','bike','moto','car','minibus']::text[]
    end;

    v_prev_node_id := null;
    v_prev_point := null;
    v_prev_external := null;

    for v_i in 1..v_n loop
      v_external := v_record.source_properties->'osm_node_ids'->>(v_i - 1);
      v_point := public.st_pointn(v_geom, v_i);
      if v_external is null or v_point is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into public.afat_atlas_topology_nodes(
        source_key, external_node_id, latitude, longitude, location,
        first_import_batch_id, last_import_batch_id, provenance
      ) values (
        'openstreetmap', v_external, public.st_y(v_point), public.st_x(v_point), v_point::public.geography,
        p_import_batch_id, p_import_batch_id,
        jsonb_build_object('source','openstreetmap','osm_node_id',v_external,'dataset_version',v_record.dataset_version)
      )
      on conflict (source_key, external_node_id) do update set
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        location = excluded.location,
        last_import_batch_id = excluded.last_import_batch_id,
        occurrence_count = public.afat_atlas_topology_nodes.occurrence_count + 1,
        provenance = public.afat_atlas_topology_nodes.provenance || excluded.provenance,
        updated_at = now()
      returning id into v_node_id;
      v_nodes := v_nodes + 1;

      if v_prev_node_id is not null and v_prev_node_id <> v_node_id then
        insert into public.afat_atlas_topology_segments(
          source_key, source_record_id, import_batch_id, segment_index,
          from_topology_node_id, to_topology_node_id, geometry, distance_m,
          highway_class, one_way, access_modes, source_properties
        ) values (
          'openstreetmap', v_record.id, p_import_batch_id, v_i - 2,
          v_prev_node_id, v_node_id,
          public.st_makeline(v_prev_point, v_point)::public.geography,
          public.st_distance(v_prev_point::public.geography, v_point::public.geography),
          v_tags->>'highway', v_oneway, v_modes,
          jsonb_build_object(
            'osm_way_id', v_record.source_properties->>'osm_id',
            'from_osm_node_id', v_prev_external,
            'to_osm_node_id', v_external,
            'tags', v_tags,
            'dataset_version', v_record.dataset_version,
            'source_license', v_record.source_license,
            'attribution_text', v_record.attribution_text
          )
        )
        on conflict (source_record_id, segment_index) do update set
          import_batch_id = excluded.import_batch_id,
          from_topology_node_id = excluded.from_topology_node_id,
          to_topology_node_id = excluded.to_topology_node_id,
          geometry = excluded.geometry,
          distance_m = excluded.distance_m,
          highway_class = excluded.highway_class,
          one_way = excluded.one_way,
          access_modes = excluded.access_modes,
          source_properties = excluded.source_properties,
          updated_at = now();
        v_segments := v_segments + 1;
      end if;

      v_prev_node_id := v_node_id;
      v_prev_point := v_point;
      v_prev_external := v_external;
    end loop;
  end loop;

  return jsonb_build_object(
    'batch_id', p_import_batch_id,
    'source', 'openstreetmap',
    'node_occurrences_processed', v_nodes,
    'segments_prepared', v_segments,
    'records_skipped', v_skipped,
    'status', 'candidate_topology_only'
  );
end;
$$;

revoke all on function public.afat_prepare_osm_topology(uuid) from public, anon, authenticated;
grant execute on function public.afat_prepare_osm_topology(uuid) to service_role;

comment on table public.afat_atlas_topology_nodes is 'Source-aware topology staging. These rows are not canonical AFAT Atlas truth and are never directly exposed as routable geography.';
comment on table public.afat_atlas_topology_segments is 'Per-way road segment staging preserving OSM intersection topology, tags, licence and batch provenance prior to conflation/review.';
comment on function public.afat_prepare_osm_topology(uuid) is 'Prepares OSM node and segment topology from a controlled import batch without promoting source data into canonical AFAT Atlas.';
