create table if not exists public.afat_city_ingestion_cells (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  source_key text not null references public.afat_geo_sources(source_key),
  cell_key text not null,
  scope_label text not null,
  south double precision not null,
  west double precision not null,
  north double precision not null,
  east double precision not null,
  status text not null default 'pending' check (status in ('pending','running','completed','completed_with_errors','failed','skipped')),
  import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  attempt_count integer not null default 0,
  last_error text,
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_profile_id,source_key,cell_key)
);
create index if not exists afat_city_ingestion_cells_status_idx on public.afat_city_ingestion_cells(city_profile_id,source_key,status,created_at);
alter table public.afat_city_ingestion_cells enable row level security;
drop policy if exists afat_city_ingestion_cells_planner_select on public.afat_city_ingestion_cells;
create policy afat_city_ingestion_cells_planner_select on public.afat_city_ingestion_cells for select to authenticated using (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure'));
revoke insert,update,delete on public.afat_city_ingestion_cells from authenticated,anon;
grant select on public.afat_city_ingestion_cells to authenticated;

create or replace function public.afat_seed_city_ingestion_cells(p_city_key text,p_source_key text,p_south double precision,p_west double precision,p_north double precision,p_east double precision,p_cell_span double precision default 0.02) returns jsonb language plpgsql security definer set search_path='public','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_city public.afat_city_profiles%rowtype; v_lat double precision; v_lon double precision; v_lat2 double precision; v_lon2 double precision; v_span double precision; v_count integer:=0; v_key text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'City ingestion permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=lower(trim(p_city_key)) and status='active';
  if not found then raise exception 'Active city profile required'; end if;
  if not exists(select 1 from public.afat_geo_sources where source_key=p_source_key) then raise exception 'Registered source required'; end if;
  if p_south not between -90 and 90 or p_north not between -90 and 90 or p_west not between -180 and 180 or p_east not between -180 and 180 or p_south>=p_north or p_west>=p_east then raise exception 'Valid bbox required'; end if;
  v_span:=greatest(0.005,least(coalesce(p_cell_span,0.02),0.06));
  if (p_north-p_south)>0.35 or (p_east-p_west)>0.35 then raise exception 'Expansion bbox too large for one queue seed'; end if;
  v_lat:=p_south;
  while v_lat<p_north loop
    v_lat2:=least(v_lat+v_span,p_north); v_lon:=p_west;
    while v_lon<p_east loop
      v_lon2:=least(v_lon+v_span,p_east);
      v_key:=format('%s:%s:%s:%s:%s',p_source_key,round(v_lat::numeric,5),round(v_lon::numeric,5),round(v_lat2::numeric,5),round(v_lon2::numeric,5));
      insert into public.afat_city_ingestion_cells(city_profile_id,source_key,cell_key,scope_label,south,west,north,east,requested_by)
      values(v_city.id,p_source_key,v_key,format('city-grid-%s-%s',round(v_lat::numeric,3),round(v_lon::numeric,3)),v_lat,v_lon,v_lat2,v_lon2,v_uid)
      on conflict(city_profile_id,source_key,cell_key) do nothing;
      if found then v_count:=v_count+1; end if;
      v_lon:=v_lon2;
    end loop;
    v_lat:=v_lat2;
  end loop;
  update public.afat_city_profiles set metadata=metadata||jsonb_build_object('last_ingestion_bbox',jsonb_build_object('south',p_south,'west',p_west,'north',p_north,'east',p_east),'last_ingestion_source',p_source_key,'automatic_truth',false),updated_at=now() where id=v_city.id;
  return jsonb_build_object('city_key',v_city.city_key,'source_key',p_source_key,'cells_created',v_count,'cell_span',v_span,'automatic_truth',false);
end $$;

create or replace function public.afat_claim_next_ingestion_cell(p_city_key text,p_source_key text default 'openstreetmap') returns jsonb language plpgsql security definer set search_path='public','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_cell public.afat_city_ingestion_cells%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'City ingestion permission required'; end if;
  select c.* into v_cell from public.afat_city_ingestion_cells c join public.afat_city_profiles p on p.id=c.city_profile_id where p.city_key=lower(trim(p_city_key)) and c.source_key=p_source_key and c.status in ('pending','failed') order by case when c.status='pending' then 0 else 1 end,c.attempt_count,c.created_at for update skip locked limit 1;
  if not found then return jsonb_build_object('status','empty'); end if;
  update public.afat_city_ingestion_cells set status='running',attempt_count=attempt_count+1,started_at=now(),finished_at=null,last_error=null,requested_by=v_uid,updated_at=now() where id=v_cell.id returning * into v_cell;
  return jsonb_build_object('status','claimed','cell',to_jsonb(v_cell));
end $$;

create or replace function public.afat_complete_ingestion_cell(p_cell_id uuid,p_status text,p_import_batch_id uuid default null,p_result jsonb default '{}'::jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path='public','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_cell public.afat_city_ingestion_cells%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'City ingestion permission required'; end if;
  if p_status not in ('completed','completed_with_errors','failed','skipped') then raise exception 'Unsupported ingestion result status'; end if;
  update public.afat_city_ingestion_cells set status=p_status,import_batch_id=p_import_batch_id,result=coalesce(p_result,'{}'::jsonb),last_error=p_error,finished_at=now(),updated_at=now() where id=p_cell_id returning * into v_cell;
  if not found then raise exception 'Ingestion cell not found'; end if;
  return to_jsonb(v_cell);
end $$;

revoke all on function public.afat_seed_city_ingestion_cells(text,text,double precision,double precision,double precision,double precision,double precision) from public,anon;
revoke all on function public.afat_claim_next_ingestion_cell(text,text) from public,anon;
revoke all on function public.afat_complete_ingestion_cell(uuid,text,uuid,jsonb,text) from public,anon;
grant execute on function public.afat_seed_city_ingestion_cells(text,text,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.afat_claim_next_ingestion_cell(text,text) to authenticated;
grant execute on function public.afat_complete_ingestion_cell(uuid,text,uuid,jsonb,text) to authenticated;