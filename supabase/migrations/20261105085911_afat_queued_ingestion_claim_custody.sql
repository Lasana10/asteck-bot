create or replace function public.afat_complete_ingestion_cell(
  p_cell_id uuid, p_status text, p_import_batch_id uuid default null,
  p_result jsonb default '{}'::jsonb, p_error text default null
) returns jsonb
language plpgsql security definer set search_path='public','pg_catalog' as $$
declare
  v_uid uuid := auth.uid();
  v_cell public.afat_city_ingestion_cells%rowtype;
  v_batch public.afat_geo_import_batches%rowtype;
  v_city_key text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then
    raise exception 'City ingestion permission required';
  end if;
  if p_status not in ('completed','completed_with_errors','failed','skipped') then
    raise exception 'Unsupported ingestion result status';
  end if;

  select c.* into v_cell from public.afat_city_ingestion_cells c
    where c.id=p_cell_id for update;
  if not found then raise exception 'Ingestion cell not found'; end if;
  if v_cell.status <> 'running' or v_cell.requested_by is distinct from v_uid then
    raise exception 'Only the current cell claimant may complete a running ingestion cell';
  end if;
  select city_key into v_city_key from public.afat_city_profiles where id=v_cell.city_profile_id;

  if p_status in ('completed','completed_with_errors') then
    if p_import_batch_id is null then raise exception 'Completed ingestion requires a persisted import batch'; end if;
    select * into v_batch from public.afat_geo_import_batches where id=p_import_batch_id for share;
    if not found then raise exception 'Import batch not found'; end if;
    if v_batch.requested_by is distinct from v_uid
      or v_batch.source_key is distinct from v_cell.source_key
      or v_batch.import_mode <> 'candidate_only'
      or v_batch.status is distinct from p_status
      or v_batch.finished_at is null
      or v_batch.created_at < v_cell.started_at - interval '1 minute'
      or v_batch.scope_bbox->>'city_key' is distinct from v_city_key
      or coalesce(abs((v_batch.scope_bbox->>'south')::double precision-v_cell.south),999)>0.0000001
      or coalesce(abs((v_batch.scope_bbox->>'north')::double precision-v_cell.north),999)>0.0000001
      or coalesce(abs((v_batch.scope_bbox->>'west')::double precision-v_cell.west),999)>0.0000001
      or coalesce(abs((v_batch.scope_bbox->>'east')::double precision-v_cell.east),999)>0.0000001 then
        raise exception 'Import batch authority, geography or final state does not match the claimed cell';
    end if;
    if v_batch.input_count is distinct from
       (coalesce(v_batch.inserted_count,0)+coalesce(v_batch.rejected_count,0))
       or (p_result->>'accepted')::integer is distinct from coalesce(v_batch.inserted_count,0)
       or (p_result->>'rejected')::integer is distinct from coalesce(v_batch.rejected_count,0)
       or (p_result->>'import_batch_id')::uuid is distinct from p_import_batch_id then
      raise exception 'Import batch evidence counts or reference do not agree';
    end if;
  else
    if p_import_batch_id is not null then
      raise exception 'Failed or skipped cell cannot assert a completed import batch';
    end if;
    if exists (
      select 1 from public.afat_geo_import_batches b
      where b.requested_by=v_uid and b.source_key=v_cell.source_key
        and b.created_at >= v_cell.started_at - interval '1 minute'
        and coalesce(abs((b.scope_bbox->>'south')::double precision-v_cell.south),999)<=0.0000001
        and coalesce(abs((b.scope_bbox->>'west')::double precision-v_cell.west),999)<=0.0000001
        and coalesce(abs((b.scope_bbox->>'north')::double precision-v_cell.north),999)<=0.0000001
        and coalesce(abs((b.scope_bbox->>'east')::double precision-v_cell.east),999)<=0.0000001
    ) then raise exception 'Import may have written source data: reconcile the batch before retry'; end if;
  end if;

  update public.afat_city_ingestion_cells set status=p_status,
    import_batch_id=p_import_batch_id, result=coalesce(p_result,'{}'::jsonb),
    last_error=p_error,finished_at=now(),updated_at=now()
    where id=p_cell_id and status='running' and requested_by=v_uid returning * into v_cell;
  if not found then raise exception 'Ingestion cell claim changed during completion'; end if;
  return to_jsonb(v_cell);
end $$;
revoke all on function public.afat_complete_ingestion_cell(uuid,text,uuid,jsonb,text) from public,anon;
grant execute on function public.afat_complete_ingestion_cell(uuid,text,uuid,jsonb,text) to authenticated;
