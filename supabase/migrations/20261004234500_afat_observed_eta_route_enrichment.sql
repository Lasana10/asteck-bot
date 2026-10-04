create or replace function public.afat_enrich_route_eta(p_route jsonb,p_mode text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_day text:=case when extract(isodow from timezone('Africa/Douala',p_at)) in (6,7) then 'weekend' else 'weekday' end;
  v_hour smallint:=extract(hour from timezone('Africa/Douala',p_at))::smallint;
  v_segments integer:=0; v_covered integer:=0; v_eta numeric:=0; v_min_conf numeric:=null; v_result jsonb:=p_route;
begin
  if p_route is null or p_route->>'status'<>'ok' or jsonb_typeof(p_route->'segments')<>'array' then return p_route; end if;
  with seg as (
    select (s->>'edge_id')::uuid edge_id,coalesce(nullif(s->>'distance_m','')::numeric,0) distance_m
    from jsonb_array_elements(p_route->'segments') s where nullif(s->>'edge_id','') is not null
  ), picked as (
    select seg.*,sp.median_speed_kph,sp.confidence
    from seg
    left join lateral (
      select p.median_speed_kph,p.confidence
      from public.afat_corridor_speed_profiles p
      where p.atlas_edge_id=seg.edge_id and p.movement_mode=p_mode
        and p.sample_count>=5 and p.evidence_status in ('corroborated','field_verified')
        and p.median_speed_kph is not null and p.median_speed_kph>0
        and p.weather_state='any'
        and p.day_type in (v_day,'all')
        and (p.hour_bucket=v_hour or p.hour_bucket is null)
      order by (p.day_type=v_day) desc,(p.hour_bucket=v_hour) desc,p.confidence desc,p.sample_count desc
      limit 1
    ) sp on true
  )
  select count(*),count(median_speed_kph),coalesce(sum(case when median_speed_kph is not null then distance_m/(median_speed_kph*1000/3600) else 0 end),0),min(confidence)
  into v_segments,v_covered,v_eta,v_min_conf from picked;

  if v_segments>0 and v_covered=v_segments and v_eta>0 then
    v_result:=jsonb_set(v_result,'{eta_seconds}',to_jsonb(ceil(v_eta)::integer),true);
    v_result:=jsonb_set(v_result,'{eta_reason}',to_jsonb('observed_corridor_profiles'::text),true);
    v_result:=jsonb_set(v_result,'{eta_profile_coverage}',to_jsonb(1.0::numeric),true);
    v_result:=jsonb_set(v_result,'{eta_profile_min_confidence}',to_jsonb(coalesce(v_min_conf,0)),true);
    v_result:=jsonb_set(v_result,'{eta_day_type}',to_jsonb(v_day),true);
    v_result:=jsonb_set(v_result,'{eta_hour_bucket}',to_jsonb(v_hour),true);
  else
    v_result:=jsonb_set(v_result,'{eta_seconds}','null'::jsonb,true);
    v_result:=jsonb_set(v_result,'{eta_reason}',to_jsonb(case when v_segments=0 then 'route_has_no_profileable_segments' else 'trusted_speed_profile_required' end),true);
    v_result:=jsonb_set(v_result,'{eta_profile_coverage}',to_jsonb(case when v_segments>0 then round(v_covered::numeric/v_segments,3) else 0 end),true);
  end if;
  return v_result;
end $$;

do $$
begin
  if to_regprocedure('public.afat_route_canonical_base(double precision,double precision,double precision,double precision,text,integer)') is null
     and to_regprocedure('public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer)') is not null then
    alter function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) rename to afat_route_canonical_base;
  end if;
end $$;

create or replace function public.afat_route_canonical(
  p_origin_lat double precision,
  p_origin_lon double precision,
  p_destination_lat double precision,
  p_destination_lon double precision,
  p_mode text,
  p_snap_radius_m integer
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_route jsonb;
begin
  v_route:=public.afat_route_canonical_base(p_origin_lat,p_origin_lon,p_destination_lat,p_destination_lon,p_mode,p_snap_radius_m);
  return public.afat_enrich_route_eta(v_route,p_mode,now());
end $$;

revoke all on function public.afat_enrich_route_eta(jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.afat_route_canonical_base(double precision,double precision,double precision,double precision,text,integer) from public,anon,authenticated;
revoke all on function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) from public,anon;
grant execute on function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) to authenticated,service_role;