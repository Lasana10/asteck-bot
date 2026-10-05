create or replace function public.afat_rank_mobility_options(
  p_place_id uuid,
  p_origin_lat double precision,
  p_origin_lon double precision,
  p_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_uid uuid:=auth.uid(); v_pref public.afat_mobility_preferences%rowtype; v_mode text;
  v_assessment jsonb; v_condition jsonb; v_score numeric; v_eta numeric; v_distance numeric;
  v_items jsonb:='[]'::jsonb; v_ranked jsonb; v_top jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_pref from public.afat_mobility_preferences where profile_id=v_uid;
  if not found then v_pref.preferred_modes:='{}'::text[]; v_pref.avoided_modes:='{}'::text[]; v_pref.optimization:='reliability'; v_pref.max_walk_m:=1200; v_pref.accessibility:='{}'::jsonb; end if;
  foreach v_mode in array array['walk','moto','car','minibus'] loop
    v_assessment:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,v_mode,p_at);
    if coalesce(v_assessment->>'state','') like 'reachable%' then
      v_condition:=public.afat_assess_route_conditions(p_place_id,p_origin_lat,p_origin_lon,v_mode,p_at);
      v_eta:=nullif(v_assessment->>'eta_seconds','')::numeric;
      v_distance:=nullif(v_assessment->>'route_distance_m','')::numeric;
      v_score:=coalesce((v_condition->>'adjusted_reliability_score')::numeric,(v_assessment->>'reliability_score')::numeric,0);
      if v_mode=any(coalesce(v_pref.preferred_modes,'{}'::text[])) then v_score:=v_score+12; end if;
      if v_mode=any(coalesce(v_pref.avoided_modes,'{}'::text[])) then v_score:=v_score-35; end if;
      if v_mode='walk' and v_distance is not null and v_distance>v_pref.max_walk_m then v_score:=v_score-40; end if;
      if v_pref.optimization='time' and v_eta is not null then v_score:=v_score+greatest(0,25-least(25,v_eta/120)); end if;
      if v_pref.optimization='low_walk' and v_mode<>'walk' then v_score:=v_score+8; end if;
      if v_pref.optimization='balanced' then v_score:=v_score+case when v_eta is not null then 5 else 0 end; end if;
      v_items:=v_items||jsonb_build_array(jsonb_build_object(
        'mode',v_mode,'score',round(greatest(0,least(100,v_score)),1),
        'assessment',v_assessment,'condition_assessment',v_condition,
        'preferred',v_mode=any(coalesce(v_pref.preferred_modes,'{}'::text[])),
        'avoided',v_mode=any(coalesce(v_pref.avoided_modes,'{}'::text[])),
        'walk_limit_exceeded',(v_mode='walk' and v_distance is not null and v_distance>v_pref.max_walk_m)
      ));
    end if;
  end loop;
  select coalesce(jsonb_agg(value order by (value->>'score')::numeric desc),'[]'::jsonb) into v_ranked from jsonb_array_elements(v_items);
  v_top:=v_ranked->0;
  return jsonb_build_object(
    'place_id',p_place_id,'optimization',v_pref.optimization,'max_walk_m',v_pref.max_walk_m,
    'options',v_ranked,'recommended',v_top,
    'recommendation_basis','reachability_environment_and_explicit_preferences',
    'raw_movement_history_used',false,'automatic_truth',false,'assessed_at',p_at
  );
end $$;
revoke all on function public.afat_rank_mobility_options(uuid,double precision,double precision,timestamptz) from public,anon;
grant execute on function public.afat_rank_mobility_options(uuid,double precision,double precision,timestamptz) to authenticated;
