-- AFAT Living Atlas contribution network
-- Applied to production as migration 20260919212310.
-- Raw movement is evidence only. It cannot directly create routable Atlas truth.

create table if not exists public.afat_contribution_sessions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  movement_mode text not null check (movement_mode in ('walk','moto','car','taxi','minibus','bus','bike','delivery','other')),
  purpose text not null default 'community_movement' check (purpose in ('community_movement','field_mapping','fleet_observation','verification_mission')),
  privacy_mode text not null default 'private_aggregate' check (privacy_mode in ('private_aggregate','trusted_review','public_mapping')),
  status text not null default 'active' check (status in ('active','completed','discarded')),
  campaign_id uuid references public.collection_campaigns(id) on delete set null,
  consent_version text not null default 'afat-living-atlas-v1',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  sample_count integer not null default 0,
  matched_sample_count integer not null default 0,
  distance_m numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_contribution_samples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.afat_contribution_sessions(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m numeric,
  speed_kph numeric,
  heading numeric,
  recorded_at timestamptz not null,
  quality_score numeric not null default 0.5 check (quality_score between 0 and 1),
  match_state text not null default 'unmatched' check (match_state in ('matched','unmatched','rejected')),
  matched_edge_id uuid references public.afat_atlas_edges(id) on delete set null,
  matched_distance_m numeric,
  source text not null default 'browser_geolocation',
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);

create table if not exists public.afat_candidate_features (
  id uuid primary key default gen_random_uuid(),
  feature_type text not null check (feature_type in ('road_segment','path','pickup_cluster','stop','entrance','place','restriction')),
  movement_mode text,
  geometry public.geography not null,
  source_session_id uuid references public.afat_contribution_sessions(id) on delete set null,
  evidence_count integer not null default 1,
  unique_contributors integer not null default 1,
  confidence numeric not null default 20 check (confidence between 0 and 100),
  status text not null default 'candidate' check (status in ('candidate','corroborated','trusted','rejected','merged')),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists afat_contribution_sessions_contributor_idx on public.afat_contribution_sessions(contributor_id, started_at desc);
create index if not exists afat_contribution_samples_session_time_idx on public.afat_contribution_samples(session_id, recorded_at);
create index if not exists afat_contribution_samples_edge_idx on public.afat_contribution_samples(matched_edge_id, recorded_at desc) where matched_edge_id is not null;
create index if not exists afat_candidate_features_geometry_gix on public.afat_candidate_features using gist(geometry);
create index if not exists afat_candidate_features_status_idx on public.afat_candidate_features(status, last_observed_at desc);

alter table public.afat_contribution_sessions enable row level security;
alter table public.afat_contribution_samples enable row level security;
alter table public.afat_candidate_features enable row level security;

create policy afat_contribution_sessions_owner_read on public.afat_contribution_sessions for select to authenticated
using (contributor_id=(select auth.uid()) or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view'));

create policy afat_contribution_samples_owner_read on public.afat_contribution_samples for select to authenticated
using (contributor_id=(select auth.uid()) or public.afat_has_permission('map.evidence.review'));

create policy afat_candidate_features_review_read on public.afat_candidate_features for select to authenticated
using (
  public.afat_has_permission('map.evidence.review')
  or public.afat_has_permission('planning.aggregate.view')
  or exists (
    select 1 from public.afat_contribution_sessions s
    where s.id=source_session_id and s.contributor_id=(select auth.uid())
  )
);

grant select on public.afat_contribution_sessions, public.afat_contribution_samples, public.afat_candidate_features to authenticated;

create or replace function public.afat_start_contribution_session(
  p_movement_mode text,
  p_purpose text default 'community_movement',
  p_privacy_mode text default 'private_aggregate',
  p_campaign_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_movement_mode not in ('walk','moto','car','taxi','minibus','bus','bike','delivery','other') then raise exception 'Unsupported movement mode'; end if;
  if p_purpose not in ('community_movement','field_mapping','fleet_observation','verification_mission') then raise exception 'Unsupported contribution purpose'; end if;
  if p_privacy_mode not in ('private_aggregate','trusted_review','public_mapping') then raise exception 'Unsupported privacy mode'; end if;

  insert into public.afat_contribution_sessions(contributor_id,movement_mode,purpose,privacy_mode,campaign_id,metadata)
  values(v_uid,p_movement_mode,p_purpose,p_privacy_mode,p_campaign_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('id',v_id,'status','active');
end; $$;

create or replace function public.afat_ingest_contribution_sample(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_kph numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=''
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
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;

  select * into v_session from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid and status='active';
  if not found then raise exception 'Contribution session unavailable'; end if;

  if p_accuracy_m is not null and p_accuracy_m > 150 then
    v_state := 'rejected'; v_quality := 0.05;
  else
    v_quality := greatest(0.1,least(1.0,1.0-(coalesce(p_accuracy_m,45)::numeric/150.0)));
    if p_speed_kph is not null and (p_speed_kph < 0 or p_speed_kph > 190) then v_quality := least(v_quality,0.15); end if;
  end if;

  v_point := public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
  v_threshold := greatest(18,least(65,coalesce(p_accuracy_m,30)::numeric+12));

  if v_state <> 'rejected' then
    select e.id,public.st_distance(e.geometry,v_point) into v_edge,v_distance
    from public.afat_atlas_edges e
    where e.status='active' and public.st_dwithin(e.geometry,v_point,v_threshold)
    order by e.geometry <-> v_point limit 1;
    if v_edge is not null then v_state := 'matched'; end if;
  end if;

  insert into public.afat_contribution_samples(
    session_id,contributor_id,latitude,longitude,accuracy_m,speed_kph,heading,
    recorded_at,quality_score,match_state,matched_edge_id,matched_distance_m,idempotency_key
  ) values (
    p_session_id,v_uid,p_latitude,p_longitude,p_accuracy_m,p_speed_kph,p_heading,
    coalesce(p_recorded_at,now()),v_quality,v_state,v_edge,v_distance,nullif(p_idempotency_key,'')
  )
  on conflict (session_id,idempotency_key) do update set accuracy_m=excluded.accuracy_m
  returning id into v_sample;

  update public.afat_contribution_sessions
  set sample_count=sample_count+1,
      matched_sample_count=matched_sample_count+case when v_state='matched' then 1 else 0 end,
      updated_at=now()
  where id=p_session_id;

  if v_state='matched' and v_quality>=0.35 then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,
      confidence,evidence,idempotency_key,observed_at
    ) values (
      v_edge,v_uid,'movement_traversal',
      jsonb_build_object('movement_mode',v_session.movement_mode,'speed_kph',p_speed_kph,'accuracy_m',p_accuracy_m),
      case when v_session.purpose='fleet_observation' then 'fleet_movement' else 'community_movement' end,
      least(70,round((25+v_quality*40)::numeric,2)),
      jsonb_build_object('session_id',p_session_id,'sample_id',v_sample,'privacy_mode',v_session.privacy_mode,'matched_distance_m',v_distance),
      'contribution:'||v_sample::text,coalesce(p_recorded_at,now())
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  return jsonb_build_object('sample_id',v_sample,'match_state',v_state,'matched_edge_id',v_edge,'matched_distance_m',v_distance,'quality_score',v_quality);
end; $$;

create or replace function public.afat_complete_contribution_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.afat_contribution_sessions%rowtype;
  v_total integer; v_matched integer; v_unmatched integer;
  v_line public.geography; v_candidate uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid and status='active';
  if not found then raise exception 'Contribution session unavailable'; end if;

  select count(*),count(*) filter(where match_state='matched'),
         count(*) filter(where match_state='unmatched' and quality_score>=0.35)
  into v_total,v_matched,v_unmatched
  from public.afat_contribution_samples where session_id=p_session_id;

  if v_unmatched>=5 then
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
        v_session.movement_mode,v_line,p_session_id,v_unmatched,1,least(45,20+v_unmatched*2),'candidate',
        v_session.started_at,now(),
        jsonb_build_object('source','community_trace','privacy_mode',v_session.privacy_mode,'purpose',v_session.purpose,'requires_corroboration',true)
      ) returning id into v_candidate;
    end if;
  end if;

  update public.afat_contribution_sessions
  set status='completed',ended_at=now(),sample_count=v_total,matched_sample_count=v_matched,updated_at=now()
  where id=p_session_id;

  return jsonb_build_object('id',p_session_id,'status','completed','sample_count',v_total,'matched_sample_count',v_matched,'unmatched_quality_samples',v_unmatched,'candidate_feature_id',v_candidate);
end; $$;

create or replace function public.afat_atlas_knowledge_gaps(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('map.sources.view')) then
    raise exception 'Insufficient Atlas access';
  end if;

  select jsonb_build_object(
    'summary',jsonb_build_object(
      'low_confidence_edges',(select count(*) from public.afat_atlas_edges where status='active' and confidence<55),
      'stale_edges',(select count(*) from public.afat_atlas_edges where status='active' and last_observed_at<now()-interval '30 days'),
      'candidate_features',(select count(*) from public.afat_candidate_features where status in ('candidate','corroborated')),
      'weak_places',(select count(*) from public.afat_places where status<>'rejected' and (base_confidence<60 or last_verified_at is null)),
      'pickup_failures',(select coalesce(sum(failed_pickups),0) from public.afat_meeting_points where status='active')
    ),
    'edges',coalesce((
      select jsonb_agg(x order by priority desc)
      from (
        select jsonb_build_object('id',e.id,'name',coalesce(e.canonical_name,'Unnamed segment'),'confidence',e.confidence,'last_observed_at',e.last_observed_at,'access_modes',e.access_modes,'evidence_status',e.evidence_status,
          'reason',case when e.confidence<45 then 'low_confidence' when e.last_observed_at<now()-interval '60 days' then 'stale' else 'needs_corroboration' end) x,
          ((100-e.confidence)+least(50,extract(epoch from(now()-e.last_observed_at))/86400)) priority
        from public.afat_atlas_edges e
        where e.status='active' and (e.confidence<60 or e.last_observed_at<now()-interval '30 days')
        order by priority desc limit greatest(1,least(coalesce(p_limit,50),200))
      ) q
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'feature_type',c.feature_type,'movement_mode',c.movement_mode,'evidence_count',c.evidence_count,'unique_contributors',c.unique_contributors,'confidence',c.confidence,'status',c.status,'last_observed_at',c.last_observed_at) order by c.last_observed_at desc)
      from (select * from public.afat_candidate_features where status in ('candidate','corroborated') order by last_observed_at desc limit greatest(1,least(coalesce(p_limit,50),200))) c
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;

revoke all on function public.afat_start_contribution_session(text,text,text,uuid,jsonb) from public,anon;
revoke all on function public.afat_ingest_contribution_sample(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text) from public,anon;
revoke all on function public.afat_complete_contribution_session(uuid) from public,anon;
revoke all on function public.afat_atlas_knowledge_gaps(integer) from public,anon;

grant execute on function public.afat_start_contribution_session(text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.afat_ingest_contribution_sample(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.afat_complete_contribution_session(uuid) to authenticated;
grant execute on function public.afat_atlas_knowledge_gaps(integer) to authenticated;

comment on table public.afat_contribution_sessions is 'Consent-bound non-booking and field-mapping movement sessions. Raw traces are evidence and never directly become routable Atlas truth.';
comment on table public.afat_candidate_features is 'Reviewable candidate geography derived from quality-controlled AFAT evidence. Candidates require corroboration/review before promotion into canonical routing.';
