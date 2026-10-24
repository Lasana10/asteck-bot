-- Keep the existing mission claim/submission architecture. A submitted physical
-- observation is not an independently verified road, and cannot mint rewards.
create or replace function public.afat_submit_micro_mission(
 p_mission_id uuid,p_answer jsonb,
 p_latitude double precision default null,p_longitude double precision default null,
 p_accuracy_m numeric default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_mission public.afat_micro_missions%rowtype;
 v_point public.geography;
 v_distance numeric;
 v_cross_source boolean;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_mission from public.afat_micro_missions
 where id=p_mission_id and claimed_by=v_uid and status='claimed' for update;
 if not found then raise exception 'Claimed mission not found';end if;
 v_cross_source:=v_mission.evidence->>'source'='licensed_cross_source_spatial_comparison';
 if v_mission.expires_at is not null and v_mission.expires_at<now() then
  raise exception 'EXPIRED_FIELD_MISSION' using errcode='22023';end if;
 if jsonb_typeof(p_answer) is distinct from 'object'
  or char_length(trim(coalesce(p_answer->>'condition','')))<3
  then raise exception 'REAL_FIELD_OBSERVATION_REQUIRED' using errcode='22023';end if;
 if v_mission.target_edge_id is not null then
  if p_latitude is null or p_longitude is null or
     p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    then raise exception 'VALID_DEVICE_COORDINATES_REQUIRED' using errcode='22023';end if;
  if p_accuracy_m is null or p_accuracy_m<0 or p_accuracy_m>120
    then raise exception 'MEASURED_GNSS_ACCURACY_REQUIRED' using errcode='22023';end if;
  v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
  select public.st_distance(e.geometry,v_point) into v_distance
    from public.afat_atlas_edges e where e.id=v_mission.target_edge_id;
  if v_distance is null or v_distance>250 then
    raise exception 'OBSERVATION_TOO_FAR_FROM_MISSION' using errcode='22023';end if;
 end if;
 update public.afat_micro_missions set
  status='submitted',submitted_at=now(),answer=p_answer,
  evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
   'latitude',p_latitude,'longitude',p_longitude,
   'accuracy_m',p_accuracy_m,'target_distance_m',v_distance,
   'independent_review_required',true,
   'road_passability_verified',false,
   'rewards_awarded_on_submission',false
  ),updated_at=now()
 where id=p_mission_id;
 -- Save the reporter's observation, not a system-approved road property.
 if v_mission.target_edge_id is not null then
  insert into public.afat_atlas_observations(
   atlas_edge_id,observer_id,observation_type,observation_value,source_kind,
   confidence,evidence,observed_at
  ) values(
   v_mission.target_edge_id,v_uid,'field_verification',
   p_answer,'micro_mission',case when p_accuracy_m<=30 then 60
     when p_accuracy_m<=60 then 50 else 35 end,
   jsonb_build_object('mission_id',p_mission_id,
    'accuracy_m',p_accuracy_m,'target_distance_m',v_distance,
    'pending_independent_review',true,'source_discrepancy',v_cross_source,
    'cannot_certify_passability',true),now()
  );
 end if;
 -- No trust ledger writes or acceptance claims from unreviewed submissions.
 return jsonb_build_object('id',p_mission_id,'status','submitted',
  'pending_independent_review',true,'trust_points_awarded',0,
  'route_truth_updated',false,'target_distance_m',v_distance);
end $$;

-- Separate review for the *licensed comparison* mission class introduced in
-- PR #205. Reviewer cannot be the submitting contributor. It deliberately
-- does not change trusted Atlas edge geometry, passability or confidence.
create or replace function public.afat_review_cross_source_field_check(
 p_mission_id uuid,p_decision text,p_notes text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
 v_mission public.afat_micro_missions%rowtype;
 v_notes text:=trim(coalesce(p_notes,''));
 v_discrepancy_id uuid;
begin
 if v_uid is null or not public.afat_has_permission('map.evidence.review') then
   raise exception 'MAP_REVIEW_PERMISSION_REQUIRED' using errcode='42501';end if;
 if p_decision not in ('accept','reject') or char_length(v_notes)<25
    or char_length(v_notes)>2000 then
   raise exception 'EVIDENCE_REVIEW_DECISION_AND_REASON_REQUIRED' using errcode='22023';end if;
 select * into v_mission from public.afat_micro_missions
 where id=p_mission_id and status='submitted'
   and evidence->>'source'='licensed_cross_source_spatial_comparison'
 for update;
 if not found then raise exception 'SUBMITTED_CROSS_SOURCE_MISSION_NOT_FOUND' using errcode='P0002';end if;
 if v_mission.claimed_by=v_uid then
   raise exception 'INDEPENDENT_REVIEWER_REQUIRED' using errcode='42501';end if;
 update public.afat_micro_missions set
   status=case when p_decision='accept' then 'verified' else 'cancelled' end,
   evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
    'field_review',jsonb_build_object('decision',p_decision,
     'reviewer_id',v_uid,'reviewed_at',now(),'notes',v_notes,
     'source_geometry_changed',false,'road_passability_verified',false)
   ),updated_at=now()
 where id=p_mission_id;
 -- No automatic location promotion, source truth claim, payout or alteration.
 return jsonb_build_object('mission_id',p_mission_id,'decision',p_decision,
  'status',case when p_decision='accept' then 'verified' else 'cancelled' end,
  'field_submission_reviewed',true,
  'route_truth_updated',false,'trust_points_awarded',0,
  'source_record_id',v_mission.evidence->>'primary_source_record_id');
end $$;
revoke all on function public.afat_review_cross_source_field_check(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.afat_review_cross_source_field_check(uuid,text,text)
 to authenticated,service_role;
