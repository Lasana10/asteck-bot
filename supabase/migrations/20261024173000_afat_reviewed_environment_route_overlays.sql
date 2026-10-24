-- The environmental ingestion gateway is a hypothesis intake, not an
-- authorization to alter route weights. Preserve raw evidence for review.
create or replace function public.afat_mark_environment_intake_pending()
returns trigger language plpgsql set search_path='' as $$
begin
 new.provenance=coalesce(new.provenance,'{}'::jsonb)||
  jsonb_build_object('review_state','pending',
   'independently_verified',false,'automatically_routable',false);
 return new;
end $$;
drop trigger if exists afat_environment_pending_intake on public.afat_environment_signals;
create trigger afat_environment_pending_intake
before insert on public.afat_environment_signals
for each row execute function public.afat_mark_environment_intake_pending();

-- This existing RPC is retained (same signature, same permission gate), but
-- ingestion never automatically calls the route-impact refresh.
create or replace function public.afat_register_environment_signal(
 p_city_key text,p_source_key text,p_signal_type text,
 p_latitude double precision,p_longitude double precision,
 p_observed_at timestamptz,p_expires_at timestamptz default null,
 p_severity numeric default 50,p_confidence numeric default 50,
 p_payload jsonb default '{}'::jsonb,p_provenance jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_id uuid;
begin
 if v_uid is null or not(public.afat_has_permission('map.evidence.review')
   or public.afat_has_permission('planning.aggregate.view')
   or public.afat_has_permission('system.configure'))
 then raise exception 'Environmental evidence permission required' using errcode='42501';end if;
 if p_signal_type not in ('rainfall','surface_water','flood_hypothesis',
   'land_cover','terrain','settlement_change','remote_change')
   then raise exception 'Unsupported environmental signal' using errcode='22023';end if;
 if p_latitude is null or p_longitude is null
   or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
   then raise exception 'Invalid environmental signal coordinates' using errcode='22023';end if;
 if p_observed_at is null or p_observed_at>now()+interval '5 minutes'
   or p_observed_at<now()-interval '90 days'
   then raise exception 'Environmental observation date invalid or stale' using errcode='22023';end if;
 if p_confidence not between 0 and 100 or p_severity not between 0 and 100
   then raise exception 'Severity/confidence must be 0..100' using errcode='22023';end if;
 if not exists(select 1 from public.afat_geo_sources
   where source_key=p_source_key and enabled=true)
   then raise exception 'Source must be registered and enabled' using errcode='22023';end if;
 select * into v_city from public.afat_city_profiles
   where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile not found' using errcode='P0002';end if;
 insert into public.afat_environment_signals(
   city_profile_id,source_key,signal_type,location,observed_at,expires_at,
   severity,confidence,payload,provenance
 ) values(
   v_city.id,p_source_key,p_signal_type,
   public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,
   p_observed_at,p_expires_at,p_severity,p_confidence,
   coalesce(p_payload,'{}'::jsonb),
   coalesce(p_provenance,'{}'::jsonb)||jsonb_build_object(
    'registered_by',v_uid,'registered_at',now(),
    'review_state','pending','independently_verified',false,
    'automatic_truth',false,'automatically_routable',false
   )
 ) returning id into v_id;
 return jsonb_build_object('id',v_id,'city_key',p_city_key,
  'signal_type',p_signal_type,'review_state','pending',
  'automatic_truth',false,'overlays_refreshed',false,
  'route_impact',false);
end $$;

-- Rebuild only overlay rows originating from AFAT environmental evidence.
-- Never remove an unrelated operator/road observation overlay.
create or replace function public.afat_refresh_environment_overlays(
 p_city_key text default 'cm-yaounde'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_rows int:=0;
begin
 if v_uid is null or not(public.afat_has_permission('planning.aggregate.view')
  or public.afat_has_permission('map.evidence.review')
  or public.afat_has_permission('system.configure')) then
  raise exception 'Operational learning permission required' using errcode='42501';end if;
 select * into v_city from public.afat_city_profiles
  where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile not found';end if;
 delete from public.afat_edge_operational_overlays
 where city_profile_id=v_city.id and
  (expires_at<=now() or evidence ? 'environment_signal_type');
 insert into public.afat_edge_operational_overlays(
   city_profile_id,edge_id,overlay_type,risk_score,travel_cost_multiplier,
   source_signal_ids,starts_at,expires_at,evidence,updated_at)
 select v_city.id,e.id,
   case when es.signal_type in ('surface_water','flood_hypothesis') then 'flood_risk'
        else 'rain_risk' end,
   es.severity,1+least(3,es.severity/40),
   array[es.id],es.observed_at,
   least(coalesce(es.expires_at,es.observed_at+interval '12 hours'),now()+interval '12 hours'),
   jsonb_build_object('environment_signal_type',es.signal_type,
     'source_key',es.source_key,'confidence',es.confidence,
     'independent_review',es.provenance->'review',
     'does_not_rewrite_edge',true),now()
 from public.afat_environment_signals es
 join lateral (
   select ae.id from public.afat_atlas_edges ae
   join public.afat_atlas_nodes an on an.id=ae.from_node_id
   where an.city=v_city.city_name and ae.status='active'
     and es.location is not null and public.st_dwithin(ae.geometry::public.geography,es.location,120)
   order by public.st_distance(ae.geometry::public.geography,es.location)
   limit 8
 ) e on true
 where es.city_profile_id=v_city.id and
   es.provenance->>'review_state'='approved' and
   es.provenance->'review'->>'reviewer_id' is not null and
   es.provenance->'review'->>'notes' is not null and
   es.observed_at between now()-interval '7 days' and now() and
   (es.expires_at is null or es.expires_at>now()) and
   es.signal_type in ('rainfall','surface_water','flood_hypothesis')
 on conflict(edge_id,overlay_type) do update set
   risk_score=greatest(public.afat_edge_operational_overlays.risk_score,excluded.risk_score),
   travel_cost_multiplier=greatest(public.afat_edge_operational_overlays.travel_cost_multiplier,excluded.travel_cost_multiplier),
   source_signal_ids=(select array(select distinct unnest(
    public.afat_edge_operational_overlays.source_signal_ids||excluded.source_signal_ids))),
   expires_at=greatest(public.afat_edge_operational_overlays.expires_at,excluded.expires_at),
   evidence=public.afat_edge_operational_overlays.evidence||excluded.evidence,updated_at=now();
 get diagnostics v_rows=row_count;
 return jsonb_build_object('city_key',p_city_key,'reviewed_environment_overlays',v_rows,
  'unreviewed_environment_ignored',true);
end $$;

-- Human review, with separation of duties, is the ONLY promotional action.
create or replace function public.afat_review_environment_signal(
 p_signal_id uuid,p_decision text,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_signal public.afat_environment_signals%rowtype;
 v_city text;v_notes text:=trim(coalesce(p_notes,''));v_result jsonb;
begin
 if v_uid is null or not public.afat_has_permission('map.evidence.review') then
  raise exception 'Independent environment reviewer required' using errcode='42501';end if;
 if p_decision not in ('approve','reject') or char_length(v_notes)<25 or char_length(v_notes)>2000
  then raise exception 'Documented review decision required' using errcode='22023';end if;
 select * into v_signal from public.afat_environment_signals where id=p_signal_id for update;
 if not found then raise exception 'Environment observation not found' using errcode='P0002';end if;
 if v_signal.provenance->>'review_state' not in ('pending','rejected') then
  raise exception 'Observation already reviewed' using errcode='P0001';end if;
 if v_signal.provenance->>'registered_by'=v_uid::text then
  raise exception 'Reporter cannot independently review own signal' using errcode='42501';end if;
 select city_key into v_city from public.afat_city_profiles where id=v_signal.city_profile_id;
 update public.afat_environment_signals set
  provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object(
    'review_state',case when p_decision='approve' then 'approved' else 'rejected' end,
    'independently_verified',p_decision='approve',
    'review',jsonb_build_object('reviewer_id',v_uid,'notes',v_notes,
      'decision',p_decision,'reviewed_at',now())
  ) where id=p_signal_id;
 if p_decision='approve' then
  v_result:=public.afat_refresh_environment_overlays(v_city);
 end if;
 return jsonb_build_object('id',p_signal_id,'decision',p_decision,
  'independent_review',true,'route_impact',p_decision='approve',
  'overlay_result',v_result);
end $$;
revoke all on function public.afat_review_environment_signal(uuid,text,text) from public,anon;
grant execute on function public.afat_review_environment_signal(uuid,text,text) to authenticated,service_role;
