create table if not exists public.afat_navigation_privacy_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  learning_opt_in boolean not null default false,
  raw_retention_days integer not null default 7 check (raw_retention_days between 1 and 30),
  updated_at timestamptz not null default now()
);

alter table public.afat_navigation_sessions
  add column if not exists learning_consent boolean not null default false,
  add column if not exists retention_until timestamptz;

alter table public.afat_navigation_privacy_preferences enable row level security;
revoke insert,update,delete on public.afat_navigation_privacy_preferences from anon,authenticated;
grant select on public.afat_navigation_privacy_preferences to authenticated;

drop policy if exists afat_navigation_privacy_owner_read on public.afat_navigation_privacy_preferences;
create policy afat_navigation_privacy_owner_read on public.afat_navigation_privacy_preferences for select to authenticated using (profile_id=auth.uid());

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

create index if not exists afat_navigation_sessions_retention_idx on public.afat_navigation_sessions(retention_until) where retention_until is not null;

revoke all on function public.afat_set_navigation_privacy_preferences(boolean,integer) from public,anon;
grant execute on function public.afat_set_navigation_privacy_preferences(boolean,integer) to authenticated;
