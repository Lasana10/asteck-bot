create unique index if not exists payment_events_provider_external_uidx
  on public.payment_events(provider,external_id)
  where external_id is not null and btrim(external_id)<>'';

create or replace function public.afat_review_transit_observation(
  p_observation_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_uid uuid:=auth.uid();
  v_obs public.afat_transit_observations%rowtype;
  v_city public.afat_city_profiles%rowtype;
  v_node_id uuid;
  v_line_id uuid;
  v_node_type text;
  v_line_ref text;
  v_conf numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then
    raise exception 'Transit evidence review permission required';
  end if;
  if p_decision not in ('accept','reject') then raise exception 'Decision must be accept or reject'; end if;

  select * into v_obs from public.afat_transit_observations where id=p_observation_id for update;
  if not found then raise exception 'Transit observation not found'; end if;
  if v_obs.status<>'pending' then
    return jsonb_build_object('id',v_obs.id,'status',v_obs.status,'automatic_truth',false);
  end if;

  if p_decision='reject' then
    update public.afat_transit_observations
      set status='rejected',reviewer_id=v_uid,reviewed_at=now(),updated_at=now()
      where id=v_obs.id;
    return jsonb_build_object('id',v_obs.id,'status','rejected','automatic_truth',false);
  end if;

  select * into v_city from public.afat_city_profiles where city_key=v_obs.city_key and status='active';
  if not found then raise exception 'Active city profile not found'; end if;
  v_conf:=case when v_obs.gps_accuracy_m is null then 30 when v_obs.gps_accuracy_m<=20 then 50 when v_obs.gps_accuracy_m<=60 then 42 else 28 end;

  if v_obs.observation_type in ('stop','boarding','transfer','terminus') then
    if v_obs.latitude is null or v_obs.longitude is null or nullif(btrim(coalesce(v_obs.node_name,'')),'') is null then
      raise exception 'Accepted transit node evidence needs a name and coordinates';
    end if;
    v_node_type:=case v_obs.observation_type when 'transfer' then 'transfer' when 'terminus' then 'terminus' when 'boarding' then 'boarding' else 'informal_stop' end;

    select id into v_node_id
    from public.afat_transit_nodes n
    where n.city_profile_id=v_city.id and n.active=true
      and lower(n.name)=lower(v_obs.node_name)
      and st_dwithin(n.location,st_setsrid(st_makepoint(v_obs.longitude,v_obs.latitude),4326)::geography,40)
    order by n.confidence desc limit 1;

    if v_node_id is null then
      insert into public.afat_transit_nodes(city_profile_id,node_type,name,latitude,longitude,location,access_modes,confidence,evidence_status,active,evidence)
      values(v_city.id,v_node_type,v_obs.node_name,v_obs.latitude,v_obs.longitude,
        st_setsrid(st_makepoint(v_obs.longitude,v_obs.latitude),4326)::geography,
        case when v_obs.mode='moto_taxi' then array['walk','moto']::text[] else array['walk',coalesce(v_obs.mode,'minibus')]::text[] end,
        v_conf,'limited',true,
        jsonb_build_object('automatic_truth',false,'source','community_transit_observation','observation_ids',jsonb_build_array(v_obs.id),'reviewed_by',v_uid,'reviewed_at',now()))
      returning id into v_node_id;
    else
      update public.afat_transit_nodes
        set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('last_observation_id',v_obs.id,'last_reviewed_at',now()),updated_at=now()
        where id=v_node_id;
    end if;
  end if;

  if v_obs.observation_type in ('line','service_pattern') or nullif(btrim(coalesce(v_obs.line_name,'')),'') is not null then
    if nullif(btrim(coalesce(v_obs.line_name,'')),'') is not null and v_obs.mode is not null then
      v_line_ref:='AFAT-COMMUNITY-'||upper(substr(md5(v_obs.city_key||':'||lower(v_obs.line_name)||':'||v_obs.mode||':'||lower(coalesce(v_obs.direction_label,''))),1,16));
      insert into public.afat_transit_lines(city_profile_id,line_ref,name,mode,direction_label,service_pattern,confidence,evidence_status,active,evidence)
      values(v_city.id,v_line_ref,v_obs.line_name,v_obs.mode,v_obs.direction_label,
        case when v_obs.observation_type='service_pattern' then jsonb_build_object('observed',true) else '{}'::jsonb end,
        30,'limited',true,
        jsonb_build_object('automatic_truth',false,'source','community_transit_observation','observation_ids',jsonb_build_array(v_obs.id),'reviewed_by',v_uid,'reviewed_at',now()))
      on conflict(line_ref) do update set
        updated_at=now(),
        evidence=public.afat_transit_lines.evidence||jsonb_build_object('last_observation_id',excluded.evidence->'observation_ids'->0,'last_reviewed_at',now())
      returning id into v_line_id;
    end if;
  end if;

  update public.afat_transit_observations
    set status='accepted',reviewer_id=v_uid,reviewed_at=now(),updated_at=now(),
        evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false,'promoted_node_id',v_node_id,'promoted_line_id',v_line_id)
    where id=v_obs.id;

  return jsonb_build_object('id',v_obs.id,'status','accepted','transit_node_id',v_node_id,'transit_line_id',v_line_id,'evidence_status','limited','automatic_truth',false);
end;
$$;

revoke all on function public.afat_review_transit_observation(uuid,text) from public,anon;
grant execute on function public.afat_review_transit_observation(uuid,text) to authenticated;