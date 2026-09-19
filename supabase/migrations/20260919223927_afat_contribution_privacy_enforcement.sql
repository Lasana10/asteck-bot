-- Source-controlled copy of production migration 20260919223927

create or replace function public.afat_privacy_gate_atlas_observation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session_id uuid;
  v_contributor uuid;
  v_allow boolean;
begin
  if new.source_kind not in ('community_movement','fleet_movement') then return new; end if;
  begin v_session_id:=(new.evidence->>'session_id')::uuid; exception when others then v_session_id:=null; end;
  if v_session_id is null then return new; end if;

  select s.contributor_id,coalesce(p.allow_aggregate_learning,true)
  into v_contributor,v_allow
  from public.afat_contribution_sessions s
  left join public.afat_privacy_preferences p on p.profile_id=s.contributor_id
  where s.id=v_session_id;

  if v_contributor is not null and v_allow=false then return null; end if;
  return new;
end; $$;

drop trigger if exists afat_privacy_gate_observations on public.afat_atlas_observations;
create trigger afat_privacy_gate_observations
before insert on public.afat_atlas_observations
for each row execute function public.afat_privacy_gate_atlas_observation();

create or replace function public.afat_privacy_gate_candidate_feature()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contributor uuid;
  v_allow boolean;
  v_protect boolean;
  v_length numeric;
begin
  if new.source_session_id is null then return new; end if;

  select s.contributor_id,
         coalesce(p.allow_aggregate_learning,true),
         coalesce(p.protect_sensitive_endpoints,true)
  into v_contributor,v_allow,v_protect
  from public.afat_contribution_sessions s
  left join public.afat_privacy_preferences p on p.profile_id=s.contributor_id
  where s.id=new.source_session_id;

  if v_contributor is not null and v_allow=false then return null; end if;

  if v_protect and new.feature_type in ('road_segment','path') then
    v_length:=public.st_length(new.geometry);
    if v_length>120 then
      new.geometry:=public.st_linesubstring(new.geometry::public.geometry,0.08,0.92)::public.geography;
      new.evidence:=new.evidence||jsonb_build_object('sensitive_endpoints_trimmed',true,'trim_fraction',0.08);
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists afat_privacy_gate_candidates on public.afat_candidate_features;
create trigger afat_privacy_gate_candidates
before insert on public.afat_candidate_features
for each row execute function public.afat_privacy_gate_candidate_feature();

revoke all on function public.afat_privacy_gate_atlas_observation() from public,anon,authenticated;
revoke all on function public.afat_privacy_gate_candidate_feature() from public,anon,authenticated;

