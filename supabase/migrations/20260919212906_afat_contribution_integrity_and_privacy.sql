-- AFAT contribution integrity and privacy hardening
-- Applied to production after Living Atlas contribution verification.
-- Makes sample replay idempotent, tracks real distance, anonymizes aggregate observations,
-- and blocks disconnected GPS jumps from becoming candidate roads.

create or replace function public.afat_ingest_contribution_sample(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_kph numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.afat_contribution_sessions%rowtype;
  v_point public.geography;
  v_quality numeric;
  v_edge uuid;
  v_distance numeric;
  v_threshold numeric;
  v_state text := 'unmatched';
  v_sample uuid;
  v_existing public.afat_contribution_samples%rowtype;
  v_prev public.afat_contribution_samples%rowtype;
  v_step_distance numeric := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;

  select * into v_session from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid and status='active';
  if not found then raise exception 'Contribution session unavailable'; end if;

  if nullif(p_idempotency_key,'') is not null then
    select * into v_existing from public.afat_contribution_samples
    where session_id=p_session_id and idempotency_key=p_idempotency_key;
    if found then
      return jsonb_build_object(
        'sample_id',v_existing.id,'match_state',v_existing.match_state,
        'matched_edge_id',v_existing.matched_edge_id,'matched_distance_m',v_existing.matched_distance_m,
        'quality_score',v_existing.quality_score,'replayed',true
      );
    end if;
  end if;

  if p_accuracy_m is not null and p_accuracy_m>150 then
    v_state:='rejected'; v_quality:=0.05;
  else
    v_quality:=greatest(0.1,least(1.0,1.0-(coalesce(p_accuracy_m,45)::numeric/150.0)));
    if p_speed_kph is not null and (p_speed_kph<0 or p_speed_kph>190) then v_quality:=least(v_quality,0.15); end if;
  end if;

  v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
  v_threshold:=greatest(18,least(65,coalesce(p_accuracy_m,30)::numeric+12));

  if v_state<>'rejected' then
    select e.id,public.st_distance(e.geometry,v_point) into v_edge,v_distance
    from public.afat_atlas_edges e
    where e.status='active' and public.st_dwithin(e.geometry,v_point,v_threshold)
    order by e.geometry <-> v_point limit 1;
    if v_edge is not null then v_state:='matched'; end if;
  end if;

  select * into v_prev from public.afat_contribution_samples
  where session_id=p_session_id and match_state<>'rejected'
  order by recorded_at desc limit 1;

  if found and coalesce(p_recorded_at,now())>v_prev.recorded_at then
    v_step_distance:=public.st_distance(
      public.st_setsrid(public.st_makepoint(v_prev.longitude,v_prev.latitude),4326)::public.geography,
      v_point
    );
    if v_step_distance>2000 then
      v_step_distance:=0;
      v_quality:=least(v_quality,0.2);
    end if;
  end if;

  insert into public.afat_contribution_samples(
    session_id,contributor_id,latitude,longitude,accuracy_m,speed_kph,heading,
    recorded_at,quality_score,match_state,matched_edge_id,matched_distance_m,idempotency_key
  ) values (
    p_session_id,v_uid,p_latitude,p_longitude,p_accuracy_m,p_speed_kph,p_heading,
    coalesce(p_recorded_at,now()),v_quality,v_state,v_edge,v_distance,nullif(p_idempotency_key,'')
  ) returning id into v_sample;

  update public.afat_contribution_sessions
  set sample_count=sample_count+1,
      matched_sample_count=matched_sample_count+case when v_state='matched' then 1 else 0 end,
      distance_m=distance_m+coalesce(v_step_distance,0),
      updated_at=now()
  where id=p_session_id;

  if v_state='matched' and v_quality>=0.35 then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,
      confidence,evidence,idempotency_key,observed_at
    ) values (
      v_edge,
      case when v_session.privacy_mode='private_aggregate' then null else v_uid end,
      'movement_traversal',
      jsonb_build_object('movement_mode',v_session.movement_mode,'speed_kph',p_speed_kph,'accuracy_m',p_accuracy_m),
      case when v_session.purpose='fleet_observation' then 'fleet_movement' else 'community_movement' end,
      least(70,round((25+v_quality*40)::numeric,2)),
      jsonb_build_object('session_id',p_session_id,'sample_id',v_sample,'privacy_mode',v_session.privacy_mode,'matched_distance_m',v_distance),
      'contribution:'||v_sample::text,
      coalesce(p_recorded_at,now())
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  return jsonb_build_object(
    'sample_id',v_sample,'match_state',v_state,'matched_edge_id',v_edge,
    'matched_distance_m',v_distance,'quality_score',v_quality,'step_distance_m',v_step_distance,'replayed',false
  );
end; $$;

create or replace function public.afat_complete_contribution_session(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.afat_contribution_sessions%rowtype;
  v_total integer;
  v_matched integer;
  v_unmatched integer;
  v_line public.geography;
  v_candidate uuid;
  v_max_gap numeric := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_session from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid and status='active';
  if not found then raise exception 'Contribution session unavailable'; end if;

  select count(*),count(*) filter(where match_state='matched'),
         count(*) filter(where match_state='unmatched' and quality_score>=0.35)
  into v_total,v_matched,v_unmatched
  from public.afat_contribution_samples where session_id=p_session_id;

  select coalesce(max(step_m),0) into v_max_gap
  from (
    select public.st_distance(
      public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography,
      public.st_setsrid(public.st_makepoint(
        lag(longitude) over(order by recorded_at),
        lag(latitude) over(order by recorded_at)
      ),4326)::public.geography
    ) step_m
    from public.afat_contribution_samples
    where session_id=p_session_id and match_state='unmatched' and quality_score>=0.35
  ) gaps
  where step_m is not null;

  if v_unmatched>=5 and v_max_gap<=400 then
    select public.st_makeline(pt order by recorded_at)::public.geography into v_line
    from (
      select public.st_setsrid(public.st_makepoint(longitude,latitude),4326) pt,recorded_at
      from public.afat_contribution_samples
      where session_id=p_session_id and match_state='unmatched' and quality_score>=0.35
      order by recorded_at
    ) s;

    if v_line is not null then
      insert into public.afat_candidate_features(
        feature_type,movement_mode,geometry,source_session_id,evidence_count,unique_contributors,
        confidence,status,first_observed_at,last_observed_at,evidence
      ) values (
        case when v_session.movement_mode='walk' then 'path' else 'road_segment' end,
        v_session.movement_mode,v_line,p_session_id,v_unmatched,1,
        least(45,20+v_unmatched*2),'candidate',v_session.started_at,now(),
        jsonb_build_object(
          'source','community_trace','privacy_mode',v_session.privacy_mode,'purpose',v_session.purpose,
          'max_trace_gap_m',v_max_gap,'requires_corroboration',true
        )
      ) returning id into v_candidate;
    end if;
  end if;

  update public.afat_contribution_sessions
  set status='completed',ended_at=now(),sample_count=v_total,matched_sample_count=v_matched,updated_at=now()
  where id=p_session_id;

  return jsonb_build_object(
    'id',p_session_id,'status','completed','sample_count',v_total,
    'matched_sample_count',v_matched,'unmatched_quality_samples',v_unmatched,
    'max_unmatched_gap_m',v_max_gap,'candidate_feature_id',v_candidate,
    'candidate_withheld_reason',case
      when v_unmatched<5 then 'insufficient_unmatched_evidence'
      when v_max_gap>400 then 'disconnected_trace'
      else null end
  );
end; $$;
