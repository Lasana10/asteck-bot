create or replace function public.afat_complete_contribution_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
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

  select * into v_session
  from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid and status='active';
  if not found then raise exception 'Contribution session unavailable'; end if;

  select count(*),
         count(*) filter(where match_state='matched'),
         count(*) filter(where match_state='unmatched' and quality_score>=0.35)
  into v_total,v_matched,v_unmatched
  from public.afat_contribution_samples
  where session_id=p_session_id;

  if coalesce(v_total,0)=0 then
    raise exception 'No movement samples were saved. Contribution was not completed.';
  end if;

  select coalesce(max(step_m),0)
  into v_max_gap
  from (
    select public.st_distance(
      public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography,
      public.st_setsrid(public.st_makepoint(
        lag(longitude) over(order by recorded_at),
        lag(latitude) over(order by recorded_at)
      ),4326)::public.geography
    ) as step_m
    from public.afat_contribution_samples
    where session_id=p_session_id
      and match_state='unmatched'
      and quality_score>=0.35
  ) gaps
  where step_m is not null;

  if v_unmatched>=5 and v_max_gap<=400 then
    select public.st_makeline(pt order by recorded_at)::public.geography
    into v_line
    from (
      select public.st_setsrid(public.st_makepoint(longitude,latitude),4326) pt,recorded_at
      from public.afat_contribution_samples
      where session_id=p_session_id
        and match_state='unmatched'
        and quality_score>=0.35
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
          'source','community_trace',
          'privacy_mode',v_session.privacy_mode,
          'purpose',v_session.purpose,
          'max_trace_gap_m',v_max_gap,
          'requires_corroboration',true
        )
      ) returning id into v_candidate;
    end if;
  end if;

  update public.afat_contribution_sessions
  set status='completed',ended_at=now(),sample_count=v_total,matched_sample_count=v_matched,updated_at=now()
  where id=p_session_id;

  return jsonb_build_object(
    'id',p_session_id,
    'status','completed',
    'sample_count',v_total,
    'matched_sample_count',v_matched,
    'unmatched_quality_samples',v_unmatched,
    'max_unmatched_gap_m',v_max_gap,
    'candidate_feature_id',v_candidate,
    'candidate_withheld_reason',case
      when v_unmatched<5 then 'insufficient_unmatched_evidence'
      when v_max_gap>400 then 'disconnected_trace'
      else null end
  );
end;
$$;
