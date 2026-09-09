-- Service-only ingestion path for reproducible Overture candidate snapshots.
-- Execute privilege is the authorization boundary; the function does not self-promote evidence.

create or replace function public.afat_ingest_overture_candidate_chunk(
  p_batch_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r jsonb;
  v_geom public.geometry;
  v_point public.geometry;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_exists boolean;
begin
  if not exists(
    select 1
    from public.afat_geo_import_batches b
    where b.id=p_batch_id and b.source_key='overture_maps'
  ) then
    raise exception using errcode='22023', message='valid Overture import batch required';
  end if;

  if jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode='22023', message='records array required';
  end if;

  for r in select value from jsonb_array_elements(p_records) loop
    v_geom := public.st_setsrid(public.st_geomfromgeojson(r->>'geometry'),4326);
    v_point := case
      when public.geometrytype(v_geom)='POINT' then v_geom
      else public.st_centroid(v_geom)
    end;

    select exists(
      select 1
      from public.afat_geo_source_records s
      where s.source_key='overture_maps'
        and s.external_feature_id=r->>'external_feature_id'
    ) into v_exists;

    insert into public.afat_geo_source_records(
      source_key,external_feature_id,first_import_batch_id,last_import_batch_id,dataset_version,
      canonical_name,normalized_name,alternate_names,source_category,source_address,
      latitude,longitude,location,source_confidence,source_properties,record_fingerprint,
      review_status,source_feature_kind,source_geometry,source_license,attribution_text,last_seen_at,updated_at
    ) values(
      'overture_maps',r->>'external_feature_id',p_batch_id,p_batch_id,
      coalesce(r->>'dataset_version','2026-08-19.0'),
      r->>'canonical_name',r->>'normalized_name',
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'alternate_names','[]'::jsonb)) x),'{}'::text[]),
      nullif(r->>'source_category',''),nullif(r->>'source_address',''),
      public.st_y(v_point),public.st_x(v_point),v_point::public.geography,
      least(1,greatest(0,coalesce((r->>'source_confidence')::numeric,0.5))),
      coalesce(r->'source_properties','{}'::jsonb),r->>'record_fingerprint',
      'candidate',r->>'source_feature_kind',v_geom::public.geography,
      nullif(r->>'source_license',''),nullif(r->>'attribution_text',''),now(),now()
    )
    on conflict(source_key,external_feature_id) do update set
      last_import_batch_id=excluded.last_import_batch_id,
      dataset_version=excluded.dataset_version,
      canonical_name=excluded.canonical_name,
      normalized_name=excluded.normalized_name,
      alternate_names=excluded.alternate_names,
      source_category=excluded.source_category,
      source_address=excluded.source_address,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      location=excluded.location,
      source_confidence=excluded.source_confidence,
      source_properties=excluded.source_properties,
      record_fingerprint=excluded.record_fingerprint,
      source_feature_kind=excluded.source_feature_kind,
      source_geometry=excluded.source_geometry,
      source_license=excluded.source_license,
      attribution_text=excluded.attribution_text,
      last_seen_at=now(),
      updated_at=now();

    if v_exists then
      v_updated:=v_updated+1;
    else
      v_inserted:=v_inserted+1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'total',v_inserted+v_updated
  );
end;
$$;

revoke all on function public.afat_ingest_overture_candidate_chunk(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.afat_ingest_overture_candidate_chunk(uuid,jsonb) to service_role;

comment on function public.afat_ingest_overture_candidate_chunk(uuid,jsonb)
is 'Service-only candidate ingestion for reproducible Overture Yaounde pilot records; never promotes evidence trust by itself.';
