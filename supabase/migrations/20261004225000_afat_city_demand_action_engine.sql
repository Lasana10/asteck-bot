create table if not exists public.afat_city_actions (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  demand_signal_id uuid not null references public.afat_demand_signals(id) on delete cascade,
  action_type text not null check (action_type in ('mapping_verification','operator_recruitment','transit_research','delivery_capacity','business_onboarding')),
  status text not null default 'open' check (status in ('open','in_progress','completed','dismissed')),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(demand_signal_id,action_type)
);
create index if not exists afat_city_actions_city_status_idx on public.afat_city_actions(city_key,status,updated_at desc);
alter table public.afat_city_actions enable row level security;
revoke insert,update,delete on public.afat_city_actions from anon,authenticated;
grant select on public.afat_city_actions to authenticated;
drop policy if exists afat_city_actions_planner_read on public.afat_city_actions;
create policy afat_city_actions_planner_read on public.afat_city_actions for select to authenticated using (
  public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')
);

create or replace function public.afat_city_action_snapshot(p_city_key text default 'cm-yaounde',p_limit integer default 24)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_summary jsonb; v_priorities jsonb; v_cells jsonb; v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'Active city profile not found'; end if;

  select coalesce(jsonb_object_agg(signal_type,total_count),'{}'::jsonb) into v_summary
  from (
    select signal_type,sum(signal_count)::bigint total_count from public.afat_demand_signals
    where city_key=p_city_key and status in ('open','investigating','actioned') group by signal_type
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'signal_id',id,'signal_type',signal_type,'label',label,'requested_mode',requested_mode,
    'signal_count',signal_count,'status',status,'first_seen_at',first_seen_at,'last_seen_at',last_seen_at,
    'resolved_place_id',resolved_place_id,'priority_score',priority_score,'recommended_action',recommended_action,
    'has_action',has_action,'action_status',action_status
  ) order by priority_score desc,last_seen_at desc),'[]'::jsonb) into v_priorities
  from (
    select d.id,d.signal_type,d.label,d.requested_mode,d.signal_count,d.status,d.first_seen_at,d.last_seen_at,d.resolved_place_id,
      (d.signal_count*10 + case when d.last_seen_at>=now()-interval '1 day' then 20 when d.last_seen_at>=now()-interval '7 days' then 10 else 0 end)::int priority_score,
      case d.signal_type when 'supply_gap' then 'operator_recruitment' when 'transit_gap' then 'transit_research' when 'delivery_demand' then 'delivery_capacity' when 'business_demand' then 'business_onboarding' else 'mapping_verification' end recommended_action,
      (a.id is not null) has_action,a.status action_status
    from public.afat_demand_signals d
    left join lateral (select ca.id,ca.status from public.afat_city_actions ca where ca.demand_signal_id=d.id order by ca.updated_at desc limit 1) a on true
    where d.city_key=p_city_key and d.status in ('open','investigating','actioned')
    order by priority_score desc,d.last_seen_at desc limit greatest(1,least(coalesce(p_limit,24),100))
  ) q;

  select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) into v_cells
  from (select status,count(*)::bigint cnt from public.afat_city_ingestion_cells c where c.city_profile_id=v_city.id group by status) c;

  return jsonb_build_object(
    'city_key',p_city_key,'city_name',v_city.city_name,'demand_counts',v_summary,'priorities',v_priorities,'ingestion_cells',v_cells,
    'network_counts',jsonb_build_object(
      'places',(select count(*) from public.afat_places where lower(city)=lower(v_city.city_name) and status<>'retired'),
      'atlas_nodes',(select count(*) from public.afat_atlas_nodes where lower(city)=lower(v_city.city_name) and status='active'),
      'atlas_edges',(select count(*) from public.afat_atlas_edges where status='active'),
      'access_points',(select count(*) from public.afat_access_points ap join public.afat_places p on p.id=ap.place_id where lower(p.city)=lower(v_city.city_name) and ap.active=true),
      'transit_nodes',(select count(*) from public.afat_transit_nodes tn where tn.city_profile_id=v_city.id and tn.active=true),
      'transit_lines',(select count(*) from public.afat_transit_lines tl where tl.city_profile_id=v_city.id and tl.active=true)
    ),
    'privacy','aggregate_no_raw_movement_or_reporter_identity','generated_at',now()
  );
end $$;

create or replace function public.afat_open_city_action(p_signal_id uuid,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_signal public.afat_demand_signals%rowtype; v_action text; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  select * into v_signal from public.afat_demand_signals where id=p_signal_id;
  if not found then raise exception 'Demand signal not found'; end if;
  v_action:=case v_signal.signal_type when 'supply_gap' then 'operator_recruitment' when 'transit_gap' then 'transit_research' when 'delivery_demand' then 'delivery_capacity' when 'business_demand' then 'business_onboarding' else 'mapping_verification' end;
  insert into public.afat_city_actions(city_key,demand_signal_id,action_type,status,notes,created_by,evidence)
  values(v_signal.city_key,v_signal.id,v_action,'open',nullif(trim(p_notes),''),v_uid,jsonb_build_object('automatic_truth',false,'source','demand_signal'))
  on conflict(demand_signal_id,action_type) do update set notes=coalesce(excluded.notes,public.afat_city_actions.notes),updated_at=now() returning id into v_id;
  update public.afat_demand_signals set status='actioned',last_seen_at=greatest(last_seen_at,now()) where id=v_signal.id and status in ('open','investigating');
  return jsonb_build_object('id',v_id,'action_type',v_action,'status','open');
end $$;

create or replace function public.afat_transition_city_action(p_action_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_action public.afat_city_actions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  if p_status not in ('open','in_progress','completed','dismissed') then raise exception 'Unsupported action status'; end if;
  select * into v_action from public.afat_city_actions where id=p_action_id for update;
  if not found then raise exception 'City action not found'; end if;
  update public.afat_city_actions set status=p_status,owner_profile_id=coalesce(owner_profile_id,v_uid),notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now(),completed_at=case when p_status='completed' then now() else completed_at end where id=p_action_id;
  if p_status='completed' then update public.afat_demand_signals set status='resolved' where id=v_action.demand_signal_id;
  elsif p_status='dismissed' then update public.afat_demand_signals set status='dismissed' where id=v_action.demand_signal_id;
  elsif p_status='in_progress' then update public.afat_demand_signals set status='investigating' where id=v_action.demand_signal_id and status<>'resolved'; end if;
  return jsonb_build_object('id',p_action_id,'status',p_status,'demand_signal_id',v_action.demand_signal_id);
end $$;

revoke all on function public.afat_city_action_snapshot(text,integer) from public,anon;
revoke all on function public.afat_open_city_action(uuid,text) from public,anon;
revoke all on function public.afat_transition_city_action(uuid,text,text) from public,anon;
grant execute on function public.afat_city_action_snapshot(text,integer) to authenticated;
grant execute on function public.afat_open_city_action(uuid,text) to authenticated;
grant execute on function public.afat_transition_city_action(uuid,text,text) to authenticated;