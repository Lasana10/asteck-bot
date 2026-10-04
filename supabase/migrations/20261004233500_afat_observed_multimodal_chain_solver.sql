create or replace function public.afat_link_accepted_transit_sequence()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_node_id uuid; v_line_id uuid; v_sequence integer; v_conf numeric;
begin
  if new.status='accepted' and old.status is distinct from new.status then
    v_node_id:=nullif(new.evidence->>'promoted_node_id','')::uuid;
    v_line_id:=nullif(new.evidence->>'promoted_line_id','')::uuid;
    v_sequence:=nullif(new.evidence->>'stop_sequence','')::integer;
    if v_node_id is not null and v_line_id is not null and v_sequence is not null and v_sequence>=0 then
      v_conf:=case when new.gps_accuracy_m is null then 25 when new.gps_accuracy_m<=20 then 45 when new.gps_accuracy_m<=60 then 38 else 25 end;
      insert into public.afat_transit_line_nodes(line_id,node_id,stop_sequence,observed_travel_seconds,observed_wait_seconds,fare_xaf,confidence,evidence_status,evidence)
      values(v_line_id,v_node_id,v_sequence,new.travel_seconds,new.wait_seconds,new.fare_xaf,v_conf,'limited',jsonb_build_object('automatic_truth',false,'source','reviewed_transit_observation','observation_id',new.id))
      on conflict(line_id,stop_sequence) do update set
        observed_travel_seconds=coalesce(excluded.observed_travel_seconds,public.afat_transit_line_nodes.observed_travel_seconds),
        observed_wait_seconds=coalesce(excluded.observed_wait_seconds,public.afat_transit_line_nodes.observed_wait_seconds),
        fare_xaf=coalesce(excluded.fare_xaf,public.afat_transit_line_nodes.fare_xaf),
        confidence=greatest(public.afat_transit_line_nodes.confidence,excluded.confidence),
        evidence=public.afat_transit_line_nodes.evidence||excluded.evidence,updated_at=now()
      where public.afat_transit_line_nodes.node_id=excluded.node_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_afat_link_accepted_transit_sequence on public.afat_transit_observations;
create trigger trg_afat_link_accepted_transit_sequence after update of status on public.afat_transit_observations
for each row execute function public.afat_link_accepted_transit_sequence();

create or replace function public.afat_plan_multimodal_journey(p_origin_lat double precision,p_origin_lon double precision,p_place_id uuid,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_place public.afat_places%rowtype; v_dest_lat double precision; v_dest_lon double precision;
  v_walk jsonb; v_moto jsonb; v_car jsonb; v_minibus jsonb; v_options jsonb:='[]'::jsonb; v_candidate record;
  v_walk_in jsonb; v_walk_out jsonb; v_chain jsonb; v_transit_seconds integer; v_wait_seconds integer; v_fare_xaf integer;
  v_segment_count integer; v_time_count integer; v_fare_count integer;
  v_chain_status text:='insufficient_transit_evidence';
  v_reason text:='AFAT does not yet have enough reviewed, ordered transit evidence to claim a multimodal chain.';
begin
  select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
  if not found then raise exception 'Place not found'; end if;
  v_dest_lat:=v_place.latitude; v_dest_lon:=v_place.longitude;
  select latitude,longitude into v_dest_lat,v_dest_lon from public.afat_access_points
    where place_id=p_place_id and active=true and 'walk'=any(access_modes) order by confidence desc nulls last limit 1;
  v_dest_lat:=coalesce(v_dest_lat,v_place.latitude); v_dest_lon:=coalesce(v_dest_lon,v_place.longitude);

  v_walk:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'walk',p_at);
  v_moto:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'moto',p_at);
  v_car:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'car',p_at);
  v_minibus:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'minibus',p_at);
  if v_walk->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','walk','assessment',v_walk)); end if;
  if v_moto->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','moto','assessment',v_moto)); end if;
  if v_car->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','car','assessment',v_car)); end if;
  if v_minibus->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','minibus','assessment',v_minibus)); end if;

  select l.id line_id,l.line_ref,l.name line_name,l.mode,l.direction_label,l.confidence line_confidence,l.evidence_status line_evidence_status,
    bn.id board_node_id,bn.name board_name,bn.latitude board_lat,bn.longitude board_lon,bn.confidence board_confidence,
    an.id alight_node_id,an.name alight_name,an.latitude alight_lat,an.longitude alight_lon,an.confidence alight_confidence,
    bln.stop_sequence board_sequence,aln.stop_sequence alight_sequence,
    st_distance(bn.location,st_setsrid(st_makepoint(p_origin_lon,p_origin_lat),4326)::geography) board_walk_m,
    st_distance(an.location,st_setsrid(st_makepoint(v_dest_lon,v_dest_lat),4326)::geography) alight_walk_m,
    least(coalesce(l.confidence,0),coalesce(bn.confidence,0),coalesce(an.confidence,0),coalesce(bln.confidence,0),coalesce(aln.confidence,0)) chain_confidence
  into v_candidate
  from public.afat_transit_lines l
  join public.afat_transit_line_nodes bln on bln.line_id=l.id
  join public.afat_transit_nodes bn on bn.id=bln.node_id and bn.active=true
  join public.afat_transit_line_nodes aln on aln.line_id=l.id and aln.stop_sequence>bln.stop_sequence
  join public.afat_transit_nodes an on an.id=aln.node_id and an.active=true
  where l.active=true and l.evidence_status in ('limited','corroborated','field_verified')
    and bln.evidence_status in ('limited','corroborated','field_verified') and aln.evidence_status in ('limited','corroborated','field_verified')
    and st_dwithin(bn.location,st_setsrid(st_makepoint(p_origin_lon,p_origin_lat),4326)::geography,1200)
    and st_dwithin(an.location,st_setsrid(st_makepoint(v_dest_lon,v_dest_lat),4326)::geography,1200)
  order by (st_distance(bn.location,st_setsrid(st_makepoint(p_origin_lon,p_origin_lat),4326)::geography)+st_distance(an.location,st_setsrid(st_makepoint(v_dest_lon,v_dest_lat),4326)::geography)) asc,chain_confidence desc
  limit 1;

  if v_candidate.line_id is not null then
    v_walk_in:=public.afat_route_canonical(p_origin_lat,p_origin_lon,v_candidate.board_lat,v_candidate.board_lon,'walk',1200);
    v_walk_out:=public.afat_route_canonical(v_candidate.alight_lat,v_candidate.alight_lon,v_dest_lat,v_dest_lon,'walk',1200);
    if v_walk_in->>'status'='ok' and v_walk_out->>'status'='ok' then
      select count(*),count(observed_travel_seconds),coalesce(sum(observed_travel_seconds),0),count(fare_xaf),max(fare_xaf)
      into v_segment_count,v_time_count,v_transit_seconds,v_fare_count,v_fare_xaf
      from public.afat_transit_line_nodes where line_id=v_candidate.line_id and stop_sequence>=v_candidate.board_sequence and stop_sequence<v_candidate.alight_sequence;
      select observed_wait_seconds into v_wait_seconds from public.afat_transit_line_nodes where line_id=v_candidate.line_id and stop_sequence=v_candidate.board_sequence;
      v_chain:=jsonb_build_object(
        'type','walk_transit_walk',
        'line',jsonb_build_object('id',v_candidate.line_id,'line_ref',v_candidate.line_ref,'name',v_candidate.line_name,'mode',v_candidate.mode,'direction',v_candidate.direction_label,'confidence',v_candidate.line_confidence,'evidence_status',v_candidate.line_evidence_status),
        'boarding',jsonb_build_object('node_id',v_candidate.board_node_id,'name',v_candidate.board_name,'latitude',v_candidate.board_lat,'longitude',v_candidate.board_lon,'stop_sequence',v_candidate.board_sequence,'walk_distance_m',round(v_candidate.board_walk_m::numeric,1)),
        'alighting',jsonb_build_object('node_id',v_candidate.alight_node_id,'name',v_candidate.alight_name,'latitude',v_candidate.alight_lat,'longitude',v_candidate.alight_lon,'stop_sequence',v_candidate.alight_sequence,'walk_distance_m',round(v_candidate.alight_walk_m::numeric,1)),
        'walk_to_board',v_walk_in,'walk_from_alight',v_walk_out,'observed_wait_seconds',v_wait_seconds,
        'observed_transit_seconds',case when v_segment_count>0 and v_time_count=v_segment_count then v_transit_seconds else null end,
        'observed_fare_xaf',case when v_fare_count>0 then v_fare_xaf else null end,
        'travel_time_evidence_complete',(v_segment_count>0 and v_time_count=v_segment_count),'fare_evidence_count',v_fare_count,
        'confidence',v_candidate.chain_confidence,'automatic_truth',false
      );
      v_chain_status:='observed_single_line_chain';
      v_reason:='AFAT found an ordered reviewed transit line with connected walking access on both ends.';
    else
      v_chain_status:='transit_candidate_walk_access_unresolved';
      v_reason:='AFAT found a reviewed transit candidate, but cannot yet confirm a connected walking leg to or from it.';
    end if;
  end if;

  return jsonb_build_object('place_id',p_place_id,'direct_options',v_options,
    'transit_network',jsonb_build_object('active_nodes',(select count(*) from public.afat_transit_nodes where active=true),'active_lines',(select count(*) from public.afat_transit_lines where active=true),'ordered_line_nodes',(select count(*) from public.afat_transit_line_nodes)),
    'multimodal_chain_status',v_chain_status,'multimodal_chain',v_chain,'reason',v_reason,'automatic_truth',false,'assessed_at',p_at);
end $$;

revoke all on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) from public,anon;
grant execute on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) to authenticated;