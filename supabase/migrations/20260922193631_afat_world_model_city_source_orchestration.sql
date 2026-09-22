-- AFAT World Model completion: city-portable source plans + safe source-signal gateway.
create table if not exists public.afat_city_source_plans (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  source_key text not null references public.afat_geo_sources(source_key) on delete cascade,
  adapter_key text,
  plan_state text not null check (plan_state in ('ready','needs_credentials','needs_bulk_extract','reference_only','disabled','error')),
  priority numeric not null default 50 check (priority between 0 and 100),
  feature_classes text[] not null default '{}'::text[],
  last_run_at timestamptz,last_success_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(city_profile_id,source_key)
);
create index if not exists afat_city_source_plans_city_idx on public.afat_city_source_plans(city_profile_id,plan_state,priority desc);
alter table public.afat_city_source_plans enable row level security;
revoke all on public.afat_city_source_plans from anon,authenticated;

create or replace function public.afat_city_source_plan_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_result jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'City source planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile required'; end if;
 select jsonb_build_object(
  'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'learning_stage',v_city.learning_stage,'operational_confidence',v_city.operational_confidence),
  'summary',jsonb_build_object(
    'ready',count(*) filter(where p.plan_state='ready'),
    'reference_only',count(*) filter(where p.plan_state='reference_only'),
    'needs_bulk_extract',count(*) filter(where p.plan_state='needs_bulk_extract'),
    'needs_credentials',count(*) filter(where p.plan_state='needs_credentials'),
    'error',count(*) filter(where p.plan_state='error')
  ),
  'sources',coalesce(jsonb_agg(jsonb_build_object(
    'source_key',p.source_key,'display_name',s.display_name,'provider_name',s.provider_name,'data_mode',cp.data_mode,
    'adapter_key',p.adapter_key,'plan_state',p.plan_state,'priority',p.priority,'feature_classes',p.feature_classes,
    'last_run_at',p.last_run_at,'last_success_at',p.last_success_at,'last_result',p.last_result,
    'durable_storage_allowed',cp.durable_storage_allowed,'usage_constraints',s.usage_constraints
  ) order by p.priority desc,s.display_name),'[]'::jsonb)
 ) into v_result
 from public.afat_city_source_plans p join public.afat_geo_sources s on s.source_key=p.source_key
 join public.afat_source_capability_profiles cp on cp.source_key=p.source_key
 where p.city_profile_id=v_city.id;
 return v_result;
end;$$;

create or replace function public.afat_register_source_signal(
 p_city_key text,p_source_key text,p_signal_type text,p_latitude double precision,p_longitude double precision,
 p_headline text,p_detail text default null,p_external_ref text default null,p_severity numeric default 50,
 p_uncertainty numeric default 70,p_demand_value numeric default 40,p_freshness_risk numeric default 50,
 p_verification_cost numeric default 40,p_observed_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_cap public.afat_source_capability_profiles%rowtype;v_type text;v_info numeric;v_fp text;v_row public.afat_source_discrepancies%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Source signal permission required'; end if;
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
 select * into v_city from public.afat_city_profiles where city_key=lower(trim(p_city_key)) and status='active';if not found then raise exception 'Active city profile required';end if;
 select * into v_cap from public.afat_source_capability_profiles where source_key=p_source_key and active_for_gap_detection=true;if not found then raise exception 'Source is not enabled for AFAT gap detection';end if;
 v_type:=case lower(trim(p_signal_type)) when 'remote_change' then 'remote_change_hypothesis' when 'visual_gap' then 'visual_coverage_gap' when 'geometry_gap' then 'geometry_gap' when 'place_gap' then 'place_gap' when 'entrance_gap' then 'entrance_gap' when 'mode_gap' then 'mode_coverage_gap' when 'freshness_gap' then 'freshness_gap' else 'other' end;
 v_info:=least(100,greatest(0,.35*least(100,greatest(0,coalesce(p_uncertainty,70)))+.25*least(100,greatest(0,coalesce(p_severity,50)))+.20*least(100,greatest(0,coalesce(p_freshness_risk,50)))+.15*least(100,greatest(0,coalesce(p_demand_value,40)))+.05*(100-least(100,greatest(0,coalesce(p_verification_cost,40))))));
 v_fp:=md5(concat_ws(':',v_city.id::text,p_source_key,v_type,round(p_latitude::numeric,5)::text,round(p_longitude::numeric,5)::text,coalesce(p_external_ref,''),coalesce(p_headline,'')));
 insert into public.afat_source_discrepancies(city_profile_id,discrepancy_type,location,source_keys,headline,detail,severity,uncertainty,demand_value,freshness_risk,verification_cost,information_value,recommended_method,fingerprint,status,evidence,first_detected_at,last_detected_at,updated_at)
 values(v_city.id,v_type,public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,array[p_source_key],left(trim(p_headline),180),nullif(left(trim(coalesce(p_detail,'')),600),''),least(100,greatest(0,coalesce(p_severity,50))),least(100,greatest(0,coalesce(p_uncertainty,70))),least(100,greatest(0,coalesce(p_demand_value,40))),least(100,greatest(0,coalesce(p_freshness_risk,50))),least(100,greatest(0,coalesce(p_verification_cost,40))),v_info,case when v_type='remote_change_hypothesis' then 'targeted_visual_or_traversal_verification' when v_type='visual_coverage_gap' then 'safe_field_photo' else 'independent_field_verification' end,v_fp,'open',jsonb_build_object('source_key',p_source_key,'source_data_mode',v_cap.data_mode,'external_ref',p_external_ref,'observed_at',coalesce(p_observed_at,now()),'durable_source_content_copied',false,'signal_only',true),coalesce(p_observed_at,now()),coalesce(p_observed_at,now()),now())
 on conflict(fingerprint) do update set severity=excluded.severity,uncertainty=excluded.uncertainty,demand_value=excluded.demand_value,freshness_risk=excluded.freshness_risk,verification_cost=excluded.verification_cost,information_value=excluded.information_value,detail=coalesce(excluded.detail,public.afat_source_discrepancies.detail),last_detected_at=excluded.last_detected_at,updated_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,'discrepancy_type',v_row.discrepancy_type,'information_value',v_row.information_value,'source_key',p_source_key,'signal_only',true);
end;$$;

create or replace function public.afat_mark_city_source_result(p_city_key text,p_source_key text,p_success boolean,p_result jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_city_id uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not public.afat_has_permission('system.configure') then raise exception 'System configuration permission required';end if;
 select id into v_city_id from public.afat_city_profiles where city_key=p_city_key and status='active';if v_city_id is null then raise exception 'Active city profile required';end if;
 update public.afat_city_source_plans set last_run_at=now(),last_success_at=case when p_success then now() else last_success_at end,last_result=coalesce(p_result,'{}'::jsonb),plan_state=case when p_success then 'ready' else 'error' end,updated_at=now() where city_profile_id=v_city_id and source_key=p_source_key;
 return jsonb_build_object('city_key',p_city_key,'source_key',p_source_key,'success',p_success);
end;$$;

revoke all on function public.afat_city_source_plan_snapshot(text) from public,anon;
revoke all on function public.afat_register_source_signal(text,text,text,double precision,double precision,text,text,text,numeric,numeric,numeric,numeric,numeric,timestamptz) from public,anon;
revoke all on function public.afat_mark_city_source_result(text,text,boolean,jsonb) from public,anon;
grant execute on function public.afat_city_source_plan_snapshot(text) to authenticated;
grant execute on function public.afat_register_source_signal(text,text,text,double precision,double precision,text,text,text,numeric,numeric,numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.afat_mark_city_source_result(text,text,boolean,jsonb) to authenticated;
