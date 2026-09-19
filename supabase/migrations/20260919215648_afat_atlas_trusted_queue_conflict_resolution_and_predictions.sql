-- Source-controlled copy of production migration 20260919215648

create or replace function public.afat_atlas_knowledge_gaps(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('map.sources.view')
  ) then raise exception 'Insufficient Atlas access'; end if;

  select jsonb_build_object(
    'summary',jsonb_build_object(
      'low_confidence_edges',(select count(*) from public.afat_atlas_edges where status='active' and confidence<55),
      'stale_edges',(select count(*) from public.afat_atlas_edges where status='active' and last_observed_at<now()-interval '30 days'),
      'candidate_features',(select count(*) from public.afat_candidate_features where status in ('candidate','corroborated','trusted')),
      'trusted_candidates',(select count(*) from public.afat_candidate_features where status='trusted'),
      'open_conflicts',(select count(*) from public.afat_evidence_conflicts where status='open'),
      'weak_places',(select count(*) from public.afat_places where status<>'rejected' and (base_confidence<60 or last_verified_at is null)),
      'pickup_failures',(select coalesce(sum(failed_pickups),0) from public.afat_meeting_points where status='active')
    ),
    'edges',coalesce((
      select jsonb_agg(x order by priority desc)
      from (
        select jsonb_build_object(
          'id',e.id,'name',coalesce(e.canonical_name,'Unnamed segment'),'confidence',e.confidence,
          'last_observed_at',e.last_observed_at,'access_modes',e.access_modes,'evidence_status',e.evidence_status,
          'reason',case when e.confidence<45 then 'low_confidence'
                        when e.last_observed_at<now()-interval '60 days' then 'stale'
                        else 'needs_corroboration' end
        ) x,
        ((100-e.confidence)+least(50,extract(epoch from(now()-e.last_observed_at))/86400)) priority
        from public.afat_atlas_edges e
        where e.status='active' and (e.confidence<60 or e.last_observed_at<now()-interval '30 days')
        order by priority desc
        limit greatest(1,least(coalesce(p_limit,50),200))
      ) q
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'feature_type',c.feature_type,'movement_mode',c.movement_mode,
        'evidence_count',c.evidence_count,'unique_contributors',c.unique_contributors,
        'confidence',c.confidence,'status',c.status,'last_observed_at',c.last_observed_at
      ) order by
        case c.status when 'trusted' then 0 when 'corroborated' then 1 else 2 end,
        c.confidence desc,c.last_observed_at desc)
      from (
        select * from public.afat_candidate_features
        where status in ('candidate','corroborated','trusted')
        order by case status when 'trusted' then 0 when 'corroborated' then 1 else 2 end,
                 confidence desc,last_observed_at desc
        limit greatest(1,least(coalesce(p_limit,50),200))
      ) c
    ),'[]'::jsonb),
    'conflicts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'edge_id',x.edge_id,'place_id',x.place_id,'conflict_type',x.conflict_type,
        'severity',x.severity,'detected_at',x.detected_at,'evidence_a',x.evidence_a,'evidence_b',x.evidence_b
      ) order by x.severity desc,x.detected_at desc)
      from (
        select * from public.afat_evidence_conflicts where status='open'
        order by severity desc,detected_at desc
        limit greatest(1,least(coalesce(p_limit,50),200))
      ) x
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.afat_resolve_evidence_conflict(
  p_conflict_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_conflict public.afat_evidence_conflicts%rowtype;
  v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;

  select * into v_conflict from public.afat_evidence_conflicts where id=p_conflict_id for update;
  if not found then raise exception 'Conflict not found'; end if;
  if v_conflict.status<>'open' then raise exception 'Conflict is already closed'; end if;

  v_status:=case p_decision when 'resolve' then 'resolved' when 'dismiss' then 'dismissed' else null end;
  if v_status is null then raise exception 'Unsupported conflict decision'; end if;

  update public.afat_evidence_conflicts
  set status=v_status,resolved_by=v_uid,resolved_at=now(),
      resolution=jsonb_build_object('decision',p_decision,'notes',nullif(trim(coalesce(p_notes,'')),''))
  where id=p_conflict_id;

  return jsonb_build_object('id',p_conflict_id,'status',v_status);
end; $$;

revoke all on function public.afat_resolve_evidence_conflict(uuid,text,text) from public,anon;
grant execute on function public.afat_resolve_evidence_conflict(uuid,text,text) to authenticated;

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
    least(0.98,greatest(0.2,(100-e.confidence)/100)),
    least(0.9,greatest(0.35,0.45+least(0.4,extract(epoch from(now()-e.last_observed_at))/86400/120))),
    case when e.last_observed_at<now()-interval '60 days' then 'Fresh field evidence is needed because this road has not been observed recently.'
         when e.confidence<45 then 'This road still has weak evidence and should be verified by independent contributors.'
         else 'AFAT would benefit from another independent observation here.' end,
    jsonb_build_object('atlas_confidence',e.confidence,'last_observed_at',e.last_observed_at,'evidence_status',e.evidence_status)
  from public.afat_atlas_edges e
  where e.status='active' and (e.confidence<60 or e.last_observed_at<now()-interval '30 days')
    and not exists (
      select 1 from public.afat_mobility_predictions p where p.target_edge_id=e.id and p.prediction_type='evidence_need' and p.valid_until>now()
    )
  order by e.confidence asc,e.last_observed_at asc
  limit greatest(1,least(coalesce(p_limit,20),100));
  get diagnostics v_created=row_count;

  insert into public.afat_mobility_predictions(
    city,prediction_type,target_edge_id,valid_from,valid_until,probability,confidence,explanation,evidence
  )
  select p_city,'disruption',e.id,now(),now()+interval '6 hours',
    least(0.95,greatest(0.25,
      0.18
      + least(0.45,coalesce(s.blocking_count,0)*0.18)
      + least(0.25,coalesce(s.negative_count,0)*0.08)
      + case when e.passability in ('poor','blocked') then 0.18 else 0 end
    )),
    least(0.92,greatest(0.35,
      0.40 + least(0.30,coalesce(s.observation_count,0)*0.04) + least(0.22,e.confidence/500)
    )),
    case
      when coalesce(s.blocking_count,0)>=2 then 'Several recent field signals indicate a possible disruption on this road.'
      when coalesce(s.negative_count,0)>=2 then 'Recent failed movement outcomes suggest this road may be unreliable.'
      when e.passability='blocked' then 'The Atlas currently marks this road as blocked.'
      else 'Recent road evidence suggests elevated disruption risk.' end,
    jsonb_build_object(
      'blocking_observations',coalesce(s.blocking_count,0),
      'negative_evidence',coalesce(s.negative_count,0),
      'recent_observations',coalesce(s.observation_count,0),
      'atlas_passability',e.passability,
      'atlas_confidence',e.confidence
    )
  from public.afat_atlas_edges e
  left join lateral (
    select
      count(*)::int observation_count,
      count(*) filter(where o.observation_type in ('verified_incident','road_condition','field_verification')
        and (
          coalesce(o.observation_value->>'condition','') in ('blocked','flooded','damaged','unsafe')
          or coalesce((o.observation_value->>'severity')::int,0)>=4
        ))::int blocking_count,
      count(*) filter(where o.observation_type='negative_mobility_evidence')::int negative_count
    from public.afat_atlas_observations o
    where o.atlas_edge_id=e.id
      and o.observed_at>now()-interval '24 hours'
      and (o.expires_at is null or o.expires_at>now())
  ) s on true
  where e.status='active'
    and (coalesce(s.blocking_count,0)>0 or coalesce(s.negative_count,0)>0 or e.passability in ('poor','blocked'))
    and not exists (
      select 1 from public.afat_mobility_predictions p where p.target_edge_id=e.id and p.prediction_type='disruption' and p.valid_until>now()
    )
  order by (coalesce(s.blocking_count,0)*3+coalesce(s.negative_count,0)*2) desc,e.confidence desc
  limit greatest(1,least(coalesce(p_limit,20),100));
  get diagnostics v_added=row_count;

  return jsonb_build_object('created',v_created+v_added,'evidence_need_created',v_created,'disruption_created',v_added,'model_key','afat_rule_evidence_v1');
end; $$;

