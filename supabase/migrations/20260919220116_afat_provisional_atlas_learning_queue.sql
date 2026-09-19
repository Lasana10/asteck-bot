-- Source-controlled copy of production migration 20260919220116

create or replace function public.afat_atlas_knowledge_gaps(p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
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
      'provisional_edges',(select count(*) from public.afat_atlas_edges where status='active' and evidence_status='provisional'),
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
          'reason',case
            when e.confidence<45 then 'low_confidence'
            when e.last_observed_at<now()-interval '60 days' then 'stale'
            when e.evidence_status='provisional' then 'provisional_needs_local_evidence'
            else 'needs_corroboration' end
        ) x,
        ((100-e.confidence)
          + case when e.evidence_status='provisional' then 35 else 0 end
          + least(50,extract(epoch from(now()-e.last_observed_at))/86400)) priority
        from public.afat_atlas_edges e
        where e.status='active'
          and (e.confidence<60 or e.last_observed_at<now()-interval '30 days' or e.evidence_status='provisional')
        order by priority desc
        limit greatest(1,least(coalesce(p_limit,50),200))
      ) q
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'feature_type',c.feature_type,'movement_mode',c.movement_mode,'evidence_count',c.evidence_count,
        'unique_contributors',c.unique_contributors,'confidence',c.confidence,'status',c.status,'last_observed_at',c.last_observed_at
      ) order by case c.status when 'trusted' then 0 when 'corroborated' then 1 else 2 end,c.confidence desc,c.last_observed_at desc)
      from (
        select * from public.afat_candidate_features where status in ('candidate','corroborated','trusted')
        order by case status when 'trusted' then 0 when 'corroborated' then 1 else 2 end,confidence desc,last_observed_at desc
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

create or replace function public.afat_generate_micro_missions(p_limit integer default 12)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_created integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('field.mission.manage') then raise exception 'Field mission management permission required'; end if;

  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,required_mode,expires_at,evidence)
  select
    coalesce(n.city,'Yaoundé'),'verify_edge',
    'Verify '||coalesce(e.canonical_name,'this road'),
    case
      when e.evidence_status='provisional' then 'Does this road exist as mapped, and which transport modes can actually use it?'
      when e.last_observed_at<now()-interval '60 days' then 'Is this road currently open and usable?'
      when e.confidence<45 then 'Can you confirm this road and how people actually use it?'
      else 'Can you confirm current road conditions here?' end,
    e.id,
    least(100,
      (100-e.confidence)
      + case when e.evidence_status='provisional' then 35 else 0 end
      + least(30,extract(epoch from(now()-e.last_observed_at))/86400)
    ),
    case when 'moto'=any(e.access_modes) then 'moto' when 'car'=any(e.access_modes) then 'car' else null end,
    now()+interval '7 days',
    jsonb_build_object(
      'reason',case
        when e.evidence_status='provisional' then 'provisional_seed_needs_local_verification'
        when e.confidence<45 then 'low_confidence'
        else 'stale_evidence' end,
      'atlas_confidence',e.confidence,'evidence_status',e.evidence_status
    )
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active'
    and (e.confidence<60 or e.last_observed_at<now()-interval '30 days' or e.evidence_status='provisional')
    and not exists (
      select 1 from public.afat_micro_missions m
      where m.target_edge_id=e.id and m.status in ('open','claimed','submitted')
    )
  order by (
    (100-e.confidence)
    + case when e.evidence_status='provisional' then 35 else 0 end
    + least(30,extract(epoch from(now()-e.last_observed_at))/86400)
  ) desc
  limit greatest(1,least(coalesce(p_limit,12),50));

  get diagnostics v_created=row_count;
  return jsonb_build_object('created',v_created);
end; $$;

insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,required_mode,expires_at,evidence)
select
  coalesce(n.city,'Yaoundé'),'verify_edge',
  'Verify '||coalesce(e.canonical_name,'this road'),
  'Does this road exist as mapped, and which transport modes can actually use it?',
  e.id,
  least(100,(100-e.confidence)+35),
  case when 'moto'=any(e.access_modes) then 'moto' when 'car'=any(e.access_modes) then 'car' else null end,
  now()+interval '7 days',
  jsonb_build_object('reason','provisional_seed_needs_local_verification','atlas_confidence',e.confidence,'evidence_status',e.evidence_status)
from public.afat_atlas_edges e
join public.afat_atlas_nodes n on n.id=e.from_node_id
where e.status='active' and e.evidence_status='provisional'
  and not exists(select 1 from public.afat_micro_missions m where m.target_edge_id=e.id and m.status in ('open','claimed','submitted'))
order by e.confidence asc,e.last_observed_at asc
limit 12;

insert into public.afat_mobility_predictions(
  city,prediction_type,target_edge_id,valid_from,valid_until,probability,confidence,explanation,evidence
)
select
  coalesce(n.city,'Yaoundé'),'evidence_need',e.id,now(),now()+interval '24 hours',
  0.65,
  least(0.85,greatest(0.45,e.confidence/100)),
  'This road comes from provisional seed geography and still needs independent local movement or field verification before AFAT can treat it as strongly corroborated.',
  jsonb_build_object('atlas_confidence',e.confidence,'evidence_status',e.evidence_status,'reason','provisional_seed')
from public.afat_atlas_edges e
join public.afat_atlas_nodes n on n.id=e.from_node_id
where e.status='active' and e.evidence_status='provisional'
  and not exists(
    select 1 from public.afat_mobility_predictions p
    where p.target_edge_id=e.id and p.prediction_type='evidence_need' and p.valid_until>now()
  )
order by e.confidence asc,e.last_observed_at asc
limit 20;

