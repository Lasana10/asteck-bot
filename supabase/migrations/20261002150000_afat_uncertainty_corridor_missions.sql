create or replace function public.afat_refresh_uncertainty_missions(p_city text default 'Yaoundé', p_limit integer default 24) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_created integer:=0; v_cancelled integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Map evidence permission required'; end if;
  p_limit:=greatest(1,least(coalesce(p_limit,24),60));

  update public.afat_micro_missions m
  set status='cancelled',updated_at=now(),evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('cancel_reason','replaced_by_uncertainty_cluster_refresh','cancelled_at',now())
  where lower(m.city)=lower(p_city) and m.status in ('open','claimed') and m.mission_type='verify_edge';
  get diagnostics v_cancelled=row_count;

  with edge_obs as (
    select e.id,e.canonical_name,e.confidence,e.evidence_status,e.passability,e.last_observed_at,e.geometry,
      count(o.id) filter(where o.created_at>now()-interval '90 days') as recent_observations
    from public.afat_atlas_edges e
    join public.afat_atlas_nodes n on n.id=e.from_node_id
    left join public.afat_atlas_observations o on o.atlas_edge_id=e.id
    where e.status='active' and lower(n.city)=lower(p_city)
    group by e.id
  ), ranked as (
    select *,
      count(*) over(partition by lower(coalesce(nullif(trim(canonical_name),''),id::text))) as segment_count,
      row_number() over(partition by lower(coalesce(nullif(trim(canonical_name),''),id::text)) order by confidence asc,last_observed_at nulls first,id) as rn
    from edge_obs
    where evidence_status='provisional' or confidence<65 or passability='unknown' or recent_observations=0 or last_observed_at is null or last_observed_at<now()-interval '90 days'
  ), picked as (
    select * from ranked where rn=1
    order by case when evidence_status='provisional' then 0 else 1 end,recent_observations asc,confidence asc,last_observed_at nulls first
    limit p_limit
  )
  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,status,expires_at,evidence)
  select p_city,'verify_corridor',
    case when canonical_name is null or trim(canonical_name)='' then 'Verify an uncertain road corridor' else 'Verify '||canonical_name end,
    concat_ws(' ',
      case when evidence_status='provisional' then 'AFAT has source geometry but not enough independent evidence.' end,
      case when passability='unknown' then 'Confirm whether this corridor is passable and by which modes.' end,
      case when recent_observations=0 then 'No recent field or journey observation supports it.' end,
      case when last_observed_at is null then 'No field observation is attached yet.' when last_observed_at<now()-interval '90 days' then 'Existing evidence is stale.' end,
      'Capture only what you can directly observe.'
    ),
    id,
    least(95,greatest(45,round(100-coalesce(confidence,50)) + least(segment_count,10) + case when recent_observations=0 then 8 else 0 end)),
    'open',now()+interval '30 days',
    jsonb_build_object('reason','evidence_gap','segment_count',segment_count,'edge_confidence',confidence,'edge_evidence_status',evidence_status,'passability',passability,'recent_observations',recent_observations,'last_observed_at',last_observed_at,'automatic_truth',false,'cluster_basis',case when canonical_name is null then 'representative_edge' else 'canonical_road_name' end)
  from picked
  where not exists (
    select 1 from public.afat_micro_missions m
    where m.status in ('open','claimed') and m.mission_type='verify_corridor' and m.target_edge_id=picked.id
  );
  get diagnostics v_created=row_count;

  return jsonb_build_object('city',p_city,'cancelled_legacy_edge_missions',v_cancelled,'created_uncertainty_missions',v_created,'automatic_truth',false);
end $$;

revoke all on function public.afat_refresh_uncertainty_missions(text,integer) from public,anon;
grant execute on function public.afat_refresh_uncertainty_missions(text,integer) to authenticated;