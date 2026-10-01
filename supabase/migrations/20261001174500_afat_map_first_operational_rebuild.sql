-- AFAT map-first operational rebuild: viewport places, real search, and targeted missions.
create or replace function public.afat_places_in_view(
  p_city_key text default 'cm-yaounde', p_west double precision default 11.45,
  p_south double precision default 3.80, p_east double precision default 11.58,
  p_north double precision default 3.92, p_limit integer default 600
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_west>=p_east or p_south>=p_north then raise exception 'Invalid viewport'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object('city_key',v_city.city_key,'places',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,
      'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'status',p.status,
      'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,
      'vehicle_access',p.vehicle_access,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),
      'source_key',p.primary_source_key
    ) order by p.base_confidence desc,p.canonical_name)
    from (select * from public.afat_places
      where lower(city)=lower(v_city.city_name) and status<>'retired'
        and latitude between p_south and p_north and longitude between p_west and p_east
      order by base_confidence desc,canonical_name
      limit greatest(1,least(coalesce(p_limit,600),1200))) p
  ),'[]'::jsonb));
end $$;
revoke all on function public.afat_places_in_view(text,double precision,double precision,double precision,double precision,integer) from public,anon;
grant execute on function public.afat_places_in_view(text,double precision,double precision,double precision,double precision,integer) to authenticated;

create or replace function public.afat_search_places(p_city_key text default 'cm-yaounde',p_query text default '',p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_q text=lower(btrim(coalesce(p_query,'')));
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(v_q)<2 then return jsonb_build_object('places','[]'::jsonb); end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object('places',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,'place_type',p.place_type,
      'latitude',p.latitude,'longitude',p.longitude,'status',p.status,'evidence_status',p.evidence_status,
      'reachability_state',p.reachability_state,'vehicle_access',p.vehicle_access,'base_confidence',p.base_confidence,
      'source_only',coalesce((p.metadata->>'source_only')::boolean,false),'source_key',p.primary_source_key
    ) order by score desc,p.canonical_name)
    from (
      select p.*,case when lower(p.canonical_name)=v_q then 100 when lower(p.canonical_name) like v_q||'%' then 80
        when lower(p.canonical_name) like '%'||v_q||'%' then 60
        when exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a) like '%'||v_q||'%') then 50
        when lower(coalesce(p.description,'')) like '%'||v_q||'%' then 35 else 0 end
        + least(20,coalesce(p.base_confidence,0)/5) as score
      from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'
        and (lower(p.canonical_name) like '%'||v_q||'%'
          or exists(select 1 from unnest(coalesce(p.aliases,'{}'::text[])) a where lower(a) like '%'||v_q||'%')
          or lower(coalesce(p.description,'')) like '%'||v_q||'%')
      order by score desc,p.canonical_name limit greatest(1,least(coalesce(p_limit,20),50))
    ) p
  ),'[]'::jsonb));
end $$;
revoke all on function public.afat_search_places(text,text,integer) from public,anon;
grant execute on function public.afat_search_places(text,text,integer) to authenticated;

update public.afat_micro_missions set status='cancelled',
 evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('cancel_reason','superseded_by_targeted_uncertainty_generation','cancelled_at',now()),updated_at=now()
where status in ('open','claimed') and mission_type='verify_edge' and coalesce(evidence->>'reason','')='provisional_seed_needs_local_verification';

create or replace function public.afat_generate_micro_missions(p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid=(select auth.uid());v_created integer:=0;v_place_created integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('field.mission.manage') then raise exception 'Field mission management permission required'; end if;
  insert into public.afat_micro_missions(city,mission_type,title,question,target_place_id,priority,required_mode,expires_at,evidence)
  select p.city,'verify_destination_access','Confirm access to '||p.canonical_name,
    'Which entrance or pickup point actually works here, and which modes can use it?',p.id,
    least(100,35+coalesce(d.signal_count,1)*10+case when p.vehicle_access='unknown' then 20 else 0 end),
    d.requested_mode,now()+interval '7 days',
    jsonb_build_object('reason','real_destination_demand_missing_access','demand_signal_id',d.id,'signal_count',d.signal_count,'place_evidence_status',p.evidence_status,'automatic_truth',false)
  from public.afat_demand_signals d join public.afat_places p on p.id=d.resolved_place_id
  where d.status='active' and d.signal_count>=1
    and not exists(select 1 from public.afat_access_points a where a.place_id=p.id and a.active=true)
    and not exists(select 1 from public.afat_micro_missions m where m.target_place_id=p.id and m.mission_type='verify_destination_access' and m.status in ('open','claimed','submitted'))
  order by d.signal_count desc,d.last_seen_at desc limit greatest(1,least(coalesce(p_limit,12),50));
  get diagnostics v_place_created=row_count;
  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,required_mode,expires_at,evidence)
  select coalesce(n.city,'Yaoundé'),'verify_edge','Check '||coalesce(e.canonical_name,'this road'),
    case when e.evidence_status='disputed' then 'AFAT has conflicting evidence here. What is the road condition and which modes can pass now?'
      else 'AFAT has very weak or stale evidence here. Is this road currently usable, and by which modes?' end,
    e.id,least(100,case when e.evidence_status='disputed' then 80 else 45 end+greatest(0,35-e.confidence)
      +least(15,extract(epoch from(now()-coalesce(e.last_observed_at,e.created_at)))/86400/30)),
    case when 'moto'=any(e.access_modes) then 'moto' when 'car'=any(e.access_modes) then 'car' else null end,
    now()+interval '7 days',
    jsonb_build_object('reason',case when e.evidence_status='disputed' then 'source_or_evidence_disagreement' else 'very_low_or_stale_evidence' end,'atlas_confidence',e.confidence,'evidence_status',e.evidence_status,'automatic_truth',false)
  from public.afat_atlas_edges e join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and (e.evidence_status='disputed' or (e.confidence<35 and coalesce(e.last_observed_at,e.created_at)<now()-interval '90 days'))
    and not exists(select 1 from public.afat_micro_missions m where m.target_edge_id=e.id and m.status in ('open','claimed','submitted'))
  order by case when e.evidence_status='disputed' then 1 else 0 end desc,e.confidence asc,coalesce(e.last_observed_at,e.created_at) asc
  limit greatest(0,least(coalesce(p_limit,12)-v_place_created,50));
  get diagnostics v_created=row_count;v_created:=v_created+v_place_created;
  return jsonb_build_object('created',v_created,'place_access',v_place_created,'edge_checks',v_created-v_place_created,'automatic_truth',false);
end $$;
