alter table public.afat_navigation_samples add column if not exists idempotency_key text;
alter table public.afat_navigation_samples add column if not exists quality_score numeric;

create unique index if not exists afat_navigation_samples_session_idempotency_idx
on public.afat_navigation_samples(session_id,idempotency_key)
where idempotency_key is not null;

create or replace function public.afat_ingest_navigation_sample_v2(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_kph numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_uid uuid:=auth.uid();
  v_session public.afat_navigation_sessions%rowtype;
  v_existing public.afat_navigation_samples%rowtype;
  v_previous public.afat_navigation_samples%rowtype;
  v_sample_id uuid;
  v_recorded_at timestamptz:=coalesce(p_recorded_at,now());
  v_quality numeric;
  v_distance numeric:=0;
  v_elapsed_seconds numeric:=0;
  v_implied_speed numeric:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.afat_navigation_sessions where id=p_session_id and profile_id=v_uid for update;
  if not found then raise exception 'Navigation session not found'; end if;
  if v_session.status<>'active' then raise exception 'Navigation session is not active'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid sample coordinates required'; end if;

  if nullif(trim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_existing from public.afat_navigation_samples
    where session_id=p_session_id and idempotency_key=p_idempotency_key;
    if found then
      return jsonb_build_object('sample_id',v_existing.id,'session_id',p_session_id,'accepted',true,'replayed',true,'quality_score',v_existing.quality_score);
    end if;
  end if;

  if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>150) then
    return jsonb_build_object('session_id',p_session_id,'accepted',false,'replayed',false,'reason','gps_accuracy_too_broad');
  end if;
  if p_speed_kph is not null and (p_speed_kph<0 or p_speed_kph>190) then
    return jsonb_build_object('session_id',p_session_id,'accepted',false,'replayed',false,'reason','implausible_reported_speed');
  end if;
  if p_heading is not null and (p_heading<0 or p_heading>=360) then
    p_heading:=null;
  end if;

  v_quality:=greatest(0.15,least(1.0,1.0-(coalesce(p_accuracy_m,45)::numeric/180.0)));

  select * into v_previous
  from public.afat_navigation_samples
  where session_id=p_session_id
  order by recorded_at desc
  limit 1;

  if found then
    v_elapsed_seconds:=extract(epoch from (v_recorded_at-v_previous.recorded_at));
    if v_elapsed_seconds<=0 then
      return jsonb_build_object('session_id',p_session_id,'accepted',false,'replayed',false,'reason','non_monotonic_timestamp');
    end if;
    v_distance:=extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(v_previous.longitude,v_previous.latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography
    );
    v_implied_speed:=(v_distance/v_elapsed_seconds)*3.6;
    if v_elapsed_seconds<120 and v_implied_speed>220 then
      return jsonb_build_object('session_id',p_session_id,'accepted',false,'replayed',false,'reason','gps_jump','distance_m',round(v_distance,1),'implied_speed_kph',round(v_implied_speed,1));
    end if;
    if v_distance<3 and v_elapsed_seconds<20 and coalesce(p_speed_kph,0)<3 then
      return jsonb_build_object('session_id',p_session_id,'accepted',false,'replayed',false,'reason','stationary_duplicate');
    end if;
  end if;

  insert into public.afat_navigation_samples(
    session_id,profile_id,latitude,longitude,accuracy_m,speed_kph,heading,recorded_at,source,evidence,idempotency_key,quality_score
  ) values (
    p_session_id,v_uid,p_latitude,p_longitude,p_accuracy_m,p_speed_kph,p_heading,v_recorded_at,'browser_geolocation',
    jsonb_build_object('automatic_truth',false,'source','browser_geolocation','quality_score',round(v_quality,3),'client_retry_safe',true),
    nullif(trim(coalesce(p_idempotency_key,'')),''),v_quality
  ) returning id into v_sample_id;

  update public.afat_navigation_sessions
  set sample_count=sample_count+1,last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy_m=p_accuracy_m,last_recorded_at=v_recorded_at,updated_at=now()
  where id=p_session_id;

  return jsonb_build_object('sample_id',v_sample_id,'session_id',p_session_id,'accepted',true,'replayed',false,'quality_score',round(v_quality,3),'step_distance_m',round(v_distance,1));
exception
  when unique_violation then
    select * into v_existing from public.afat_navigation_samples where session_id=p_session_id and idempotency_key=p_idempotency_key;
    return jsonb_build_object('sample_id',v_existing.id,'session_id',p_session_id,'accepted',true,'replayed',true,'quality_score',v_existing.quality_score);
end $$;

revoke all on function public.afat_ingest_navigation_sample_v2(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text) from public,anon;
grant execute on function public.afat_ingest_navigation_sample_v2(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text) to authenticated;