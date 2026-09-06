alter table public.afat_geo_source_records
  add column if not exists source_feature_kind text not null default 'point'
    check (source_feature_kind in ('point','line','polygon','relation')),
  add column if not exists source_geometry public.geography(geometry,4326),
  add column if not exists source_license text,
  add column if not exists attribution_text text;

update public.afat_geo_source_records
set source_geometry = location,
    source_feature_kind = 'point'
where source_geometry is null and location is not null;

create index if not exists afat_geo_source_records_geometry_gix
  on public.afat_geo_source_records using gist(source_geometry);
create index if not exists afat_geo_source_records_kind_idx
  on public.afat_geo_source_records(source_key, source_feature_kind, review_status);

create or replace function public.afat_register_geo_source_record(
  p_source_key text,
  p_external_feature_id text,
  p_import_batch_id uuid,
  p_dataset_version text,
  p_feature_kind text,
  p_canonical_name text,
  p_alternate_names text[],
  p_source_category text,
  p_source_address text,
  p_geojson jsonb,
  p_source_confidence numeric,
  p_source_properties jsonb,
  p_record_fingerprint text,
  p_source_license text,
  p_attribution_text text
)
returns public.afat_geo_source_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geometry public.geometry;
  v_geography public.geography;
  v_point public.geometry;
  v_record public.afat_geo_source_records%rowtype;
begin
  if p_source_key is null or length(trim(p_source_key)) < 2 then
    raise exception using errcode='22023', message='source_key required';
  end if;
  if p_external_feature_id is null or length(trim(p_external_feature_id)) < 1 then
    raise exception using errcode='22023', message='external_feature_id required';
  end if;
  if p_feature_kind not in ('point','line','polygon','relation') then
    raise exception using errcode='22023', message='unsupported source feature kind';
  end if;
  if p_geojson is null then
    raise exception using errcode='22023', message='GeoJSON geometry required';
  end if;

  v_geometry := public.st_setsrid(public.st_geomfromgeojson(p_geojson::text), 4326);
  if public.st_isempty(v_geometry) then
    raise exception using errcode='22023', message='empty geometry rejected';
  end if;
  if not public.st_isvalid(v_geometry) then
    raise exception using errcode='22023', message='invalid geometry rejected';
  end if;
  v_geography := v_geometry::public.geography;
  v_point := case when public.geometrytype(v_geometry) = 'POINT' then v_geometry else public.st_pointonsurface(v_geometry) end;

  insert into public.afat_geo_source_records(
    source_key, external_feature_id, first_import_batch_id, last_import_batch_id,
    dataset_version, canonical_name, normalized_name, alternate_names,
    source_category, source_address, latitude, longitude, location,
    source_confidence, source_properties, record_fingerprint,
    review_status, first_seen_at, last_seen_at,
    source_feature_kind, source_geometry, source_license, attribution_text,
    created_at, updated_at
  ) values (
    trim(p_source_key), trim(p_external_feature_id), p_import_batch_id, p_import_batch_id,
    trim(p_dataset_version), coalesce(nullif(trim(p_canonical_name),''), trim(p_external_feature_id)),
    lower(coalesce(nullif(trim(p_canonical_name),''), trim(p_external_feature_id))),
    coalesce(p_alternate_names,'{}'::text[]), p_source_category, p_source_address,
    public.st_y(v_point), public.st_x(v_point), v_point::public.geography,
    greatest(0::numeric,least(1::numeric,coalesce(p_source_confidence,0.4))),
    coalesce(p_source_properties,'{}'::jsonb), trim(p_record_fingerprint),
    'candidate', now(), now(), p_feature_kind, v_geography,
    nullif(trim(p_source_license),''), nullif(trim(p_attribution_text),''), now(), now()
  )
  on conflict (source_key, external_feature_id) do update set
    last_import_batch_id = excluded.last_import_batch_id,
    dataset_version = excluded.dataset_version,
    canonical_name = excluded.canonical_name,
    normalized_name = excluded.normalized_name,
    alternate_names = excluded.alternate_names,
    source_category = excluded.source_category,
    source_address = excluded.source_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location = excluded.location,
    source_confidence = excluded.source_confidence,
    source_properties = excluded.source_properties,
    record_fingerprint = excluded.record_fingerprint,
    source_feature_kind = excluded.source_feature_kind,
    source_geometry = excluded.source_geometry,
    source_license = excluded.source_license,
    attribution_text = excluded.attribution_text,
    last_seen_at = now(),
    updated_at = now()
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function public.afat_register_geo_source_record(text,text,uuid,text,text,text,text[],text,text,jsonb,numeric,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.afat_register_geo_source_record(text,text,uuid,text,text,text,text[],text,text,jsonb,numeric,jsonb,text,text,text) to service_role;
