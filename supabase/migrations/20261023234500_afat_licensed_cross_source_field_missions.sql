-- AFAT: turn existing licensed Overture/OSM geometry discrepancies into
-- geographically anchored, optional field missions. Neither source coverage
-- nor category disagreement proves a real road exists, is usable or is closed.
-- No source record, road graph, or personal travel location is changed here.

create or replace function public.afat_atlas_cross_source_road_checks(
  p_city_key text default 'cm-yaounde',p_limit integer default 20
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_city public.afat_city_profiles%rowtype;
  v_box jsonb;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not (
      public.afat_has_permission('map.evidence.review')
      or public.afat_has_permission('planning.aggregate.view')
      or public.afat_has_permission('field.mission.manage')
  ) then raise exception 'ATLAS_SOURCE_REVIEW_PERMISSION_REQUIRED' using errcode='42501';
  end if;

  select * into v_city from public.afat_city_profiles
    where city_key=p_city_key and status='active';
  if not found then raise exception 'ACTIVE_CITY_NOT_FOUND' using errcode='P0002'; end if;
  v_box:=v_city.metadata->'coverage_working_envelope';
  if v_box is null or
    jsonb_typeof(v_box->'south')<>'number' or
    jsonb_typeof(v_box->'north')<>'number' or
    jsonb_typeof(v_box->'west')<>'number' or
    jsonb_typeof(v_box->'east')<>'number'
  then raise exception 'REVIEWED_CITY_COVERAGE_NOT_CONFIGURED' using errcode='22023';end if;

  with comparisons as (
    select s.id,s.source_key,s.external_feature_id,s.canonical_name,
      s.source_category,s.source_confidence,s.dataset_version,
      source.attribution_text,
      public.st_y(public.st_centroid(s.source_geometry::public.geometry)) as lat,
      public.st_x(public.st_centroid(s.source_geometry::public.geometry)) as lon,
      peer.id as peer_id,peer.source_key as peer_source,
      peer.source_category as peer_category,peer.distance_m as peer_distance_m,
      edge.id as atlas_edge_id,edge.distance_m as atlas_distance_m,
      mission.id as active_mission_id
    from public.afat_geo_source_records s
    join public.afat_geo_sources source on source.source_key=s.source_key
      and source.enabled=true and source.commercial_use_reviewed=true
    left join lateral (
      select p.id,p.source_key,p.source_category,
        round(public.st_distance(p.source_geometry,s.source_geometry)::numeric,1) as distance_m
      from public.afat_geo_source_records p
      join public.afat_geo_sources ps on ps.source_key=p.source_key
        and ps.enabled=true and ps.commercial_use_reviewed=true
      where p.source_feature_kind='line'
        and p.source_key=case when s.source_key='openstreetmap'
          then 'overture_maps' else 'openstreetmap' end
        and public.st_dwithin(p.source_geometry,s.source_geometry,35)
      order by public.st_distance(p.source_geometry,s.source_geometry)
      limit 1
    ) peer on true
    left join lateral (
      select e.id,round(public.st_distance(e.geometry,s.source_geometry)::numeric,1) as distance_m
      from public.afat_atlas_edges e
      where e.status='active' and public.st_dwithin(e.geometry,s.source_geometry,80)
      order by public.st_distance(e.geometry,s.source_geometry) limit 1
    ) edge on true
    left join lateral (
      select m.id from public.afat_micro_missions m
      where m.target_edge_id=edge.id and m.status in ('open','claimed','submitted')
      order by m.created_at desc limit 1
    ) mission on true
    where s.source_key in ('openstreetmap','overture_maps')
      and s.source_feature_kind='line' and s.review_status='candidate'
      and s.source_geometry is not null
      and s.latitude between (v_box->>'south')::float8 and (v_box->>'north')::float8
      and s.longitude between (v_box->>'west')::float8 and (v_box->>'east')::float8
  ),
  gaps as (
    select *,
      case when peer_id is null then 'other_dataset_has_no_nearby_segment'
        else 'nearby_sources_use_different_road_categories' end as discrepancy_type
    from comparisons where peer_id is null
      or (
        lower(coalesce(source_category,''))<>lower(coalesce(peer_category,''))
        and coalesce(source_category,'')<>'' and coalesce(peer_category,'')<>''
      )
  ),
  selected as (
    select * from gaps order by
       case when atlas_edge_id is not null and active_mission_id is null then 0 else 1 end,
       case when peer_id is null then 0 else 1 end,
       source_confidence desc nulls last,id
    limit greatest(1,least(coalesce(p_limit,20),50))
  )
  select jsonb_build_object(
    'city_key',v_city.city_key,'city_name',v_city.city_name,
    'basis','licensed_source_crosscheck_not_field_verified',
    'comparison_radius_m',35,'route_anchor_radius_m',80,
    'automatic_truth',false,'road_safety_verified',false,
    'discrepancies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_record_id',r.id,'source_key',r.source_key,
        'feature_name',left(r.canonical_name,120),
        'feature_category',r.source_category,
        'source_confidence',r.source_confidence,
        'dataset_version',r.dataset_version,
        'attribution',r.attribution_text,
        'latitude',r.lat,'longitude',r.lon,
        'discrepancy_type',r.discrepancy_type,
        'nearby_source_key',r.peer_source,
        'nearby_category',r.peer_category,
        'nearest_source_distance_m',r.peer_distance_m,
        'atlas_edge_id',r.atlas_edge_id,
        'atlas_edge_distance_m',r.atlas_distance_m,
        'existing_mission_id',r.active_mission_id,
        'can_request_field_check',
          r.atlas_edge_id is not null and r.active_mission_id is null
       )) from selected r
    ),'[]'::jsonb),
    'source_records_compared',(select count(*) from comparisons),
    'discrepancy_count',(select count(*) from gaps),
    'actionable_count',(select count(*) from gaps
      where atlas_edge_id is not null and active_mission_id is null),
    'message','These are differences in licensed mapping datasets, NOT verified missing/closed roads. Field confirmation is required.'
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.afat_atlas_cross_source_road_checks(text,integer) from public,anon,authenticated;
grant execute on function public.afat_atlas_cross_source_road_checks(text,integer) to authenticated,service_role;

create or replace function public.afat_request_cross_source_field_check(
  p_source_record_id uuid,p_city_key text,p_review_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_record public.afat_geo_source_records%rowtype;
 v_city public.afat_city_profiles%rowtype;
 v_license public.afat_geo_sources%rowtype;
 v_box jsonb;
 v_peer public.afat_geo_source_records%rowtype;
 v_edge public.afat_atlas_edges%rowtype;
 v_mission public.afat_micro_missions%rowtype;
 v_reason text:=trim(coalesce(p_review_reason,''));
 v_type text;
begin
 if v_uid is null or not public.afat_has_permission('field.mission.manage')
  then raise exception 'ATLAS_MISSION_MANAGE_PERMISSION_REQUIRED' using errcode='42501';end if;
 if char_length(v_reason)<25 or char_length(v_reason)>1500 then
  raise exception 'ATLAS_FIELD_REVIEW_REASON_REQUIRED' using errcode='22023';end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'ACTIVE_CITY_NOT_FOUND' using errcode='P0002';end if;
 select * into v_record from public.afat_geo_source_records
  where id=p_source_record_id and source_key in ('overture_maps','openstreetmap')
   and source_feature_kind='line' and review_status='candidate';
 if not found then raise exception 'REAL_SOURCE_CANDIDATE_NOT_FOUND' using errcode='P0002';end if;
 select * into v_license from public.afat_geo_sources
  where source_key=v_record.source_key and enabled=true and commercial_use_reviewed=true;
 if not found then raise exception 'SOURCE_LICENSE_NOT_APPROVED' using errcode='42501';end if;
 v_box:=v_city.metadata->'coverage_working_envelope';
 if v_box is null or
  jsonb_typeof(v_box->'south')<>'number' or
  jsonb_typeof(v_box->'north')<>'number' or
  jsonb_typeof(v_box->'west')<>'number' or
  jsonb_typeof(v_box->'east')<>'number' or
  v_record.latitude not between (v_box->>'south')::float8 and (v_box->>'north')::float8
  or v_record.longitude not between (v_box->>'west')::float8 and (v_box->>'east')::float8
  then raise exception 'SOURCE_OUTSIDE_ACTIVE_CITY_WORKING_COVERAGE' using errcode='22023';end if;
 select * into v_peer from public.afat_geo_source_records p
  where p.source_key=case when v_record.source_key='openstreetmap'
    then 'overture_maps' else 'openstreetmap' end
    and p.source_feature_kind='line'
    and public.st_dwithin(p.source_geometry,v_record.source_geometry,35)
  order by public.st_distance(p.source_geometry,v_record.source_geometry) limit 1;
 if v_peer.id is null then v_type:='other_dataset_has_no_nearby_segment';
 elsif lower(coalesce(v_peer.source_category,''))<>lower(coalesce(v_record.source_category,''))
   and coalesce(v_peer.source_category,'')<>'' and coalesce(v_record.source_category,'')<>'' then
   v_type:='nearby_sources_use_different_road_categories';
 else
   raise exception 'NO_CURRENT_CROSS_SOURCE_DISCREPANCY' using errcode='P0001';
 end if;
 select e.* into v_edge from public.afat_atlas_edges e
 where e.status='active' and public.st_dwithin(e.geometry,v_record.source_geometry,80)
 order by public.st_distance(e.geometry,v_record.source_geometry) limit 1;
 if not found then
   raise exception 'NO_EXISTING_ATLAS_EDGE_FOR_FIELD_CHECK' using errcode='P0001';end if;
 select * into v_mission from public.afat_micro_missions
  where target_edge_id=v_edge.id and status in ('open','claimed','submitted')
  order by created_at desc limit 1;
 if found then
   return jsonb_build_object('mission_id',v_mission.id,'created',false,
    'status',v_mission.status,'atlas_edge_id',v_edge.id,'automatic_truth',false);
 end if;
 insert into public.afat_micro_missions(
  city,mission_type,title,question,target_edge_id,priority,required_mode,
  status,expires_at,evidence
 ) values(
  v_city.city_name,'verify_corridor','Check differing map sources near '||
    left(coalesce(nullif(v_record.canonical_name,''),'mapped corridor'),72),
  'Visit only if safe. Independently check whether this corridor physically exists, the correct type and accessibility. Do not infer closure from source gaps.',
  v_edge.id,80,null,'open',now()+interval '21 days',
  jsonb_build_object('source','licensed_cross_source_spatial_comparison',
    'primary_source_record_id',v_record.id,'primary_source_key',v_record.source_key,
    'primary_external_feature_id',v_record.external_feature_id,
    'peer_source_record_id',v_peer.id,'discrepancy_type',v_type,
    'city_key',v_city.city_key,'source_attribution',v_license.attribution_text,
    'request_reason',v_reason,'requested_by',v_uid,'automatic_truth',false,
    'field_evidence_required',true,'passability_verified',false)
 )
 on conflict do nothing
 returning * into v_mission;
 if not found then
   select * into v_mission from public.afat_micro_missions
    where target_edge_id=v_edge.id and status in ('open','claimed','submitted')
    order by created_at desc limit 1;
 end if;
 if v_mission.id is null then
  raise exception 'FIELD_MISSION_CREATION_NOT_CONFIRMED' using errcode='P0001';end if;
 return jsonb_build_object('mission_id',v_mission.id,
  'created',v_mission.evidence->>'primary_source_record_id'=v_record.id::text,
  'status',v_mission.status,'atlas_edge_id',v_edge.id,
  'source_record_id',v_record.id,'automatic_truth',false);
end $$;

revoke all on function public.afat_request_cross_source_field_check(uuid,text,text) from public,anon,authenticated;
grant execute on function public.afat_request_cross_source_field_check(uuid,text,text) to authenticated,service_role;
