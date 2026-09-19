-- AFAT Atlas review and mapping mission governance
-- Applied to production as migration 20260919212638.

create or replace function public.afat_review_candidate_feature(
  p_candidate_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_candidate public.afat_candidate_features%rowtype;
  v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;

  select * into v_candidate from public.afat_candidate_features where id=p_candidate_id for update;
  if not found then raise exception 'Candidate not found'; end if;
  if v_candidate.status in ('rejected','merged') then raise exception 'Candidate is already closed'; end if;

  v_status := case p_decision when 'corroborate' then 'corroborated' when 'trust' then 'trusted' when 'reject' then 'rejected' else null end;
  if v_status is null then raise exception 'Unsupported review decision'; end if;

  update public.afat_candidate_features
  set status=v_status,
      confidence=case when v_status='corroborated' then greatest(confidence,60)
                      when v_status='trusted' then greatest(confidence,80)
                      when v_status='rejected' then least(confidence,10)
                      else confidence end,
      reviewed_by=v_uid,reviewed_at=now(),review_notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=p_candidate_id;

  return jsonb_build_object(
    'id',p_candidate_id,'status',v_status,
    'promotion_state',case when v_status='trusted' then 'trusted_candidate_requires_explicit_atlas_promotion' else 'review_complete' end
  );
end; $$;

create or replace function public.afat_create_mapping_mission(
  p_title text,
  p_description text default null,
  p_reward_points_per_km integer default 10,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('field.mission.manage') then raise exception 'Field mission management permission required'; end if;
  if length(trim(coalesce(p_title,'')))<3 then raise exception 'Mission title is required'; end if;

  insert into public.collection_campaigns(title,description,reward_points_per_km,is_active,expires_at)
  values(trim(p_title),nullif(trim(coalesce(p_description,'')),''),greatest(0,least(coalesce(p_reward_points_per_km,10),1000)),true,p_expires_at)
  returning id into v_id;

  return jsonb_build_object('id',v_id,'status','active');
end; $$;

revoke all on function public.afat_review_candidate_feature(uuid,text,text) from public,anon;
revoke all on function public.afat_create_mapping_mission(text,text,integer,timestamptz) from public,anon;
grant execute on function public.afat_review_candidate_feature(uuid,text,text) to authenticated;
grant execute on function public.afat_create_mapping_mission(text,text,integer,timestamptz) to authenticated;
