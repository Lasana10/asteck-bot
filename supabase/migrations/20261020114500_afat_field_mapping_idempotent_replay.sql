-- Exactly-once field mapping intake for untrusted offline clients.
-- Scoped by authenticated contributor; legacy unkeyed submissions remain valid.
-- Server enforces a unique idempotency key; replay cannot multiply Atlas observations.
create unique index if not exists afat_mapping_observations_contributor_client_id_uq
on public.afat_mapping_observations(contributor_id, (attributes->>'client_observation_id'))
where attributes ? 'client_observation_id';

CREATE OR REPLACE FUNCTION public.afat_submit_mapping_observation(p_city_key text, p_observation_type text, p_latitude double precision, p_longitude double precision, p_accuracy_m numeric, p_movement_mode text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_attributes jsonb DEFAULT '{}'::jsonb, p_media_paths jsonb DEFAULT '[]'::jsonb, p_observed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_id uuid;
  v_conf numeric;
  v_match uuid;
  v_distance numeric;
  v_original public.afat_mapping_observations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('report.create') then raise exception 'Field contribution permission required'; end if;
  if p_observation_type not in ('entrance','landmark','informal_stop','pickup_point','local_name','mode_access','road_surface','road_condition','missing_path','missing_road','restriction','other') then raise exception 'Unsupported mapping observation type'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if p_accuracy_m is null or p_accuracy_m>150 then raise exception 'Location accuracy is too weak for field mapping'; end if;

  if coalesce(p_attributes,'{}'::jsonb) ? 'client_observation_id' and (
    jsonb_typeof(p_attributes->'client_observation_id') is distinct from 'string' or
    (p_attributes->>'client_observation_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then raise exception 'Invalid client observation identity'; end if;
  if jsonb_typeof(coalesce(p_attributes,'{}'::jsonb)) is distinct from 'object' then raise exception 'Invalid observation attributes'; end if;
  if p_accuracy_m < 0 then raise exception 'Invalid location uncertainty'; end if;
  if p_observed_at > now() + interval '5 seconds' then raise exception 'Future observation rejected'; end if;

  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile unavailable'; end if;

  v_conf:=case when p_accuracy_m<=15 then 62 when p_accuracy_m<=35 then 52 when p_accuracy_m<=70 then 44 else 35 end;

  insert into public.afat_mapping_observations(
    contributor_id,city_profile_id,observation_type,latitude,longitude,movement_mode,label,description,attributes,media_paths,confidence,observed_at
  ) values (
    v_uid,v_city.id,p_observation_type,p_latitude,p_longitude,p_movement_mode,
    nullif(trim(coalesce(p_label,'')),''),nullif(trim(coalesce(p_description,'')),''),
    coalesce(p_attributes,'{}'::jsonb)||jsonb_build_object('accuracy_m',p_accuracy_m),
    coalesce(p_media_paths,'[]'::jsonb),v_conf,coalesce(p_observed_at,now())
  ) on conflict do nothing returning id into v_id;

  if v_id is null then
    select * into v_original from public.afat_mapping_observations
    where contributor_id=v_uid and attributes->>'client_observation_id'=p_attributes->>'client_observation_id'
    limit 1;
    if not found then raise exception 'Field observation insert conflict unresolved'; end if;
    if v_original.observation_type is distinct from p_observation_type or
       v_original.latitude is distinct from p_latitude or
       v_original.longitude is distinct from p_longitude or
       v_original.observed_at is distinct from coalesce(p_observed_at,now()) or
       v_original.movement_mode is distinct from p_movement_mode or
       v_original.label is distinct from nullif(trim(coalesce(p_label,'')),'') or
       v_original.description is distinct from nullif(trim(coalesce(p_description,'')),'') or
       v_original.attributes->'accuracy_m' is distinct from to_jsonb(p_accuracy_m) or
       v_original.media_paths is distinct from coalesce(p_media_paths,'[]'::jsonb) then
       raise exception 'Conflicting field observation replay';
    end if;
    return jsonb_build_object('id',v_original.id,'status',v_original.status,'confidence',v_original.confidence,'idempotent_replay',true,'matched_edge_id',null,'matched_edge_distance_m',null);
  end if;

  select e.id,public.st_distance(e.geometry,public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography)
  into v_match,v_distance
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and n.city=v_city.city_name
    and public.st_dwithin(e.geometry,public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,greatest(25,least(120,p_accuracy_m+35)))
  order by e.geometry <-> public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography
  limit 1;

  if v_match is not null and p_observation_type in ('road_surface','road_condition','mode_access','restriction') then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at
    ) values (
      v_match,v_uid,'field_mapping_'||p_observation_type,
      jsonb_build_object('type',p_observation_type,'label',p_label,'description',p_description,'movement_mode',p_movement_mode,'attributes',coalesce(p_attributes,'{}'::jsonb)),
      'field_mapper',v_conf,
      jsonb_build_object('mapping_observation_id',v_id,'accuracy_m',p_accuracy_m,'edge_distance_m',v_distance),
      coalesce(p_observed_at,now())
    );
  end if;

  return jsonb_build_object('id',v_id,'status','candidate','confidence',v_conf,'matched_edge_id',v_match,'matched_edge_distance_m',v_distance);
end; $function$;