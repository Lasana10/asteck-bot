create table if not exists public.afat_navigation_privacy_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  learning_opt_in boolean not null default false,
  raw_retention_days integer not null default 7 check (raw_retention_days between 1 and 30),
  updated_at timestamptz not null default now()
);
alter table public.afat_navigation_privacy_preferences enable row level security;
revoke insert,update,delete on public.afat_navigation_privacy_preferences from anon,authenticated;
grant select on public.afat_navigation_privacy_preferences to authenticated;
drop policy if exists afat_navigation_privacy_owner_read on public.afat_navigation_privacy_preferences;
create policy afat_navigation_privacy_owner_read on public.afat_navigation_privacy_preferences for select to authenticated using (profile_id=auth.uid());

alter table public.afat_navigation_sessions add column if not exists learning_consent boolean not null default false;
alter table public.afat_navigation_sessions add column if not exists retention_until timestamptz;

create or replace function public.afat_set_navigation_privacy_preferences(p_learning_opt_in boolean,p_raw_retention_days integer default 7)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_raw_retention_days not between 1 and 30 then raise exception 'Retention must be between 1 and 30 days'; end if;
  insert into public.afat_navigation_privacy_preferences(profile_id,learning_opt_in,raw_retention_days,updated_at)
  values(v_uid,coalesce(p_learning_opt_in,false),p_raw_retention_days,now())
  on conflict(profile_id) do update set learning_opt_in=excluded.learning_opt_in,raw_retention_days=excluded.raw_retention_days,updated_at=now();
  return jsonb_build_object('learning_opt_in',coalesce(p_learning_opt_in,false),'raw_retention_days',p_raw_retention_days,'updated_at',now());
end $$;

create or replace function public.afat_apply_navigation_privacy()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_pref public.afat_navigation_privacy_preferences%rowtype;
begin
  select * into v_pref from public.afat_navigation_privacy_preferences where profile_id=new.profile_id;
  new.learning_consent:=coalesce(v_pref.learning_opt_in,false);
  new.retention_until:=coalesce(new.retention_until,now()+make_interval(days=>coalesce(v_pref.raw_retention_days,7)));
  new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('learning_consent',new.learning_consent,'raw_retention_days',coalesce(v_pref.raw_retention_days,7),'automatic_truth',false);
  return new;
end $$;
drop trigger if exists trg_afat_navigation_privacy on public.afat_navigation_sessions;
create trigger trg_afat_navigation_privacy before insert on public.afat_navigation_sessions for each row execute function public.afat_apply_navigation_privacy();

do $$
begin
  if to_regprocedure('public.afat_learn_navigation_session_unchecked(uuid)') is null
     and to_regprocedure('public.afat_learn_navigation_session(uuid)') is not null then
    alter function public.afat_learn_navigation_session(uuid) rename to afat_learn_navigation_session_unchecked;
  end if;
end $$;

create or replace function public.afat_learn_navigation_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_session public.afat_navigation_sessions%rowtype;
begin
  select * into v_session from public.afat_navigation_sessions where id=p_session_id;
  if not found then return jsonb_build_object('learned',false,'reason','session_not_found'); end if;
  if not coalesce(v_session.learning_consent,false) then return jsonb_build_object('learned',false,'reason','learning_not_consented'); end if;
  return public.afat_learn_navigation_session_unchecked(p_session_id);
end $$;

create or replace function public.afat_navigation_learning_trigger()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
begin
  if old.status is distinct from new.status and new.status='arrived' and coalesce(new.learning_consent,false) then
    begin perform public.afat_learn_navigation_session(new.id); exception when others then null; end;
  end if;
  return new;
end $$;

drop trigger if exists trg_afat_navigation_learning on public.afat_navigation_sessions;
create trigger trg_afat_navigation_learning after update of status on public.afat_navigation_sessions for each row execute function public.afat_navigation_learning_trigger();

create or replace function public.afat_purge_expired_navigation_evidence(p_limit integer default 5000)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_deleted integer:=0; v_sessions integer:=0;
begin
  with doomed as (
    select s.id from public.afat_navigation_samples s
    join public.afat_navigation_sessions n on n.id=s.session_id
    where n.retention_until is not null and n.retention_until<now() and n.status<>'active'
    order by n.retention_until asc limit greatest(1,least(coalesce(p_limit,5000),20000))
  )
  delete from public.afat_navigation_samples s using doomed d where s.id=d.id;
  get diagnostics v_deleted=row_count;
  update public.afat_navigation_sessions
  set last_latitude=null,last_longitude=null,last_accuracy_m=null,last_recorded_at=null,
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('raw_location_purged_at',now()),updated_at=now()
  where retention_until is not null and retention_until<now() and status<>'active'
    and (last_latitude is not null or last_longitude is not null);
  get diagnostics v_sessions=row_count;
  return jsonb_build_object('deleted_samples',v_deleted,'sessions_scrubbed',v_sessions,'purged_at',now());
end $$;

revoke all on function public.afat_set_navigation_privacy_preferences(boolean,integer) from public,anon;
grant execute on function public.afat_set_navigation_privacy_preferences(boolean,integer) to authenticated;
revoke all on function public.afat_learn_navigation_session(uuid) from public,anon,authenticated;
revoke all on function public.afat_learn_navigation_session_unchecked(uuid) from public,anon,authenticated,service_role;
revoke all on function public.afat_purge_expired_navigation_evidence(integer) from public,anon,authenticated;
grant execute on function public.afat_purge_expired_navigation_evidence(integer) to service_role;