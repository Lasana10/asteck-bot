-- Review may promote only an independently inspected, recent, precise observation
-- near its real Atlas place. A promoted point remains limited access evidence.
create or replace function public.afat_review_access_evidence(p_submission_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.afat_access_evidence_submissions%rowtype;
  v_place public.afat_places%rowtype;
  v_access_id uuid;
  v_conf numeric;
  v_observed_at timestamptz;
  v_distance_m double precision;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then
    raise exception 'Evidence review permission required';
  end if;
  if p_decision not in ('accept','reject') then raise exception 'Decision must be accept or reject'; end if;
  select * into v_row from public.afat_access_evidence_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_row.status<>'pending' then
    return jsonb_build_object('id',v_row.id,'status',v_row.status,'access_point_id',v_row.promoted_access_point_id);
  end if;
  if v_row.profile_id=v_uid then raise exception 'Independent reviewer required'; end if;
  if p_decision='reject' then
    update public.afat_access_evidence_submissions
       set status='rejected',reviewer_id=v_uid,reviewed_at=now(),updated_at=now()
     where id=v_row.id;
    return jsonb_build_object('id',v_row.id,'status','rejected','automatic_truth',false);
  end if;

  select * into v_place from public.afat_places where id=v_row.place_id and status not in ('disputed','retired');
  if not found then raise exception 'Destination place is no longer eligible'; end if;
  if v_row.gps_accuracy_m is null or v_row.gps_accuracy_m>60 or v_row.gps_accuracy_m<0 then
    raise exception 'Precise GPS evidence required for access promotion';
  end if;
  if v_row.evidence->>'observation_time_source' is distinct from 'device_reported_gnss'
     or v_row.evidence->>'observation_time_verified' is distinct from 'false'
     or nullif(v_row.evidence->>'observed_at','') is null then
    raise exception 'Device capture time required for access review';
  end if;
  begin
    v_observed_at:=(v_row.evidence->>'observed_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid access capture time';
  end;
  if not isfinite(v_observed_at) or v_observed_at>now()+interval '5 minutes'
     or v_observed_at<now()-interval '30 days' then
    raise exception 'Access observation is too old or in the future';
  end if;
  v_distance_m:=st_distance(v_row.location,v_place.location);
  if v_distance_m is null or v_distance_m>1000 then
    raise exception 'Observed access is too far from the selected Atlas place';
  end if;

  v_conf:=case when v_row.gps_accuracy_m<=20 then 55 else 45 end;
  insert into public.afat_access_points(
    place_id,access_type,name,instructions,latitude,longitude,access_modes,
    confidence,evidence_status,source_kind,opening_rules,evidence,active,fingerprint
  ) values (
    v_row.place_id,v_row.suggested_access_type,coalesce(v_row.name,'Community observed access'),
    v_row.instructions,v_row.latitude,v_row.longitude,v_row.access_modes,
    v_conf,'limited','community','{}'::jsonb,
    v_row.evidence||jsonb_build_object('reviewed_by',v_uid,'reviewed_at',now(),
      'distance_to_place_m',round(v_distance_m::numeric,1),'automatic_truth',false,
      'entrance_field_verified',false),true,
    md5(v_row.place_id::text||':'||round(v_row.latitude::numeric,5)::text||':'||
      round(v_row.longitude::numeric,5)::text||':'||v_row.suggested_access_type)
  ) on conflict(fingerprint) do update
    set updated_at=now(),evidence=public.afat_access_points.evidence||excluded.evidence
  returning id into v_access_id;
  update public.afat_access_evidence_submissions
     set status='accepted',reviewer_id=v_uid,reviewed_at=now(),promoted_access_point_id=v_access_id,updated_at=now()
   where id=v_row.id;
  return jsonb_build_object('id',v_row.id,'status','accepted','access_point_id',v_access_id,
    'evidence_status','limited','distance_to_place_m',round(v_distance_m::numeric,1),
    'automatic_truth',false,'entrance_field_verified',false);
end $$;

revoke all on function public.afat_review_access_evidence(uuid,text) from public,anon;
grant execute on function public.afat_review_access_evidence(uuid,text) to authenticated;
