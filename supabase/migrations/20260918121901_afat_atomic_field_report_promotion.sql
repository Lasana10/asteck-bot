create or replace function public.afat_review_field_report(
  p_report_id uuid,
  p_reviewer_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_report public.afat_field_reports%rowtype;
  v_incident public.incidents%rowtype;
  v_incident_type text;
  v_confidence integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501', message='Service role required'; end if;
  if p_status not in ('triaged','verified','rejected','resolved') then raise exception using errcode='22023', message='Unsupported field report review state'; end if;
  select * into v_report from public.afat_field_reports where id=p_report_id for update;
  if not found then raise exception using errcode='P0002', message='Field report not found'; end if;
  update public.afat_field_reports set status=p_status,reviewed_by=p_reviewer_id,reviewed_at=now(),
    resolution_notes=nullif(trim(coalesce(p_resolution_notes,'')),''),updated_at=now()
  where id=p_report_id returning * into v_report;
  if p_status='verified' and v_report.promoted_incident_id is null and v_report.latitude is not null and v_report.longitude is not null then
    v_incident_type := case v_report.report_type when 'crash' then 'accident' when 'road_obstruction' then 'roadblock'
      when 'route_issue' then 'road_damage' when 'unsafe_pickup' then 'hazard' when 'security_concern' then 'hazard' else 'other' end;
    v_confidence := case when v_report.accuracy_m is null then 70 when v_report.accuracy_m<=25 then 95
      when v_report.accuracy_m<=75 then 88 when v_report.accuracy_m<=200 then 78 else 65 end;
    insert into public.incidents(reporter_id,reporter_username,type,description,location,latitude,longitude,severity,status,source,expires_at,verification_status,resolver_id,resolved_at,confidence_score)
    values(v_report.reporter_profile_id,'AFAT journey field report',v_incident_type,
      coalesce(v_report.description,initcap(replace(v_report.report_type,'_',' '))),
      public.st_setsrid(public.st_makepoint(v_report.longitude,v_report.latitude),4326)::geography,
      v_report.latitude,v_report.longitude,v_report.severity,'verified','ops',
      now()+case when v_report.severity>=4 then interval '8 hours' else interval '4 hours' end,
      'verified',p_reviewer_id,null,v_confidence)
    returning * into v_incident;
    update public.afat_field_reports set promoted_incident_id=v_incident.id,updated_at=now() where id=v_report.id returning * into v_report;
  elsif p_status='resolved' and v_report.promoted_incident_id is not null then
    update public.incidents set status='resolved',verification_status='resolved',resolver_id=p_reviewer_id,resolved_at=now()
    where id=v_report.promoted_incident_id and status<>'resolved' returning * into v_incident;
  elsif p_status='rejected' and v_report.promoted_incident_id is not null then
    update public.incidents set status='dismissed',verification_status='rejected',resolver_id=p_reviewer_id,resolved_at=now()
    where id=v_report.promoted_incident_id returning * into v_incident;
  end if;
  return jsonb_build_object('report',to_jsonb(v_report),'incident',case when v_incident.id is null then null else to_jsonb(v_incident) end);
end; $$;
revoke all on function public.afat_review_field_report(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.afat_review_field_report(uuid,uuid,text,text) to service_role;
