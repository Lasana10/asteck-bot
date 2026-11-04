-- Preserve existing demand signal semantics, but return the standard
-- authenticated offline-queue receipt. A successful gap report is a planning
-- signal, NOT an accepted transport observation or a published service.
create or replace function public.afat_record_mobility_gap(
  p_city_key text, p_signal_type text, p_label text,
  p_place_id uuid default null, p_mode text default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path='public','extensions','pg_catalog' as $afat$
declare v_uid uuid:=auth.uid(); v_fp text; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_signal_type not in ('supply_gap','route_failure','access_gap','transit_gap','delivery_demand','business_demand')
    then raise exception 'Unsupported mobility gap' using errcode='22023'; end if;
  v_fp:=md5(coalesce(p_city_key,'cm-yaounde')||':'||p_signal_type||':'||
    coalesce(p_place_id::text,'')||':'||coalesce(round(p_latitude::numeric,3)::text,'')||':'||
    coalesce(round(p_longitude::numeric,3)::text,'')||':'||lower(coalesce(trim(p_label),'')));
  insert into public.afat_demand_signals(
    city_key,fingerprint,signal_type,label,requested_mode,signal_count,status,
    source_kind,first_seen_at,last_seen_at,resolved_place_id,metadata)
  values(
    coalesce(nullif(trim(p_city_key),''),'cm-yaounde'),
    v_fp,p_signal_type,left(coalesce(nullif(trim(p_label),''),p_signal_type),180),
    p_mode,1,'open','afat_runtime',now(),now(),p_place_id,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'automatic_truth',false,'last_reporter_id',v_uid,
      'latitude',p_latitude,'longitude',p_longitude))
  on conflict(city_key,fingerprint,signal_type) do update
    set signal_count=public.afat_demand_signals.signal_count+1,
        last_seen_at=now(),
        requested_mode=coalesce(excluded.requested_mode,public.afat_demand_signals.requested_mode),
        metadata=public.afat_demand_signals.metadata||excluded.metadata
  returning id into v_id;
  return jsonb_build_object(
    'id',v_id,'recorded',true,'status','pending','automatic_truth',false,
    'signal_type',p_signal_type,'human_reviewed',false,
    'published_transport_service',false);
end;
$afat$;
revoke all on function public.afat_record_mobility_gap(text,text,text,uuid,text,double precision,double precision,jsonb)
  from public,anon;
grant execute on function public.afat_record_mobility_gap(text,text,text,uuid,text,double precision,double precision,jsonb)
  to authenticated,service_role;
