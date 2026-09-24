create table if not exists public.afat_conflation_suggestions(
 id uuid primary key default gen_random_uuid(),
 city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
 left_source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
 right_source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
 suggestion_type text not null check(suggestion_type in ('duplicate_candidate','position_disagreement','strong_location_disagreement')),
 distance_m numeric not null,
 name_match boolean not null default false,
 independence_factor numeric not null default 1 check(independence_factor between 0 and 1),
 confidence numeric not null default 50 check(confidence between 0 and 100),
 status text not null default 'open' check(status in ('open','accepted','rejected','superseded')),
 evidence jsonb not null default '{}'::jsonb,
 fingerprint text not null unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists afat_conflation_suggestions_city_status_idx on public.afat_conflation_suggestions(city_profile_id,status,confidence desc);
create index if not exists afat_conflation_suggestions_left_idx on public.afat_conflation_suggestions(left_source_record_id);
create index if not exists afat_conflation_suggestions_right_idx on public.afat_conflation_suggestions(right_source_record_id);
alter table public.afat_conflation_suggestions enable row level security;
revoke all on public.afat_conflation_suggestions from anon,authenticated;

CREATE OR REPLACE FUNCTION public.afat_build_city_model(p_city_key text DEFAULT 'cm-yaounde'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid()); a jsonb;b jsonb;c jsonb;d jsonb;e jsonb;f jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
 a:=public.afat_refresh_city_source_relevance(p_city_key);
 b:=public.afat_refresh_source_intelligence(p_city_key,300);
 c:=public.afat_refresh_source_reliability_matrix(p_city_key);
 d:=public.afat_refresh_operational_map_learning(p_city_key);
 e:=public.afat_refresh_environment_overlays(p_city_key);
 f:=public.afat_refresh_cross_source_disagreements(p_city_key,750);
 perform public.afat_refresh_canonical_independence(p_city_key);
 perform public.afat_generate_source_verification_missions(p_city_key,20);
 return jsonb_build_object(
  'city_key',p_city_key,'relevance',a,'source_intelligence',b,'reliability',c,
  'operational_learning',d,'environment',e,'cross_source',f,'snapshot',public.afat_city_model_snapshot(p_city_key)
 );
end; $function$
;

CREATE OR REPLACE FUNCTION public.afat_refresh_cross_source_disagreements(p_city_key text DEFAULT 'cm-yaounde'::text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=(select auth.uid());
 v_city public.afat_city_profiles%rowtype;
 v_rows int:=0;
 v_gaps int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Source intelligence permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'City profile not found'; end if;
 p_limit:=greatest(25,least(coalesce(p_limit,500),3000));

 with candidates as (
   select
    least(a.id,b.id) as left_id,
    greatest(a.id,b.id) as right_id,
    a.source_key as source_a,
    b.source_key as source_b,
    a.normalized_name,
    public.st_distance(a.location,b.location)::numeric as distance_m,
    coalesce(a.source_confidence,.5)::numeric as conf_a,
    coalesce(b.source_confidence,.5)::numeric as conf_b,
    public.afat_source_independence_factor(a.source_key,b.source_key) as independence_factor
   from public.afat_geo_source_records a
   join public.afat_geo_source_records b
     on a.id<b.id
    and a.source_key<>b.source_key
    and a.location is not null and b.location is not null
    and a.normalized_name is not null and a.normalized_name<>''
    and a.normalized_name=b.normalized_name
    and public.st_dwithin(a.location,b.location,250)
   where (
      coalesce(a.source_properties->>'city_key','')=p_city_key
      or coalesce(a.source_properties->>'city_name','')=v_city.city_name
   )
   and (
      coalesce(b.source_properties->>'city_key','')=p_city_key
      or coalesce(b.source_properties->>'city_name','')=v_city.city_name
   )
   order by public.st_distance(a.location,b.location)
   limit p_limit
 )
 insert into public.afat_conflation_suggestions(
   city_profile_id,left_source_record_id,right_source_record_id,suggestion_type,distance_m,name_match,
   independence_factor,confidence,evidence,fingerprint,updated_at
 )
 select
   v_city.id,c.left_id,c.right_id,
   case when c.distance_m<=25 then 'duplicate_candidate'
        when c.distance_m<=80 then 'position_disagreement'
        else 'strong_location_disagreement' end,
   round(c.distance_m,1),true,c.independence_factor,
   least(98,round((
      case when c.distance_m<=25 then 82 when c.distance_m<=80 then 68 else 58 end
      +least(10,(c.conf_a+c.conf_b)*5)
      +case when c.independence_factor>=.75 then 5 else -12 end
   )::numeric,2)),
   jsonb_build_object(
     'normalized_name',c.normalized_name,
     'source_a',c.source_a,'source_b',c.source_b,
     'source_confidence_a',c.conf_a,'source_confidence_b',c.conf_b,
     'independence_factor',c.independence_factor,
     'automatic_merge',false
   ),
   md5('conflation:'||c.left_id::text||':'||c.right_id::text),
   now()
 from candidates c
 on conflict(fingerprint) do update set
   suggestion_type=excluded.suggestion_type,distance_m=excluded.distance_m,
   independence_factor=excluded.independence_factor,confidence=excluded.confidence,
   evidence=excluded.evidence,updated_at=now()
 where public.afat_conflation_suggestions.status='open';
 get diagnostics v_rows=row_count;

 insert into public.afat_source_discrepancies(
   city_profile_id,discrepancy_type,location,source_keys,headline,detail,severity,uncertainty,
   demand_value,freshness_risk,verification_cost,information_value,recommended_method,fingerprint,evidence,last_detected_at,updated_at
 )
 select
   s.city_profile_id,'cross_source_location_disagreement',
   public.st_lineinterpolatepoint(public.st_makeline(a.location::public.geometry,b.location::public.geometry),.5)::public.geography,
   array[a.source_key,b.source_key],
   'Sources disagree on the position of '||coalesce(a.canonical_name,b.canonical_name,'a mapped place'),
   'Two source records with the same normalized name are separated by '||round(s.distance_m)||' m. AFAT will not choose one automatically.',
   least(90,45+s.distance_m/5),
   case when s.independence_factor>=.75 then 82 else 62 end,
   50,45,35,
   least(100,round((
     .35*(case when s.independence_factor>=.75 then 82 else 62 end)
     +.25*least(90,45+s.distance_m/5)+.20*45+.15*50+.05*65
   )::numeric,2)),
   'independent_field_or_operational_verification',
   md5('cross-source-location:'||s.fingerprint),
   jsonb_build_object(
      'conflation_suggestion_id',s.id,
      'distance_m',s.distance_m,
      'independence_factor',s.independence_factor,
      'automatic_promotion',false
   ),
   now(),now()
 from public.afat_conflation_suggestions s
 join public.afat_geo_source_records a on a.id=s.left_source_record_id
 join public.afat_geo_source_records b on b.id=s.right_source_record_id
 where s.city_profile_id=v_city.id and s.status='open'
   and s.suggestion_type in ('position_disagreement','strong_location_disagreement')
 on conflict(fingerprint) do update set
   uncertainty=excluded.uncertainty,severity=excluded.severity,information_value=excluded.information_value,
   evidence=excluded.evidence,last_detected_at=now(),updated_at=now()
 where public.afat_source_discrepancies.status in ('open','missioned','under_review');
 get diagnostics v_gaps=row_count;

 return jsonb_build_object('city_key',p_city_key,'conflation_suggestions_refreshed',v_rows,'disagreement_gaps_refreshed',v_gaps);
end; $function$
;

revoke all on function public.afat_refresh_cross_source_disagreements(text,integer) from public,anon;
grant execute on function public.afat_refresh_cross_source_disagreements(text,integer) to authenticated;
revoke all on function public.afat_build_city_model(text) from public,anon;
grant execute on function public.afat_build_city_model(text) to authenticated;
