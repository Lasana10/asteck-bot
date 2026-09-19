-- Source-controlled copy of production migration 20260919214845 afat_living_city_learning_network

create table if not exists public.afat_contributor_reputation (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reputation_score numeric not null default 50 check (reputation_score between 0 and 100),
  trust_level text not null default 'new' check (trust_level in ('new','regular','trusted','steward','institutional')),
  completed_sessions integer not null default 0,
  corroborated_contributions integer not null default 0,
  rejected_contributions integer not null default 0,
  verified_distance_m numeric not null default 0,
  last_contribution_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_evidence_conflicts (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  place_id uuid references public.afat_places(id) on delete cascade,
  conflict_type text not null check (conflict_type in ('passability','mode_access','place_name','pickup_viability','road_existence','condition')),
  evidence_a jsonb not null default '{}'::jsonb,
  evidence_b jsonb not null default '{}'::jsonb,
  severity numeric not null default 0.5 check (severity between 0 and 1),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution jsonb not null default '{}'::jsonb
);

create table if not exists public.afat_micro_missions (
  id uuid primary key default gen_random_uuid(),
  city text not null default 'Yaoundé',
  mission_type text not null check (mission_type in ('verify_edge','verify_place','verify_pickup','confirm_name','confirm_condition','map_gap')),
  title text not null,
  question text not null,
  target_edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  target_place_id uuid references public.afat_places(id) on delete cascade,
  target_meeting_point_id uuid references public.afat_meeting_points(id) on delete cascade,
  priority numeric not null default 50 check (priority between 0 and 100),
  required_mode text,
  status text not null default 'open' check (status in ('open','claimed','submitted','verified','expired','cancelled')),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  submitted_at timestamptz,
  expires_at timestamptz,
  answer jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_city_profiles (
  id uuid primary key default gen_random_uuid(),
  city_key text not null unique,
  city_name text not null,
  country_code text not null,
  country_name text,
  timezone text not null default 'Africa/Douala',
  currency_code text not null default 'XAF',
  default_language text not null default 'en',
  supported_languages text[] not null default array['en','fr']::text[],
  transport_modes jsonb not null default '[]'::jsonb,
  local_terms jsonb not null default '{}'::jsonb,
  data_sources jsonb not null default '[]'::jsonb,
  learning_stage text not null default 'seed' check (learning_stage in ('seed','observe','discover','verify','operate','learn','predict')),
  operational_confidence numeric not null default 0 check (operational_confidence between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_city_learning_runs (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  started_by uuid references public.profiles(id) on delete set null,
  stage text not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  metrics jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.afat_mobility_predictions (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  prediction_type text not null check (prediction_type in ('edge_reliability','congestion','pickup_success','disruption','demand','evidence_need')),
  target_edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  target_place_id uuid references public.afat_places(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  probability numeric not null check (probability between 0 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  model_key text not null default 'afat_rule_evidence_v1',
  created_at timestamptz not null default now()
);

create index if not exists afat_conflicts_edge_status_idx on public.afat_evidence_conflicts(edge_id,status,detected_at desc);
create index if not exists afat_micro_missions_queue_idx on public.afat_micro_missions(status,priority desc,created_at);
create index if not exists afat_micro_missions_claimed_idx on public.afat_micro_missions(claimed_by,status) where claimed_by is not null;
create index if not exists afat_city_runs_city_idx on public.afat_city_learning_runs(city_profile_id,started_at desc);
create index if not exists afat_predictions_city_type_idx on public.afat_mobility_predictions(city,prediction_type,valid_until desc);
create index if not exists afat_predictions_edge_idx on public.afat_mobility_predictions(target_edge_id,valid_until desc) where target_edge_id is not null;

alter table public.afat_contributor_reputation enable row level security;
alter table public.afat_evidence_conflicts enable row level security;
alter table public.afat_micro_missions enable row level security;
alter table public.afat_city_profiles enable row level security;
alter table public.afat_city_learning_runs enable row level security;
alter table public.afat_mobility_predictions enable row level security;

create policy afat_contributor_reputation_read on public.afat_contributor_reputation for select to authenticated
using ((select auth.uid())=profile_id or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view'));

create policy afat_evidence_conflicts_read on public.afat_evidence_conflicts for select to authenticated
using (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view'));

create policy afat_micro_missions_read on public.afat_micro_missions for select to authenticated
using (
  status='open'
  or claimed_by=(select auth.uid())
  or public.afat_has_permission('field.mission.manage')
  or public.afat_has_permission('map.evidence.review')
);

create policy afat_city_profiles_read on public.afat_city_profiles for select to authenticated using (status='active');
create policy afat_city_learning_runs_read on public.afat_city_learning_runs for select to authenticated
using (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review'));
create policy afat_mobility_predictions_read on public.afat_mobility_predictions for select to authenticated
using (valid_until>now());

grant select on public.afat_contributor_reputation, public.afat_evidence_conflicts, public.afat_micro_missions,
  public.afat_city_profiles, public.afat_city_learning_runs, public.afat_mobility_predictions to authenticated;

insert into public.afat_city_profiles(
  city_key,city_name,country_code,country_name,timezone,currency_code,default_language,
  supported_languages,transport_modes,local_terms,data_sources,learning_stage,operational_confidence,metadata
) values (
  'cm-yaounde','Yaoundé','CM','Cameroon','Africa/Douala','XAF','en',
  array['en','fr']::text[],
  '["walk","moto","taxi","car","minibus","bus","bike","delivery"]'::jsonb,
  '{"moto":{"en":"Moto","fr":"Moto"},"meeting_point":{"en":"Meeting point","fr":"Point de rencontre"}}'::jsonb,
  '["afat_living_atlas","openstreetmap","overture"]'::jsonb,
  'learn',68,
  '{"bootstrap":"existing_production_atlas","city_genesis_version":"v1"}'::jsonb
)
on conflict (city_key) do update set
  supported_languages=excluded.supported_languages,
  transport_modes=excluded.transport_modes,
  data_sources=excluded.data_sources,
  updated_at=now();

create or replace function public.afat_refresh_contributor_reputation(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_completed integer;
  v_distance numeric;
  v_corroborated integer;
  v_rejected integer;
  v_score numeric;
  v_level text;
begin
  select count(*),coalesce(sum(distance_m),0),max(ended_at)
  into v_completed,v_distance
  from public.afat_contribution_sessions
  where contributor_id=p_profile_id and status='completed';

  select count(*) filter(where c.status in ('corroborated','trusted')),
         count(*) filter(where c.status='rejected')
  into v_corroborated,v_rejected
  from public.afat_candidate_features c
  join public.afat_contribution_sessions s on s.id=c.source_session_id
  where s.contributor_id=p_profile_id;

  v_score:=greatest(0,least(100,
    45 + least(20,v_completed*1.5) + least(25,v_corroborated*4) + least(10,v_distance/10000) - least(35,v_rejected*7)
  ));

  v_level:=case
    when v_score>=90 and v_corroborated>=20 then 'steward'
    when v_score>=75 and v_corroborated>=8 then 'trusted'
    when v_score>=58 and v_completed>=5 then 'regular'
    else 'new' end;

  insert into public.afat_contributor_reputation(
    profile_id,reputation_score,trust_level,completed_sessions,corroborated_contributions,
    rejected_contributions,verified_distance_m,last_contribution_at,updated_at
  )
  select p_profile_id,v_score,v_level,v_completed,v_corroborated,v_rejected,v_distance,
         max(ended_at),now()
  from public.afat_contribution_sessions where contributor_id=p_profile_id
  on conflict(profile_id) do update set
    reputation_score=excluded.reputation_score,
    trust_level=excluded.trust_level,
    completed_sessions=excluded.completed_sessions,
    corroborated_contributions=excluded.corroborated_contributions,
    rejected_contributions=excluded.rejected_contributions,
    verified_distance_m=excluded.verified_distance_m,
    last_contribution_at=excluded.last_contribution_at,
    updated_at=now();

  return jsonb_build_object('profile_id',p_profile_id,'score',v_score,'trust_level',v_level);
end; $$;

create or replace function public.afat_refresh_candidate_corroboration(p_candidate_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_candidate public.afat_candidate_features%rowtype;
  v_unique integer:=1;
  v_evidence integer:=0;
  v_confidence numeric;
  v_status text;
begin
  select * into v_candidate from public.afat_candidate_features where id=p_candidate_id;
  if not found then raise exception 'Candidate not found'; end if;

  select count(distinct s.contributor_id),
         coalesce(sum(c.evidence_count),0)
  into v_unique,v_evidence
  from public.afat_candidate_features c
  join public.afat_contribution_sessions s on s.id=c.source_session_id
  where c.status not in ('rejected','merged')
    and c.feature_type=v_candidate.feature_type
    and coalesce(c.movement_mode,'')=coalesce(v_candidate.movement_mode,'')
    and public.st_dwithin(c.geometry,v_candidate.geometry,35);

  v_confidence:=least(92,20 + least(30,v_evidence*1.7) + least(42,v_unique*12));
  v_status:=case
    when v_unique>=4 and v_evidence>=18 then 'trusted'
    when v_unique>=2 and v_evidence>=8 then 'corroborated'
    else v_candidate.status end;

  update public.afat_candidate_features
  set unique_contributors=greatest(unique_contributors,v_unique),
      evidence_count=greatest(evidence_count,v_evidence),
      confidence=greatest(confidence,v_confidence),
      status=case when status='candidate' then v_status else status end,
      updated_at=now()
  where id=p_candidate_id;

  return jsonb_build_object('candidate_id',p_candidate_id,'unique_contributors',v_unique,'evidence_count',v_evidence,'confidence',v_confidence,'status',v_status);
end; $$;

create or replace function public.afat_candidate_after_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.afat_refresh_candidate_corroboration(new.id);
  return new;
end; $$;

drop trigger if exists afat_candidate_auto_corroborate on public.afat_candidate_features;
create trigger afat_candidate_auto_corroborate
after insert on public.afat_candidate_features
for each row execute function public.afat_candidate_after_insert();

create or replace function public.afat_generate_micro_missions(p_limit integer default 12)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_created integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('field.mission.manage') then raise exception 'Field mission management permission required'; end if;

  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,required_mode,expires_at,evidence)
  select
    'Yaoundé','verify_edge',
    'Verify '||coalesce(e.canonical_name,'this road'),
    case
      when e.last_observed_at<now()-interval '60 days' then 'Is this road currently open and usable?'
      when e.confidence<45 then 'Can you confirm this road and how people actually use it?'
      else 'Can you confirm current road conditions here?' end,
    e.id,
    least(100,(100-e.confidence)+least(30,extract(epoch from(now()-e.last_observed_at))/86400)),
    case when 'moto'=any(e.access_modes) then 'moto' when 'car'=any(e.access_modes) then 'car' else null end,
    now()+interval '7 days',
    jsonb_build_object('reason',case when e.confidence<45 then 'low_confidence' else 'stale_evidence' end,'atlas_confidence',e.confidence)
  from public.afat_atlas_edges e
  where e.status='active'
    and (e.confidence<60 or e.last_observed_at<now()-interval '30 days')
    and not exists (
      select 1 from public.afat_micro_missions m
      where m.target_edge_id=e.id and m.status in ('open','claimed','submitted')
    )
  order by ((100-e.confidence)+least(30,extract(epoch from(now()-e.last_observed_at))/86400)) desc
  limit greatest(1,least(coalesce(p_limit,12),50));

  get diagnostics v_created=row_count;
  return jsonb_build_object('created',v_created);
end; $$;

create or replace function public.afat_claim_micro_mission(p_mission_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_mission public.afat_micro_missions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('field.mission.join') then raise exception 'Field mission permission required'; end if;

  update public.afat_micro_missions
  set status='claimed',claimed_by=v_uid,claimed_at=now(),updated_at=now()
  where id=p_mission_id and status='open' and (expires_at is null or expires_at>now())
  returning * into v_mission;
  if not found then raise exception 'Mission is no longer available'; end if;
  return jsonb_build_object('id',v_mission.id,'status',v_mission.status,'question',v_mission.question);
end; $$;

create or replace function public.afat_submit_micro_mission(
  p_mission_id uuid,p_answer jsonb,p_latitude double precision default null,p_longitude double precision default null,
  p_accuracy_m numeric default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_mission public.afat_micro_missions%rowtype;
  v_rep jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_mission from public.afat_micro_missions
  where id=p_mission_id and claimed_by=v_uid and status='claimed'
  for update;
  if not found then raise exception 'Claimed mission not found'; end if;

  update public.afat_micro_missions
  set status='submitted',submitted_at=now(),answer=coalesce(p_answer,'{}'::jsonb),
      evidence=evidence||jsonb_build_object('latitude',p_latitude,'longitude',p_longitude,'accuracy_m',p_accuracy_m,'submitted_by',v_uid),
      updated_at=now()
  where id=p_mission_id;

  if v_mission.target_edge_id is not null and p_answer ? 'condition' then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at
    ) values (
      v_mission.target_edge_id,v_uid,'field_verification',p_answer,'micro_mission',
      case when coalesce(p_accuracy_m,999)<=30 then 72 else 55 end,
      jsonb_build_object('mission_id',p_mission_id,'accuracy_m',p_accuracy_m),now()
    );
  end if;

  insert into public.trust_ledger(user_id,amount,reason,reference_id)
  values(v_uid,5,'verified_field_mission_submission',p_mission_id::text);

  v_rep:=public.afat_refresh_contributor_reputation(v_uid);
  return jsonb_build_object('id',p_mission_id,'status','submitted','reputation',v_rep);
end; $$;

create or replace function public.afat_record_edge_condition(
  p_edge_id uuid,p_condition text,p_mode text default null,p_confidence numeric default 0.5,p_source_ref text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_edge public.afat_atlas_edges%rowtype;
  v_conflict uuid;
  v_recent record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_condition not in ('open','slow','blocked','damaged','flooded','unsafe','unknown') then raise exception 'Unsupported condition'; end if;

  select * into v_edge from public.afat_atlas_edges where id=p_edge_id and status='active';
  if not found then raise exception 'Atlas edge not found'; end if;

  insert into public.afat_atlas_observations(
    atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at,expires_at
  ) values (
    p_edge_id,v_uid,'road_condition',
    jsonb_build_object('condition',p_condition,'mode',p_mode),
    'community_condition',greatest(10,least(70,p_confidence*100)),
    jsonb_build_object('source_ref',p_source_ref),now(),now()+interval '12 hours'
  );

  select observation_value,observed_at into v_recent
  from public.afat_atlas_observations
  where atlas_edge_id=p_edge_id and observation_type='road_condition'
    and observed_at>now()-interval '6 hours'
    and observer_id is distinct from v_uid
    and coalesce(observation_value->>'condition','')<>p_condition
  order by observed_at desc limit 1;

  if found then
    insert into public.afat_evidence_conflicts(edge_id,conflict_type,evidence_a,evidence_b,severity)
    values(
      p_edge_id,'condition',
      jsonb_build_object('condition',p_condition,'observer',v_uid),
      jsonb_build_object('observation',v_recent.observation_value,'observed_at',v_recent.observed_at),
      0.6
    ) returning id into v_conflict;
  end if;

  return jsonb_build_object('edge_id',p_edge_id,'condition',p_condition,'conflict_id',v_conflict);
end; $$;

create or replace function public.afat_ingest_passage_negative_evidence()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_edge uuid;
begin
  begin v_edge:=(new.evidence->>'edge_id')::uuid; exception when others then v_edge:=null; end;
  if v_edge is null then return new; end if;
  if new.outcome_type in ('failed_pickup','route_failed','inaccessible','cancelled_access','wrong_entrance') then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at,expires_at
    ) values (
      v_edge,new.reporter_id,'negative_mobility_evidence',
      jsonb_build_object('outcome_type',new.outcome_type,'responsibility',new.responsibility),
      'passage_outcome',55,
      jsonb_build_object('passage_outcome_id',new.id,'passage_intent_id',new.passage_intent_id),
      new.created_at,new.created_at+interval '30 days'
    );
  end if;
  return new;
end; $$;

drop trigger if exists afat_passage_negative_evidence on public.passage_outcomes;
create trigger afat_passage_negative_evidence
after insert on public.passage_outcomes
for each row execute function public.afat_ingest_passage_negative_evidence();

create or replace function public.afat_refresh_city_learning(p_city_key text default 'cm-yaounde')
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_edges integer; v_low integer; v_stale integer; v_obs integer; v_candidates integer; v_conflicts integer;
  v_conf numeric; v_stage text; v_run uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review')) then
    raise exception 'Planning or map review permission required';
  end if;

  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  select count(*),count(*) filter(where confidence<55),count(*) filter(where last_observed_at<now()-interval '30 days')
  into v_edges,v_low,v_stale from public.afat_atlas_edges where status='active';
  select count(*) into v_obs from public.afat_atlas_observations where observed_at>now()-interval '30 days';
  select count(*) into v_candidates from public.afat_candidate_features where status in ('candidate','corroborated');
  select count(*) into v_conflicts from public.afat_evidence_conflicts where status='open';

  v_conf:=case when v_edges=0 then 0 else greatest(0,least(100,
    100 - (v_low::numeric/v_edges*45) - (v_stale::numeric/v_edges*25) - least(15,v_conflicts*0.5) + least(15,v_obs::numeric/100)
  )) end;

  v_stage:=case
    when v_edges<100 then 'seed'
    when v_conf<35 then 'observe'
    when v_conf<50 then 'discover'
    when v_conf<65 then 'verify'
    when v_conf<75 then 'operate'
    when v_conf<88 then 'learn'
    else 'predict' end;

  update public.afat_city_profiles
  set operational_confidence=v_conf,learning_stage=v_stage,updated_at=now()
  where id=v_city.id;

  insert into public.afat_city_learning_runs(city_profile_id,started_by,stage,status,metrics,recommendations,completed_at)
  values(
    v_city.id,v_uid,v_stage,'completed',
    jsonb_build_object('edges',v_edges,'low_confidence_edges',v_low,'stale_edges',v_stale,'recent_observations',v_obs,'candidate_features',v_candidates,'open_conflicts',v_conflicts,'operational_confidence',v_conf),
    jsonb_build_array(
      case when v_stale>0 then 'refresh_stale_edges' else 'maintain_freshness' end,
      case when v_candidates>0 then 'corroborate_candidate_geography' else 'expand_coverage' end,
      case when v_conflicts>0 then 'resolve_evidence_conflicts' else 'continue_collection' end
    ),
    now()
  ) returning id into v_run;

  return jsonb_build_object('run_id',v_run,'city_key',p_city_key,'learning_stage',v_stage,'operational_confidence',round(v_conf,1),'edges',v_edges,'recent_observations',v_obs,'candidate_features',v_candidates,'open_conflicts',v_conflicts);
end; $$;

create or replace function public.afat_generate_evidence_predictions(p_city text default 'Yaoundé',p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_created integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('planning.aggregate.view') then raise exception 'Planning access required'; end if;

  delete from public.afat_mobility_predictions where valid_until<=now();

  insert into public.afat_mobility_predictions(
    city,prediction_type,target_edge_id,valid_from,valid_until,probability,confidence,explanation,evidence
  )
  select p_city,'evidence_need',e.id,now(),now()+interval '24 hours',
    least(0.98,greatest(0.2,(100-e.confidence)/100)),
    least(0.9,greatest(0.35,0.45 + least(0.4,extract(epoch from(now()-e.last_observed_at))/86400/120))),
    case
      when e.last_observed_at<now()-interval '60 days' then 'Fresh field evidence is needed because this road has not been observed recently.'
      when e.confidence<45 then 'This road still has weak evidence and should be verified by independent contributors.'
      else 'AFAT would benefit from another independent observation here.' end,
    jsonb_build_object('atlas_confidence',e.confidence,'last_observed_at',e.last_observed_at,'evidence_status',e.evidence_status)
  from public.afat_atlas_edges e
  where e.status='active' and (e.confidence<60 or e.last_observed_at<now()-interval '30 days')
    and not exists (
      select 1 from public.afat_mobility_predictions p
      where p.target_edge_id=e.id and p.prediction_type='evidence_need' and p.valid_until>now()
    )
  order by e.confidence asc,e.last_observed_at asc
  limit greatest(1,least(coalesce(p_limit,20),100));

  get diagnostics v_created=row_count;
  return jsonb_build_object('created',v_created,'model_key','afat_rule_evidence_v1');
end; $$;

revoke all on function public.afat_refresh_contributor_reputation(uuid) from public,anon;
revoke all on function public.afat_refresh_candidate_corroboration(uuid) from public,anon;
revoke all on function public.afat_generate_micro_missions(integer) from public,anon;
revoke all on function public.afat_claim_micro_mission(uuid) from public,anon;
revoke all on function public.afat_submit_micro_mission(uuid,jsonb,double precision,double precision,numeric) from public,anon;
revoke all on function public.afat_record_edge_condition(uuid,text,text,numeric,text) from public,anon;
revoke all on function public.afat_refresh_city_learning(text) from public,anon;
revoke all on function public.afat_generate_evidence_predictions(text,integer) from public,anon;

grant execute on function public.afat_refresh_contributor_reputation(uuid) to authenticated;
grant execute on function public.afat_refresh_candidate_corroboration(uuid) to authenticated;
grant execute on function public.afat_generate_micro_missions(integer) to authenticated;
grant execute on function public.afat_claim_micro_mission(uuid) to authenticated;
grant execute on function public.afat_submit_micro_mission(uuid,jsonb,double precision,double precision,numeric) to authenticated;
grant execute on function public.afat_record_edge_condition(uuid,text,text,numeric,text) to authenticated;
grant execute on function public.afat_refresh_city_learning(text) to authenticated;
grant execute on function public.afat_generate_evidence_predictions(text,integer) to authenticated;

