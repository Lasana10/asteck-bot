-- Independently recorded unmet journeys, visible only as privacy-thresholded
-- operator opportunity signals. This never creates published service inventory.
create or replace function public.afat_operator_route_opportunities()
returns jsonb
language plpgsql stable security definer set search_path='' as $afat$
declare
 v_uid uuid:=(select auth.uid());
 v_operator public.profiles%rowtype;
 v_city_key text;
 v_rows jsonb;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v_operator from public.profiles where id=v_uid;
 if not found or v_operator.role<>'operator' or
    v_operator.operator_application_status<>'APPROVED' or
    v_operator.verification_status<>'verified' or not coalesce(v_operator.is_active,true)
 then raise exception 'Verified active operator account required' using errcode='42501'; end if;
 select city_key into v_city_key from public.afat_city_profiles
  where status='active' and (lower(city_name)=lower(coalesce(v_operator.preferred_city,''))
    or lower(city_key)=lower(coalesce(v_operator.preferred_city,''))) limit 1;
 if v_city_key is null then
  return jsonb_build_object('status','city_not_configured','corridors','[]'::jsonb,
   'minimum_report_count_to_display',3,'scheduled_departures_verified',false,
   'represents_unique_passengers',false,'automatic_truth',false);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('corridor',d.label,
   'reported_requests',d.request_count,'last_reported_at',d.last_seen_at,
   'available_operator_inventory',false,'actual_vehicle_available',false,
   'booking_confirmed',false) order by d.request_count desc,d.last_seen_at desc),'[]'::jsonb)
 into v_rows from (
   select label,sum(signal_count)::bigint request_count,max(last_seen_at) last_seen_at
   from public.afat_demand_signals
   where city_key=v_city_key and signal_type='supply_gap'
     and source_kind='afat_runtime'
     and metadata->>'departure_demand'='true'
     and last_seen_at>=now()-interval '30 days'
   group by label
   having sum(signal_count)>=3
   order by request_count desc,last_seen_at desc limit 12
 ) d;
 return jsonb_build_object('status','ok','city_key',v_city_key,
   'corridors',v_rows,'minimum_report_count_to_display',3,
   'scheduled_departures_verified',false,'represents_unique_passengers',false,
   'automatic_truth',false,'generated_at',now());
end;
$afat$;
revoke all on function public.afat_operator_route_opportunities() from public,anon,authenticated;
grant execute on function public.afat_operator_route_opportunities() to authenticated,service_role;
