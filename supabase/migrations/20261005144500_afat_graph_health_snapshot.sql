create or replace function public.afat_graph_health_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_city public.afat_city_profiles%rowtype; v_nodes integer:=0; v_routable_nodes integer:=0; v_edges integer:=0; v_components integer:=0; v_largest integer:=0; v_isolated integer:=0; v_provisional integer:=0; v_low_conf integer:=0; v_avg_conf numeric:=0; v_share numeric:=0; v_state text:='empty';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'Active city profile not found'; end if;
  select count(*),count(*) filter(where routing_vertex_id is not null) into v_nodes,v_routable_nodes from public.afat_atlas_nodes where lower(city)=lower(v_city.city_name) and status='active';
  select count(*),count(*) filter(where evidence_status='provisional'),count(*) filter(where coalesce(confidence,0)<60),coalesce(avg(confidence),0)
    into v_edges,v_provisional,v_low_conf,v_avg_conf
  from public.afat_atlas_edges e join public.afat_atlas_nodes fn on fn.id=e.from_node_id join public.afat_atlas_nodes tn on tn.id=e.to_node_id
  where e.status='active' and e.routing_edge_id is not null and fn.routing_vertex_id is not null and tn.routing_vertex_id is not null and lower(fn.city)=lower(v_city.city_name) and lower(tn.city)=lower(v_city.city_name);
  with city_nodes as (select routing_vertex_id from public.afat_atlas_nodes where lower(city)=lower(v_city.city_name) and status='active' and routing_vertex_id is not null),
  comps as (select c.component,c.node from pgr_connectedComponents('select e.routing_edge_id as id, fn.routing_vertex_id as source, tn.routing_vertex_id as target, 1.0::float8 as cost from public.afat_atlas_edges e join public.afat_atlas_nodes fn on fn.id=e.from_node_id join public.afat_atlas_nodes tn on tn.id=e.to_node_id where e.status=''active'' and e.routing_edge_id is not null and fn.routing_vertex_id is not null and tn.routing_vertex_id is not null') c join city_nodes n on n.routing_vertex_id=c.node),
  sizes as (select component,count(*)::int n from comps group by component)
  select count(*),coalesce(max(n),0) into v_components,v_largest from sizes;
  select count(*) into v_isolated from public.afat_atlas_nodes n where lower(n.city)=lower(v_city.city_name) and n.status='active' and n.routing_vertex_id is not null and not exists(select 1 from public.afat_atlas_edges e where e.status='active' and e.routing_edge_id is not null and (e.from_node_id=n.id or e.to_node_id=n.id));
  v_share:=case when v_routable_nodes>0 then round((v_largest::numeric/v_routable_nodes::numeric)*100,1) else 0 end;
  v_state:=case when v_edges=0 or v_routable_nodes=0 then 'empty' when v_share>=90 and v_isolated=0 then 'strongly_connected' when v_share>=75 then 'usable_fragmented' when v_share>=50 then 'fragmented' else 'highly_fragmented' end;
  return jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'state',v_state,'active_nodes',v_nodes,'routable_nodes',v_routable_nodes,'active_routable_edges',v_edges,'connected_components',v_components,'largest_component_nodes',v_largest,'largest_component_share_pct',v_share,'isolated_routable_nodes',v_isolated,'provisional_edges',v_provisional,'low_confidence_edges',v_low_conf,'average_edge_confidence',round(v_avg_conf,1),'automatic_truth',false,'generated_at',now());
end $$;
revoke all on function public.afat_graph_health_snapshot(text) from public,anon;
grant execute on function public.afat_graph_health_snapshot(text) to authenticated;
