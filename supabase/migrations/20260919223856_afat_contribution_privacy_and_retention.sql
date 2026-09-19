-- Source-controlled copy of production migration 20260919223856

create table if not exists public.afat_privacy_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  raw_trace_retention_days integer not null default 30 check (raw_trace_retention_days between 7 and 365),
  protect_sensitive_endpoints boolean not null default true,
  allow_aggregate_learning boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.afat_privacy_preferences enable row level security;

drop policy if exists afat_privacy_preferences_own_read on public.afat_privacy_preferences;
create policy afat_privacy_preferences_own_read
on public.afat_privacy_preferences for select to authenticated
using (profile_id=(select auth.uid()));

grant select on public.afat_privacy_preferences to authenticated;

create or replace function public.afat_set_privacy_preferences(
  p_raw_trace_retention_days integer default 30,
  p_protect_sensitive_endpoints boolean default true,
  p_allow_aggregate_learning boolean default true
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_raw_trace_retention_days<7 or p_raw_trace_retention_days>365 then raise exception 'Retention must be between 7 and 365 days'; end if;

  insert into public.afat_privacy_preferences(
    profile_id,raw_trace_retention_days,protect_sensitive_endpoints,allow_aggregate_learning,updated_at
  ) values (
    v_uid,p_raw_trace_retention_days,p_protect_sensitive_endpoints,p_allow_aggregate_learning,now()
  )
  on conflict(profile_id) do update set
    raw_trace_retention_days=excluded.raw_trace_retention_days,
    protect_sensitive_endpoints=excluded.protect_sensitive_endpoints,
    allow_aggregate_learning=excluded.allow_aggregate_learning,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',v_uid,'raw_trace_retention_days',p_raw_trace_retention_days,
    'protect_sensitive_endpoints',p_protect_sensitive_endpoints,
    'allow_aggregate_learning',p_allow_aggregate_learning
  );
end; $$;

create or replace function public.afat_my_privacy_snapshot()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_pref public.afat_privacy_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_pref from public.afat_privacy_preferences where profile_id=v_uid;
  return jsonb_build_object(
    'preferences',jsonb_build_object(
      'raw_trace_retention_days',coalesce(v_pref.raw_trace_retention_days,30),
      'protect_sensitive_endpoints',coalesce(v_pref.protect_sensitive_endpoints,true),
      'allow_aggregate_learning',coalesce(v_pref.allow_aggregate_learning,true)
    ),
    'raw_samples',(select count(*) from public.afat_contribution_samples where contributor_id=v_uid),
    'sessions',(select count(*) from public.afat_contribution_sessions where contributor_id=v_uid),
    'completed_sessions',(select count(*) from public.afat_contribution_sessions where contributor_id=v_uid and status='completed'),
    'mapping_observations',(select count(*) from public.afat_mapping_observations where contributor_id=v_uid),
    'reputation',(select jsonb_build_object(
      'score',reputation_score,'trust_level',trust_level,'completed_sessions',completed_sessions,
      'verified_distance_m',verified_distance_m
    ) from public.afat_contributor_reputation where profile_id=v_uid)
  );
end; $$;

create or replace function public.afat_delete_my_raw_session(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_session public.afat_contribution_sessions%rowtype; v_deleted integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.afat_contribution_sessions
  where id=p_session_id and contributor_id=v_uid
  for update;
  if not found then raise exception 'Contribution session not found'; end if;
  if v_session.status='active' then raise exception 'Finish or discard the active session before deleting raw trace data'; end if;

  update public.afat_atlas_observations
  set evidence=(evidence - 'session_id' - 'sample_id')||jsonb_build_object('raw_trace_deleted',true)
  where evidence->>'session_id'=p_session_id::text
    and (observer_id=v_uid or observer_id is null);

  delete from public.afat_contribution_samples where session_id=p_session_id;
  get diagnostics v_deleted=row_count;

  update public.afat_contribution_sessions
  set metadata=metadata||jsonb_build_object('raw_trace_deleted',true,'raw_trace_deleted_at',now()),
      sample_count=0,matched_sample_count=0,updated_at=now()
  where id=p_session_id;

  return jsonb_build_object('session_id',p_session_id,'raw_samples_deleted',v_deleted,'derived_aggregate_evidence_retained',true);
end; $$;

create or replace function public.afat_purge_expired_raw_contributions()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_session record; v_sessions integer:=0; v_samples integer:=0; v_n integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('system.configure') then raise exception 'System configuration permission required'; end if;

  for v_session in
    select s.id,s.contributor_id
    from public.afat_contribution_sessions s
    left join public.afat_privacy_preferences p on p.profile_id=s.contributor_id
    where s.status in ('completed','discarded')
      and coalesce(s.ended_at,s.updated_at)<now()-(coalesce(p.raw_trace_retention_days,30)||' days')::interval
      and coalesce((s.metadata->>'raw_trace_deleted')::boolean,false)=false
  loop
    update public.afat_atlas_observations
    set evidence=(evidence - 'session_id' - 'sample_id')||jsonb_build_object('raw_trace_expired',true)
    where evidence->>'session_id'=v_session.id::text;

    delete from public.afat_contribution_samples where session_id=v_session.id;
    get diagnostics v_n=row_count;
    v_samples:=v_samples+v_n;

    update public.afat_contribution_sessions
    set metadata=metadata||jsonb_build_object('raw_trace_deleted',true,'raw_trace_deleted_at',now(),'deletion_reason','retention_policy'),
        sample_count=0,matched_sample_count=0,updated_at=now()
    where id=v_session.id;
    v_sessions:=v_sessions+1;
  end loop;

  return jsonb_build_object('sessions_purged',v_sessions,'raw_samples_deleted',v_samples);
end; $$;

revoke all on function public.afat_set_privacy_preferences(integer,boolean,boolean) from public,anon;
revoke all on function public.afat_my_privacy_snapshot() from public,anon;
revoke all on function public.afat_delete_my_raw_session(uuid) from public,anon;
revoke all on function public.afat_purge_expired_raw_contributions() from public,anon;

grant execute on function public.afat_set_privacy_preferences(integer,boolean,boolean) to authenticated;
grant execute on function public.afat_my_privacy_snapshot() to authenticated;
grant execute on function public.afat_delete_my_raw_session(uuid) to authenticated;
grant execute on function public.afat_purge_expired_raw_contributions() to authenticated;

