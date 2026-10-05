create table if not exists public.afat_mobility_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_modes text[] not null default '{}'::text[],
  avoided_modes text[] not null default '{}'::text[],
  optimization text not null default 'reliability' check (optimization in ('reliability','time','low_walk','balanced')),
  max_walk_m integer not null default 1200 check (max_walk_m between 100 and 10000),
  accessibility jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.afat_mobility_preferences enable row level security;
revoke insert,update,delete on public.afat_mobility_preferences from anon,authenticated;
grant select on public.afat_mobility_preferences to authenticated;
drop policy if exists afat_mobility_preferences_owner_read on public.afat_mobility_preferences;
create policy afat_mobility_preferences_owner_read on public.afat_mobility_preferences for select to authenticated using (profile_id=auth.uid());

create or replace function public.afat_set_mobility_preferences(
  p_preferred_modes text[] default '{}'::text[],
  p_avoided_modes text[] default '{}'::text[],
  p_optimization text default 'reliability',
  p_max_walk_m integer default 1200,
  p_accessibility jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_allowed text[]:=array['walk','bike','moto','car','minibus'];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_optimization not in ('reliability','time','low_walk','balanced') then raise exception 'OPTIMIZATION_INVALID'; end if;
  if p_max_walk_m not between 100 and 10000 then raise exception 'MAX_WALK_INVALID'; end if;
  if exists(select 1 from unnest(coalesce(p_preferred_modes,'{}'::text[])) m where not (m=any(v_allowed)))
     or exists(select 1 from unnest(coalesce(p_avoided_modes,'{}'::text[])) m where not (m=any(v_allowed))) then raise exception 'MODE_INVALID'; end if;
  insert into public.afat_mobility_preferences(profile_id,preferred_modes,avoided_modes,optimization,max_walk_m,accessibility,updated_at)
  values(v_uid,coalesce(p_preferred_modes,'{}'::text[]),coalesce(p_avoided_modes,'{}'::text[]),p_optimization,p_max_walk_m,coalesce(p_accessibility,'{}'::jsonb),now())
  on conflict(profile_id) do update set preferred_modes=excluded.preferred_modes,avoided_modes=excluded.avoided_modes,optimization=excluded.optimization,max_walk_m=excluded.max_walk_m,accessibility=excluded.accessibility,updated_at=now();
  return jsonb_build_object('preferred_modes',coalesce(p_preferred_modes,'{}'::text[]),'avoided_modes',coalesce(p_avoided_modes,'{}'::text[]),'optimization',p_optimization,'max_walk_m',p_max_walk_m,'accessibility',coalesce(p_accessibility,'{}'::jsonb),'updated_at',now());
end $$;

create or replace function public.afat_rank_mobility_options(p_place_id uuid,p_origin_lat double precision,p_origin_lon double precision,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_pref public.afat_mobility_preferences%rowtype; v_mode text; v_assessment jsonb; v_score numeric; v_eta numeric; v_distance numeric; v_items jsonb:='[]'::jsonb; v_ranked jsonb; v_top jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_pref from public.afat_mobility_preferences where profile_id=v_uid;
  if not found then v_pref.preferred_modes:='{}'::text[]; v_pref.avoided_modes:='{}'::text[]; v_pref.optimization:='reliability'; v_pref.max_walk_m:=1200; v_pref.accessibility:='{}'::jsonb; end if;
  foreach v_mode in array array['walk','moto','car','minibus'] loop
    v_assessment:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,v_mode,p_at);
    if coalesce(v_assessment->>'state','') like 'reachable%' then
      v_eta:=nullif(v_assessment->>'eta_seconds','')::numeric; v_distance:=nullif(v_assessment->>'route_distance_m','')::numeric; v_score:=coalesce((v_assessment->>'reliability_score')::numeric,0);
      if v_mode=any(coalesce(v_pref.preferred_modes,'{}'::text[])) then v_score:=v_score+12; end if;
      if v_mode=any(coalesce(v_pref.avoided_modes,'{}'::text[])) then v_score:=v_score-35; end if;
      if v_mode='walk' and v_distance is not null and v_distance>v_pref.max_walk_m then v_score:=v_score-40; end if;
      if v_pref.optimization='time' and v_eta is not null then v_score:=v_score+greatest(0,25-least(25,v_eta/120)); end if;
      if v_pref.optimization='low_walk' and v_mode<>'walk' then v_score:=v_score+8; end if;
      if v_pref.optimization='balanced' then v_score:=v_score+case when v_eta is not null then 5 else 0 end; end if;
      v_items:=v_items||jsonb_build_array(jsonb_build_object('mode',v_mode,'score',round(greatest(0,least(100,v_score)),1),'assessment',v_assessment,'preferred',v_mode=any(coalesce(v_pref.preferred_modes,'{}'::text[])),'avoided',v_mode=any(coalesce(v_pref.avoided_modes,'{}'::text[])),'walk_limit_exceeded',(v_mode='walk' and v_distance is not null and v_distance>v_pref.max_walk_m)));
    end if;
  end loop;
  select coalesce(jsonb_agg(value order by (value->>'score')::numeric desc),'[]'::jsonb) into v_ranked from jsonb_array_elements(v_items);
  v_top:=v_ranked->0;
  return jsonb_build_object('place_id',p_place_id,'optimization',v_pref.optimization,'max_walk_m',v_pref.max_walk_m,'options',v_ranked,'recommended',v_top,'recommendation_basis','evidence_and_explicit_preferences','raw_movement_history_used',false,'automatic_truth',false,'assessed_at',p_at);
end $$;

revoke all on function public.afat_set_mobility_preferences(text[],text[],text,integer,jsonb) from public,anon;
revoke all on function public.afat_rank_mobility_options(uuid,double precision,double precision,timestamptz) from public,anon;
grant execute on function public.afat_set_mobility_preferences(text[],text[],text,integer,jsonb) to authenticated;
grant execute on function public.afat_rank_mobility_options(uuid,double precision,double precision,timestamptz) to authenticated;