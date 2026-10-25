-- Repair the deployed transit-sequence schema and make passenger multimodal
-- patterns depend on recent, independently reviewed field observations.
alter table public.afat_transit_line_nodes
  add column if not exists observed_wait_seconds integer,
  add column if not exists fare_xaf integer,
  add column if not exists confidence numeric not null default 25,
  add column if not exists evidence_status text not null default 'limited',
  add column if not exists source_observed_at timestamptz,
  add column if not exists source_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
 if not exists(select 1 from pg_constraint where conname='afat_transit_line_nodes_wait_check') then
  alter table public.afat_transit_line_nodes add constraint afat_transit_line_nodes_wait_check
   check(observed_wait_seconds is null or observed_wait_seconds between 0 and 21600);
 end if;
 if not exists(select 1 from pg_constraint where conname='afat_transit_line_nodes_fare_check') then
  alter table public.afat_transit_line_nodes add constraint afat_transit_line_nodes_fare_check
   check(fare_xaf is null or fare_xaf between 0 and 1000000);
 end if;
 if not exists(select 1 from pg_constraint where conname='afat_transit_line_nodes_confidence_check') then
  alter table public.afat_transit_line_nodes add constraint afat_transit_line_nodes_confidence_check
   check(confidence between 0 and 100);
 end if;
 if not exists(select 1 from pg_constraint where conname='afat_transit_line_nodes_evidence_status_check') then
  alter table public.afat_transit_line_nodes add constraint afat_transit_line_nodes_evidence_status_check
   check(evidence_status in ('limited','corroborated','field_verified','disputed','stale'));
 end if;
end $$;

create or replace function public.afat_link_accepted_transit_sequence()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_node_id uuid; v_line_id uuid; v_sequence integer; v_conf numeric;
 v_observed_at timestamptz;
begin
 if new.status='accepted' and old.status is distinct from new.status then
  if new.reviewer_id is null or new.reviewed_at is null or new.reviewer_id=new.profile_id then
   raise exception 'Independent transit review is required' using errcode='42501';
  end if;
  begin
   v_observed_at:=nullif(new.evidence->>'observed_at','')::timestamptz;
  exception when others then
   v_observed_at:=null;
  end;
  v_node_id:=nullif(new.evidence->>'promoted_node_id','')::uuid;
  v_line_id:=nullif(new.evidence->>'promoted_line_id','')::uuid;
  v_sequence:=nullif(new.evidence->>'stop_sequence','')::integer;
  if v_node_id is not null and v_line_id is not null and v_sequence is not null and v_sequence>=0
    and new.gps_accuracy_m between 0 and 60
    and v_observed_at between now()-interval '30 days' and now()+interval '5 minutes' then
   v_conf:=case when new.gps_accuracy_m<=20 then 45 else 38 end;
   insert into public.afat_transit_line_nodes(
    line_id,node_id,stop_sequence,direction,observed_travel_seconds,
    observed_wait_seconds,fare_xaf,confidence,evidence_status,
    source_observed_at,source_reviewed_at,evidence,updated_at)
   values(v_line_id,v_node_id,v_sequence,'forward',new.travel_seconds,
    new.wait_seconds,new.fare_xaf,v_conf,'limited',v_observed_at,new.reviewed_at,
    jsonb_build_object('automatic_truth',false,'source','reviewed_transit_observation',
      'observation_id',new.id,'reviewer_id',new.reviewer_id,
      'observation_time_verified',false),now())
   on conflict(line_id,direction,stop_sequence) do update set
    node_id=excluded.node_id,
    observed_travel_seconds=coalesce(excluded.observed_travel_seconds,public.afat_transit_line_nodes.observed_travel_seconds),
    observed_wait_seconds=coalesce(excluded.observed_wait_seconds,public.afat_transit_line_nodes.observed_wait_seconds),
    fare_xaf=coalesce(excluded.fare_xaf,public.afat_transit_line_nodes.fare_xaf),
    confidence=greatest(public.afat_transit_line_nodes.confidence,excluded.confidence),
    evidence_status='limited',source_observed_at=excluded.source_observed_at,
    source_reviewed_at=excluded.source_reviewed_at,
    evidence=public.afat_transit_line_nodes.evidence||excluded.evidence,updated_at=now();
  end if;
 end if;
 return new;
end $$;
revoke all on function public.afat_link_accepted_transit_sequence() from public,anon,authenticated;

create or replace function public.afat_plan_multimodal_journey(
 p_origin_lat double precision,p_origin_lon double precision,p_place_id uuid,
 p_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare
 v_uid uuid:=(select auth.uid()); v_place public.afat_places%rowtype; v_city_id uuid;
 v_dest_lat double precision; v_dest_lon double precision;
 v_walk jsonb; v_moto jsonb; v_car jsonb; v_minibus jsonb; v_options jsonb:='[]'::jsonb;
 v_candidate record; v_walk_in jsonb; v_walk_out jsonb; v_chain jsonb;
 v_transit_seconds integer; v_wait_seconds integer; v_fare_xaf integer;
 v_segment_count integer; v_expected_segments integer; v_time_count integer; v_fare_count integer;
 v_chain_status text:='insufficient_transit_evidence';
 v_reason text:='AFAT does not yet have enough recent, independently reviewed and ordered transit evidence to show a multimodal pattern.';
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_origin_lat not between -90 and 90 or p_origin_lon not between -180 and 180 then
  raise exception 'Valid origin required' using errcode='22023';
 end if;
 if p_at < now()-interval '5 minutes' or p_at > now()+interval '5 minutes' then
  raise exception 'Current assessment time required' using errcode='22023';
 end if;
 select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
 if not found then raise exception 'Place not found'; end if;
 select id into v_city_id from public.afat_city_profiles
  where status='active' and lower(city_name)=lower(v_place.city) limit 1;
 if v_city_id is null then raise exception 'Active destination city not found'; end if;
 v_dest_lat:=v_place.latitude; v_dest_lon:=v_place.longitude;
 select latitude,longitude into v_dest_lat,v_dest_lon from public.afat_access_points
  where place_id=p_place_id and active=true and 'walk'=any(access_modes)
  order by confidence desc nulls last limit 1;
 v_dest_lat:=coalesce(v_dest_lat,v_place.latitude); v_dest_lon:=coalesce(v_dest_lon,v_place.longitude);

 v_walk:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'walk',p_at);
 v_moto:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'moto',p_at);
 v_car:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'car',p_at);
 v_minibus:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'minibus',p_at);
 if v_walk->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','walk','assessment',v_walk)); end if;
 if v_moto->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','moto','assessment',v_moto)); end if;
 if v_car->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','car','assessment',v_car)); end if;
 if v_minibus->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','minibus','assessment',v_minibus)); end if;

 select l.id line_id,l.line_ref,l.name line_name,l.mode,l.direction_label,
  l.confidence line_confidence,l.evidence_status line_evidence_status,
  bn.id board_node_id,bn.name board_name,bn.latitude board_lat,bn.longitude board_lon,
  an.id alight_node_id,an.name alight_name,an.latitude alight_lat,an.longitude alight_lon,
  bln.stop_sequence board_sequence,aln.stop_sequence alight_sequence,
  public.st_distance(bn.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography) board_walk_m,
  public.st_distance(an.location,public.st_setsrid(public.st_makepoint(v_dest_lon,v_dest_lat),4326)::public.geography) alight_walk_m,
  least(coalesce(l.confidence,0),coalesce(bn.confidence,0),coalesce(an.confidence,0),bln.confidence,aln.confidence) chain_confidence,
  greatest(bln.source_observed_at,aln.source_observed_at) evidence_observed_at,
  greatest(bln.source_reviewed_at,aln.source_reviewed_at) latest_reviewed_at,
  least(bln.source_observed_at,aln.source_observed_at)+interval '30 days' evidence_expires_at
 into v_candidate
 from public.afat_transit_lines l
 join public.afat_transit_line_nodes bln on bln.line_id=l.id and bln.direction='forward'
 join public.afat_transit_nodes bn on bn.id=bln.node_id and bn.active=true and bn.city_profile_id=l.city_profile_id
 join public.afat_transit_line_nodes aln on aln.line_id=l.id and aln.direction=bln.direction and aln.stop_sequence>bln.stop_sequence
 join public.afat_transit_nodes an on an.id=aln.node_id and an.active=true and an.city_profile_id=l.city_profile_id
 where l.city_profile_id=v_city_id and l.active=true
  and l.evidence_status in ('limited','corroborated','field_verified')
  and bn.evidence_status in ('limited','corroborated','field_verified')
  and an.evidence_status in ('limited','corroborated','field_verified')
  and bln.evidence_status in ('limited','corroborated','field_verified')
  and aln.evidence_status in ('limited','corroborated','field_verified')
  and bln.source_observed_at between p_at-interval '30 days' and p_at+interval '5 minutes'
  and aln.source_observed_at between p_at-interval '30 days' and p_at+interval '5 minutes'
  and bln.source_reviewed_at is not null and aln.source_reviewed_at is not null
  and public.st_dwithin(bn.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography,1200)
  and public.st_dwithin(an.location,public.st_setsrid(public.st_makepoint(v_dest_lon,v_dest_lat),4326)::public.geography,1200)
 order by (public.st_distance(bn.location,public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography)
  +public.st_distance(an.location,public.st_setsrid(public.st_makepoint(v_dest_lon,v_dest_lat),4326)::public.geography)) asc,
  chain_confidence desc limit 1;

 if v_candidate.line_id is not null then
  v_walk_in:=public.afat_route_canonical(p_origin_lat,p_origin_lon,v_candidate.board_lat,v_candidate.board_lon,'walk',1200);
  v_walk_out:=public.afat_route_canonical(v_candidate.alight_lat,v_candidate.alight_lon,v_dest_lat,v_dest_lon,'walk',1200);
  if v_walk_in->>'status'='ok' and v_walk_out->>'status'='ok' then
   v_expected_segments:=v_candidate.alight_sequence-v_candidate.board_sequence;
   select count(*),count(observed_travel_seconds),coalesce(sum(observed_travel_seconds),0),
    count(fare_xaf),max(fare_xaf),max(observed_wait_seconds)
   into v_segment_count,v_time_count,v_transit_seconds,v_fare_count,v_fare_xaf,v_wait_seconds
   from public.afat_transit_line_nodes
   where line_id=v_candidate.line_id and direction='forward'
    and stop_sequence>=v_candidate.board_sequence and stop_sequence<v_candidate.alight_sequence
    and evidence_status in ('limited','corroborated','field_verified')
    and source_observed_at between p_at-interval '30 days' and p_at+interval '5 minutes'
    and source_reviewed_at is not null;
   v_chain:=jsonb_build_object(
    'type','walk_transit_walk',
    'line',jsonb_build_object('line_ref',v_candidate.line_ref,'name',v_candidate.line_name,
      'mode',v_candidate.mode,'direction',v_candidate.direction_label,
      'confidence',v_candidate.line_confidence,'evidence_status',v_candidate.line_evidence_status),
    'boarding',jsonb_build_object('name',v_candidate.board_name,'latitude',v_candidate.board_lat,
      'longitude',v_candidate.board_lon,'stop_sequence',v_candidate.board_sequence,
      'walk_distance_m',round(v_candidate.board_walk_m::numeric,1)),
    'alighting',jsonb_build_object('name',v_candidate.alight_name,'latitude',v_candidate.alight_lat,
      'longitude',v_candidate.alight_lon,'stop_sequence',v_candidate.alight_sequence,
      'walk_distance_m',round(v_candidate.alight_walk_m::numeric,1)),
    'walk_to_board',v_walk_in,'walk_from_alight',v_walk_out,
    'observed_wait_seconds',v_wait_seconds,
    'observed_transit_seconds',case when v_segment_count=v_expected_segments and v_time_count=v_expected_segments then v_transit_seconds else null end,
    'observed_fare_xaf',case when v_fare_count>0 then v_fare_xaf else null end,
    'travel_time_evidence_complete',(v_segment_count=v_expected_segments and v_time_count=v_expected_segments),
    'fare_evidence_count',v_fare_count,'confidence',v_candidate.chain_confidence,
    'evidence_observed_at',v_candidate.evidence_observed_at,
    'latest_reviewed_at',v_candidate.latest_reviewed_at,
    'evidence_expires_at',v_candidate.evidence_expires_at,
    'observation_time_verified',false,'live_service_available',false,
    'boarding_availability_verified',false,'schedule_verified',false,
    'fare_current_verified',false,'automatic_truth',false);
   v_chain_status:='reviewed_recent_single_line_pattern';
   v_reason:='AFAT found a recent independently reviewed transit pattern with connected mapped walking legs. Live service, boarding, schedule and current fare remain unverified.';
  else
   v_chain_status:='transit_candidate_walk_access_unresolved';
   v_reason:='AFAT found a recent reviewed transit pattern, but cannot confirm a connected walking leg to or from it.';
  end if;
 end if;
 return jsonb_build_object('place_id',p_place_id,'direct_options',v_options,
  'transit_network',jsonb_build_object(
   'active_nodes',(select count(*) from public.afat_transit_nodes where city_profile_id=v_city_id and active),
   'active_lines',(select count(*) from public.afat_transit_lines where city_profile_id=v_city_id and active),
   'recent_reviewed_ordered_nodes',(select count(*) from public.afat_transit_line_nodes ln
      join public.afat_transit_lines l on l.id=ln.line_id
      where l.city_profile_id=v_city_id and ln.source_observed_at>=p_at-interval '30 days'
       and ln.source_reviewed_at is not null)),
  'multimodal_chain_status',v_chain_status,'multimodal_chain',v_chain,
  'reason',v_reason,'live_service_available',false,'automatic_truth',false,'assessed_at',p_at);
end $$;

revoke all on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) from public,anon;
grant execute on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) to authenticated,service_role;
