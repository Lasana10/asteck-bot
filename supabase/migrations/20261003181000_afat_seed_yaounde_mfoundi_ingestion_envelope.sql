with city as (
  select id from public.afat_city_profiles where city_key='cm-yaounde' and status='active' limit 1
), params as (
  select 3.723659::double precision south,
         11.413966::double precision west,
         4.023592::double precision north,
         11.576568::double precision east,
         0.02::double precision span
), lat_steps as (
  select generate_series(0, ceil((north-south)/span)::int - 1) i, south, north, span from params
), lon_steps as (
  select generate_series(0, ceil((east-west)/span)::int - 1) j, west, east, span from params
), cells as (
  select
    greatest(p.south, p.south + l.i*p.span) as south,
    greatest(p.west, p.west + o.j*p.span) as west,
    least(p.north, p.south + (l.i+1)*p.span) as north,
    least(p.east, p.west + (o.j+1)*p.span) as east
  from params p cross join lat_steps l cross join lon_steps o
)
insert into public.afat_city_ingestion_cells(
  city_profile_id,source_key,cell_key,scope_label,south,west,north,east,status,requested_by,result
)
select
  city.id,
  'openstreetmap',
  format('openstreetmap:%s:%s:%s:%s',round(c.south::numeric,5),round(c.west::numeric,5),round(c.north::numeric,5),round(c.east::numeric,5)),
  format('mfoundi-envelope-%s-%s',round(c.south::numeric,3),round(c.west::numeric,3)),
  c.south,c.west,c.north,c.east,
  'pending',null,
  jsonb_build_object(
    'automatic_truth',false,
    'seed_reason','city_coverage_working_envelope',
    'boundary_name','Mfoundi / Communauté urbaine de Yaoundé',
    'boundary_source','OpenStreetMap administrative boundary; OSM tags cite Institut National de Cartographie',
    'bbox_reference','3.723659,11.413966,4.023592,11.576568',
    'requires_authenticated_ingest',true
  )
from city cross join cells c
on conflict(city_profile_id,source_key,cell_key) do nothing;

update public.afat_city_profiles
set metadata=metadata||jsonb_build_object(
  'coverage_working_envelope',jsonb_build_object(
    'south',3.723659,'west',11.413966,'north',4.023592,'east',11.576568,
    'basis','Mfoundi / Communauté urbaine de Yaoundé administrative boundary working envelope',
    'automatic_truth',false
  )
),updated_at=now()
where city_key='cm-yaounde';