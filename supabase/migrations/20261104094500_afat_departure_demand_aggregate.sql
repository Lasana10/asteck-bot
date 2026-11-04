-- Voluntary scheduled-departure demand: read-only staff snapshot, never supply truth.
-- Raw reporter metadata and low-volume route interests are withheld.
create or replace function public.afat_departure_demand_snapshot(
  p_city_key text default 'cm-yaounde'
) returns jsonb
language plpgsql stable security definer set search_path='' as $afat$
declare
  v_uid uuid := (select auth.uid());
  v_city text;
  v_requests bigint;
  v_corridors jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view') or
    public.afat_has_permission('system.configure')
  ) then raise exception 'Planning permission required' using errcode='42501'; end if;
  select city_key into v_city from public.afat_city_profiles
    where city_key=p_city_key and status='active' limit 1;
  if v_city is null then raise exception 'Active city not found' using errcode='22023'; end if;
  select coalesce(sum(signal_count),0) into v_requests
    from public.afat_demand_signals d
    where d.city_key=v_city and d.signal_type='supply_gap'
      and d.source_kind='afat_runtime'
      and d.metadata->>'departure_demand'='true'
      and d.last_seen_at>now()-interval '30 days';
  select coalesce(jsonb_agg(jsonb_build_object(
     'corridor',ranked.label,'reported_requests',ranked.requests,
     'latest_report_at',ranked.latest_at,'independent_supply_verified',false
  ) order by ranked.requests desc,ranked.latest_at desc),'[]'::jsonb)
    into v_corridors
    from (
      select label,sum(signal_count)::bigint requests,max(last_seen_at) latest_at
      from public.afat_demand_signals d
      where d.city_key=v_city and d.signal_type='supply_gap'
        and d.source_kind='afat_runtime'
        and d.metadata->>'departure_demand'='true'
        and d.last_seen_at>now()-interval '30 days'
      group by label having sum(signal_count)>=3
      order by requests desc,latest_at desc limit 15
    ) ranked;
  return jsonb_build_object(
     'city_key',v_city,'reported_requests_30d',v_requests,
     'repeated_corridors',v_corridors,'minimum_report_count_to_display',3,
     'represents_unique_passengers',false,'scheduled_departures_verified',false,
     'automatic_truth',false,'generated_at',now()
  );
end;
$afat$;
revoke all on function public.afat_departure_demand_snapshot(text) from public,anon,authenticated;
grant execute on function public.afat_departure_demand_snapshot(text) to authenticated,service_role;
