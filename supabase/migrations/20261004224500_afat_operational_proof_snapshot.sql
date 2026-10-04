create or replace function public.afat_operational_proof_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_uid uuid:=auth.uid();
  v_city public.afat_city_profiles%rowtype;
  v_pending_cells bigint; v_completed_cells bigint; v_failed_cells bigint;
  v_contribution_samples bigint; v_navigation_sessions bigint; v_navigation_samples bigint; v_arrived_sessions bigint;
  v_access_points bigint; v_access_pending bigint; v_meeting_points bigint;
  v_transit_nodes bigint; v_transit_lines bigint; v_transit_pending bigint;
  v_supply bigint; v_dispatch bigint; v_completed_dispatch bigint;
  v_ride_credits bigint; v_service_requests bigint; v_service_proofs bigint; v_completed_services bigint;
  v_eta_profiles bigint;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'Active city profile not found'; end if;
  select count(*) filter(where status='pending'),count(*) filter(where status in ('completed','completed_with_errors')),count(*) filter(where status='failed') into v_pending_cells,v_completed_cells,v_failed_cells from public.afat_city_ingestion_cells where city_profile_id=v_city.id;
  select count(*) into v_contribution_samples from public.afat_contribution_samples;
  select count(*),count(*) filter(where status='arrived') into v_navigation_sessions,v_arrived_sessions from public.afat_navigation_sessions where city_key=p_city_key;
  select count(*) into v_navigation_samples from public.afat_navigation_samples s join public.afat_navigation_sessions n on n.id=s.session_id where n.city_key=p_city_key;
  select count(*) into v_access_points from public.afat_access_points ap join public.afat_places p on p.id=ap.place_id where ap.active=true and lower(p.city)=lower(v_city.city_name);
  select count(*) into v_access_pending from public.afat_access_evidence_submissions a join public.afat_places p on p.id=a.place_id where a.status='pending' and lower(p.city)=lower(v_city.city_name);
  select count(*) into v_meeting_points from public.afat_meeting_points mp join public.afat_places p on p.id=mp.place_id where mp.status<>'retired' and lower(p.city)=lower(v_city.city_name);
  select count(*) into v_transit_nodes from public.afat_transit_nodes where city_profile_id=v_city.id and active=true;
  select count(*) into v_transit_lines from public.afat_transit_lines where city_profile_id=v_city.id and active=true;
  select count(*) into v_transit_pending from public.afat_transit_observations where city_key=p_city_key and status='pending';
  select count(*) into v_supply from public.vehicles v join public.profiles p on p.id=v.operator_id where v.is_available=true and v.clearance_status='verified' and v.last_ping_at>=now()-interval '120 seconds' and p.role='operator' and upper(coalesce(p.operator_application_status,''))='APPROVED' and upper(coalesce(p.verification_status,'')) in ('VERIFIED','APPROVED') and coalesce(p.is_active,false)=true;
  select count(*),count(*) filter(where status='completed') into v_dispatch,v_completed_dispatch from public.dispatch_assignments;
  select count(*) into v_ride_credits from public.wallet_ledger where entry_type='ride_credit' and direction='credit' and status='posted';
  select count(*),count(*) filter(where status='completed') into v_service_requests,v_completed_services from public.service_requests;
  select count(*) into v_service_proofs from public.afat_service_request_events where event_type in ('pickup_verified','item_collected','passenger_boarded','delivery_proof','recipient_confirmed');
  select count(*) into v_eta_profiles from public.afat_corridor_speed_profiles where sample_count>=5 and evidence_status in ('corroborated','field_verified');
  return jsonb_build_object(
    'city_key',p_city_key,'city_name',v_city.city_name,'generated_at',now(),'privacy','aggregate_operational_proof_no_raw_personal_trace',
    'city_ingestion',jsonb_build_object('pending_cells',v_pending_cells,'completed_cells',v_completed_cells,'failed_cells',v_failed_cells,'has_real_ingestion',v_completed_cells>0),
    'contribution',jsonb_build_object('saved_samples',v_contribution_samples,'has_real_sample_proof',v_contribution_samples>0),
    'navigation',jsonb_build_object('sessions',v_navigation_sessions,'samples',v_navigation_samples,'arrived_sessions',v_arrived_sessions,'has_real_journey_proof',v_navigation_samples>0 and v_arrived_sessions>0),
    'last_100m',jsonb_build_object('active_access_points',v_access_points,'pending_access_submissions',v_access_pending,'meeting_points',v_meeting_points,'has_reviewed_access',v_access_points>0),
    'transit',jsonb_build_object('active_nodes',v_transit_nodes,'active_lines',v_transit_lines,'pending_observations',v_transit_pending,'has_network_proof',v_transit_nodes>1 and v_transit_lines>0),
    'supply',jsonb_build_object('fresh_verified_vehicles',v_supply,'has_live_supply_proof',v_supply>0),
    'dispatch',jsonb_build_object('assignments',v_dispatch,'completed_assignments',v_completed_dispatch,'has_dispatch_proof',v_dispatch>0),
    'money',jsonb_build_object('posted_ride_credits',v_ride_credits,'has_settlement_proof',v_ride_credits>0),
    'delivery',jsonb_build_object('requests',v_service_requests,'completed_requests',v_completed_services,'proof_events',v_service_proofs,'has_delivery_proof',v_service_proofs>0),
    'eta_learning',jsonb_build_object('trusted_profiles',v_eta_profiles,'has_trusted_eta_proof',v_eta_profiles>0),
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'coverage',case when v_completed_cells=0 then 'Run authenticated City Genesis ingestion cells.' end,
      'contribution',case when v_contribution_samples=0 then 'Complete one real contribution with saved GPS samples.' end,
      'journey',case when v_navigation_samples=0 then 'Run one real phone navigation journey with server-saved samples.' end,
      'access',case when v_access_points=0 then 'Submit and review at least one real entrance/access point.' end,
      'transit',case when not(v_transit_nodes>1 and v_transit_lines>0) then 'Collect and review enough ordered transit evidence for a real line.' end,
      'supply',case when v_supply=0 then 'Bring one approved operator with a verified vehicle online using fresh GPS.' end,
      'dispatch',case when v_dispatch=0 then 'Create and assign one real transport/service request.' end,
      'settlement',case when v_ride_credits=0 then 'Complete one real paid/cash-confirmed booking through exactly-once settlement.' end,
      'delivery',case when v_service_proofs=0 then 'Execute one real proof-backed delivery lifecycle.' end,
      'eta',case when v_eta_profiles=0 then 'Collect consented completed journey evidence until corridor speed profiles become corroborated.' end
    ))
  );
end $$;
revoke all on function public.afat_operational_proof_snapshot(text) from public,anon;
grant execute on function public.afat_operational_proof_snapshot(text) to authenticated;
