-- Source-controlled copy of production migration 20260919215027 afat_living_city_integration_closure

create or replace function public.afat_contribution_session_after_complete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.status='completed' then
    perform public.afat_refresh_contributor_reputation(new.contributor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists afat_contribution_reputation_refresh on public.afat_contribution_sessions;
create trigger afat_contribution_reputation_refresh
after update of status on public.afat_contribution_sessions
for each row
when (new.status='completed')
execute function public.afat_contribution_session_after_complete();

create or replace function public.afat_available_micro_missions(
  p_latitude double precision,
  p_longitude double precision,
  p_mode text default null,
  p_radius_m integer default 3000,
  p_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_point public.geography;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if not public.afat_has_permission('field.mission.join') then
    return '[]'::jsonb;
  end if;

  v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;

  select coalesce(jsonb_agg(item order by distance_m asc, priority desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',m.id,
      'mission_type',m.mission_type,
      'title',m.title,
      'question',m.question,
      'priority',m.priority,
      'required_mode',m.required_mode,
      'target_edge_id',m.target_edge_id,
      'target_place_id',m.target_place_id,
      'target_meeting_point_id',m.target_meeting_point_id,
      'distance_m',round(public.st_distance(
        coalesce(e.geometry,
          case when p.id is not null then public.st_setsrid(public.st_makepoint(p.longitude,p.latitude),4326)::public.geography end,
          case when mp.id is not null then public.st_setsrid(public.st_makepoint(mp.longitude,mp.latitude),4326)::public.geography end
        ),
        v_point
      )),
      'expires_at',m.expires_at,
      'evidence',m.evidence
    ) item,
    public.st_distance(
      coalesce(e.geometry,
        case when p.id is not null then public.st_setsrid(public.st_makepoint(p.longitude,p.latitude),4326)::public.geography end,
        case when mp.id is not null then public.st_setsrid(public.st_makepoint(mp.longitude,mp.latitude),4326)::public.geography end
      ),
      v_point
    ) distance_m,
    m.priority
    from public.afat_micro_missions m
    left join public.afat_atlas_edges e on e.id=m.target_edge_id
    left join public.afat_places p on p.id=m.target_place_id
    left join public.afat_meeting_points mp on mp.id=m.target_meeting_point_id
    where m.status='open'
      and (m.expires_at is null or m.expires_at>now())
      and (m.required_mode is null or p_mode is null or m.required_mode=p_mode)
      and coalesce(e.geometry,
        case when p.id is not null then public.st_setsrid(public.st_makepoint(p.longitude,p.latitude),4326)::public.geography end,
        case when mp.id is not null then public.st_setsrid(public.st_makepoint(mp.longitude,mp.latitude),4326)::public.geography end
      ) is not null
      and public.st_dwithin(
        coalesce(e.geometry,
          case when p.id is not null then public.st_setsrid(public.st_makepoint(p.longitude,p.latitude),4326)::public.geography end,
          case when mp.id is not null then public.st_setsrid(public.st_makepoint(mp.longitude,mp.latitude),4326)::public.geography end
        ),
        v_point,
        greatest(250,least(coalesce(p_radius_m,3000),15000))
      )
    order by distance_m asc,m.priority desc
    limit greatest(1,least(coalesce(p_limit,8),20))
  ) q;

  return v_result;
end;
$$;

create or replace function public.afat_living_city_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
  ) then raise exception 'Planning or map review permission required'; end if;

  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  return jsonb_build_object(
    'city',jsonb_build_object(
      'city_key',v_city.city_key,
      'city_name',v_city.city_name,
      'country_code',v_city.country_code,
      'country_name',v_city.country_name,
      'timezone',v_city.timezone,
      'currency_code',v_city.currency_code,
      'default_language',v_city.default_language,
      'supported_languages',v_city.supported_languages,
      'transport_modes',v_city.transport_modes,
      'learning_stage',v_city.learning_stage,
      'operational_confidence',v_city.operational_confidence
    ),
    'reputation',jsonb_build_object(
      'contributors',(select count(*) from public.afat_contributor_reputation),
      'trusted',(select count(*) from public.afat_contributor_reputation where trust_level in ('trusted','steward','institutional')),
      'stewards',(select count(*) from public.afat_contributor_reputation where trust_level in ('steward','institutional'))
    ),
    'missions',jsonb_build_object(
      'open',(select count(*) from public.afat_micro_missions where status='open' and (expires_at is null or expires_at>now())),
      'claimed',(select count(*) from public.afat_micro_missions where status='claimed'),
      'submitted',(select count(*) from public.afat_micro_missions where status='submitted')
    ),
    'conflicts',jsonb_build_object(
      'open',(select count(*) from public.afat_evidence_conflicts where status='open')
    ),
    'predictions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'prediction_type',p.prediction_type,'target_edge_id',p.target_edge_id,
        'target_place_id',p.target_place_id,'probability',p.probability,'confidence',p.confidence,
        'explanation',p.explanation,'valid_until',p.valid_until,'model_key',p.model_key
      ) order by p.confidence desc,p.probability desc)
      from (
        select * from public.afat_mobility_predictions
        where city=v_city.city_name and valid_until>now()
        order by confidence desc,probability desc
        limit 20
      ) p
    ),'[]'::jsonb),
    'conflict_queue',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'edge_id',c.edge_id,'place_id',c.place_id,'conflict_type',c.conflict_type,
        'severity',c.severity,'detected_at',c.detected_at,'evidence_a',c.evidence_a,'evidence_b',c.evidence_b
      ) order by c.severity desc,c.detected_at desc)
      from (
        select * from public.afat_evidence_conflicts
        where status='open'
        order by severity desc,detected_at desc
        limit 15
      ) c
    ),'[]'::jsonb),
    'mission_queue',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'mission_type',m.mission_type,'title',m.title,'question',m.question,
        'priority',m.priority,'required_mode',m.required_mode,'status',m.status,'expires_at',m.expires_at
      ) order by m.priority desc,m.created_at)
      from (
        select * from public.afat_micro_missions
        where status in ('open','claimed','submitted')
          and (expires_at is null or expires_at>now())
        order by priority desc,created_at
        limit 20
      ) m
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.afat_review_evidence_conflict(
  p_conflict_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;
  if p_decision not in ('resolve','dismiss') then raise exception 'Unsupported conflict decision'; end if;
  v_status:=case when p_decision='resolve' then 'resolved' else 'dismissed' end;

  update public.afat_evidence_conflicts
  set status=v_status,resolved_by=v_uid,resolved_at=now(),
      resolution=jsonb_build_object('decision',p_decision,'notes',nullif(trim(coalesce(p_notes,'')),''))
  where id=p_conflict_id and status='open';

  if not found then raise exception 'Conflict is already closed or unavailable'; end if;
  return jsonb_build_object('id',p_conflict_id,'status',v_status);
end;
$$;

revoke all on function public.afat_contribution_session_after_complete() from public,anon,authenticated;
revoke all on function public.afat_available_micro_missions(double precision,double precision,text,integer,integer) from public,anon;
revoke all on function public.afat_living_city_snapshot(text) from public,anon;
revoke all on function public.afat_review_evidence_conflict(uuid,text,text) from public,anon;

grant execute on function public.afat_available_micro_missions(double precision,double precision,text,integer,integer) to authenticated;
grant execute on function public.afat_living_city_snapshot(text) to authenticated;
grant execute on function public.afat_review_evidence_conflict(uuid,text,text) to authenticated;

