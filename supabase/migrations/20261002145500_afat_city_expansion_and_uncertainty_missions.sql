create table if not exists public.afat_city_ingest_cells (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  cell_key text not null,
  scope_label text not null,
  south double precision not null,
  west double precision not null,
  north double precision not null,
  east double precision not null,
  priority integer not null default 50,
  status text not null default 'pending' check(status in ('pending','running','completed','completed_with_errors','failed')),
  last_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  last_result jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_profile_id,cell_key)
);

alter table public.afat_city_ingest_cells enable row level security;
drop policy if exists afat_city_ingest_cells_planner_read on public.afat_city_ingest_cells;
create policy afat_city_ingest_cells_planner_read on public.afat_city_ingest_cells for select to authenticated using (
  public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')
);
revoke insert,update,delete on public.afat_city_ingest_cells from authenticated,anon;
grant select on public.afat_city_ingest_cells to authenticated;

with city as (
  select id from public.afat_city_profiles where city_key='cm-yaounde' and status='active' limit 1
), cells(cell_key,scope_label,south,west,north,east,priority) as (
  values
  ('yde-nw-01','Yaoundé northwest 01',3.88,11.44,3.92,11.48,92),
  ('yde-nw-02','Yaoundé northwest 02',3.88,11.48,3.92,11.52,96),
  ('yde-n-03','Yaoundé north 03',3.88,11.52,3.92,11.56,94),
  ('yde-ne-04','Yaoundé northeast 04',3.88,11.56,3.92,11.60,86),
  ('yde-w-05','Yaoundé west 05',3.84,11.44,3.88,11.48,94),
  ('yde-cw-06','Yaoundé centre-west 06',3.84,11.48,3.88,11.52,100),
  ('yde-c-07','Yaoundé centre 07',3.84,11.52,3.88,11.56,100),
  ('yde-e-08','Yaoundé east 08',3.84,11.56,3.88,11.60,90),
  ('yde-sw-09','Yaoundé southwest 09',3.80,11.44,3.84,11.48,82),
  ('yde-sw-10','Yaoundé southwest 10',3.80,11.48,3.84,11.52,96),
  ('yde-s-11','Yaoundé south 11',3.80,11.52,3.84,11.56,90),
  ('yde-se-12','Yaoundé southeast 12',3.80,11.56,3.84,11.60,80),
  ('yde-ssw-13','Yaoundé far southwest 13',3.76,11.44,3.80,11.48,72),
  ('yde-ssw-14','Yaoundé far southwest 14',3.76,11.48,3.80,11.52,76),
  ('yde-ss-15','Yaoundé far south 15',3.76,11.52,3.80,11.56,74),
  ('yde-sse-16','Yaoundé far southeast 16',3.76,11.56,3.80,11.60,68)
)
insert into public.afat_city_ingest_cells(city_profile_id,cell_key,scope_label,south,west,north,east,priority)
select city.id,c.cell_key,c.scope_label,c.south,c.west,c.north,c.east,c.priority from city cross join cells c
on conflict(city_profile_id,cell_key) do update set scope_label=excluded.scope_label,south=excluded.south,west=excluded.west,north=excluded.north,east=excluded.east,priority=excluded.priority,updated_at=now();

create or replace function public.afat_mark_city_ingest_cell(p_cell_id uuid,p_status text,p_batch_id uuid default null,p_result jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='public','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_row public.afat_city_ingest_cells%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planner or admin permission required'; end if;
  if p_status not in ('pending','running','completed','completed_with_errors','failed') then raise exception 'Invalid ingest cell status'; end if;
  update public.afat_city_ingest_cells set status=p_status,last_batch_id=coalesce(p_batch_id,last_batch_id),last_result=coalesce(p_result,'{}'::jsonb),last_run_at=case when p_status='running' then now() else coalesce(last_run_at,now()) end,updated_at=now() where id=p_cell_id returning * into v_row;
  if not found then raise exception 'Ingest cell not found'; end if;
  return to_jsonb(v_row);
end $$;
grant execute on function public.afat_mark_city_ingest_cell(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.afat_refresh_uncertainty_missions(p_city text default 'Yaoundé', p_limit integer default 24) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_created integer:=0; v_cancelled integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Map evidence permission required'; end if;
  p_limit:=greatest(1,least(coalesce(p_limit,24),60));
  update public.afat_micro_missions m set status='cancelled',updated_at=now(),evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('cancel_reason','replaced_by_uncertainty_cluster_refresh','cancelled_at',now()) where lower(m.city)=lower(p_city) and m.status in ('open','claimed') and m.mission_type='verify_edge';
  get diagnostics v_cancelled=row_count;
  with ranked as (
    select e.id,e.canonical_name,e.confidence,e.evidence_status,e.passability,e.last_observed_at,e.geometry,
      count(*) over(partition by lower(coalesce(nullif(trim(e.canonical_name),''),e.id::text))) as segment_count,
      row_number() over(partition by lower(coalesce(nullif(trim(e.canonical_name),''),e.id::text)) order by e.confidence asc,e.last_observed_at nulls first,e.id) as rn
    from public.afat_atlas_edges e join public.afat_atlas_nodes n on n.id=e.from_node_id
    where e.status='active' and lower(n.city)=lower(p_city)
      and (e.evidence_status='provisional' or e.confidence<65 or e.passability='unknown' or e.last_observed_at is null or e.last_observed_at<now()-interval '90 days')
  ), picked as (
    select * from ranked where rn=1 order by case when evidence_status='provisional' then 0 else 1 end,confidence asc,last_observed_at nulls first limit p_limit
  )
  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,priority,status,expires_at,evidence)
  select p_city,'verify_corridor',case when canonical_name is null or trim(canonical_name)='' then 'Verify an uncertain road corridor' else 'Verify '||canonical_name end,
    concat_ws(' ',case when evidence_status='provisional' then 'AFAT has source geometry but not enough independent evidence.' else null end,case when passability='unknown' then 'Confirm whether this corridor is passable and by which modes.' else null end,case when last_observed_at is null then 'No field observation is attached yet.' when last_observed_at<now()-interval '90 days' then 'Existing evidence is stale.' else null end,'Capture only what you can directly observe.'),
    id,least(95,greatest(45,round(100-coalesce(confidence,50)) + least(segment_count,10))),'open',now()+interval '30 days',jsonb_build_object('reason','evidence_gap','segment_count',segment_count,'edge_confidence',confidence,'edge_evidence_status',evidence_status,'passability',passability,'last_observed_at',last_observed_at,'automatic_truth',false,'cluster_basis',case when canonical_name is null then 'representative_edge' else 'canonical_road_name' end)
  from picked on conflict do nothing;
  get diagnostics v_created=row_count;
  return jsonb_build_object('city',p_city,'cancelled_legacy_edge_missions',v_cancelled,'created_uncertainty_missions',v_created,'automatic_truth',false);
end $$;
grant execute on function public.afat_refresh_uncertainty_missions(text,integer) to authenticated;