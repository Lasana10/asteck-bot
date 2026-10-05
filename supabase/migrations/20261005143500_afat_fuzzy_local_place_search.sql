create or replace function public.afat_search_places(p_city_key text default 'cm-yaounde'::text,p_query text default ''::text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_city public.afat_city_profiles%rowtype; v_q text=lower(btrim(coalesce(p_query,'')));
begin
  if length(v_q)<2 then return jsonb_build_object('places','[]'::jsonb); end if;
  if length(v_q)>120 then raise exception 'Query too long'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object('places',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,'place_type',p.place_type,
      'latitude',p.latitude,'longitude',p.longitude,'status',p.status,'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,
      'vehicle_access',p.vehicle_access,'base_confidence',p.base_confidence,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),
      'source_key',p.primary_source_key,'match_reason',p.match_reason,'match_similarity',round(p.match_similarity::numeric,3)
    ) order by p.score desc,p.canonical_name)
    from (
      select p.*,
        greatest(similarity(lower(p.canonical_name),v_q),similarity(lower(coalesce(p.zone_label,'')),v_q),coalesce((select max(similarity(lower(a),v_q)) from unnest(coalesce(p.aliases,'{}'::text[])) a),0)) match_similarity,
        case
          when lower(p.canonical_name)=v_q then 'exact_name'
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a)=v_q) then 'exact_alias'
          when lower(p.canonical_name) like v_q||'%' then 'name_prefix'
          when lower(p.canonical_name) like '%'||v_q||'%' then 'name_contains'
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a) like '%'||v_q||'%') then 'alias_contains'
          when lower(coalesce(p.zone_label,''))=v_q then 'exact_zone'
          when lower(coalesce(p.zone_label,'')) like '%'||v_q||'%' then 'zone_contains'
          when lower(p.canonical_name) % v_q then 'fuzzy_name'
          when lower(coalesce(p.zone_label,'')) % v_q then 'fuzzy_zone'
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where similarity(lower(a),v_q)>=0.36) then 'fuzzy_alias'
          else 'description_contains' end match_reason,
        case
          when lower(p.canonical_name)=v_q then 140
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a)=v_q) then 135
          when lower(p.canonical_name) like v_q||'%' then 120
          when lower(p.canonical_name) like '%'||v_q||'%' then 105
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a) like '%'||v_q||'%') then 100
          when lower(coalesce(p.zone_label,''))=v_q then 92
          when lower(coalesce(p.zone_label,'')) like '%'||v_q||'%' then 78
          when lower(p.canonical_name) % v_q then 70+round(similarity(lower(p.canonical_name),v_q)*20)::int
          when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where similarity(lower(a),v_q)>=0.36) then 68+round(coalesce((select max(similarity(lower(a),v_q)) from unnest(coalesce(p.aliases,'{}'::text[])) a),0)*20)::int
          when lower(coalesce(p.zone_label,'')) % v_q then 55+round(similarity(lower(coalesce(p.zone_label,'')),v_q)*20)::int
          when lower(coalesce(p.description,'')) like '%'||v_q||'%' then 35 else 0 end
          +least(20,coalesce(p.base_confidence,0)/5) score
      from public.afat_places p
      where lower(p.city)=lower(v_city.city_name) and p.status<>'retired' and (
        lower(p.canonical_name) like '%'||v_q||'%' or lower(p.canonical_name) % v_q
        or exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a) like '%'||v_q||'%' or similarity(lower(a),v_q)>=0.36)
        or lower(coalesce(p.zone_label,'')) like '%'||v_q||'%' or lower(coalesce(p.zone_label,'')) % v_q
        or lower(coalesce(p.description,'')) like '%'||v_q||'%'
      )
      order by score desc,p.canonical_name limit greatest(1,least(coalesce(p_limit,20),50))
    ) p
  ),'[]'::jsonb));
end $$;
revoke all on function public.afat_search_places(text,text,integer) from public;
grant execute on function public.afat_search_places(text,text,integer) to anon,authenticated;
