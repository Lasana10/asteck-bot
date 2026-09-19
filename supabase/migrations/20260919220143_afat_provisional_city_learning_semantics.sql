-- Source-controlled copy of production migration 20260919220143

create or replace function public.afat_refresh_city_learning(p_city_key text default 'cm-yaounde')
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_edges integer; v_low integer; v_stale integer; v_provisional integer; v_obs integer; v_candidates integer; v_conflicts integer;
  v_conf numeric; v_stage text; v_run uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review')) then
    raise exception 'Planning or map review permission required';
  end if;

  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  select
    count(*),
    count(*) filter(where e.confidence<55),
    count(*) filter(where e.last_observed_at<now()-interval '30 days'),
    count(*) filter(where e.evidence_status='provisional')
  into v_edges,v_low,v_stale,v_provisional
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and n.city=v_city.city_name;

  select count(*) into v_obs
  from public.afat_atlas_observations o
  join public.afat_atlas_edges e on e.id=o.atlas_edge_id
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where o.observed_at>now()-interval '30 days' and n.city=v_city.city_name;

  select count(*) into v_candidates
  from public.afat_candidate_features
  where status in ('candidate','corroborated','trusted')
    and (city_profile_id=v_city.id or city_profile_id is null);

  select count(*) into v_conflicts
  from public.afat_evidence_conflicts c
  join public.afat_atlas_edges e on e.id=c.edge_id
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where c.status='open' and n.city=v_city.city_name;

  v_conf:=case when v_edges=0 then 0 else greatest(0,least(100,
    100
    - (v_low::numeric/v_edges*35)
    - (v_stale::numeric/v_edges*20)
    - (v_provisional::numeric/v_edges*45)
    - least(12,v_conflicts*0.5)
    + least(12,v_obs::numeric/100)
  )) end;

  v_stage:=case
    when v_edges<100 then 'seed'
    when v_conf<30 then 'observe'
    when v_conf<45 then 'discover'
    when v_conf<62 then 'verify'
    when v_conf<74 then 'operate'
    when v_conf<88 then 'learn'
    else 'predict' end;

  update public.afat_city_profiles
  set operational_confidence=v_conf,learning_stage=v_stage,updated_at=now()
  where id=v_city.id;

  insert into public.afat_city_learning_runs(city_profile_id,started_by,stage,status,metrics,recommendations,completed_at)
  values(
    v_city.id,v_uid,v_stage,'completed',
    jsonb_build_object(
      'edges',v_edges,'low_confidence_edges',v_low,'stale_edges',v_stale,'provisional_edges',v_provisional,
      'recent_observations',v_obs,'candidate_features',v_candidates,'open_conflicts',v_conflicts,'operational_confidence',v_conf
    ),
    jsonb_build_array(
      case when v_provisional>0 then 'corroborate_provisional_seed' else 'maintain_verified_graph' end,
      case when v_stale>0 then 'refresh_stale_edges' else 'maintain_freshness' end,
      case when v_candidates>0 then 'review_candidate_geography' else 'expand_coverage' end,
      case when v_conflicts>0 then 'resolve_evidence_conflicts' else 'continue_collection' end
    ),
    now()
  ) returning id into v_run;

  return jsonb_build_object(
    'run_id',v_run,'city_key',p_city_key,'learning_stage',v_stage,'operational_confidence',round(v_conf,1),
    'edges',v_edges,'provisional_edges',v_provisional,'recent_observations',v_obs,
    'candidate_features',v_candidates,'open_conflicts',v_conflicts
  );
end; $$;

create or replace function public.afat_generate_evidence_predictions(p_city text default 'Yaoundé',p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_created integer:=0; v_added integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('planning.aggregate.view') then raise exception 'Planning access required'; end if;

  delete from public.afat_mobility_predictions where valid_until<=now();

  insert into public.afat_mobility_predictions(
    city,prediction_type,target_edge_id,valid_from,valid_until,probability,confidence,explanation,evidence
  )
  select p_city,'evidence_need',e.id,now(),now()+interval '24 hours',
    case when e.evidence_status='provisional' then 0.65 else least(0.98,greatest(0.2,(100-e.confidence)/100)) end,
    least(0.9,greatest(0.35,
      0.45
      + case when e.evidence_status='provisional' then 0.12 else 0 end
      + least(0.28,extract(epoch from(now()-e.last_observed_at))/86400/120)
    )),
    case
      when e.evidence_status='provisional' then 'This road is still provisional seed geography and needs independent local movement or field verification.'
      when e.last_observed_at<now()-interval '60 days' then 'Fresh field evidence is needed because this road has not been observed recently.'
      when e.confidence<45 then 'This road still has weak evidence and should be verified by independent contributors.'
      else 'AFAT would benefit from another independent observation here.' end,
    jsonb_build_object('atlas_confidence',e.confidence,'last_observed_at',e.last_observed_at,'evidence_status',e.evidence_status)
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and n.city=p_city
    and (e.confidence<60 or e.last_observed_at<now()-interval '30 days' or e.evidence_status='provisional')
    and not exists (
      select 1 from public.afat_mobility_predictions p
      where p.target_edge_id=e.id and p.prediction_type='evidence_need' and p.valid_until>now()
    )
  order by case when e.evidence_status='provisional' then 0 else 1 end,e.confidence asc,e.last_observed_at asc
  limit greatest(1,least(coalesce(p_limit,20),100));
  get diagnostics v_created=row_count;

  insert into public.afat_mobility_predictions(
    city,prediction_type,target_edge_id,valid_from,valid_until,probability,confidence,explanation,evidence
  )
  select p_city,'disruption',e.id,now(),now()+interval '6 hours',
    least(0.95,greatest(0.25,
      0.18+least(0.45,coalesce(s.blocking_count,0)*0.18)+least(0.25,coalesce(s.negative_count,0)*0.08)
      +case when e.passability in ('poor','blocked') then 0.18 else 0 end
    )),
    least(0.92,greatest(0.35,
      0.40+least(0.30,coalesce(s.observation_count,0)*0.04)+least(0.22,e.confidence/500)
    )),
    case
      when coalesce(s.blocking_count,0)>=2 then 'Several recent field signals indicate a possible disruption on this road.'
      when coalesce(s.negative_count,0)>=2 then 'Recent failed movement outcomes suggest this road may be unreliable.'
      when e.passability='blocked' then 'The Atlas currently marks this road as blocked.'
      else 'Recent road evidence suggests elevated disruption risk.' end,
    jsonb_build_object(
      'blocking_observations',coalesce(s.blocking_count,0),'negative_evidence',coalesce(s.negative_count,0),
      'recent_observations',coalesce(s.observation_count,0),'atlas_passability',e.passability,'atlas_confidence',e.confidence
    )
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  left join lateral (
    select
      count(*)::int observation_count,
      count(*) filter(where o.observation_type in ('verified_incident','road_condition','field_verification')
        and (coalesce(o.observation_value->>'condition','') in ('blocked','flooded','damaged','unsafe')
             or coalesce((o.observation_value->>'severity')::int,0)>=4))::int blocking_count,
      count(*) filter(where o.observation_type='negative_mobility_evidence')::int negative_count
    from public.afat_atlas_observations o
    where o.atlas_edge_id=e.id and o.observed_at>now()-interval '24 hours'
      and (o.expires_at is null or o.expires_at>now())
  ) s on true
  where e.status='active' and n.city=p_city
    and (coalesce(s.blocking_count,0)>0 or coalesce(s.negative_count,0)>0 or e.passability in ('poor','blocked'))
    and not exists (
      select 1 from public.afat_mobility_predictions p
      where p.target_edge_id=e.id and p.prediction_type='disruption' and p.valid_until>now()
    )
  order by (coalesce(s.blocking_count,0)*3+coalesce(s.negative_count,0)*2) desc,e.confidence desc
  limit greatest(1,least(coalesce(p_limit,20),100));
  get diagnostics v_added=row_count;

  return jsonb_build_object(
    'created',v_created+v_added,'evidence_need_created',v_created,'disruption_created',v_added,'model_key','afat_rule_evidence_v1'
  );
end; $$;

