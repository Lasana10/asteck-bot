create or replace function public.afat_promote_strict_building_matches(
  p_left_source_key text,
  p_right_source_key text,
  p_iou_threshold numeric default 0.70
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pairs int := 0;
  v_entities int := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service role required';
  end if;
  if p_left_source_key=p_right_source_key or p_iou_threshold<0.5 or p_iou_threshold>1 then
    raise exception using errcode='22023', message='invalid source pair or IoU threshold';
  end if;

  create temporary table _afat_strict_building_pairs on commit drop as
  with a as (
    select id,source_geometry::geometry geom,source_confidence
    from public.afat_geo_source_records where source_key=p_left_source_key and source_feature_kind='polygon' and review_status in ('candidate','matched')
  ), b as (
    select id,source_geometry::geometry geom,source_confidence
    from public.afat_geo_source_records where source_key=p_right_source_key and source_feature_kind='polygon' and review_status in ('candidate','matched')
  ), ps as (
    select a.id aid,b.id bid,a.source_confidence aconf,b.source_confidence bconf,
           public.st_area(public.st_intersection(a.geom,b.geom)::geography)/nullif(public.st_area(public.st_union(a.geom,b.geom)::geography),0) iou
    from a join b on public.st_intersects(a.geom,b.geom)
  ), ar as (select *,row_number() over(partition by aid order by iou desc,bid) rn_a from ps),
     br as (select *,row_number() over(partition by bid order by iou desc,aid) rn_b from ps)
  select ar.aid,ar.bid,ar.aconf,ar.bconf,ar.iou,
         md5(least(ar.aid::text,ar.bid::text)||'|'||greatest(ar.aid::text,ar.bid::text)) pair_key
  from ar join br using(aid,bid,aconf,bconf,iou)
  where ar.rn_a=1 and br.rn_b=1 and ar.iou>=p_iou_threshold;

  select count(*) into v_pairs from _afat_strict_building_pairs;

  insert into public.afat_atlas_entity_links(left_source_record_id,right_source_record_id,relationship,entity_kind,match_score,geometry_score,category_score,source_independence,decision_status,rationale,decided_at,updated_at)
  select aid,bid,'same_entity','building',iou,iou,1,1,'matched',
         jsonb_build_object('method','mutual_best_polygon_iou','threshold',p_iou_threshold,'left_source_key',p_left_source_key,'right_source_key',p_right_source_key),now(),now()
  from _afat_strict_building_pairs
  on conflict (least(left_source_record_id,right_source_record_id), greatest(left_source_record_id,right_source_record_id), entity_kind)
  do update set relationship='same_entity',match_score=excluded.match_score,geometry_score=excluded.geometry_score,source_independence=1,decision_status='matched',rationale=excluded.rationale,decided_at=now(),updated_at=now();

  insert into public.afat_canonical_entities(entity_kind,canonical_name,geometry,centroid,attributes,evidence_status,confidence,status)
  select 'building','AFAT canonical building '||substr(p.pair_key,1,10),
         public.st_union(a.source_geometry::geometry,b.source_geometry::geometry),
         public.st_centroid(public.st_union(a.source_geometry::geometry,b.source_geometry::geometry))::geography,
         jsonb_build_object('pair_key',p.pair_key,'match_method','mutual_best_polygon_iou','iou',round(p.iou::numeric,6),'left_source_key',p_left_source_key,'right_source_key',p_right_source_key),
         'corroborated',round((((p.aconf+p.bconf)/2)*100)::numeric,2),'active'
  from _afat_strict_building_pairs p
  join public.afat_geo_source_records a on a.id=p.aid join public.afat_geo_source_records b on b.id=p.bid
  where not exists(select 1 from public.afat_canonical_entities ce where ce.entity_kind='building' and ce.attributes->>'pair_key'=p.pair_key);
  get diagnostics v_entities = row_count;

  insert into public.afat_canonical_entity_sources(canonical_entity_id,source_record_id,contribution_role,independent,contribution_confidence,provenance)
  select ce.id,p.aid,'geometry',true,p.aconf,jsonb_build_object('source_key',p_left_source_key,'pair_key',p.pair_key,'iou',p.iou)
  from _afat_strict_building_pairs p join public.afat_canonical_entities ce on ce.attributes->>'pair_key'=p.pair_key
  union all
  select ce.id,p.bid,'geometry',true,p.bconf,jsonb_build_object('source_key',p_right_source_key,'pair_key',p.pair_key,'iou',p.iou)
  from _afat_strict_building_pairs p join public.afat_canonical_entities ce on ce.attributes->>'pair_key'=p.pair_key
  on conflict do nothing;

  update public.afat_geo_source_records set review_status='matched',review_reason='Strict mutual-best cross-provider building geometry match',reviewed_at=now(),updated_at=now()
  where id in (select aid from _afat_strict_building_pairs union select bid from _afat_strict_building_pairs);

  perform public.afat_recompute_canonical_trust(ce.id)
  from public.afat_canonical_entities ce
  where ce.entity_kind='building' and ce.attributes->>'pair_key' in (select pair_key from _afat_strict_building_pairs);

  return jsonb_build_object('strict_pairs',v_pairs,'new_canonical_entities',v_entities,'iou_threshold',p_iou_threshold,'left_source_key',p_left_source_key,'right_source_key',p_right_source_key);
end;
$$;
revoke all on function public.afat_promote_strict_building_matches(text,text,numeric) from public,anon,authenticated;
grant execute on function public.afat_promote_strict_building_matches(text,text,numeric) to service_role;
