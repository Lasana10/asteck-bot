create extension if not exists http with schema extensions;

create or replace function public.afat_ingest_osm_map_bbox(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_scope_label text default 'Yaounde:osm-api-cell'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_doc xml;
  v_batch_id uuid;
  v_dataset_version text;
  v_source_license text;
  v_attribution text;
  v_input_count integer := 0;
  v_registered integer := 0;
  v_topology jsonb;
begin
  if p_west >= p_east or p_south >= p_north then
    raise exception using errcode='22023', message='Invalid bbox';
  end if;
  if (p_east-p_west) > 0.01 or (p_north-p_south) > 0.01 then
    raise exception using errcode='22023', message='AFAT OSM API bbox is intentionally limited to 0.01 degrees per side';
  end if;

  v_url := format('https://api.openstreetmap.org/api/0.6/map?bbox=%s,%s,%s,%s',p_west,p_south,p_east,p_north);

  select h.content::xml into v_doc
  from extensions.http_get(v_url) h
  where h.status = 200;

  if v_doc is null then
    raise exception 'OpenStreetMap map API did not return HTTP 200';
  end if;

  select license_expression, attribution_text
  into v_source_license, v_attribution
  from public.afat_geo_sources
  where source_key='openstreetmap';

  v_dataset_version := 'osm-api:'||to_char(now(),'YYYYMMDDHH24MISSMS');

  with ways as (
    select x.* from xmltable('/osm/way' passing v_doc columns id bigint path '@id', body xml path '.') x
  ), highway_ways as (
    select w.id,w.body,
      (select t.v from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t where t.k='highway' limit 1) highway
    from ways w
  )
  select count(*) into v_input_count from highway_ways where highway is not null;

  insert into public.afat_geo_import_batches(
    source_key,dataset_version,scope_label,scope_bbox,import_mode,status,input_count,license_snapshot
  ) values (
    'openstreetmap',v_dataset_version,coalesce(nullif(trim(p_scope_label),''),'Yaounde:osm-api-cell'),
    jsonb_build_object('south',p_south,'west',p_west,'north',p_north,'east',p_east),
    'candidate_only','running',v_input_count,
    jsonb_build_object('license',v_source_license,'attribution',v_attribution,'endpoint','https://api.openstreetmap.org/api/0.6/map')
  ) returning id into v_batch_id;

  with nodes as materialized (
    select x.* from xmltable('/osm/node' passing v_doc columns id bigint path '@id', lat double precision path '@lat', lon double precision path '@lon') x
  ), ways as materialized (
    select x.* from xmltable('/osm/way' passing v_doc columns id bigint path '@id', body xml path '.') x
  ), highway_ways as materialized (
    select w.id,w.body,
      (select t.v from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t where t.k='highway' limit 1) highway,
      (select t.v from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t where t.k='name' limit 1) name,
      (select t.v from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t where t.k='name:en' limit 1) name_en,
      (select t.v from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t where t.k='name:fr' limit 1) name_fr,
      coalesce((select jsonb_object_agg(t.k,t.v) from xmltable('/way/tag' passing w.body columns k text path '@k', v text path '@v') t),'{}'::jsonb) tags
    from ways w
  ), features as materialized (
    select hw.id,hw.highway,
      coalesce(nullif(hw.name,''),nullif(hw.name_en,''),nullif(hw.name_fr,''),'OSM road '||hw.id::text) canonical_name,
      hw.tags,
      jsonb_agg(jsonb_build_array(n.lon,n.lat) order by nd.ord) coordinates,
      jsonb_agg(nd.ref order by nd.ord) osm_node_ids
    from highway_ways hw
    cross join lateral xmltable('/way/nd' passing hw.body columns ord for ordinality, ref bigint path '@ref') nd
    join nodes n on n.id=nd.ref
    where hw.highway is not null
    group by hw.id,hw.highway,hw.name,hw.name_en,hw.name_fr,hw.tags
    having count(*) >= 2
  ), registered as (
    select (public.afat_register_geo_source_record(
      'openstreetmap','way/'||f.id::text,v_batch_id,v_dataset_version,'line',f.canonical_name,array[]::text[],f.highway,null,
      jsonb_build_object('type','LineString','coordinates',f.coordinates),0.55,
      jsonb_build_object('osm_type','way','osm_id',f.id,'tags',f.tags,'osm_node_ids',f.osm_node_ids,'topology_aligned',true,'ingestion_method','official_osm_map_api','source_bbox',jsonb_build_array(p_west,p_south,p_east,p_north)),
      encode(extensions.digest((f.id::text||f.tags::text||f.coordinates::text)::bytea,'sha256'),'hex'),
      v_source_license,v_attribution
    )).id record_id
    from features f
  ) select count(*) into v_registered from registered;

  select public.afat_prepare_osm_topology(v_batch_id) into v_topology;

  update public.afat_geo_import_batches
  set status='completed',inserted_count=v_registered,finished_at=now(),updated_at=now()
  where id=v_batch_id;

  return jsonb_build_object(
    'batch_id',v_batch_id,
    'scope_label',p_scope_label,
    'highway_features',v_input_count,
    'registered_records',v_registered,
    'topology',v_topology,
    'status','completed_candidate_only'
  );
end;
$$;

revoke all on function public.afat_ingest_osm_map_bbox(double precision,double precision,double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.afat_ingest_osm_map_bbox(double precision,double precision,double precision,double precision,text) to service_role;

comment on function public.afat_ingest_osm_map_bbox(double precision,double precision,double precision,double precision,text) is 'Controlled bounded OSM map API ingest for AFAT. Registers real highway source records with provenance and prepares candidate topology; never promotes directly to canonical Atlas truth.';
