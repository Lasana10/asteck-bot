-- AFAT verified access distinction: a human-reviewed field proposal is still
-- limited-confidence knowledge until independent corroboration. Reuses the
-- existing canonical route and access graph without inventing any observation.
CREATE OR REPLACE FUNCTION public.afat_assess_place_reachability(p_place_id uuid, p_origin_lat double precision DEFAULT NULL::double precision, p_origin_lon double precision DEFAULT NULL::double precision, p_mode text DEFAULT 'car'::text, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_place public.afat_places%rowtype;
  v_access jsonb;
  v_meeting jsonb;
  v_route jsonb;
  v_access_count integer:=0;
  v_reviewed_access_count integer:=0;
  v_meeting_count integer:=0;
  v_best_access_conf numeric:=0;
  v_best_meeting_conf numeric:=0;
  v_route_status text;
  v_route_distance numeric;
  v_reliability numeric:=0;
  v_state text:='unknown';
  v_reasons jsonb:='[]'::jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_disruptions integer:=0;
  v_speed_profiles integer:=0;
begin
  if p_mode not in ('walk','bike','moto','car','minibus') then raise exception 'Unsupported movement mode'; end if;
  select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
  if not found then raise exception 'Place not found'; end if;

  select count(*),coalesce(max(confidence),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'access_type',access_type,'latitude',latitude,'longitude',longitude,
    'access_modes',access_modes,'confidence',confidence,'evidence_status',evidence_status,'instructions',instructions
  ) order by confidence desc),'[]'::jsonb)
  into v_access_count,v_best_access_conf,v_access
  from public.afat_access_points
  where place_id=p_place_id and active=true and (cardinality(access_modes)=0 or p_mode=any(access_modes));

  select count(*),coalesce(max(confidence),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'latitude',latitude,'longitude',longitude,'access_modes',access_modes,
    'confidence',confidence,'evidence_status',evidence_status,'walk_minutes',walk_minutes,
    'safety_score',safety_score,'roadside_score',roadside_score,'instructions',instructions
  ) order by confidence desc),'[]'::jsonb)
  into v_meeting_count,v_best_meeting_conf,v_meeting
  from public.afat_meeting_points
  where place_id=p_place_id and status<>'retired' and (cardinality(access_modes)=0 or p_mode=any(access_modes));

  -- Promoted community entrances are LIMITED until independent corroboration.
  -- They are useful for discovery but cannot certify high-confidence reachability.
  select count(*) into v_reviewed_access_count
  from public.afat_access_points
  where place_id=p_place_id and active=true
    and evidence_status in ('corroborated','verified','field_verified')
    and (cardinality(access_modes)=0 or p_mode=any(access_modes));

  if p_origin_lat is not null and p_origin_lon is not null then
    v_route:=public.afat_route_canonical(
      p_origin_lat,p_origin_lon,
      coalesce((v_access->0->>'latitude')::double precision,v_place.latitude),
      coalesce((v_access->0->>'longitude')::double precision,v_place.longitude),
      p_mode,1200
    );
    v_route_status:=v_route->>'status';
    v_route_distance:=nullif(v_route->>'distance_m','')::numeric;
  end if;

  if v_route_status='ok' then
    v_reliability:=v_reliability+45;
    v_reasons:=v_reasons||jsonb_build_array('connected_graph_route');
  elsif p_origin_lat is not null then
    v_missing:=v_missing||jsonb_build_array('connected_route');
  end if;
  if v_access_count>0 then
    v_reliability:=v_reliability+least(25,v_best_access_conf/4);
    v_reasons:=v_reasons||jsonb_build_array(
      case when v_reviewed_access_count>0 then 'known_access_point' else 'limited_access_evidence' end
    );
  end if;
  if v_reviewed_access_count=0 then
    v_missing:=v_missing||jsonb_build_array('verified_access_or_entrance');
  end if;
  if v_meeting_count>0 then
    v_reliability:=v_reliability+least(10,v_best_meeting_conf/10);
    v_reasons:=v_reasons||jsonb_build_array('known_meeting_point');
  end if;
  if v_place.evidence_status in ('field_verified','corroborated') then v_reliability:=v_reliability+15; end if;
  if v_place.reachability_state='stale' then v_reliability:=greatest(0,v_reliability-15); v_reasons:=v_reasons||jsonb_build_array('stale_place_evidence'); end if;
  if v_place.reachability_state='disputed' then v_reliability:=greatest(0,v_reliability-25); v_reasons:=v_reasons||jsonb_build_array('disputed_place_evidence'); end if;

  if v_route_status='ok' and v_reviewed_access_count>0 and v_reliability>=70 then v_state:='reachable_high_confidence';
  elsif v_route_status='ok' then v_state:='reachable_with_uncertainty';
  elsif p_origin_lat is null then v_state:='destination_known_origin_needed';
  else v_state:='not_confirmed'; end if;

  if v_route_status='ok' then
    select count(*) into v_disruptions
    from public.afat_atlas_observations o
    join jsonb_array_elements(coalesce(v_route->'segments','[]'::jsonb)) s on (s->>'edge_id')::uuid=o.atlas_edge_id
    where o.observation_type='verified_incident'
      and coalesce((o.observation_value->>'active')::boolean,false)=true
      and (o.expires_at is null or o.expires_at>p_at);

    select count(*) into v_speed_profiles
    from public.afat_corridor_speed_profiles sp
    join jsonb_array_elements(coalesce(v_route->'segments','[]'::jsonb)) s on (s->>'edge_id')::uuid=sp.atlas_edge_id
    where sp.movement_mode=p_mode and sp.sample_count>=3 and sp.evidence_status in ('corroborated','field_verified');
  end if;

  if v_disruptions>0 then
    v_reliability:=greatest(0,v_reliability-least(25,v_disruptions*8));
    v_reasons:=v_reasons||jsonb_build_array('active_route_disruption');
  end if;
  if v_speed_profiles=0 and v_route_status='ok' then v_missing:=v_missing||jsonb_build_array('trusted_eta_profile'); end if;

  return jsonb_build_object(
    'place_id',v_place.id,'place_ref',v_place.place_ref,'name',v_place.canonical_name,
    'mode',p_mode,'state',v_state,'reliability_score',round(least(100,v_reliability),1),
    'route',v_route,'route_distance_m',v_route_distance,'active_disruptions',v_disruptions,
    'trusted_speed_profile_segments',v_speed_profiles,
    'reviewed_access_count',v_reviewed_access_count,
    'access_points',coalesce(v_access,'[]'::jsonb),'meeting_points',coalesce(v_meeting,'[]'::jsonb),
    'reasons',v_reasons,'missing_evidence',v_missing,
    'eta_seconds',case when v_speed_profiles>0 then v_route->'eta_seconds' else null end,
    'automatic_truth',false,'assessed_at',p_at
  );
end;
$function$

