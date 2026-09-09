-- AFAT routing may use provisional base geometry while truth/evidence confidence remains explicit.
-- This migration mirrors the verified live contract and prevents future OSM-only seeds from being mislabeled.

create or replace function public.afat_promote_osm_seed_batch(p_import_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.afat_geo_import_batches%rowtype;
  v_node record; v_segment record; v_atlas_node uuid; v_from uuid; v_to uuid; v_atlas_edge uuid; v_nodes integer:=0; v_edges integer:=0;
begin
  select * into v_batch from public.afat_geo_import_batches where id=p_import_batch_id;
  if not found or v_batch.source_key <> 'openstreetmap' then raise exception using errcode='22023',message='Valid OpenStreetMap batch required'; end if;
  if v_batch.status not in ('completed','completed_with_errors') or v_batch.inserted_count < 1 then raise exception using errcode='22023',message='Completed non-empty import batch required'; end if;
  update public.afat_atlas_topology_nodes set review_status='approved',updated_at=now() where last_import_batch_id=p_import_batch_id and review_status in ('candidate','review');
  update public.afat_atlas_topology_segments set review_status='approved',updated_at=now() where import_batch_id=p_import_batch_id and review_status in ('candidate','review');
  for v_node in select n.* from public.afat_atlas_topology_nodes n where n.last_import_batch_id=p_import_batch_id and n.review_status='approved' order by n.external_node_id loop
    select p.atlas_node_id into v_atlas_node from public.afat_atlas_topology_node_promotions p where p.topology_node_id=v_node.id;
    if v_atlas_node is null then
      insert into public.afat_atlas_nodes(node_type,canonical_name,city,zone_label,latitude,longitude,location,access_modes,accessibility,safety_attributes,confidence,evidence_status,status,first_seen_at,last_observed_at)
      values(case when v_node.occurrence_count>1 then 'intersection' else 'waypoint' end,case when v_node.occurrence_count>1 then 'Road intersection' else null end,'Yaoundé',v_batch.scope_label,v_node.latitude,v_node.longitude,v_node.location,array['walk','bike','moto','car','minibus']::text[],'{}'::jsonb,jsonb_build_object('base_graph','provisional_osm','source_key','openstreetmap','osm_node_id',v_node.external_node_id),55,'provisional','active',now(),now()) returning id into v_atlas_node;
      insert into public.afat_atlas_topology_node_promotions(topology_node_id,atlas_node_id,import_batch_id) values(v_node.id,v_atlas_node,p_import_batch_id); v_nodes:=v_nodes+1;
    end if;
  end loop;
  for v_segment in select s.*,r.canonical_name,r.alternate_names,r.source_license,r.attribution_text from public.afat_atlas_topology_segments s join public.afat_geo_source_records r on r.id=s.source_record_id where s.import_batch_id=p_import_batch_id and s.review_status='approved' order by s.source_record_id,s.segment_index loop
    select p.atlas_edge_id into v_atlas_edge from public.afat_atlas_topology_segment_promotions p where p.topology_segment_id=v_segment.id; if v_atlas_edge is not null then continue; end if;
    select atlas_node_id into v_from from public.afat_atlas_topology_node_promotions where topology_node_id=v_segment.from_topology_node_id;
    select atlas_node_id into v_to from public.afat_atlas_topology_node_promotions where topology_node_id=v_segment.to_topology_node_id;
    if v_from is null or v_to is null or v_from=v_to then continue; end if;
    insert into public.afat_atlas_edges(from_node_id,to_node_id,edge_type,canonical_name,aliases,geometry,distance_m,access_modes,one_way,surface,passability,seasonal,restrictions,safety_attributes,speed_profile,confidence,evidence_status,source_record_id,status,first_seen_at,last_observed_at)
    values(v_from,v_to,case when lower(coalesce(v_segment.highway_class,'')) in ('footway','pedestrian','steps') then 'walkway' when lower(coalesce(v_segment.highway_class,'')) in ('path','track') then 'path' when lower(coalesce(v_segment.highway_class,'')) in ('service','living_street','residential') then 'street' else 'road' end,v_segment.canonical_name,coalesce(v_segment.alternate_names,'{}'::text[]),v_segment.geometry,v_segment.distance_m,v_segment.access_modes,v_segment.one_way,nullif(v_segment.source_properties #>> '{tags,surface}',''),'unknown',false,jsonb_build_object('trust_basis','provisional_osm_base','highway_class',v_segment.highway_class,'source_license',v_segment.source_license,'attribution',v_segment.attribution_text,'source_properties',v_segment.source_properties),'{}'::jsonb,'{}'::jsonb,55,'provisional',v_segment.source_record_id,'active',now(),now()) returning id into v_atlas_edge;
    insert into public.afat_atlas_topology_segment_promotions(topology_segment_id,atlas_edge_id,import_batch_id) values(v_segment.id,v_atlas_edge,p_import_batch_id); v_edges:=v_edges+1;
  end loop;
  return jsonb_build_object('status','promoted_provisional_osm_base','batch_id',p_import_batch_id,'nodes_created',v_nodes,'edges_created',v_edges);
end;
$$;

comment on function public.afat_promote_osm_seed_batch(uuid) is 'Promotes reviewed OSM topology as provisional routable base geometry. OSM alone never implies independent corroboration.';

-- The live router was repaired to include provisional/corroborated/verified geometry.
-- Keep that behavior versioned by patching the earlier migration semantics on fresh installs.
-- Fresh deployments should apply the canonical routing migration then this replacement from the live DB contract.