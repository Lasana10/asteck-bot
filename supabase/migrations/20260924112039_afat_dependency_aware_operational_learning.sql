-- AFAT dependency-aware reliability + operational/environmental learning.
-- Production-aligned with migration 20260924112039.

create table if not exists public.afat_edge_operational_overlays(
 id uuid primary key default gen_random_uuid(),
 city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
 edge_id uuid not null references public.afat_atlas_edges(id) on delete cascade,
 overlay_type text not null check(overlay_type in ('flood_risk','rain_risk','surface_water','temporary_slowdown','access_uncertainty')),
 risk_score numeric not null check(risk_score between 0 and 100),
 travel_cost_multiplier numeric not null default 1 check(travel_cost_multiplier between 1 and 10),
 source_signal_ids uuid[] not null default '{}',
 starts_at timestamptz not null default now(),
 expires_at timestamptz not null,
 evidence jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 unique(edge_id,overlay_type)
);
create index if not exists afat_edge_operational_overlays_city_expiry_idx on public.afat_edge_operational_overlays(city_profile_id,expires_at);
alter table public.afat_edge_operational_overlays enable row level security;
revoke all on public.afat_edge_operational_overlays from anon,authenticated;

create or replace function public.afat_refresh_source_reliability_matrix(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_rows int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Source intelligence permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'City profile not found'; end if;

 with scoped as (
   select r.source_key,
          coalesce(nullif(r.source_properties->>'zone_label',''),'citywide') as zone_key,
          coalesce(nullif(r.source_category,''),'unknown') as feature_class,
          count(*)::int as sample_size,
          count(*) filter(where r.linked_place_id is not null)::int as linked_count,
          max(r.last_seen_at) as last_seen_at
   from public.afat_geo_source_records r
   where coalesce(r.source_properties->>'city_key',p_city_key)=p_city_key
      or coalesce(r.source_properties->>'city_name','')=v_city.city_name
   group by r.source_key,coalesce(nullif(r.source_properties->>'zone_label',''),'citywide'),coalesce(nullif(r.source_category,''),'unknown')
 ), maxes as (
   select greatest(1,max(sample_size))::numeric as max_sample from scoped
 )
 insert into public.afat_source_area_scores(city_profile_id,zone_key,source_key,feature_class,coverage_score,freshness_score,agreement_score,confidence,sample_size,evidence,refreshed_at)
 select v_city.id,s.zone_key,s.source_key,s.feature_class,
        least(100,round((s.sample_size::numeric/m.max_sample)*100,2)),
        case when s.last_seen_at is null then 0 else greatest(0,round((100-least(100,extract(epoch from(now()-s.last_seen_at))/86400/3))::numeric,2)) end,
        case when s.sample_size=0 then 0 else round((s.linked_count::numeric/s.sample_size)*100,2) end,
        least(100,round((
          0.35*least(100,(s.sample_size::numeric/m.max_sample)*100)
          +0.25*(case when s.last_seen_at is null then 0 else greatest(0,100-least(100,extract(epoch from(now()-s.last_seen_at))/86400/3)) end)
          +0.25*(case when s.sample_size=0 then 0 else (s.linked_count::numeric/s.sample_size)*100 end)
          +0.15*coalesce(gs.default_trust_weight*100,50)
        )::numeric,2)),
        s.sample_size,
        jsonb_build_object('basis','zone_feature_source_matrix','linked_count',s.linked_count,'last_seen_at',s.last_seen_at,'trust_weight',gs.default_trust_weight),
        now()
 from scoped s cross join maxes m join public.afat_geo_sources gs on gs.source_key=s.source_key
 on conflict(city_profile_id,zone_key,source_key,feature_class) do update set
   coverage_score=excluded.coverage_score,freshness_score=excluded.freshness_score,agreement_score=excluded.agreement_score,
   confidence=excluded.confidence,sample_size=excluded.sample_size,evidence=excluded.evidence,refreshed_at=now();
 get diagnostics v_rows=row_count;
 return jsonb_build_object('city_key',p_city_key,'matrix_rows_refreshed',v_rows);
end; $$;
revoke all on function public.afat_refresh_source_reliability_matrix(text) from public,anon;
grant execute on function public.afat_refresh_source_reliability_matrix(text) to authenticated;

create or replace function public.afat_refresh_canonical_independence(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_changed int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Evidence review permission required'; end if;
 update public.afat_canonical_entity_sources ces
 set independent=false,
     provenance=coalesce(ces.provenance,'{}'::jsonb)||jsonb_build_object('independence_recalculated_at',now(),'independence_reason','source_dependency_graph')
 from public.afat_geo_source_records r
 where r.id=ces.source_record_id
 and exists(
   select 1
   from public.afat_canonical_entity_sources ces2
   join public.afat_geo_source_records r2 on r2.id=ces2.source_record_id
   join public.afat_source_dependencies d on
      ((d.source_key=r.source_key and d.depends_on_source_key=r2.source_key)
       or (d.source_key=r2.source_key and d.depends_on_source_key=r.source_key))
      and d.independence_factor<0.75
   where ces2.canonical_entity_id=ces.canonical_entity_id and ces2.source_record_id<>ces.source_record_id
 );
 get diagnostics v_changed=row_count;
 return jsonb_build_object('city_key',p_city_key,'source_links_marked_dependent',v_changed);
end; $$;
revoke all on function public.afat_refresh_canonical_independence(text) from public,anon;
grant execute on function public.afat_refresh_canonical_independence(text) to authenticated;

create or replace function public.afat_refresh_operational_map_learning(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_slow int:=0; v_fail int:=0; v_pickups int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Operational learning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'City profile not found'; end if;

 insert into public.afat_operational_map_signals(city_profile_id,edge_id,journey_id,signal_type,severity,confidence,observed_at,evidence,fingerprint)
 select v_city.id,e.id,j.id,'journey_slowdown',
        least(90,greatest(35,85-coalesce(x.avg_speed,0)*4)),
        least(90,45+x.sample_count*3),coalesce(j.completed_at,j.updated_at,j.started_at,now()),
        jsonb_build_object('average_speed_kph',x.avg_speed,'sample_count',x.sample_count,'vehicle_mode',j.vehicle_mode,'learning_role','operational_evidence_not_truth'),
        md5('journey-slowdown:'||j.id::text)
 from public.afat_journeys j
 join lateral (
    select avg(js.speed_kph)::numeric avg_speed,count(*)::int sample_count,
           public.st_setsrid(public.st_makepoint(avg(js.longitude),avg(js.latitude)),4326)::public.geography center
    from public.afat_journey_samples js
    where js.journey_id=j.id and js.accuracy_m<=60 and js.speed_kph is not null
 ) x on x.sample_count>=3 and x.avg_speed between 0 and 8
 join lateral (
    select ae.id
    from public.afat_atlas_edges ae join public.afat_atlas_nodes an on an.id=ae.from_node_id
    where an.city=v_city.city_name and ae.status='active'
      and public.st_dwithin(ae.geometry::public.geography,x.center,80)
    order by public.st_distance(ae.geometry::public.geography,x.center) limit 1
 ) e on true
 where coalesce(j.completed_at,j.updated_at,j.started_at)>=now()-interval '30 days'
 on conflict(fingerprint) do update set severity=excluded.severity,confidence=excluded.confidence,observed_at=excluded.observed_at,evidence=excluded.evidence;
 get diagnostics v_slow=row_count;

 insert into public.afat_operational_map_signals(city_profile_id,journey_id,signal_type,severity,confidence,observed_at,evidence,fingerprint)
 select v_city.id,j.id,'journey_failure',75,65,coalesce(j.updated_at,j.started_at,now()),
        jsonb_build_object('journey_status',j.status,'vehicle_mode',j.vehicle_mode,'journey_evidence',coalesce(j.evidence,'{}'::jsonb),'learning_role','verification_trigger_not_truth'),
        md5('journey-failure:'||j.id::text)
 from public.afat_journeys j
 where j.status in ('failed','cancelled','aborted','interrupted') and coalesce(j.updated_at,j.started_at)>=now()-interval '30 days'
 on conflict(fingerprint) do update set observed_at=excluded.observed_at,evidence=excluded.evidence;
 get diagnostics v_fail=row_count;

 insert into public.afat_operational_map_signals(city_profile_id,place_id,signal_type,severity,confidence,observed_at,evidence,fingerprint)
 select v_city.id,p.id,
        case when coalesce(p.failed_pickups,0)>coalesce(p.successful_pickups,0) then 'pickup_failure' else 'pickup_success' end,
        case when coalesce(p.failed_pickups,0)>coalesce(p.successful_pickups,0) then least(90,40+coalesce(p.failed_pickups,0)*4) else 25 end,
        least(90,40+least(15,coalesce(p.successful_pickups,0)+coalesce(p.failed_pickups,0))*3),
        p.updated_at,
        jsonb_build_object('successful_pickups',coalesce(p.successful_pickups,0),'failed_pickups',coalesce(p.failed_pickups,0),'vehicle_access',p.vehicle_access,'learning_role','meeting_point_and_entrance_evidence'),
        md5('pickup-pattern:'||p.id::text||':'||coalesce(p.successful_pickups,0)::text||':'||coalesce(p.failed_pickups,0)::text)
 from public.afat_places p
 where lower(p.city)=lower(v_city.city_name) and (coalesce(p.successful_pickups,0)+coalesce(p.failed_pickups,0))>0
 on conflict(fingerprint) do nothing;
 get diagnostics v_pickups=row_count;

 insert into public.afat_source_discrepancies(city_profile_id,discrepancy_type,target_edge_id,target_place_id,source_keys,headline,detail,severity,uncertainty,demand_value,freshness_risk,verification_cost,information_value,recommended_method,fingerprint,evidence,last_detected_at,updated_at)
 select s.city_profile_id,
        case when s.signal_type='pickup_failure' then 'entrance_gap' else 'operational_outcome_gap' end,
        s.edge_id,s.place_id,array['afat_internal'],
        case when s.signal_type='journey_slowdown' then 'Real journey repeatedly slowed on this mobility edge'
             when s.signal_type='journey_failure' then 'A real journey failed or was interrupted'
             when s.signal_type='pickup_failure' then 'Pickup outcomes suggest entrance or meeting-point uncertainty'
             else 'Operational outcome adds mobility evidence' end,
        'Generated from real AFAT operational outcomes; requires independent confirmation before canonical map changes.',
        s.severity,least(90,greatest(45,100-s.confidence)),65,45,25,
        least(100,round((.35*(least(90,greatest(45,100-s.confidence)))+.25*s.severity+.20*45+.15*65+.05*75)::numeric,2)),
        case when s.signal_type like 'pickup_%' then 'entrance_or_meeting_point_field_check' else 'independent_traversal_or_field_check' end,
        md5('ops-gap:'||s.fingerprint),
        jsonb_build_object('operational_signal_id',s.id,'signal_type',s.signal_type,'evidence',s.evidence),
        s.observed_at,now()
 from public.afat_operational_map_signals s
 where s.city_profile_id=v_city.id and s.observed_at>=now()-interval '30 days'
 on conflict(fingerprint) do update set last_detected_at=excluded.last_detected_at,updated_at=now(),evidence=excluded.evidence
 where public.afat_source_discrepancies.status in ('open','missioned','under_review');

 return jsonb_build_object('city_key',p_city_key,'slowdown_signals',v_slow,'failure_signals',v_fail,'pickup_signals',v_pickups);
end; $$;
revoke all on function public.afat_refresh_operational_map_learning(text) from public,anon;
grant execute on function public.afat_refresh_operational_map_learning(text) to authenticated;

create or replace function public.afat_refresh_environment_overlays(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_rows int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Operational learning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'City profile not found'; end if;

 delete from public.afat_edge_operational_overlays where city_profile_id=v_city.id and expires_at<=now();

 insert into public.afat_edge_operational_overlays(city_profile_id,edge_id,overlay_type,risk_score,travel_cost_multiplier,source_signal_ids,starts_at,expires_at,evidence,updated_at)
 select v_city.id,e.id,
        case when es.signal_type in ('surface_water','flood_hypothesis') then 'flood_risk'
             when es.signal_type='rainfall' then 'rain_risk' else 'access_uncertainty' end,
        es.severity,
        1+least(3,es.severity/40),
        array[es.id],es.observed_at,coalesce(es.expires_at,es.observed_at+interval '12 hours'),
        jsonb_build_object('environment_signal_type',es.signal_type,'source_key',es.source_key,'confidence',es.confidence,'does_not_rewrite_edge',true),
        now()
 from public.afat_environment_signals es
 join lateral (
   select ae.id
   from public.afat_atlas_edges ae join public.afat_atlas_nodes an on an.id=ae.from_node_id
   where an.city=v_city.city_name and ae.status='active' and es.location is not null
     and public.st_dwithin(ae.geometry::public.geography,es.location,120)
   order by public.st_distance(ae.geometry::public.geography,es.location) limit 8
 ) e on true
 where es.city_profile_id=v_city.id and es.observed_at>=now()-interval '7 days'
   and es.signal_type in ('rainfall','surface_water','flood_hypothesis')
 on conflict(edge_id,overlay_type) do update set
   risk_score=greatest(public.afat_edge_operational_overlays.risk_score,excluded.risk_score),
   travel_cost_multiplier=greatest(public.afat_edge_operational_overlays.travel_cost_multiplier,excluded.travel_cost_multiplier),
   source_signal_ids=(select array(select distinct unnest(public.afat_edge_operational_overlays.source_signal_ids||excluded.source_signal_ids))),
   expires_at=greatest(public.afat_edge_operational_overlays.expires_at,excluded.expires_at),
   evidence=public.afat_edge_operational_overlays.evidence||excluded.evidence,updated_at=now();
 get diagnostics v_rows=row_count;
 return jsonb_build_object('city_key',p_city_key,'temporary_edge_overlays_refreshed',v_rows);
end; $$;
revoke all on function public.afat_refresh_environment_overlays(text) from public,anon;
grant execute on function public.afat_refresh_environment_overlays(text) to authenticated;

create or replace function public.afat_build_city_model(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); a jsonb;b jsonb;c jsonb;d jsonb;e jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
 a:=public.afat_refresh_city_source_relevance(p_city_key);
 b:=public.afat_refresh_source_intelligence(p_city_key,300);
 c:=public.afat_refresh_source_reliability_matrix(p_city_key);
 d:=public.afat_refresh_operational_map_learning(p_city_key);
 e:=public.afat_refresh_environment_overlays(p_city_key);
 perform public.afat_refresh_canonical_independence(p_city_key);
 perform public.afat_generate_source_verification_missions(p_city_key,20);
 return jsonb_build_object('city_key',p_city_key,'relevance',a,'source_intelligence',b,'reliability',c,'operational_learning',d,'environment',e,'snapshot',public.afat_city_model_snapshot(p_city_key));
end; $$;
revoke all on function public.afat_build_city_model(text) from public,anon;
grant execute on function public.afat_build_city_model(text) to authenticated;
